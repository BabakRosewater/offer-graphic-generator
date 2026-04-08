function cleanLine(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parseMoney(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[,\s$]/g, "");
  const sign = /^\(.*\)$/.test(cleaned) ? -1 : 1;
  const core = cleaned.replace(/[()]/g, "");
  const n = Number(core);
  return Number.isFinite(n) ? sign * n : null;
}

function parseIntLike(value) {
  if (!value) return null;
  const n = Number(String(value).replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return cleanLine(m[1]);
  }
  return null;
}

function firstMoney(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m || !m[1]) continue;
    const value = parseMoney(m[1]);
    if (value !== null) return value;
  }
  return null;
}

function firstNumber(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m || !m[1]) continue;
    const value = parseIntLike(m[1]);
    if (value !== null) return value;
  }
  return null;
}

function getBlock(text, startLabel, stopLabels = []) {
  const start = text.search(startLabel);
  if (start < 0) return "";
  const tail = text.slice(start);
  let end = tail.length;
  for (const stop of stopLabels) {
    const idx = tail.search(stop);
    if (idx > 0 && idx < end) end = idx;
  }
  return tail.slice(0, end);
}

export function normalizePdfText(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u0000/g, "")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .join("\n");
}

export function parsePurchaseAgreement(rawText) {
  const text = normalizePdfText(rawText);

  const buyerBlock = getBlock(text, /buyer|customer/i, [/vehicle/i, /selected terms/i, /purchase/i]);
  const vehicleBlock = getBlock(text, /vehicle/i, [/purchase/i, /selected terms/i, /trade/i]);
  const purchaseBlock = getBlock(text, /purchase|deal|pricing/i, [/selected terms/i, /trade/i]);
  const selectedTermsBlock = getBlock(text, /selected terms/i, [/payment options|payment matrix|trade/i]);
  const tradeBlock = getBlock(text, /trade/i, [/selected terms/i, /payment options|payment matrix/i]);
  const paymentMatrixBlock = getBlock(text, /payment options|payment matrix/i, [/signatures?|buyer/i]);

  const parsed = {
    customerName: firstMatch(buyerBlock || text, [
      /buyer(?:\s*name)?\s*[:\-]\s*([^\n]+)/i,
      /customer(?:\s*name)?\s*[:\-]\s*([^\n]+)/i,
      /name\s*[:\-]\s*([^\n]{3,80})/i,
    ]),
    customerPhone: firstMatch(buyerBlock || text, [
      /(?:phone|cell|mobile)\s*[:\-]\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
    ]),
    vehicleName: firstMatch(vehicleBlock || text, [
      /vehicle\s*(?:description|name|model)?\s*[:\-]\s*([^\n]+)/i,
      /year\s+make\s+model\s*[:\-]\s*([^\n]+)/i,
    ]),
    vin: firstMatch(vehicleBlock || text, [
      /\bvin\s*[:\-]\s*([A-HJ-NPR-Z0-9]{11,17})/i,
      /\b([A-HJ-NPR-Z0-9]{17})\b/,
    ]),
    stockNumber: firstMatch(vehicleBlock || text, [
      /stock\s*(?:number|#)?\s*[:\-]\s*([A-Z0-9\-]+)/i,
    ]),
    vehicleMileage: firstNumber(vehicleBlock || text, [
      /mileage\s*[:\-]\s*([\d,]+)/i,
      /odometer\s*[:\-]\s*([\d,]+)/i,
    ]),
    vehicleColor: firstMatch(vehicleBlock || text, [
      /color\s*[:\-]\s*([^\n]+)/i,
      /ext(?:erior)?\s*color\s*[:\-]\s*([^\n]+)/i,
    ]),

    retailPrice: firstMoney(purchaseBlock || text, [
      /retail\s*price\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
      /cash\s*price\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    salesPrice: firstMoney(purchaseBlock || text, [
      /sales\s*price\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    savings: firstMoney(purchaseBlock || text, [
      /savings\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
      /discount\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    totalSalesPrice: firstMoney(purchaseBlock || text, [
      /total\s*sales\s*price\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
      /total\s*price\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    tradeAllowance: firstMoney(tradeBlock || text, [
      /trade\s*allowance\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    tradePayoff: firstMoney(tradeBlock || text, [
      /trade\s*(?:payoff|lien\s*payoff|amount\s*owed)\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    tradeEquity: firstMoney(tradeBlock || text, [
      /trade\s*equity\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
      /net\s*trade\s*(?:in)?\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),
    amountFinanced: firstMoney(purchaseBlock || text, [
      /amount\s*financed\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
    ]),

    selectedTerms: {
      term: firstNumber(selectedTermsBlock || text, [
        /term\s*[:\-]?\s*(\d{1,3})\s*(?:months?|mos?)/i,
        /(\d{1,3})\s*(?:months?|mos?)\s*@/i,
      ]),
      apr: firstMoney(selectedTermsBlock || text, [
        /apr\s*[:\-]?\s*([\d.]+)\s*%/i,
      ]),
      payment: firstMoney(selectedTermsBlock || text, [
        /payment\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
        /monthly\s*payment\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
      ]),
    },

    paymentMatrix: {
      term: firstNumber(paymentMatrixBlock, [/(\d{1,3})\s*(?:months?|mos?)/i]),
      apr: firstMoney(paymentMatrixBlock, [/([\d.]+)\s*%\s*apr/i]),
      payment: firstMoney(paymentMatrixBlock, [/(\$[\d,]+(?:\.\d{2})?)/i]),
    },
  };

  return parsed;
}
