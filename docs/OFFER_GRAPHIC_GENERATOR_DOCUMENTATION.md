# Offer Graphic Generator Documentation

## Purpose

Offer Graphic Generator is a Cloudflare Pages app that turns dealership inputs into customer-facing mobile graphics.

It currently supports two related workflows:

1. **Offer Graphic mode** — upload a purchase agreement or deal image, extract structured deal data, review/edit it, and render a downloadable offer summary graphic.
2. **Message Graphic mode** — compose a structured outreach / follow-up message graphic directly from form fields or from a renderer payload.

The repository acts as both:
- a **front-end graphic composer / preview tool**, and
- a **backend extraction / rendering API** for related dealership tools.

---

## Current Product Roles

### 1. Offer Graphic workflow

This workflow is built for internal users who have a deal sheet, purchase agreement, or image and want to produce a clean customer-facing offer card.

High-level flow:
- User uploads a PDF or image.
- Frontend converts PDF page 1 to image using `pdf.js` when needed.
- Frontend posts image JSON to `/api/extract`.
- Backend calls Gemini and normalizes the extracted fields.
- Backend optionally enriches the result with inventory and staff-photo lookups.
- User reviews/edits extracted fields in the left-side form.
- Frontend renders a mobile-style preview.
- User downloads the graphic with `html2canvas`.

### 2. Message Graphic workflow

This workflow is for structured one-to-one customer messaging graphics.

Examples include:
- re-engagement
- inventory redirect
- status update
- numbers clarity
- trade progress
- incentive reframe

The Message Graphic path is also the rendering target for external systems such as Save-A-Deal that want to hand off a structured graphic payload.

---

## Frontend Architecture

### Main file

- `index.html`

This is a single-page app with no framework build step. It uses CDN-hosted libraries directly in the browser.

### Frontend dependencies

Loaded in `index.html`:
- Tailwind CSS
- Lucide icons
- `html2canvas`
- `pdf.js`

### Main views

The UI includes three major states:
- **Upload view**
- **Extracting view**
- **Review / Preview view**

The review screen has two main columns:
- **Left panel:** editable form fields
- **Right panel:** live graphic preview canvas

### UI modes

The top-level UI switches between:
- **Offer Graphic**
- **Message Graphic**

Offer Graphic mode focuses on extracted deal structure.
Message Graphic mode focuses on communication graphics and renderer payload fields.

### Output behavior

The final preview is rendered client-side and downloaded via `html2canvas`.

---

## Backend API Routes

### `/api/extract`

File:
- `functions/api/extract.js`

Purpose:
- Accept image JSON from the browser
- Call Gemini server-side
- Normalize extracted deal data
- Optionally enrich with inventory and staff photo data
- Return stable JSON for the review form and preview

#### Input

Expected JSON:

```json
{
  "mimeType": "image/png",
  "imageBase64": "..."
}
```

#### Extraction behavior

The route:
- validates JSON content type
- validates `mimeType` and `imageBase64`
- only accepts image MIME types
- builds a strict JSON extraction prompt for Gemini
- parses Gemini output
- runs the output through purchase-agreement parsing helpers
- runs final normalization

#### Important business rule

The extraction prompt explicitly enforces:

- payment / APR / term must come from **Selected Terms** when visible
- lowest payment from a matrix must **not** be used unless Selected Terms is missing
- if payment is a range, the lower value is used

#### Optional enrichment

After AI extraction:
- inventory enrichment is attempted by VIN first, then stock
- staff photo enrichment is attempted from staff name

Both enrichments are best-effort and non-blocking.

#### Response shape

Success:

```json
{
  "ok": true,
  "source_type": "image_ai_fallback",
  "data": { }
}
```

Error:

```json
{
  "ok": false,
  "error": "...",
  "stage": "validation | extract",
  "source_type": "image_ai_fallback"
}
```

---

### `/api/render-graphic`

File:
- `functions/api/render-graphic.js`

Purpose:
- accept a structured message graphic payload
- validate shape and enums
- normalize it into the internal message-preview model
- return a deep-link asset URL that opens the front-end renderer with the payload preloaded

This route is the key integration point for external systems that want graphics rendered from structured business logic.

#### Schema version

Current required schema version:
- `2026-04-graphic-payload-v1`

#### Supported graphic types

Current supported enum values:
- `re_engagement`
- `inventory_redirect`
- `status_update`
- `numbers_clarity`
- `confidence_message`
- `lifestyle_fit`
- `final_decision`
- `competitive_save`
- `trade_progress`
- `incentive_reframe`

#### Template behavior

Dedicated templates currently exist for:
- `re_engagement`
- `inventory_redirect`
- `status_update`
- `numbers_clarity`

Other supported graphic types are valid, but currently fall back to the re-engagement style/layout with warnings.

#### Theme variants

Valid theme variants:
- `default`
- `soft`
- `recovery`
- `confidence`
- `premium`
- `urgent`

#### Required top-level fields

Required request fields include:
- `request_id`
- `schema_version`
- `graphic_type`
- `headline`
- `message_body`
- `meta`

Required `meta` fields include:
- `source_app`
- `case_number`
- `store_id`
- `dry_run`
- `requested_at`

#### Dry-run support

If `meta.dry_run === true`, the route validates the request and returns success without generating a deep-link asset URL.

#### Output behavior

If the payload is valid and not in dry-run mode, the route:
- translates request fields to the internal message-normalizer shape
- normalizes them
- builds a deep-link URL using `/?payload=<encoded JSON>`
- returns that URL as `asset_url`

