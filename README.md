# Traceability App

Implementazione iniziale allineata alle decisioni di progetto:

- Fase 1 subito operativa: `foto -> Drive -> OCR -> draft -> convalida su tablet/PC`
- Due modalita operative: `Modalita camera` (default rapido) e `Modalita flusso completo`
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
- `doc/progetto/14_label_payload_contract.md`: contratto stampa etichette (lifecycle + fiches)
- `doc/progetto/15_capture_worker_backup_workflow.md`: percorso dati foto/OCR, worker, registri, backup Drive
- upstream handoff reference: `C:\Users\user\chefside\fiches-recettes\traceability_handoff.json`

## Backend - avvio locale

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py makemigrations core
python manage.py migrate
python manage.py bootstrap_admin --username admin --password ChangeMe123! --site-code PARIS01 --site-name "Cucina Paris"
python manage.py runserver
```

Il backend ora carica automaticamente variabili da `backend/.env`.

### Import envelope da fiches-recettes (handoff script)

Script upstream: `C:\Users\user\chefside\fiches-recettes\scripts\import-fiches-envelope.ps1`

Uso consigliato:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\user\chefside\fiches-recettes\scripts\import-fiches-envelope.ps1 -Path "C:\path\file.json" -ApiBase "http://localhost:3001/api"
```

Note operative:

- lettura UTF-8 strict
- rilevazione testo sospetto (override con `-AllowSuspectText` solo se necessario)
- invio JSON con `charset=utf-8`
- script pensato per API fiches dedicate (`.../fiches`), non per `POST /api/import/fiches` del backend traceability

### Endpoint principali (Fase 1)

- `POST /api/auth/token`
- `GET /api/auth/me`
- `POST /api/sites`
- `POST /api/import/fiches`
- `POST /api/capture/label-photo`
- `GET/POST /api/cold-sectors`
- `GET/POST /api/cold-points`
- `GET/POST /api/temperature-routes`
- `GET/POST /api/temperature-routes/steps`
- `GET /api/temperature-routes/{route_id}/sequence`
- `POST /api/temperatures/capture` (OCR temperatura da foto, senza persistenza immagine)
- `POST /api/temperatures/capture-preview` (anteprima OCR, nessuna persistenza immagine)
- `POST /api/temperatures/confirm` (conferma OCR o inserimento manuale)
- `GET /api/temperatures?site_code=PARIS01&limit=20`
- `GET /api/lots/drafts?site_code=PARIS01`
- `POST /api/lots/{lot_id}/validate`
- `POST /api/lots/reconcile-identical`
- `POST /api/lots/{lot_id}/transform`
- `GET /api/alerts?site_code=PARIS01`
- `POST /api/alerts/{alert_id}/status`
- `GET /api/reports/lots.csv?site_code=PARIS01&from_date=2026-02-01&to_date=2026-02-21`
- `GET /api/reports/lots.pdf?site_code=PARIS01&from_date=2026-02-01&to_date=2026-02-21`
- `GET /api/reports/temperatures.csv?site_code=PARIS01` (registro temperature per settore/punto freddo)

### Deploy Railway

- Deploy automatico su push GitHub supportato.
- Startup command gestito da `Procfile`:
  - `python manage.py migrate --noinput`
  - `gunicorn traceability.wsgi:application --bind 0.0.0.0:$PORT`
- In questo modo le migration vengono applicate automaticamente a ogni deploy.

### Note integrazione esterna

- Upload Drive e OCR Claude hanno fallback stub in `backend/core/services.py`
- Se abiliti env di integrazione, vengono usati provider reali:
  - `GOOGLE_DRIVE_ENABLED=1`
  - `GOOGLE_DRIVE_STRICT=1` (consigliato in produzione: errore esplicito se upload fallisce)
  - `GOOGLE_DRIVE_OAUTH_CLIENT_ID=<client-id>`
  - `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=<client-secret>`
  - `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=<refresh-token>`
  - `GOOGLE_DRIVE_OAUTH_TOKEN_URI=https://oauth2.googleapis.com/token`
  - `GOOGLE_DRIVE_FOLDER_ID=<folder-id>`
  - `GOOGLE_DRIVE_RETRY_ATTEMPTS=3`
  - `GOOGLE_DRIVE_RETRY_BASE_SLEEP_S=0.6`
  - `CLAUDE_ENABLED=1`
  - `ANTHROPIC_API_KEY=<key>`
  - `ANTHROPIC_MODEL=claude-haiku-4-5-20251001`
  - `CLAUDE_RETRY_ATTEMPTS=3`
  - `CLAUDE_RETRY_BASE_SLEEP_S=0.8`
  - `OCR_LABEL_ASYNC_ENABLED=1` (opzionale: OCR etichette tramite worker async)
