Traceability App - Client Requirements (Michele)

1. Vision

Build a mobile-first application for HACCP traceability operations in professional kitchens, integrated with:

- Export v1.1 from Fiches Recettes (knowledge layer)
- Claude API for OCR and decision support
- Google Drive for photo storage
- Django + PostgreSQL backend

2. Main goals

- Create lots quickly from label photos
- Automate lot and DLC extraction with AI
- Manage lifecycle transformations
- Generate automatic expiry alerts
- Keep full audit trail
- Keep operations linear and fast for kitchen staff

3. Operational modes

Mode A - Flusso completo (Photo + Analysis + Validation)

- Take photo
- Automatic upload to Google Drive (mandatory)
- Automatic OCR extraction
- Draft creation
- Immediate operator validation
- Optional lifecycle transformation
- Optional label generation/printing

Mode B - Modalita camera (rapid capture)

- Take photos quickly with minimum friction
- Automatic upload to Google Drive (mandatory)
- Automatic OCR extraction in backend
- Deferred draft validation from draft queue

Note: Default UX is Mode B (`Modalita camera`) to maximize speed on phone.
Analysis still runs in backend; immediate validation is optional via Mode A.

4. Functional requirements (current scope)

- Mobile capture with camera-first UX and gallery fallback
- OCR extraction payload fields:
  - supplier_lot_code
  - dlc_date
  - weight
  - product_guess
- OCR warnings (non-blocking)
- Draft list and validation
- Lifecycle transform endpoint
- Reports by period/supplier/category (CSV + PDF)
- Alerts D-3, D-2, D-1, expired

5. Non-functional requirements

- Multi-site support (progressive rollout)
- Role-based access
- Immutable audit trail
- UTC timestamps + site timezone (`Europe/Paris`)
- Resilient behavior with incomplete OCR data
- No runtime dependency on Fiches app (import-only boundary)

6. UX/Process constraints

- Keep operator flow minimal in kitchen
- Prefer one-tap actions where possible
- Tablet and desktop must support fast validation and transformation
- Mobile remains the primary capture channel

7. Fiches handoff alignment (2026-02-24)

Source: `C:\Users\user\fiches-recettes\traceability_handoff.json`

- Dataset size from source system: about 95 fiches
- Source status: stable, with quality backlog
- Known data gaps to handle in ingest:
  - partial ingredient-to-product mapping coverage
  - residual encoding artifacts on a subset of records
  - PDF not suitable as primary machine source
- Ingest policy:
  - strict validation for required arrays/types
  - reject malformed IDs and unparseable dates
  - product resolution strategy:
    - primary key: `supplier_product_id`
    - fallback: `supplier_id + normalized product name` with review queue
- Traceability acceptance targets:
  - v1.1 ingest success rate >95%
  - auto ingredient-product match rate >85%
  - price coverage >80% on mapped ingredients
