import { parsePurchaseAgreement } from "../../lib/parse-purchase-agreement.js";
import { normalizeDealData } from "../../lib/normalize-deal-data.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function inflateIfNeeded(streamText, streamBytes) {
  if (!/FlateDecode/i.test(streamText)) {
    return new TextDecoder().decode(streamBytes);
  }

  if (typeof DecompressionStream === "undefined") {
    // TODO(phase-2): replace with a fallback inflater if runtime lacks DecompressionStream.
    return "";
  }

  const ds = new DecompressionStream("deflate");
  const decompressed = new Response(new Blob([streamBytes]).stream().pipeThrough(ds));
  return await decompressed.text();
}

function decodePdfStringToken(token) {
  if (!token) return "";

  if (token.startsWith("(")) {
    const inner = token.slice(1, -1);
    return inner
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
    const streamBytes = new TextEncoder().encode(streamRaw);
    const decoded = await inflateIfNeeded(dict, streamBytes);
    const content = decoded || streamRaw;
    const extracted = extractTextFromPdfContent(content);
    if (extracted) chunks.push(extracted);
  }

  return chunks.join("\n");
}

export async function onRequestPost(context) {
  try {
    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ ok: false, error: "Expected multipart/form-data upload." }, 400);
    }

    const formData = await context.request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return json({ ok: false, error: "No file was provided in form field 'file'." }, 400);
    }

    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const isPdf = type.includes("pdf") || name.endsWith(".pdf");
    const isImage = type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);

    if (isImage) {
      return json({ ok: false, error: "Image extraction not implemented in phase 1" }, 501);
    }

    if (!isPdf) {
      return json({ ok: false, error: "Unsupported file type. Upload a PDF in phase 1." }, 415);
    }

    const rawText = await extractPdfText(await file.arrayBuffer());
    if (!rawText || rawText.trim().length < 20) {
      return json({ ok: false, error: "Unable to extract readable text from PDF." }, 422);
    }

    const parsed = parsePurchaseAgreement(rawText);
    const normalized = normalizeDealData(parsed);

    return json({
      ok: true,
      source_type: "pdf_text",
      data: normalized,
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Extraction failed unexpectedly.",
    }, 500);
  }
}