- In mancanza di env validi, il sistema usa fallback stub senza interrompere il flusso operativo
- Drive upload e OCR devono restare automatici nel flusso di capture
- Se sono presenti variabili service account (`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` o `..._FILE`), il backend puo usarle come fallback.
- Per account Google personali, preferire OAuth utente (service account puo fallire con `storageQuotaExceeded`).
- OCR normalizza automaticamente:
  - date francesi (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD mois YYYY`) -> `YYYY-MM-DD`
  - peso (`2,5 kg`, `500gr`) -> formato coerente
  - codice lotto fornitore in uppercase pulito
- OCR aggiunge warning non bloccanti nel draft (`ocr_warnings`) per ridurre errori operativi:
  - lotto fornitore mancante
  - DLC mancante/non valida/nel passato/troppo lontana
  - peso mancante o implausibile
  - prodotto suggerito assente

### Worker OCR etichette (Drive -> Draft)

- Comando worker:

```powershell
python manage.py process_ocr_jobs --limit 50
```

- Per riprocessare anche job falliti:

```powershell
python manage.py process_ocr_jobs --limit 50 --retry-failed
```

- Con `OCR_LABEL_ASYNC_ENABLED=1`, `POST /api/capture/label-photo` crea `OcrJob` in `PENDING` e il worker completa l'estrazione dai file su Drive.

### Alert processing operativo

- Gli alert di scadenza (`D-3`, `D-2`, `D-1`, `EXPIRED`) vengono pianificati alla convalida del lotto.
- Per marcare gli alert "dovuti" come inviati, eseguire periodicamente:

```powershell
python manage.py process_alerts
```

- Mobile supporta ora:
  - lista alert attivi (`due_only=1`)
  - azione `ACKED`
  - azione `RESOLVED`

## Mobile - avvio locale

```powershell
cd mobile
npm install
npm run start
```

Configura endpoint backend creando `mobile/.env` (consigliato anche in locale per evitare fallback impliciti):

```dotenv
EXPO_PUBLIC_API_BASE=https://<your-traccia-backend>.up.railway.app
```

In alternativa, per backend locale:

```dotenv
EXPO_PUBLIC_API_BASE=http://<IP_DEL_TUO_PC>:8000
```

Nota: `EXPO_PUBLIC_API_BASE` puo essere con o senza `/api`, l'app normalizza automaticamente.
Nota sicurezza: chiavi API sensibili vanno solo in `backend/.env`, non in `mobile/.env`.

### Flusso UI implementato (mobile)

- Login token
- Bottom navigation con icone: `Camera`, `Dashboard`, `Lifecycle`, `Temperature`, `Parametri`
- Schermata camera con due modalita:
  - `Modalita camera` (default): priorita velocita operativa, validazione differita
  - `Modalita flusso completo`: visualizzazione immediata del draft con OCR/warning
- Scatto foto etichetta e invio a backend
- Visualizzazione risultato OCR + suggerimenti prodotto top-3
- Dashboard con: lista alert, report CSV/PDF, lista draft da convalidare
- Temperature:
  - scatto singolo OCR
  - sequenza per punti freddo
  - manuale con preset (`FRIDGE/COLD_ROOM: 0..10`, `FREEZER: -21..-15`)
  - manuale fuori range con `motivo scarto` + `intervento`

### Stato dati estratti (coerenza con flusso cucina)

Da foto etichetta OCR oggi vengono estratti:
- `supplier_lot_code`
- `dlc_date`
- `weight`
- `product_guess`
- warning qualità (`ocr_warnings`)

Nota operativa:
- `supplier_name` in capture resta opzionale ma attualmente non viene richiesto in UI mobile.
- Per il flusso lifecycle "umano" (ricerca per prodotto/fornitore/data/quantita) serve un endpoint dedicato di ricerca lotti attivi: previsto, non ancora implementato.

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
  "file_mime_type": "image/jpeg",
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
