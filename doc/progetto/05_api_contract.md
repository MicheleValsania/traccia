# API Contract

## Purpose

This document describes the Traccia API surface that remains relevant in the new operating model where:
- `CookOps` is the central governance and validation platform
- `Traccia` is the local operational execution platform

It is not a full endpoint dump.
It is the contract guide for the API areas that still matter after centralization.

## 1. Authentication and site context

### Auth
- `POST /api/auth/token`
- `GET /api/auth/me`

These endpoints remain the basis for local mobile authentication and site membership resolution.

## 2. Local operational APIs kept in Traccia

### Temperature execution
- `POST /api/temperatures/capture-preview`
- `POST /api/temperatures/confirm`
- `GET /api/temperatures?site_code=<SITE>&limit=<N>`
- `GET /api/reports/temperatures.csv?site_code=<SITE>[&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD][&sector_id=<uuid>]`

These endpoints remain relevant because temperature execution stays local to each point of sale.

### Label execution
- `GET /api/labels/profiles`
- `PATCH /api/labels/profiles/{profile_id}`
- `POST /api/labels/print`

Local label execution remains active in Traccia, but profiles are increasingly governed centrally from CookOps.

### Site-local structure
- `GET /api/cold-sectors`
- `POST /api/cold-sectors`
- `PATCH /api/cold-sectors/{sector_id}`
- `GET /api/cold-points`
- `POST /api/cold-points`
- `PATCH /api/cold-points/{point_id}`

These endpoints still exist locally, but the target governance path is increasingly driven from CookOps through HACCP sync APIs.

## 3. HACCP adapter APIs used by CookOps

### Registries and planning
- `GET /api/v1/haccp/sites/`
- `POST /api/v1/haccp/sites/sync/`
- `GET /api/v1/haccp/sectors/`
- `POST /api/v1/haccp/sectors/sync/`
- `PATCH /api/v1/haccp/sectors/{sector_id}/`
- `DELETE /api/v1/haccp/sectors/{sector_id}/`
- `GET /api/v1/haccp/cold-points/`
- `POST /api/v1/haccp/cold-points/sync/`
- `PATCH /api/v1/haccp/cold-points/{point_id}/`
- `DELETE /api/v1/haccp/cold-points/{point_id}/`
- `GET /api/v1/haccp/schedules/`
- `POST /api/v1/haccp/schedules/`
- `PATCH /api/v1/haccp/schedules/{schedule_id}/`
- `DELETE /api/v1/haccp/schedules/{schedule_id}/`

### Labels
- `GET /api/v1/haccp/label-profiles/`
- `POST /api/v1/haccp/label-profiles/`
- `PATCH /api/v1/haccp/label-profiles/{profile_id}/`
- `DELETE /api/v1/haccp/label-profiles/{profile_id}/`
- `GET /api/v1/haccp/label-sessions/`
- `POST /api/v1/haccp/label-sessions/`

### OCR and validation
- `GET /api/v1/haccp/ocr-results/`
- `POST /api/v1/haccp/ocr-results/{document_id}/validate/`

### Lifecycle and reporting
- `GET /api/v1/haccp/lifecycle-events/`
- `GET /api/v1/haccp/temperature-readings/`

These endpoints form the main Traccia-to-CookOps operational bridge.

## 4. Deprecated target flows

The following APIs may still exist during transition, but they are no longer the target product contract for central traceability ingestion:

### Immediate capture and draft-first flow
- `POST /api/capture/label-photo`
- `GET /api/lots/drafts`
- `POST /api/lots/{lot_id}/validate`
- `POST /api/lots/reconcile-identical`

Reason:
- incoming capture is moving to `continuous camera -> Drive -> CookOps import -> central validation`
- central lot creation should happen in CookOps, not from local phone-first validation

## 5. Lifecycle note

`Lifecycle` is no longer considered a standalone long-term mobile module.

The remaining local operational need is:
- using a centrally governed label profile
- selecting or confirming a source lot
- executing the label and local operational event

This behavior is expected to move inside the label workflow rather than remain as an autonomous lifecycle area.

## 6. Contract guidance

### Stable direction
- keep local operational APIs in Traccia
- keep HACCP adapter APIs for CookOps
- centralize validation and governance in CookOps

### Avoid for new development
- building new product logic on immediate local OCR validation
- extending standalone lifecycle UI contracts
- treating Traccia as the central document validation backend

## 7. Related documents

- `doc/progetto/17_target_operating_model.md`
- `doc/progetto/18_documentation_inventory.md`
- `doc/progetto/03_architecture.md`
- `doc/progetto/15_capture_worker_backup_workflow.md`
