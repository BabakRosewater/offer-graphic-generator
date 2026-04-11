import { normalizeMessageData } from "../../lib/normalize-message-data.js";

const SCHEMA_VERSION = "2026-04-graphic-payload-v1";

const SUPPORTED_GRAPHIC_TYPES = [
  "re_engagement",
  "inventory_redirect",
  "status_update",
  "numbers_clarity",
  "confidence_message",
  "lifestyle_fit",
  "final_decision",
  "competitive_save",
  "trade_progress",
  "incentive_reframe",
];

// Types that have a dedicated template in the current UI
const TEMPLATED_GRAPHIC_TYPES = new Set([
  "re_engagement",
  "inventory_redirect",
  "status_update",
  "numbers_clarity",
]);

const VALID_THEME_VARIANTS = new Set([
  "default",
  "soft",
  "recovery",
  "confidence",
  "premium",
  "urgent",
]);

// Display badge text shown in the message graphic UI per graphic type
const REASON_BADGE_BY_TYPE = {
  re_engagement:      "No response after follow-up",
  inventory_redirect: "Vehicle no longer available",
  status_update:      "Waiting on update",
  numbers_clarity:    "Numbers clarification requested",
  confidence_message: "Needs reassurance",
  lifestyle_fit:      "Re-establishing fit",
  final_decision:     "Near final decision",
  competitive_save:   "Comparing alternatives",
  trade_progress:     "Trade-in in progress",
  incentive_reframe:  "Incentive update",
};

