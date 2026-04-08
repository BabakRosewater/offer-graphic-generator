import {
  parseAprValue,
  parseMoneyValue,
  parsePaymentValue,
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
};

function asText(value) {
  return value == null ? "" : String(value).trim();
}

export function normalizeDealData(rawData = {}) {
  return {
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
  };
}
