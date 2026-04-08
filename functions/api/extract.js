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

async function inflateIfNeeded(streamText, streamBytes) {
  if (!/FlateDecode/i.test(streamText)) {
    return new TextDecoder().decode(streamBytes);
  }

  if (typeof DecompressionStream === "undefined") {
    return "";
  }

  try {
    const ds = new DecompressionStream("deflate");
    const decompressed = new Response(new Blob([streamBytes]).stream().pipeThrough(ds));
    return await decompressed.text();
  } catch {
    return "";
  }
}

function latin1ToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i += 1) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function decodePdfStringToken(token) {
  if (!token) return "";

  if (token.startsWith("(")) {
    return token
      .slice(1, -1)
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, " ")
      .replace(/\\\\/g, "\\");
  }

  if (token.startsWith("<")) {
    const hex = token.slice(1, -1).replace(/\s+/g, "");
    let out = "";
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (!Number.isNaN(code)) out += String.fromCharCode(code);
    }
    return out;
  }

  return token;
}

function extractTextFromPdfContent(content) {
  const out = [];
  const tokenRegex = /(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>)/g;

  for (const match of content.matchAll(tokenRegex)) {
    const text = decodePdfStringToken(match[1]).trim();
    if (text) out.push(text);
  }

  return out.join("\n");
}

async function extractPdfText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const ascii = new TextDecoder("latin1").decode(bytes);
  const streamRegex = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;

  const chunks = [];
  let m;
  while ((m = streamRegex.exec(ascii)) !== null) {
    const dict = m[1] || "";
    const streamRaw = m[2] || "";
    const streamBytes = latin1ToBytes(streamRaw);
    const decoded = await inflateIfNeeded(dict, streamBytes);
    const content = /FlateDecode/i.test(dict) ? decoded : decoded || streamRaw;
    if (!content) continue;
    const extracted = extractTextFromPdfContent(content);
    if (extracted) chunks.push(extracted);
  }

  return chunks.join("\n");
}

function hasStrongDeterministicData(data) {
  const hasCoreIdentity = Boolean(data.customerName && data.vehicleName);
  const hasSelectedTerms = Number(data.payment) > 0 && Number(data.term) > 0 && Number(data.apr) >= 0;
  const hasFinancialAnchor = Number(data.amountFinanced) > 0 || Number(data.retailPrice) > 0 || Number(data.salesPrice) > 0;
  return hasCoreIdentity && hasSelectedTerms && hasFinancialAnchor;
}

function aiPrompt() {
  return `You are extracting structured values from Clark Hyundai purchase agreement documents.

Return ONLY strict JSON with this schema:
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
  "vehicleMileage": 0
}

Rules:
- payment, apr, and term must come from Selected Terms when visible.
- Do NOT choose the lowest payment matrix option unless Selected Terms is missing.
- If Selected Terms payment is shown as a range (example: $429 - $464), use the lower payment value.
- Use numbers for numeric fields; use 0 when unknown.
- Use empty string for unknown text fields.
- No markdown, no comments, no prose.`;
}

async function callGemini(context, file) {
  const apiKey = context.env?.GEMINI_API_KEY;
  const model = context.env?.GEMINI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

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
                mimeType: file.type || "application/octet-stream",
                data: base64,
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
    const text = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${text.slice(0, 400)}`);
  }

  const payload = await response.json();
  const candidate = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === "string");
  const rawJson = candidate?.text;
  if (!rawJson) {
    throw new Error("Gemini response did not include JSON text content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("Gemini returned non-JSON output.");
  }

  return normalizeDealData(parsed);
}

async function extractWithDeterministicPdf(file) {
  const rawText = await extractPdfText(await file.arrayBuffer());
  if (!rawText || rawText.trim().length < 20) {
    return { ok: false, reason: "Unable to extract readable text from PDF." };
  }

  const parsed = parsePurchaseAgreement(rawText);
  const normalized = normalizeDealData(parsed);
  if (!hasStrongDeterministicData(normalized)) {
    return { ok: false, reason: "Deterministic extraction returned incomplete data.", data: normalized };
  }

  return { ok: true, data: normalized };
}

export async function onRequestPost(context) {
  try {
    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return buildError("Expected multipart/form-data upload.", "validation", 400);
    }

    const formData = await context.request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return buildError("No file was provided in form field 'file'.", "validation", 400);
    }

    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const isPdf = type.includes("pdf") || name.endsWith(".pdf");
    const isImage = type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);

    if (!isPdf && !isImage) {
      return buildError("Unsupported file type. Upload a PDF or image file.", "validation", 415);
    }

    if (isImage) {
      const aiData = await callGemini(context, file);
      return json({ ok: true, source_type: "image_ai_fallback", data: aiData });
    }

    const deterministic = await extractWithDeterministicPdf(file);
    if (deterministic.ok) {
      return json({ ok: true, source_type: "pdf_text", data: deterministic.data });
    }

    const aiData = await callGemini(context, file);
    return json({
      ok: true,
      source_type: "pdf_ai_fallback",
      data: aiData,
      stage: "gemini_fallback",
      deterministic_reason: deterministic.reason,
    });
  } catch (error) {
    return buildError(
      error instanceof Error ? error.message : "Extraction failed unexpectedly.",
      "extract",
      500,
    );
  }
}
