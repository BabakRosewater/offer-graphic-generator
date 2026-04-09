# offer-graphic-generator

Cloudflare Pages single-page app for turning purchase agreement uploads into reviewable offer graphic data.

## Architecture (current behavior)

- **Frontend (`index.html`)**
  - Accepts PDF and image uploads
  - Converts PDF first page to image client-side with `pdf.js`
  - Sends JSON to `/api/extract`:
    ```json
    { "mimeType": "image/png", "imageBase64": "..." }
    ```
  - Keeps review/edit form, live preview, and `html2canvas` download flow
- **Backend (`functions/api/extract.js`)**
  - Calls Gemini server-side
  - Reads `GEMINI_API_KEY` and optional `GEMINI_MODEL` from Cloudflare env
  - Optionally enriches extracted vehicle metadata using inventory endpoint
  - Returns normalized JSON payload
- **Normalization (`lib/normalize-deal-data.js`)**
  - Enforces stable output shape and type-safe numeric parsing
- **Parsing helpers (`lib/parse-purchase-agreement.js`)**
  - Parses money/APR/term/payment strings
  - Handles term strings like `72 Monthly`
  - Handles payment ranges like `$429 - $464` and returns the lower value
  - Parses optional `paymentOptions` arrays into normalized `{ term, apr, payment }` rows

## Critical business rule

Payment/APR/term must come from Selected Terms when visible.
Do not use lowest matrix payment unless Selected Terms is missing.

## Environment variables (Cloudflare Pages)

- `GEMINI_API_KEY` (required)
- `GEMINI_MODEL` (optional, default: `gemini-2.5-flash`)
- `INVENTORY_MATCH_BASE_URL` (optional, default: `https://clark-inventory-finder.pages.dev`)

No client-side API key is used.

## Optional inventory enrichment (best-effort)

After Gemini extraction succeeds, `/api/extract` can call:

- `${INVENTORY_MATCH_BASE_URL}/api/vehicle-match?vin=...` (preferred first)
- `${INVENTORY_MATCH_BASE_URL}/api/vehicle-match?stock=...` (fallback)

This enrichment is non-blocking. If inventory lookup fails/times out/no-match, the endpoint still returns Gemini-normalized data.

## Derived deal-type schema (v1)

Normalized output now includes an automatic derived scenario layer:

- `sourceDocType`, `transactionType`, `vehicleCondition`
- `tradePresent`, `tradeStatus`, `cashDownStatus`
- `rebatePresent`, `gapPresent`, `serviceContractPresent`
- `selectedPaymentLow`, `selectedPaymentHigh`
- `residualPercent`, `moneyFactor`, `leaseMileagePlan`
- `governmentFees`, `acquisitionFee`, `netCapCost`
- `programBucket`, `scenarioKey`

Current starter categories supported:

- finance purchase
- lease
- no trade
- positive equity trade
- rebate
- no rebate
- zero down

Planned future schema expansion:

- negative equity refinements
- actual cash down variants
- used / CPO distinctions
- more gap/service contract positive examples
- cash purchase variants

## API response shape

### Success

```json
{
  "ok": true,
  "source_type": "image_ai_fallback",
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
    "vehicleMileage": 0,
    "imageUrl": "",
    "inventoryStatus": "",
    "inventoryMatchType": "",
    "governmentFees": 0,
    "cashDown": 0,
    "paymentOptions": [{ "term": 60, "apr": 1.99, "payment": 427 }]
  }
}
```

### Error

```json
{
  "ok": false,
  "error": "...",
  "stage": "validation | extract",
  "source_type": "image_ai_fallback"
}
```

## Deploy

1. Connect repo to Cloudflare Pages.
2. Framework preset: `None`
3. Build command: *(empty)*
4. Build output directory: `.`
5. Add environment variables above and deploy.

## Structure

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
