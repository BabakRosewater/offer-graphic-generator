const MESSAGE_DEFAULTS = {
  graphicType: "re_engagement",
  headline: "Quick update on your options",
  subheadline: "I can help you choose the right next step.",
  vehicleTitle: "",
  vehicleSubtitle: "",
  messageBody: "",
  ctaOptions: ["Review numbers", "See similar inventory"],
  contactName: "",
  contactTitle: "",
  contactPhone: "",
  contactPhotoUrl: "",
  themeVariant: "classic",
  customerFirstName: "",
};

export function normalizeMessageData(raw = {}) {
  const ctaOptions = [raw.cta1, raw.cta2, raw.cta3]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    graphicType: String(raw.graphicType || MESSAGE_DEFAULTS.graphicType),
    headline: String(raw.headline || MESSAGE_DEFAULTS.headline),
    subheadline: String(raw.subheadline || MESSAGE_DEFAULTS.subheadline),
    vehicleTitle: String(raw.vehicleTitle || MESSAGE_DEFAULTS.vehicleTitle),
    vehicleSubtitle: String(raw.vehicleSubtitle || MESSAGE_DEFAULTS.vehicleSubtitle),
    messageBody: String(raw.messageBody || MESSAGE_DEFAULTS.messageBody),
    ctaOptions: ctaOptions.length ? ctaOptions : [...MESSAGE_DEFAULTS.ctaOptions],
    contactName: String(raw.contactName || MESSAGE_DEFAULTS.contactName),
    contactTitle: String(raw.contactTitle || MESSAGE_DEFAULTS.contactTitle),
    contactPhone: String(raw.contactPhone || MESSAGE_DEFAULTS.contactPhone),
    contactPhotoUrl: String(raw.contactPhotoUrl || MESSAGE_DEFAULTS.contactPhotoUrl),
    themeVariant: String(raw.themeVariant || MESSAGE_DEFAULTS.themeVariant),
    customerFirstName: String(raw.customerFirstName || MESSAGE_DEFAULTS.customerFirstName),
  };
}

export { MESSAGE_DEFAULTS };
