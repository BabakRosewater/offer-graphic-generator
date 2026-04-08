function cleanText(value) {
  return String(value ?? "").trim();
}

export function parseMoneyValue(value) {
  const str = cleanText(value);
  if (!str) return 0;

  const range = str.match(/-?\$?\s*([\d,]+(?:\.\d+)?)\s*-\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (range) {
    const low = Number(range[1].replace(/,/g, ""));
    return Number.isFinite(low) ? low : 0;
  }

  const parenNegative = /^\(.*\)$/.test(str);
  const numberMatch = str.match(/-?[\d,]+(?:\.\d+)?/);
  if (!numberMatch) return 0;

  const parsed = Number(numberMatch[0].replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return parenNegative ? -Math.abs(parsed) : parsed;
}

export function parseAprValue(value) {
  const str = cleanText(value);
  if (!str) return 0;
  const m = str.match(/-?\d+(?:\.\d+)?/);
  if (!m) return 0;
  const apr = Number(m[0]);
  return Number.isFinite(apr) ? apr : 0;
}

export function parseTermValue(value) {
  const str = cleanText(value);
  if (!str) return 0;
  const m = str.match(/\d{1,3}/);
  if (!m) return 0;
  const term = Number(m[0]);
  return Number.isFinite(term) ? term : 0;
}

export function parsePaymentValue(value) {
  return parseMoneyValue(value);
}

export function parsePaymentOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((row) => ({
      term: parseTermValue(row?.term),
      apr: parseAprValue(row?.apr),
      payment: parsePaymentValue(row?.payment),
    }))
    .filter((row) => row.term > 0 || row.payment > 0 || row.apr > 0);
}

// For compatibility with existing imports/architecture, this utility can be used
// to sanitize raw AI response objects before final normalization.
export function parsePurchaseAgreement(raw = {}) {
  return {
    ...raw,
    retailPrice: parseMoneyValue(raw.retailPrice),
    discount: parseMoneyValue(raw.discount),
    tradeEquity: parseMoneyValue(raw.tradeEquity),
    amountFinanced: parseMoneyValue(raw.amountFinanced),
    payment: parsePaymentValue(raw.payment),
    apr: parseAprValue(raw.apr),
    term: parseTermValue(raw.term),
    salesPrice: parseMoneyValue(raw.salesPrice),
    totalSalesPrice: parseMoneyValue(raw.totalSalesPrice),
    tradeAllowance: parseMoneyValue(raw.tradeAllowance),
    tradePayoff: parseMoneyValue(raw.tradePayoff),
    vehicleMileage: parseTermValue(raw.vehicleMileage),
    governmentFees: parseMoneyValue(raw.governmentFees),
    accessories: parseMoneyValue(raw.accessories),
    serviceContract: parseMoneyValue(raw.serviceContract),
    gap: parseMoneyValue(raw.gap),
    procDocFees: parseMoneyValue(raw.procDocFees),
    cashDown: parseMoneyValue(raw.cashDown),
    rebate: parseMoneyValue(raw.rebate),
    paymentOptions: parsePaymentOptions(raw.paymentOptions),
  };
}
