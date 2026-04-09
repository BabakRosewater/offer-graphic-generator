import { parsePurchaseAgreement } from "../../lib/parse-purchase-agreement.js";
import { normalizeDealData } from "../../lib/normalize-deal-data.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_INVENTORY_BASE_URL = "https://clark-inventory-finder.pages.dev";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildError(error, stage, status = 500, sourceType = null) {
  return json(
    {
      ok: false,
      error,
      stage,
      ...(sourceType ? { source_type: sourceType } : {}),
    },
    status,
  );
}

function aiPrompt() {
  return `Analyze this vehicle purchase agreement image.
Return ONLY strict JSON exactly in this shape:
{
  "customerName": "",
  "vehicleName": "",
  "retailPrice": 0,
  "discount": 0,
  "tradeEquity": 0,
  "amountFinanced": 0,
  "payment": 0,
  "apr": 0,
  "term": 0,
  "salesPrice": 0,
  "totalSalesPrice": 0,
  "tradeAllowance": 0,
  "tradePayoff": 0,
  "customerPhone": "",
  "stockNumber": "",
  "vin": "",
  "vehicleColor": "",
  "vehicleMileage": 0,
  "governmentFees": 0,
  "accessories": 0,
  "serviceContract": 0,
  "gap": 0,
  "procDocFees": 0,
  "cashDown": 0,
  "rebate": 0,
  "residualPercent": 0,
  "moneyFactor": 0,
  "acquisitionFee": 0,
  "netCapCost": 0,
  "paymentOptions": [
    { "term": 0, "apr": 0, "payment": 0, "cashDown": 0 }
  ]
}

Rules:
- payment, apr, and term must come from Selected Terms when visible.
- Do NOT use lowest matrix payment unless Selected Terms is missing.
- If payment is a range (e.g., $429 - $464), return the lower value.
- For lease docs, include residualPercent, moneyFactor, acquisitionFee, netCapCost, and set paymentOptions with cashDown values when shown.
- Use 0 for unknown numbers and empty string for unknown text.
- No markdown, no explanation.`;
}

async function callGemini(context, mimeType, imageBase64) {
  const apiKey = context.env?.GEMINI_API_KEY;
  const model = context.env?.GEMINI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: aiPrompt() },
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${detail.slice(0, 400)}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === "string")?.text;
  if (!text) {
    throw new Error("Gemini response did not include JSON text.");
  }

  const parsed = JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim());
  return normalizeDealData(parsePurchaseAgreement(parsed));
}

function normalizeVin(vin) {
  return String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizeStock(stock) {
  return String(stock || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").trim();
}

async function fetchInventoryMatch(baseUrl, key, value, timeoutMs = 2500) {
  const url = new URL("/api/vehicle-match", baseUrl);
  url.searchParams.set(key, value);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("inventory_timeout"), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.ok || !payload?.vehicle) return null;
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function applyInventoryEnrichment(baseData, payload) {
  if (!payload?.ok || !payload?.vehicle) return baseData;
  const vehicle = payload.vehicle;
  const rawImageUrl = String(vehicle.imageUrl || "").trim();
  let imageUrl = "";
  if (rawImageUrl) {
    try {
      const candidate = rawImageUrl.startsWith("//")
        ? `https:${rawImageUrl}`
        : rawImageUrl.startsWith("http://")
          ? rawImageUrl.replace(/^http:\/\//i, "https://")
          : rawImageUrl.match(/^https?:\/\//i)
            ? rawImageUrl
            : `https://${rawImageUrl}`;
      imageUrl = new URL(candidate).toString();
    } catch {
      imageUrl = "";
    }
  }
  const enriched = {
    ...baseData,
    stockNumber: String(vehicle.stockNumber || baseData.stockNumber || ""),
    vin: String(vehicle.vin || baseData.vin || ""),
    vehicleName: String(vehicle.vehicleName || baseData.vehicleName || ""),
    vehicleColor: String(vehicle.color || baseData.vehicleColor || ""),
    vehicleMileage: Number(vehicle.mileage ?? baseData.vehicleMileage ?? 0) || 0,
    imageUrl,
    inventoryStatus: String(vehicle.status || ""),
    inventoryMatchType: String(payload.matchType || ""),
  };
  return normalizeDealData(enriched);
}

async function enrichWithInventory(context, normalizedData) {
  const baseUrl = context.env?.INVENTORY_MATCH_BASE_URL || DEFAULT_INVENTORY_BASE_URL;
  const vin = normalizeVin(normalizedData.vin);
  const stock = normalizeStock(normalizedData.stockNumber);
  if (!vin && !stock) return normalizedData;

  let match = null;
  if (vin) {
    match = await fetchInventoryMatch(baseUrl, "vin", vin);
  }
  if (!match && stock) {
    match = await fetchInventoryMatch(baseUrl, "stock", stock);
  }

  return match ? applyInventoryEnrichment(normalizedData, match) : normalizedData;
}

export async function onRequestPost(context) {
  try {
    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return buildError("Expected application/json payload.", "validation", 400);
    }

    const body = await context.request.json();
    const mimeType = String(body?.mimeType || "").trim().toLowerCase();
    const imageBase64 = String(body?.imageBase64 || "").trim();

    if (!mimeType || !imageBase64) {
      return buildError("Missing required fields: mimeType and imageBase64.", "validation", 400);
    }

    if (!mimeType.startsWith("image/")) {
      return buildError("mimeType must be an image type.", "validation", 415);
    }

    const normalized = await callGemini(context, mimeType, imageBase64);
    const enriched = await enrichWithInventory(context, normalized);

    return json({
      ok: true,
      source_type: "image_ai_fallback",
      data: enriched,
    });
  } catch (error) {
    return buildError(
      error instanceof Error ? error.message : "Extraction failed unexpectedly.",
      "extract",
      500,
      "image_ai_fallback",
    );
  }
}