#### Response shape

Success:

```json
{
  "request_id": "...",
  "status": "ok",
  "template_key": "...",
  "graphic_type": "...",
  "asset_url": "...",
  "thumbnail_url": null,
  "rendered_at": "...",
  "warnings": []
}
```

Error:

```json
{
  "request_id": "...",
  "status": "error",
  "error_code": "...",
  "message": "..."
}
```

#### CORS

This route includes explicit CORS handling for:
- `POST`
- `OPTIONS`

---

## Core Normalization Layers

### `lib/parse-purchase-agreement.js`

Purpose:
- sanitize and parse raw extracted values from AI
- convert money / APR / term / range strings into numeric forms
- preserve compatibility with the rest of the app

Key responsibilities:
- parse money values
- parse payment ranges and keep the lower number
- parse APR values
- parse term values like `72 Monthly`
- parse residual percent
- parse money factor
- parse lease mileage plan
- parse `paymentOptions[]`

### `lib/normalize-deal-data.js`

Purpose:
- enforce a stable normalized shape for extracted deal data
- derive higher-level deal scenario fields from the normalized numbers

Includes:
- stable field defaults
- type-safe numeric parsing
- derived schema helpers

Derived fields include:
- `sourceDocType`
- `transactionType`
- `vehicleCondition`
- `tradePresent`
- `tradeStatus`
- `cashDownStatus`
- `rebatePresent`
- `gapPresent`
- `serviceContractPresent`
- `selectedPaymentLow`
- `selectedPaymentHigh`
- `residualPercent`
- `moneyFactor`
- `leaseMileagePlan`
- `governmentFees`
- `acquisitionFee`
- `netCapCost`
- `programBucket`
- `scenarioKey`

### `lib/normalize-message-data.js`

Purpose:
- normalize message-graphic payloads into the front-end message rendering model

Includes defaults for:
- `graphicType`
- `reasonBadge`
- `headline`
- `subheadline`
- `vehicleTitle`
- `vehicleSubtitle`
- `messageBody`
- `ctaOptions`
- `contactName`
- `contactTitle`
- `contactPhone`
- `contactPhotoUrl`
- `themeVariant`
- `customerFirstName`

---

## External Dependencies / Enrichment

### Gemini

`/api/extract` uses Gemini server-side.

Environment variables:
- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL` (optional, default `gemini-2.5-flash`)

No client-side API key is used.

### Inventory matching

Inventory enrichment is best-effort and uses:
- VIN-first lookup
- stock fallback lookup

Base URL env var:
- `INVENTORY_MATCH_BASE_URL`

Default:
- `https://clark-inventory-finder.pages.dev`

### Staff photo lookup

Staff photo enrichment is best-effort and depends on staff name.

Base URL env var:
- `STAFF_PHOTO_BASE_URL`

Default:
- `https://clark-inventory-finder.pages.dev`

---

## Deployment

Config file:
- `wrangler.jsonc`

Current configuration:
- Cloudflare Pages project
- no framework preset / no build step
- `pages_build_output_dir` = `.`

Typical deploy setup:
1. Connect repo to Cloudflare Pages
2. Framework preset: None
3. Build command: empty
4. Build output directory: `.`
5. Add environment variables for Gemini and optional enrichment sources

---

## Repository Structure

Current important files/folders:

```text
offer-graphic-generator/
  index.html
  README.md
  wrangler.jsonc
  docs/
    OFFER_GRAPHIC_GENERATOR_DOCUMENTATION.md
  functions/
    api/
      extract.js
      render-graphic.js
  lib/
    parse-purchase-agreement.js
    normalize-deal-data.js
    normalize-message-data.js
```

---

## Business Rules / Operational Notes

### Extraction truth rule

For purchase / lease extraction:
- use Selected Terms when visible
- do not substitute lowest matrix payment unless Selected Terms is missing

### Inventory enrichment philosophy

Inventory enrichment is non-blocking:
- the app should still return usable extracted deal data if inventory lookup fails

### Staff photo enrichment philosophy

Staff photo lookup is non-blocking:
- missing photo should not break the offer graphic flow

### Message renderer contract philosophy

The render endpoint is intentionally strict:
- validates schema version
- validates required fields
- validates enum values
- validates CTA limits / lengths
- supports dry run

This makes it safer as an integration target for external tools such as Save-A-Deal.

---

## Current Strengths

- clear split between extraction and rendering APIs
- single-file SPA with low deployment complexity
- structured normalization layers already in place
- best-effort inventory and staff enrichment
- render endpoint is contract-driven and integration-friendly
- message-graphic mode supports externally generated payloads

---

## Current Gaps / Things To Watch

1. `README.md` currently documents the extraction flow better than the render-graphic flow. This documentation file fills that gap.
2. `normalizeDealData()` currently derives `vehicleCondition` using a simple year/mileage heuristic (`new` vs `unknown`) rather than a deeper new/used/CPO source of truth.
3. Non-templated graphic types are valid but currently fall back to the re-engagement layout.
4. Front-end logic lives primarily in `index.html`; future maintainability may benefit from extracting some client-side logic into dedicated files if complexity continues to grow.

---

## Recommended Documentation Maintenance

When the system changes, update this document for:
- new API routes
- new graphic types
- new schema versions
- changed environment variables
- front-end mode changes
- new enrichment sources
- template/fallback behavior changes

This file is intended to be the deeper architectural reference, while `README.md` can remain the lighter operational quick-start.
