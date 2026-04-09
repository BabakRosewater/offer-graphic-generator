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

export function parseMoneyRange(value) {
  const str = cleanText(value);
  if (!str) return { low: 0, high: 0 };
  const range = str.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*-\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (range) {
    const a = Number(range[1].replace(/,/g, ""));
    const b = Number(range[2].replace(/,/g, ""));
    const low = Number.isFinite(a) ? a : 0;
    const high = Number.isFinite(b) ? b : low;
    return { low: Math.min(low, high), high: Math.max(low, high) };
  }
  const single = parseMoneyValue(str);
  return { low: single, high: single };
}

export function parseResidualPercent(value) {
  const str = cleanText(value);
  if (!str) return 0;
  const m = str.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function parseMoneyFactor(value) {
  const str = cleanText(value);
  if (!str) return 0;
  const m = str.match(/0?\.\d{3,6}|\d\.\d{3,6}/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : 0;
}

export function parseLeaseMileagePlan(value) {
  const str = cleanText(value);
  if (!str) return "";
  const m = str.match(/(\d{1,3}(?:,\d{3})*)\s*(?:mi|miles?)\b/i);
  if (!m) return "";
  return `${m[1]} mi`;
}

export function parsePaymentOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((row) => ({
      term: parseTermValue(row?.term),
      apr: parseAprValue(row?.apr),
      payment: parsePaymentValue(row?.payment),
      cashDown: parseMoneyValue(row?.cashDown ?? row?.downPayment),
    }))
    .filter((row) => row.term > 0 || row.payment > 0 || row.apr > 0 || row.cashDown > 0);
}

// For compatibility with existing imports/architecture, this utility can be used
// to sanitize raw AI response objects before final normalization.
export function parsePurchaseAgreement(raw = {}) {
  return {
    ...raw,
    paymentRaw: cleanText(raw.paymentRaw || raw.payment || raw.selectedPayment || ""),
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
    rebateAmount: parseMoneyValue(raw.rebateAmount),
    paymentOptions: parsePaymentOptions(raw.paymentOptions),
    residualPercent: parseResidualPercent(raw.residualPercent),
    moneyFactor: parseMoneyFactor(raw.moneyFactor),
    leaseMileagePlan: parseLeaseMileagePlan(raw.leaseMileagePlan),
    acquisitionFee: parseMoneyValue(raw.acquisitionFee),
    netCapCost: parseMoneyValue(raw.netCapCost),
  };
}
