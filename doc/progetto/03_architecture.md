# System Architecture

## 1. Application boundary

The product is now split across two applications with different responsibilities.

- `Traccia`: local mobile execution for each point of sale
- `CookOps`: central governance, validation and traceability consolidation

This separation replaces the previous mobile-first standalone model.

## 2. High-level architecture

```text
Continuous Camera (Traccia site)
            |
            v
        Google Drive
            |
            v
CookOps central import and OCR validation
            |
            v
Central lot creation and document reconciliation
            |
            v
Operational execution in Traccia
- labels
- temperatures
- cleaning
```

## 3. Responsibility split

### Traccia

Traccia is the local execution layer.

It is responsible for:
- continuous camera capture on site
- local temperature execution by sector and cold point
- local label execution using profiles governed in CookOps
- local cleaning task execution
- local operational events linked to the label flow

It is not the source of truth for central document validation anymore.

### CookOps

CookOps is the central state and governance layer.

It is responsible for:
- importing photos from Drive
- OCR extraction and validation
- manual upload of delivery notes and invoices
- matching and reconciliation of supporting documents
- central lot creation
- HACCP planning and structure management
- label profile governance
- distribution of central lots to units

## 4. Architectural principles

- Central documents enter the system as central data first.
- Local execution stays on site in Traccia.
- Configuration and planning are governed centrally in CookOps.
- Lifecycle is no longer a standalone Traccia section.
- The remaining local lifecycle logic is embedded into the label workflow.
- Immediate OCR from single-photo mobile capture is deprecated.
- Continuous camera capture remains the only target camera flow.
- Cross-app integration must remain explicit and auditable.

## 5. Core data flows

### 5.1 Continuous camera flow

1. A site uses the Traccia continuous camera.
2. Images are sent to Drive or the central ingestion path.
3. CookOps imports the files.
4. OCR extraction runs centrally.
5. A central operator validates and corrects the extracted data.
6. CookOps creates or consolidates the central lot.

### 5.2 Document flow

1. Delivery notes and invoices are uploaded manually in CookOps.
2. They are linked to central dossiers or lots.
3. They are used to confirm quantities, dates and supplier references.

### 5.3 Local operational flow

1. CookOps defines label profiles, planning and structures.
2. Traccia receives the local execution context.
3. The operator executes:
- temperature readings
- labels
- cleaning tasks
4. Execution evidence remains visible centrally through shared APIs and reports.

## 6. Target mobile modules in Traccia

### Keep
- Camera: continuous mode only
- Temperature
- Labels
- Cleaning
- Minimal site and device parameters

### Reduce
- local configuration that duplicates central governance
- flows that create central data directly from the phone

### Remove
- standalone Lifecycle module
- immediate OCR and validation from single-photo capture

## 7. Integration boundary

### Data governed by CookOps
- OCR validation
- delivery notes and invoices
- central lots
- HACCP planning
- sectors and cold points structure
- label profiles

### Data executed in Traccia
- temperature measurements
- local label execution
- local cleaning completion
- source lot confirmation during label execution

## 8. Transitional state

Some backend lifecycle and lot-related capabilities still exist in Traccia during the cleanup phase.

They should be treated as transitional until:
- lifecycle UI is removed from mobile
- local immediate OCR flow is removed
- label execution fully absorbs the remaining local lifecycle actions

## 9. Reference documents

- `doc/progetto/17_target_operating_model.md`
- `doc/progetto/18_documentation_inventory.md`
- `doc/progetto/15_capture_worker_backup_workflow.md`
- `doc/progetto/16_label_printer_implementation.md`
