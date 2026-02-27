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
- `POST /api/lots/reconcile-identical`
  - merge ammesso solo per lotti con parametri critici identici
  - mantiene relazione N:1 tra righe documento e lotto (`LotDocumentMatch`)

Request body (`/api/lots/reconcile-identical`):

```json
{
  "site_code": "TOURNELS01",
  "fiche_product_id": "optional-uuid",
  "supplier_name": "Miko",
  "supplier_lot_code": "LOT-ABC-123",
  "dlc_date": "2026-03-15",
  "quantity_value": "4.000",
  "quantity_unit": "kg",
  "package_count": 20,
  "critical_attributes": {
    "supplier_product_id": "561fa673-9b83-4c95-a3ea-fbd55370f8f0",
    "allergen_signature": "fish"
  },
  "document_lines": [
    {
      "document_type": "DELIVERY_NOTE",
      "document_number": "BL-2026-00077",
      "line_ref": "10",
      "supplier_product_id": "561fa673-9b83-4c95-a3ea-fbd55370f8f0",
      "qty_value": "4.000",
      "qty_unit": "kg"
    }
  ]
}
```

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