const FIELD_LIMITS = {
  request_id:          120,
  schema_version:      60,
  template_key:        80,
  customer_first_name: 40,
  headline:            80,
  subheadline:         120,
  vehicle_title:       80,
  vehicle_subtitle:    100,
  message_body:        280,
  contact_name:        60,
  contact_title:       60,
  contact_phone:       30,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorResponse(request_id, error_code, message, status = 400) {
  return json(
    { request_id: request_id ?? null, status: "error", error_code, message },
    status,
  );
}

function resolveTemplate(graphic_type, template_key) {
  const defaultKey = `${graphic_type}_v1`;
  if (!template_key) {
    return { resolvedKey: defaultKey, warning: null };
  }
  if (template_key === defaultKey) {
    return { resolvedKey: template_key, warning: null };
  }
  return {
    resolvedKey: defaultKey,
    warning: `template_key '${template_key}' is not available; using default '${defaultKey}'`,
  };
}

function translateToNormalizerShape(body) {
  const ctaArray = Array.isArray(body.cta_options) ? body.cta_options : [];
  const themeVariant = VALID_THEME_VARIANTS.has(body.theme_variant)
    ? body.theme_variant
    : "default";

  return {
    graphicType:       body.graphic_type,
    reasonBadge:       REASON_BADGE_BY_TYPE[body.graphic_type] ?? "",
    customerFirstName: String(body.customer_first_name || ""),
    headline:          String(body.headline),
    subheadline:       String(body.subheadline || ""),
    vehicleTitle:      String(body.vehicle_title || ""),
    vehicleSubtitle:   String(body.vehicle_subtitle || ""),
    messageBody:       String(body.message_body),
    cta1:              String(ctaArray[0] || ""),
    cta2:              String(ctaArray[1] || ""),
    cta3:              String(ctaArray[2] || ""),
    contactName:       String(body.contact_name || ""),
    contactTitle:      String(body.contact_title || ""),
    contactPhone:      String(body.contact_phone || ""),
    contactPhotoUrl:   String(body.contact_photo_url || ""),
    themeVariant,
  };
}

function buildDeepLink(baseUrl, normalized) {
  const payload = {
    graphicType:       normalized.graphicType,
    reasonBadge:       normalized.reasonBadge,
    customerFirstName: normalized.customerFirstName,
    headline:          normalized.headline,
    subheadline:       normalized.subheadline,
    vehicleTitle:      normalized.vehicleTitle,
    vehicleSubtitle:   normalized.vehicleSubtitle,
    messageBody:       normalized.messageBody,
    ctaOptions:        normalized.ctaOptions,
    contactName:       normalized.contactName,
    contactTitle:      normalized.contactTitle,
    contactPhone:      normalized.contactPhone,
    contactPhotoUrl:   normalized.contactPhotoUrl,
    themeVariant:      normalized.themeVariant,
  };
  return `${baseUrl}/?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

export async function onRequestPost(context) {
  // 1. Content-type check
  const ct = context.request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return errorResponse(null, "VALIDATION_ERROR", "Content-Type must be application/json.", 400);
  }

  // 2. Parse body
  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse(null, "VALIDATION_ERROR", "Request body is not valid JSON.", 400);
  }

  const { request_id } = body;

  // 3. Required top-level fields
  const missing = [];
  if (!body.request_id)                            missing.push("request_id");
  if (!body.schema_version)                        missing.push("schema_version");
  if (!body.graphic_type)                          missing.push("graphic_type");
  if (!body.headline)                              missing.push("headline");
  if (!body.message_body)                          missing.push("message_body");
  if (!body.meta || typeof body.meta !== "object") missing.push("meta");
  if (missing.length) {
    return errorResponse(request_id, "VALIDATION_ERROR", `Missing required fields: ${missing.join(", ")}.`);
  }

  // 4. Required meta fields
  const { meta } = body;
  const missingMeta = [];
  if (!meta.source_app)                  missingMeta.push("meta.source_app");
  if (!meta.case_number)                 missingMeta.push("meta.case_number");
  if (!meta.store_id)                    missingMeta.push("meta.store_id");
  if (typeof meta.dry_run !== "boolean") missingMeta.push("meta.dry_run");
  if (!meta.requested_at)                missingMeta.push("meta.requested_at");
  if (missingMeta.length) {
    return errorResponse(request_id, "VALIDATION_ERROR", `Missing required meta fields: ${missingMeta.join(", ")}.`);
  }

  // 5. Schema version
  if (body.schema_version !== SCHEMA_VERSION) {
    return errorResponse(
      request_id,
      "INVALID_SCHEMA_VERSION",
      `Unsupported schema_version '${body.schema_version}'. Expected '${SCHEMA_VERSION}'.`,
    );
  }

  // 6. Graphic type enum
  if (!SUPPORTED_GRAPHIC_TYPES.includes(body.graphic_type)) {
    return errorResponse(
      request_id,
      "INVALID_GRAPHIC_TYPE",
      `Unsupported graphic_type '${body.graphic_type}'. Supported: ${SUPPORTED_GRAPHIC_TYPES.join(", ")}.`,
    );
  }

  // 7. Field length constraints
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    const val = body[field];
    if (val != null && String(val).length > max) {
      return errorResponse(
        request_id,
        "VALIDATION_ERROR",
        `Field '${field}' exceeds maximum length of ${max} characters.`,
      );
    }
  }

  // 8. cta_options shape
  if (body.cta_options !== undefined) {
    if (!Array.isArray(body.cta_options)) {
      return errorResponse(request_id, "VALIDATION_ERROR", "cta_options must be an array.");
    }
    if (body.cta_options.length > 3) {
      return errorResponse(request_id, "VALIDATION_ERROR", "cta_options must not exceed 3 items.");
    }
    for (const item of body.cta_options) {
      if (String(item).length > 40) {
        return errorResponse(
          request_id,
          "VALIDATION_ERROR",
          "Each cta_options item must not exceed 40 characters.",
        );
      }
    }
  }

  // 9. Template resolution
  const { resolvedKey, warning: templateWarning } = resolveTemplate(
    body.graphic_type,
    body.template_key,
  );
  const warnings = [];
  if (templateWarning) warnings.push(templateWarning);
  if (!TEMPLATED_GRAPHIC_TYPES.has(body.graphic_type)) {
    warnings.push(
      `graphic_type '${body.graphic_type}' does not yet have a dedicated template; the re_engagement layout will be applied.`,
    );
  }

  // 10. Dry run — validate only, no asset
  if (meta.dry_run === true) {
    return json({
      request_id,
      status: "ok",
      template_key: resolvedKey,
      graphic_type: body.graphic_type,
      asset_url: null,
      thumbnail_url: null,
      rendered_at: new Date().toISOString(),
      warnings: [...warnings, "dry_run: asset_url not generated"],
    });
  }

  // 11. Translate, normalize, build deep-link
  const translated = translateToNormalizerShape(body);
  const normalized = normalizeMessageData(translated);

  const requestUrl = new URL(context.request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
  const assetUrl = buildDeepLink(baseUrl, normalized);

  return json({
    request_id,
    status: "ok",
    template_key: resolvedKey,
    graphic_type: body.graphic_type,
    asset_url: assetUrl,
    thumbnail_url: null,
    rendered_at: new Date().toISOString(),
    warnings,
  });
}
