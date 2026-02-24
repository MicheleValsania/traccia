API Contract (Current)

Auth

- `POST /api/auth/token`
- `GET /api/auth/me`

Knowledge import

- `POST /api/import/fiches`
  - imports export v1.1 from Fiches
  - must enforce strict envelope validation on arrays/primitive types
  - should reject malformed IDs and unparseable dates
  - should persist import warnings for operational review

Sites

- `POST /api/sites`
- `GET /api/sites`

Capture flow

- `POST /api/capture/label-photo`

Request body:

```json
{
  "site_code": "TOURNELS01",
  "supplier_name": "optional",
  "file_name": "capture.jpg",
  "file_mime_type": "image/jpeg",
  "file_b64": "<base64>"
}
```

Response body:

```json
{
  "lot_id": "uuid",
  "internal_lot_code": "TOURNELS01-20260224-0001",
  "draft_status": "DRAFT",
  "ocr_result": {
    "supplier_lot_code": "",
    "dlc_date": "",
    "weight": "",
    "product_guess": "",
    "confidence": 0.8,
    "ai_suggested": true,
    "provider": "claude",
    "fallback_reason": ""
  },
  "ocr_provider": "claude",
  "ocr_warnings": [],
  "product_suggestions": [],
  "asset": {
    "drive_file_id": "string",
    "drive_link": "https://..."
  }
}
```

Drafts and validation

- `GET /api/lots/drafts?site_code=TOURNELS01`
- `POST /api/lots/{lot_id}/validate`

Lifecycle

- `POST /api/lots/{lot_id}/transform`

Alerts

- `GET /api/alerts?site_code=TOURNELS01`

Reports

- `GET /api/reports/lots.csv?site_code=TOURNELS01&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`
- `GET /api/reports/lots.pdf?site_code=TOURNELS01&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`

Operational rule

- All capture modes must keep this invariant:
  - photo upload to Google Drive is automatic and mandatory before analysis output is finalized.

Ingest quality policy (from upstream handoff)

- Product resolution:
  - primary: `supplier_product_id`
  - fallback: `supplier_id + normalized product name` with review queue
- Price policy:
  - use exported `unit_price_value` when present
  - fallback to product master lookup when `supplier_product_id` exists
