# offer-graphic-generator

Cloudflare Pages static app for generating offer graphics from Clark Hyundai purchase agreements.

## Current architecture

- Static single-page app in `index.html`
- Cloudflare Pages Function endpoint at `functions/api/extract.js`
- Deterministic parser and normalizer modules in `lib/`
- Manual review/edit + preview/download flow remains in place

## Extraction flow (phase 1.5 / AI-assisted)

### 1) PDF path

1. Try deterministic PDF text extraction and parser first.
2. Normalize parsed output with `lib/normalize-deal-data.js`.
3. If data is too weak/incomplete, fallback to Gemini.

`source_type` values:
- `pdf_text` (deterministic success)
- `pdf_ai_fallback` (Gemini used after deterministic shortfall)

### 2) Image path

- Send image directly to Gemini extraction.
- Normalize output with `lib/normalize-deal-data.js`.

`source_type` value:
- `image_ai_fallback`

## Critical business rule

For **payment**, **APR**, and **term**:
- Use **Selected Terms** when visible.
- Do **not** use lowest matrix payment unless Selected Terms is missing.

This rule is enforced in deterministic normalization and explicitly required in Gemini prompt instructions.

## Gemini configuration

Set these as Cloudflare Pages environment variables/secrets:

- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)

No API key is used client-side.

## API response shape

### Success

```json
{
  "ok": true,
  "source_type": "pdf_text | pdf_ai_fallback | image_ai_fallback",
  "data": {
    "customerName": "",
    "vehicleName": "",
    "retailPrice": 0,
    "discount": 0,
    "tradeEquity": 0,
    "amountFinanced": 0,
    "payment": 0,
    "apr": 0,
    "term": 0,
    "salesPrice": 0,
    "totalSalesPrice": 0,
    "tradeAllowance": 0,
    "tradePayoff": 0,
    "customerPhone": "",
    "stockNumber": "",
    "vin": "",
    "vehicleColor": "",
    "vehicleMileage": 0
  }
}
```

### Error

```json
{
  "ok": false,
  "error": "...",
  "stage": "validation | extract"
}
```

`source_type` may be included when available.

## Current limitations

- Deterministic PDF extraction still depends on readable text streams.
- Gemini extraction quality depends on model output consistency.
- Large files may hit provider/runtime limits.

## Local development

### Prerequisites

- Node.js 18+
- Wrangler 3+

### Run

```bash
npm install
npx wrangler pages dev .
```

Then open the local URL from Wrangler and upload a PDF/image.

## Deploy (Cloudflare Pages)

1. Connect repository to Cloudflare Pages.
2. Use build output directory `.`
3. Keep Framework preset as `None`.
4. Add `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) in Pages environment variables/secrets.
5. Deploy.

## Expected structure

```text
offer-graphic-generator/
  index.html
  README.md
  wrangler.jsonc
  functions/
    api/
      extract.js
  lib/
    parse-purchase-agreement.js
    normalize-deal-data.js
```
