import {
  parseAprValue,
  parseLeaseMileagePlan,
  parseMoneyFactor,
  parseMoneyRange,
  parseMoneyValue,
  parsePaymentValue,
  parsePaymentOptions,
  parseResidualPercent,
  parseTermValue,
} from "./parse-purchase-agreement.js";

const SHAPE = {
  customerName: "",
  vehicleName: "",
  retailPrice: 0,
  discount: 0,
  tradeEquity: 0,
  amountFinanced: 0,
  payment: 0,
  apr: 0,
  term: 0,
  salesPrice: 0,
  totalSalesPrice: 0,
  tradeAllowance: 0,
  tradePayoff: 0,
  customerPhone: "",
  stockNumber: "",
  vin: "",
  vehicleColor: "",
  vehicleMileage: 0,
  governmentFees: 0,
  accessories: 0,
  serviceContract: 0,
  gap: 0,
  procDocFees: 0,
  cashDown: 0,
  rebate: 0,
  paymentOptions: [],
  imageUrl: "",
  inventoryStatus: "",
  inventoryMatchType: "",
  sourceDocType: "",
  transactionType: "",
  vehicleCondition: "",
  tradePresent: false,
  tradeStatus: "",
  cashDownStatus: "",
  rebatePresent: false,
  gapPresent: false,
  serviceContractPresent: false,
  selectedPaymentLow: 0,
  selectedPaymentHigh: 0,
  residualPercent: 0,
  moneyFactor: 0,
  leaseMileagePlan: "",
  acquisitionFee: 0,
  netCapCost: 0,
  programBucket: "",
  scenarioKey: "",
};

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function deriveVehicleCondition(vehicleName, vehicleMileage) {
  const yearMatch = String(vehicleName || "").match(/\b(20\d{2})\b/);
  const modelYear = yearMatch ? Number(yearMatch[1]) : 0;
  const mileage = Number(vehicleMileage) || 0;
  if (modelYear >= 2025 && mileage >= 0 && mileage <= 500) return "new";
  return "unknown";
}

export function deriveDealTypeSchema(rawOrNormalized = {}) {
  const paymentRange = parseMoneyRange(rawOrNormalized.paymentRaw ?? rawOrNormalized.payment);
  const tradeAllowance = parseMoneyValue(rawOrNormalized.tradeAllowance);
  const tradePayoff = parseMoneyValue(rawOrNormalized.tradePayoff);
  const tradeEquity = parseMoneyValue(rawOrNormalized.tradeEquity);
  const cashDown = parseMoneyValue(rawOrNormalized.cashDown);
  const rebate = parseMoneyValue(rawOrNormalized.rebate) || parseMoneyValue(rawOrNormalized.rebateAmount);
  const gap = parseMoneyValue(rawOrNormalized.gap);
  const serviceContract = parseMoneyValue(rawOrNormalized.serviceContract);
  const residualPercent = parseResidualPercent(rawOrNormalized.residualPercent);
  const moneyFactor = parseMoneyFactor(rawOrNormalized.moneyFactor);
  const leaseMileagePlan = parseLeaseMileagePlan(rawOrNormalized.leaseMileagePlan);
  const acquisitionFee = parseMoneyValue(rawOrNormalized.acquisitionFee);
  const netCapCost = parseMoneyValue(rawOrNormalized.netCapCost);
  const governmentFees = parseMoneyValue(rawOrNormalized.governmentFees);
  const amountFinanced = parseMoneyValue(rawOrNormalized.amountFinanced);
  const apr = parseAprValue(rawOrNormalized.apr);

  const leaseIndicators = residualPercent > 0 || moneyFactor > 0 || leaseMileagePlan !== "" || netCapCost > 0;
  const sourceDocType = leaseIndicators ? "lease_agreement" : "purchase_agreement";
  const transactionType = sourceDocType === "lease_agreement"
    ? "lease"
    : (amountFinanced > 0 || apr > 0 ? "finance_purchase" : "unknown");

  const tradePresent = tradeAllowance > 0 || tradePayoff > 0 || tradeEquity !== 0;
  let tradeStatus = "no_trade";
  if (tradePresent && tradeEquity > 0) tradeStatus = "positive_equity_trade";
  else if (tradePresent && tradeEquity < 0) tradeStatus = "negative_equity_trade";
  else if (tradePresent) tradeStatus = "zero_equity_trade";

  const cashDownStatus = cashDown > 0 ? "cash_down" : "zero_down";
  const rebatePresent = rebate > 0;
  const gapPresent = gap > 0;
  const serviceContractPresent = serviceContract > 0;
  const vehicleCondition = deriveVehicleCondition(rawOrNormalized.vehicleName, rawOrNormalized.vehicleMileage);

  let programBucket = "unknown";
  if (transactionType === "finance_purchase") {
    programBucket = rebatePresent ? "rebate_finance" : "no_rebate_finance";
  } else if (transactionType === "lease") {
    programBucket = rebatePresent ? "lease_rebate" : "lease_no_rebate";
  } else if (transactionType === "cash_purchase") {
    programBucket = "cash_purchase";
  }

  const scenarioKey = [
    transactionType || "unknown",
    vehicleCondition || "unknown",
    tradeStatus || "no_trade",
    cashDownStatus,
    rebatePresent ? "rebate" : "no_rebate",
    gapPresent ? "gap" : "no_gap",
    serviceContractPresent ? "service_contract" : "no_service_contract",
  ].join("|");

  return {
    sourceDocType,
    transactionType,
    vehicleCondition,
    tradePresent,
    tradeStatus,
    cashDownStatus,
    rebatePresent,
    gapPresent,
    serviceContractPresent,
    selectedPaymentLow: paymentRange.low,
    selectedPaymentHigh: paymentRange.high,
    residualPercent,
    moneyFactor,
    leaseMileagePlan,
    governmentFees,
    acquisitionFee,
    netCapCost,
    programBucket,
    scenarioKey,
  };
}

