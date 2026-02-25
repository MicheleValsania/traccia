Development Roadmap

Phase 1 - Operational MVP (current)

- Auth + RBAC base
- Fiches import
- Capture flow:
  - photo
  - Drive upload
  - OCR extraction
  - draft creation
- Draft validation
- Expiry alerts
- Reports CSV/PDF
- OCR diagnostics (provider/fallback reason)
- Fiches ingest quality baseline:
  - strict validation
  - import warning visibility
  - baseline metrics (ingest success, mapping rate, price coverage)

Phase 2 - Operational speed modes

- Mode A Flusso completo:
  - capture -> drive -> OCR -> immediate validation flow
- Mode B Modalita camera (default):
  - rapid capture, deferred validation queue
- Keep Drive upload mandatory in both modes

Phase 3 - Lifecycle and labels

- Full lifecycle actions from mobile/web
- Post-validation transformation shortcuts
- Label generation and print flow

Phase 4 - Web responsive PC + Tablet

- Single React web app
- Desktop layout for fast bulk validation
- Tablet layout with tap-first UX
- Same backend/API as mobile

Phase 5 - Documents and matching

- Delivery/sales docs ingestion
- OCR and assisted matching against lots
- Operator confirmation workflow

Phase 6 - Multi-site hardening

- Multi-site rollout
- Role refinements (admin/manager/chef/operator/auditor)
- Monitoring, backup, retention and compliance hardening
- Data quality SLAs on upstream Fiches ingest pipeline
