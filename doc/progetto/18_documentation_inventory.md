# Documentation Inventory and Cleanup Plan

## Objective

This document classifies the current Traccia documentation before functional cleanup of `main`.

Statuses used:
- `keep`: still aligned with the target product and can remain with limited edits.
- `rewrite`: useful subject, but content is partially outdated and should be rewritten.
- `archive`: historical reference only, should move out of the main reading path.
- `delete_later`: remove after content has been merged elsewhere.

## Core docs to keep visible

| File | Status | Action |
|---|---|---|
| `README.md` | rewrite | Rewrite around the new target model: Traccia local execution, CookOps central governance. |
| `doc/progetto/17_target_operating_model.md` | keep | Becomes the primary scope reference for Traccia. |
| `doc/progetto/03_architecture.md` | rewrite | Update architecture boundaries with CookOps centralization and Drive inbox flow. |
| `doc/progetto/05_api_contract.md` | keep | Rewritten around local execution APIs, HACCP adapter APIs and the upload-only capture endpoint. |
| `doc/progetto/15_capture_worker_backup_workflow.md` | rewrite | Keep only the continuous camera and central ingestion flow. |
| `doc/progetto/16_label_printer_implementation.md` | keep | Still relevant because label execution remains local in Traccia. |

## Docs to rewrite because the product model changed

| File | Status | Reason |
|---|---|---|
| `doc/progetto/01_requirements.md` | rewrite | Still describes immediate OCR and mobile-first draft validation as target flows. |
| `doc/progetto/04_data_model.md` | rewrite | Data model must reflect central lot governance and reduced local lifecycle autonomy. |
| `doc/progetto/06_ai_integration.md` | rewrite | AI extraction must move from immediate local flow to central CookOps validation flow. |
| `doc/progetto/08_roadmap.md` | rewrite | Roadmap phases are no longer aligned with the new product boundary. |
| `doc/progetto/11_web_tablet_mvp.md` | archive | Web/tablet scope has effectively moved into CookOps. |
| `doc/progetto/12_cookops_traceability_contract_v1.md` | rewrite | Keep as integration history, but align to current real adapter/API model. |
| `doc/progetto/13_lifecycle_human_search_contract.md` | archive | Standalone lifecycle search is no longer a main Traccia UI target. |
| `doc/progetto/14_label_payload_contract.md` | rewrite | Keep because labels remain local, but remove assumptions about standalone lifecycle UI. |

## Docs to archive under legacy

| File | Status | Reason |
|---|---|---|
| `doc/progetto/09_fiches_exort_contract.md` | archive | Historical integration note; not a central Traccia concern anymore. |
| `doc/progetto/10_mermaid.md` | archive | Keep only if diagrams are refreshed, otherwise move to legacy. |
| `doc/progetto/11_web_tablet_mvp.md` | archive | Web execution is now a CookOps concern. |
| `doc/progetto/13_lifecycle_human_search_contract.md` | archive | Refers to a lifecycle UI that is being removed. |
| `doc/progetto/compatibility_contract.md` | archive | Historical compatibility note; should not stay in the primary reading path. |
| `doc/progetto/schemas/cookops_fish_burger_mapped_example.json` | archive | Example payload, useful only as historical reference. |
| `doc/progetto/schemas/cookops_traccia_envelope_1.0.0.schema.json` | archive | Keep only as legacy integration schema reference. |

## Docs to inspect manually before final action

| File | Status | Action |
|---|---|---|
| `doc/progetto/02_stack.md` | keep | Likely still valid, but should be checked against actual deploy/runtime stack. |
| `doc/progetto/07_security_and_compliance.md` | keep | Likely reusable with limited wording changes. |
| `doc/progetto/00_introduction` | rewrite | Convert into a proper markdown intro or merge into README. |

## Proposed target structure

### Primary docs
- `README.md`
- `doc/progetto/17_target_operating_model.md`
- `doc/progetto/03_architecture.md`
- `doc/progetto/05_api_contract.md`
- `doc/progetto/15_capture_worker_backup_workflow.md`
- `doc/progetto/16_label_printer_implementation.md`

### Secondary docs
- `doc/progetto/04_data_model.md`
- `doc/progetto/07_security_and_compliance.md`
- `doc/progetto/12_cookops_traceability_contract_v1.md`
- `doc/progetto/14_label_payload_contract.md`

### Legacy archive
- `doc/progetto/legacy/...`

## Suggested cleanup order

1. Rewrite `README.md`.
2. Rewrite `03_architecture.md`.
3. Rewrite `15_capture_worker_backup_workflow.md`.
4. Rewrite `12_cookops_traceability_contract_v1.md`.
5. Move deprecated lifecycle and web/tablet docs to `legacy/`.
6. Revisit `04_data_model.md` once the Traccia main cleanup starts.
