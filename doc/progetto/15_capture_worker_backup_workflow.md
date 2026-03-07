# 15 - Capture, Worker OCR, Registri e Backup Drive

Date: 2026-03-07
Owner: traccia team

## 1) Obiettivo

Definire in modo operativo e verificabile:
- percorso dati dalla foto al lotto convalidato,
- modalita di accesso del worker OCR alle foto su Drive,
- registri gia presenti dove scrivere i dati estratti,
- strategia backup su Drive (lotti + temperature).

## 2) Percorso dati (stato attuale)

Flusso `Camera -> Backend`:
1. Mobile invia foto a `POST /api/capture/label-photo` con base64.
2. Backend esegue upload Drive (`upload_to_drive`).
3. Backend esegue OCR etichetta (`run_label_ocr`).
4. Backend crea:
   - `Lot` in stato `DRAFT`,
   - `Asset` collegato al lotto (con `drive_file_id`, `drive_link`, `sha256`),
   - `OcrJob` con risultato OCR.
5. Operatore convalida draft -> `Lot` passa a `ACTIVE`.

Formato date:
- Interno (DB/API): `YYYY-MM-DD`
- UI/Export Francia: visualizzazione `DD-MM-YYYY` (layer presentazione).

## 3) Worker OCR (target consigliato)

## 3.1 Principio

Separare upload e OCR in due fasi:
- fase A sincrona: acquisizione + upload Drive + creazione record,
- fase B asincrona: worker OCR su coda (`OcrJob`).

Beneficio:
- app camera resta veloce in cucina,
- retry OCR indipendente,
- migliore osservabilita errori.

## 3.2 Accesso worker alle foto

Il worker deve leggere i record `Asset` e usare:
- `Asset.drive_file_id` come riferimento principale,
- `Asset.mime_type` e `Asset.file_name` per contesto.

Pattern consigliato:
1. Worker prende `OcrJob(status=PENDING)` con lock.
2. Recupera `Asset` associato.
3. Scarica binario da Drive via API `files.get_media(fileId=drive_file_id)`.
4. Esegue OCR.
5. Salva risultato in `OcrJob.result`, aggiorna `Lot.ai_payload`.
6. Imposta `OcrJob.status` in `DONE` o `FAILED`.

Implementazione disponibile:
- `python manage.py process_ocr_jobs --limit 50`
- opzionale retry falliti: `--retry-failed`
- modalita async capture attivabile con `OCR_LABEL_ASYNC_ENABLED=1`.

Nota:
- Se Drive e indisponibile, il worker marca `FAILED` con errore esplicito.
- Retry governato da policy (es. max 3 tentativi, backoff esponenziale).

## 4) Registri esistenti (gia disponibili)

Per tracciabilita lotti:
- `Lot`: stato operativo (`DRAFT`, `ACTIVE`, `TRANSFORMED`, ...)
- `Asset`: metadati file e riferimento Drive
- `OcrJob`: esito OCR e diagnostica
- `AuditLog`: eventi immutabili (hash chain)

Per temperature:
- `TemperatureReading`: registro principale (manuale + OCR confermato)
- `TemperatureRegister`: registro per settore
- `ColdSector`, `ColdPoint`, `TemperatureRoute`, `TemperatureRouteStep`

Conclusione:
- i registri per scrivere dati estratti esistono gia.
- da completare solo pipeline worker asincrona e monitoraggio stato.

## 5) Campi OCR estesi (carni/pesce)

Oltre ai campi base (`supplier_lot_code`, `dlc_date`, `weight`, `product_guess`):
- carni:
  - `cee_stamp`
  - `meat_origin_country`
- pesce:
  - `fao_zone`
  - `catch_method` (opzionale)

Regola:
- salvataggio in `Lot.ai_payload` + warning di revisione se mancanti.

## 6) Backup Drive (lotti + temperature)

## 6.1 Cosa salvare

Backup periodico (giornaliero consigliato):
1. `lots.csv` (filtro giorno corrente)
2. `temperatures.csv` (filtro giorno corrente)
3. opzionale `lots.pdf` per archivio leggibile

## 6.2 Dove salvare

Cartella Drive dedicata (esempio):
- `traccia_backup/YYYY/MM/DD/`
  - `lots_YYYY-MM-DD.csv`
  - `temperatures_YYYY-MM-DD.csv`
  - `lots_YYYY-MM-DD.pdf` (opzionale)

## 6.3 Come generarlo

Usare endpoint gia presenti:
- `GET /api/reports/lots.csv`
- `GET /api/reports/temperatures.csv`
- `GET /api/reports/lots.pdf` (opzionale)

Poi upload su Drive via stesso provider credenziali.

## 6.4 Frequenza e retention

- Frequenza minima: 1 backup/notte (es. 02:00 Europe/Paris).
- Consigliato: backup incrementale giornaliero + retention 12 mesi.
- Naming deterministico per facile recupero auditor.

## 7) Controlli operativi minimi

Ogni giorno verificare:
1. ultimo upload foto su Drive riuscito,
2. coda OCR senza arretrati critici,
3. backup giornaliero presente in cartella Drive backup,
4. report temperature esportabile senza errori.

## 8) Decisioni operative consigliate

1. Tenere `GOOGLE_DRIVE_STRICT=1` in produzione.
2. Tenere OCR non bloccante ma con warning strutturati.
3. Separare chiaramente:
- storage foto (`Asset`/Drive),
- estrazione (`OcrJob`),
- validazione umana (`Lot` DRAFT->ACTIVE),
- audit (`AuditLog`),
- backup report (cartella Drive backup).