export function normalizeDealData(rawData = {}) {
  const normalized = {
    ...SHAPE,
    customerName: asText(rawData.customerName),
    vehicleName: asText(rawData.vehicleName),
    retailPrice: parseMoneyValue(rawData.retailPrice),
    discount: parseMoneyValue(rawData.discount ?? rawData.savings),
    tradeEquity: parseMoneyValue(rawData.tradeEquity),
    amountFinanced: parseMoneyValue(rawData.amountFinanced),
    payment: parsePaymentValue(rawData.payment),
    apr: parseAprValue(rawData.apr),
    term: parseTermValue(rawData.term),
    salesPrice: parseMoneyValue(rawData.salesPrice),
    totalSalesPrice: parseMoneyValue(rawData.totalSalesPrice),
    tradeAllowance: parseMoneyValue(rawData.tradeAllowance),
    tradePayoff: parseMoneyValue(rawData.tradePayoff),
    customerPhone: asText(rawData.customerPhone),
    stockNumber: asText(rawData.stockNumber),
    vin: asText(rawData.vin),
    vehicleColor: asText(rawData.vehicleColor),
    vehicleMileage: parseTermValue(rawData.vehicleMileage),
    governmentFees: parseMoneyValue(rawData.governmentFees),
    accessories: parseMoneyValue(rawData.accessories),
    serviceContract: parseMoneyValue(rawData.serviceContract),
    gap: parseMoneyValue(rawData.gap),
    procDocFees: parseMoneyValue(rawData.procDocFees),
    cashDown: parseMoneyValue(rawData.cashDown),
    rebate: parseMoneyValue(rawData.rebate ?? rawData.rebateAmount),
    paymentOptions: parsePaymentOptions(rawData.paymentOptions),
    imageUrl: asText(rawData.imageUrl),
    inventoryStatus: asText(rawData.inventoryStatus),
    inventoryMatchType: asText(rawData.inventoryMatchType),
    residualPercent: parseResidualPercent(rawData.residualPercent ?? rawData.residual ?? rawData.selectedResidual),
    moneyFactor: parseMoneyFactor(rawData.moneyFactor),
    leaseMileagePlan: parseLeaseMileagePlan(rawData.leaseMileagePlan),
    acquisitionFee: parseMoneyValue(rawData.acquisitionFee),
    netCapCost: parseMoneyValue(rawData.netCapCost),
  };
  const derived = deriveDealTypeSchema({
    ...normalized,
    paymentRaw: asText(rawData.paymentRaw || rawData.payment),
    rebateAmount: rawData.rebateAmount,
  });
  return { ...normalized, ...derived };
}
