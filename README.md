# Traccia

Traccia is the local operational mobile app for point-of-sale traceability execution.

The target operating model is now split across two applications:
- `Traccia`: local execution on site
- `CookOps`: central governance, validation and traceability consolidation

## Current product role

Traccia remains responsible for:
- continuous camera capture on site
- local temperature execution
- local label execution
- local cleaning execution
- local operational events linked to label flows

CookOps is responsible for:
- Drive photo import
- OCR extraction and validation
- manual upload of delivery notes and invoices
- central lot creation and reconciliation
- HACCP planning and structure governance
- label profile governance

## Scope kept in Traccia

### Camera
- continuous camera flow only
- no immediate single-photo OCR workflow as target product flow

### Temperature
- execution of local measurements by sector and cold point
- local visibility of measurements
- central visibility through CookOps reports

### Labels
- execution based on label profiles prepared in CookOps
- source lot insertion or confirmation on site
- local printing and operational event registration

### Cleaning
- execution and completion of local cleaning tasks

## Scope being deprecated in Traccia

- standalone `Lifecycle` section
- immediate OCR extraction from single-photo camera flows
- local validation of extracted traceability data
- local creation of central traceability records outside CookOps governance

Lifecycle logic that still belongs to local execution is expected to move inside the `Labels` workflow.

## Repository structure

- `backend/`: Django + DRF backend
- `mobile/`: Expo React Native mobile application
- `doc/progetto/17_target_operating_model.md`: target mobile scope and Traccia/CookOps boundary
- `doc/progetto/18_documentation_inventory.md`: documentation cleanup plan
- `doc/progetto/15_capture_worker_backup_workflow.md`: capture and backup workflow, to be rewritten around the continuous camera model
- `doc/progetto/16_label_printer_implementation.md`: label printer implementation notes

## Local backend setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

The backend reads environment variables from `backend/.env` when present.

## Local mobile setup

```powershell
cd mobile
npm install
npm run start
```

Recommended mobile env:

```dotenv
EXPO_PUBLIC_API_BASE=https://<your-traccia-backend>.up.railway.app
```

For local backend testing:

```dotenv
EXPO_PUBLIC_API_BASE=http://<YOUR-PC-IP>:8000
```

## Main backend capabilities currently exposed

- authentication and site membership
- HACCP adapter endpoints used by CookOps
- local temperature execution endpoints
- label profile and print endpoints
- OCR result queue and validation endpoints
- lifecycle and lot-related backend capabilities still present during transition

## Documentation priority

Read in this order:
1. `doc/progetto/17_target_operating_model.md`
2. `doc/progetto/18_documentation_inventory.md`
3. `doc/progetto/03_architecture.md`
4. `doc/progetto/15_capture_worker_backup_workflow.md`
5. `doc/progetto/16_label_printer_implementation.md`

## Branching note

A preservation branch exists for the pre-cleanup state:
- `archive/pre-cookops-centralization`
