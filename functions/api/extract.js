import { parsePurchaseAgreement } from "../../lib/parse-purchase-agreement.js";
import { normalizeDealData } from "../../lib/normalize-deal-data.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

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
  "paymentOptions": [
    { "term": 0, "apr": 0, "payment": 0 }
  ]
}

Rules:
- payment, apr, and term must come from Selected Terms when visible.
- Do NOT use lowest matrix payment unless Selected Terms is missing.
- If payment is a range (e.g., $429 - $464), return the lower value.
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

    return json({
      ok: true,
      source_type: "image_ai_fallback",
      data: normalized,
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
