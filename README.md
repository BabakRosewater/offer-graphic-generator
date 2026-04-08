# offer-graphic-generator

Cloudflare Pages static app for generating offer graphics from Clark Hyundai purchase agreements.

## Phase 1 scope (implemented)

Phase 1 implements deterministic **PDF text extraction** and parsing for Clark Hyundai purchase agreement PDFs.

- Static single-page app in `index.html`
- Cloudflare Pages Function endpoint at `functions/api/extract.js`
- Parser and normalizer modules in `lib/`
- Manual review/edit and preview/download flow remains in place

## What changed in phase 1

- Removed client-side Gemini/API-key extraction path
- Upload now accepts `application/pdf,image/*`
- Front end sends uploaded file to `/api/extract`
- PDF flow:
  1. Extract raw text from PDF streams in the function
  2. Parse deterministic Clark Hyundai fields
  3. Normalize to UI data contract
  4. Return JSON to browser for form population
- Image flow currently returns `501` with:
  - `Image extraction not implemented in phase 1`

## Critical business rule

For **payment**, **APR**, and **term**, extraction uses the **Selected Terms** section as source of truth.

Only if Selected Terms values are missing does the normalizer fall back to payment matrix values.

## Current limitations

- PDF extraction relies on readable text content streams and Flate decoding available in Worker runtime.
- Scanned/image-only PDFs are not OCR’d in phase 1.
- Image uploads are intentionally not implemented yet (phase 2).
- No Gemini fallback in this phase.

## Local development

### Prerequisites

- Node.js 18+
- Wrangler 3+

### Run

```bash
npm install
npx wrangler pages dev .
```

Then open the local URL from Wrangler and upload a purchase agreement PDF.

## Deploy (Cloudflare Pages)

1. Connect this repository to Cloudflare Pages.
2. Set build output directory to the repository root (`.`).
3. Ensure Pages Functions are enabled (the `functions/` directory is auto-detected).
4. Deploy.

No API keys are required for phase 1, and no secrets are hardcoded.

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

## Phase 2 (not included yet)

- Image extraction/OCR path
- Gemini fallback for non-deterministic cases
- Additional document families beyond Clark Hyundai purchase agreements
