function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toString(value) {
  return value == null ? "" : String(value).trim();
}

function cleanVehicleName(value) {
  return toString(value).replace(/\s+/g, " ").trim();
}

export function normalizeDealData(parsed = {}) {
  const selected = parsed.selectedTerms || {};
  const matrix = parsed.paymentMatrix || {};

  const term = selected.term ?? matrix.term ?? 0;
  const apr = selected.apr ?? matrix.apr ?? 0;
  const payment = selected.payment ?? matrix.payment ?? 0;

  let tradeEquity = parsed.tradeEquity;
  if (tradeEquity == null) {
    const allowance = parsed.tradeAllowance;
    const payoff = parsed.tradePayoff;
    if (allowance != null || payoff != null) {
      tradeEquity = toNumber(allowance, 0) - toNumber(payoff, 0);
    } else {
      tradeEquity = 0;
    }
  }

  return {
    customerName: toString(parsed.customerName),
    vehicleName: cleanVehicleName(parsed.vehicleName),
    retailPrice: toNumber(parsed.retailPrice, 0),
    discount: toNumber(parsed.savings ?? parsed.discount, 0),
    tradeEquity: toNumber(tradeEquity, 0),
    amountFinanced: toNumber(parsed.amountFinanced, 0),
    payment: toNumber(payment, 0),
    apr: toNumber(apr, 0),
    term: toNumber(term, 0),

    salesPrice: toNumber(parsed.salesPrice, 0),
    totalSalesPrice: toNumber(parsed.totalSalesPrice, 0),
    tradeAllowance: toNumber(parsed.tradeAllowance, 0),
    tradePayoff: toNumber(parsed.tradePayoff, 0),
    customerPhone: toString(parsed.customerPhone),
    stockNumber: toString(parsed.stockNumber),
    vin: toString(parsed.vin),
    vehicleColor: toString(parsed.vehicleColor),
    vehicleMileage: toNumber(parsed.vehicleMileage, 0),
  };
}
