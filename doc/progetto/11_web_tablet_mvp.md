# Web + Tablet MVP (Execution Plan)

Date: 2026-02-25
Owner: traccia team

## 1. Goal

Deliver one responsive React web app for PC and tablet to manage traceability operations after mobile capture:

- Fast draft validation
- Lifecycle operations
- Alerts and exports
- Base parameters for data quality

Mobile remains camera-first for fast capture.

## 2. Scope

### In scope (MVP)

1. `Lotti`
- Draft list with filters (status, date, supplier, category, site_code)
- Single draft validation (drawer/panel)
- OCR warnings visibility
- Link to related fiche/product (if matched)

2. `Lifecycle`
- Active lots list
- Allowed transformations based on profile/rules
- Confirmation flow with new DLC preview

3. `Alert / Report`
- Alert list by urgency (expired, D-1, D-3)
- CSV/PDF export with existing backend filters

4. `Parametri` (base only)
- Fiches import trigger + import status
- Product guess unresolved queue (read + manual mapping entry point)

### Out of scope (post-MVP)

- Full label design studio
- Advanced analytics dashboards
- Complex batch operations with partial rollback

## 3. Information Architecture

Single app, shared routes:

1. `/lots`
2. `/lifecycle`
3. `/alerts-reports`
4. `/settings`
5. `/labels` (placeholder in MVP, full flow in phase 2)

Navigation behavior:

- Desktop: left sidebar
- Tablet: bottom navigation bar
- Same routes, same API, responsive layout only

## 4. UX Rules

1. Camera and heavy capture remain on mobile
2. Web/tablet optimize review and validation speed
3. One primary action per screen
4. Warnings never hidden; blocking warnings prevent batch validate
5. Keep forms linear, avoid deep modal chains

## 5. API Contract Usage (Existing Backend)

Primary endpoints already available:

- `POST /api/auth/token`
- `GET /api/auth/me`
- `GET /api/lots/drafts?site_code=...`
- `POST /api/lots/{lot_id}/validate`
- `POST /api/lots/{lot_id}/transform`
- `GET /api/alerts?site_code=...`
- `GET /api/reports/lots.csv?...`
- `GET /api/reports/lots.pdf?...`
- `POST /api/import/fiches`

MVP frontend must not fork business rules from backend.

## 6. Validation Rules (MVP)

1. Draft validation requires:
- site role in allowed set
- essential fields present/corrected

2. Batch validate policy:
- only rows with no blocking warning
- rows with warnings stay pending

3. Lifecycle action policy:
- only active lots
- only allowed transformations
- action must produce auditable event

## 7. Delivery Plan

## Sprint 1 (core operations)

1. Auth + session shell
2. Lots page (filters + table + single validate panel)
3. Basic warning taxonomy in UI
4. Tablet responsive behavior for lots page

Acceptance:
- operator validates drafts from tablet/pc without backend changes

## Sprint 2 (continuity)

1. Lifecycle page with transformation flow
2. Alerts + CSV/PDF exports
3. Settings base section (fiches import status + unresolved guesses list hook)
4. Labels page placeholder and routing

Acceptance:
- end-to-end from mobile capture to validated + transformed lot + exported report

## 8. Technical Notes

1. Keep one React codebase for PC/tablet
2. Reuse API client patterns from existing projects where possible
3. Keep strict typing for DTOs (draft, warning, transform, alert)
4. Add minimal component tests for critical forms and warning behavior

## 9. Risks and Mitigations

1. Risk: UX drift between mobile and web terminology
- Mitigation: shared glossary (`Modalita camera`, `Modalita flusso completo`, `draft`, `validated`, `transformed`)

2. Risk: slow validation if table interactions are heavy
- Mitigation: server-side filters + optimistic UI updates for row status

3. Risk: unresolved OCR product guesses grow over time
- Mitigation: dedicated unresolved queue in settings with clear owner workflow

## 10. Next Action

Create web app skeleton and implement Sprint 1 route `/lots` first.
