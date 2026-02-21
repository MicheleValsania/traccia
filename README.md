# Traceability App

Implementazione iniziale allineata alle decisioni di progetto:

- Fase 1 subito operativa: `foto -> Drive -> OCR -> draft -> convalida su tablet/PC`
- Report per `periodo`, `fornitore`, `categoria` con export `CSV + PDF`
- Alert scadenza: `D-3`, `D-2`, `D-1`, `scaduto`
- Timezone: `Europe/Paris`
- Import fiches: manuale via endpoint
- Convalida draft consentita anche a `OPERATOR`
- Auth base via token + RBAC per sito
- Audit log immutabile con hash chain

## Struttura

- `backend/`: Django + DRF (API e regole Fase 1)
- `mobile/`: Expo React Native (mobile-first capture rapido)

## Backend - avvio locale

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py makemigrations core
python manage.py migrate
python manage.py bootstrap_admin --username admin --password ChangeMe123! --site-code PARIS01 --site-name "Cucina Paris"
python manage.py runserver
```

### Endpoint principali (Fase 1)

- `POST /api/auth/token`
- `GET /api/auth/me`
- `POST /api/sites`
- `POST /api/import/fiches`
- `POST /api/capture/label-photo`
- `GET /api/lots/drafts?site_code=PARIS01`
- `POST /api/lots/{lot_id}/validate`
- `POST /api/lots/{lot_id}/transform`
- `GET /api/alerts?site_code=PARIS01`
- `GET /api/reports/lots.csv?site_code=PARIS01&from_date=2026-02-01&to_date=2026-02-21`
- `GET /api/reports/lots.pdf?site_code=PARIS01&from_date=2026-02-01&to_date=2026-02-21`

### Note integrazione esterna

- Upload Drive e OCR Claude sono implementati con stub in `backend/core/services.py`
- Se abiliti env di integrazione, vengono usati provider reali:
  - `GOOGLE_DRIVE_ENABLED=1`
  - `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=<path-json>`
  - `GOOGLE_DRIVE_FOLDER_ID=<folder-id>`
  - `GOOGLE_DRIVE_RETRY_ATTEMPTS=3`
  - `GOOGLE_DRIVE_RETRY_BASE_SLEEP_S=0.6`
  - `CLAUDE_ENABLED=1`
  - `ANTHROPIC_API_KEY=<key>`
  - `ANTHROPIC_MODEL=claude-3-5-sonnet-latest`
  - `CLAUDE_RETRY_ATTEMPTS=3`
  - `CLAUDE_RETRY_BASE_SLEEP_S=0.8`
- In mancanza di env validi, il sistema usa fallback stub senza interrompere il flusso operativo
- OCR normalizza automaticamente:
  - date francesi (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD mois YYYY`) -> `YYYY-MM-DD`
  - peso (`2,5 kg`, `500gr`) -> formato coerente
  - codice lotto fornitore in uppercase pulito
- OCR aggiunge warning non bloccanti nel draft (`ocr_warnings`) per ridurre errori operativi:
  - lotto fornitore mancante
  - DLC mancante/non valida/nel passato/troppo lontana
  - peso mancante o implausibile
  - prodotto suggerito assente

## Mobile - avvio locale

```powershell
cd mobile
npm install
npm run start
```

Configura endpoint backend per telefono fisico creando `mobile/.env`:

```dotenv
EXPO_PUBLIC_API_BASE=http://<IP_DEL_TUO_PC>:8000
```

Nota: `EXPO_PUBLIC_API_BASE` puo essere con o senza `/api`, l'app normalizza automaticamente.

### Flusso UI implementato

- Login token
- Scatto foto etichetta e invio a backend
- Visualizzazione risultato OCR + suggerimenti prodotto top-3
- Lista draft da convalidare
- Apertura report CSV/PDF

### Struttura mobile (refactor componenti)

- `mobile/App.tsx`: orchestratore stato + tab
- `mobile/src/api.ts`: chiamate backend
- `mobile/src/types.ts`: tipi condivisi
- `mobile/src/styles.ts`: stile condiviso
- `mobile/src/components/AuthCard.tsx`
- `mobile/src/components/WarningList.tsx`
- `mobile/src/screens/CaptureScreen.tsx`
- `mobile/src/screens/DraftsScreen.tsx`
- `mobile/src/screens/LifecycleScreen.tsx`
- `mobile/src/screens/ReportsScreen.tsx`

## Esempi payload

### 1) Creazione sito

```json
{
  "code": "PARIS01",
  "name": "Cucina Parigi Centro",
  "timezone": "Europe/Paris"
}
```

### 2) Import fiches manuale

```json
{
  "export_version": "1.1",
  "source_app": "fiches-recettes",
  "fiches": [
    {
      "fiche_id": "11111111-1111-1111-1111-111111111111",
      "title": "Poulet fermier",
      "language": "fr",
      "category": "Carni",
      "allergens": [],
      "storage_profiles": [],
      "label_hints": null
    }
  ]
}
```

### 3) Capture foto etichetta

```json
{
  "site_code": "PARIS01",
  "supplier_name": "Fornitore A",
  "file_name": "lot_ab12_2026-03-19.jpg",
  "file_b64": "<base64>"
}
```

### 4) Convalida draft

```json
{
  "fiche_product_id": "11111111-1111-1111-1111-111111111111",
  "supplier_lot_code": "LOT-AB12",
  "dlc_date": "2026-03-19",
  "quantity_value": "12.5",
  "quantity_unit": "kg",
  "category": "Carni",
  "validated_by": "operatore.rossi",
  "role": "OPERATOR"
}
```

### 5) Lifecycle transform (base fase 2)

```json
{
  "action": "FREEZING",
  "output_dlc_date": "2026-04-15",
  "output_quantity_value": "10.0",
  "output_quantity_unit": "kg",
  "note": "Abbattuto e porzionato"
}
```
