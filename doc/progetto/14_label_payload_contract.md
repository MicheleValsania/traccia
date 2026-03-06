# 14 - Label Payload Contract (Lifecycle + Fiches)

## Obiettivo

Definire un unico contratto dati per la stampa etichette, valido sia quando la stampa parte da:
- trasformazione lifecycle (`lot_id` derivato),
- lotto attivo collegato a fiche (`fiche_product_id`),
- fallback lotto senza fiche.

Questo evita logiche duplicate tra mobile, web/tablet e backend.

## Ambito integrazione con `fiches-recettes`

Questo documento dipende anche da:
- `doc/progetto/09_fiches_exort_contract.md`
- `doc/progetto/12_cookops_traceability_contract_v1.md`

`fiches-recettes` resta la fonte autorevole per:
- metadati prodotto (`title`, allergeni),
- profili HACCP (`storage_profiles`),
- suggerimenti stampa (`label_hints`).

`traccia` resta la fonte autorevole per:
- stato e cronologia lotti (`DRAFT/ACTIVE/TRANSFORMED/...`),
- eventi lifecycle,
- audit stampa e stato operativo.

## Modalita comunicazione tra app

Modalita 1 - Import batch (attuale, stabile):
- `fiches-recettes` esporta envelope JSON.
- `traccia` importa via `POST /api/import/fiches`.
- frequenza consigliata: bootstrap + sync pianificata (es. 1 volta al giorno).

Modalita 2 - Sync near-real-time (fase successiva):
- webhook o polling incrementale da `fiches-recettes` verso `traccia`.
- payload con `updated_at` e `schema_version`.
- idempotenza obbligatoria (stesso evento non deve creare duplicati).

Modalita 3 - Fallback operativo:
- se sync fiche non disponibile, stampa da dati lotto + OCR con warning.
- il servizio non deve bloccarsi in cucina.

## Flusso pratico

1. Operatore seleziona lotto attivo o lotto derivato.
2. Backend costruisce `label_payload`.
3. UI mostra preview.
4. Operatore conferma stampa.
5. Backend registra evento audit stampa.

## Priorita fonti dati

Ordine di priorita per ogni campo:
1. Dati lotto corrente (`Lot`, `LotTransformation`, `LotEvent`).
2. Dati fiche collegata (`FicheProduct`, `storage_profiles`, `label_hints`).
3. Fallback OCR (`ai_payload.product_guess`, ecc.).
4. Valori vuoti con warning non bloccante.

## Regole di coerenza cross-app

- Match primario: `fiche_product_id`.
- Se `fiche_product_id` manca:
  - tentativo fallback su `ai_payload.product_guess` (solo proposta, non binding definitivo).
- Se fiche collegata ma incoerente con categoria lotto:
  - warning in preview (`FICHE_LOT_MISMATCH`),
  - stampa consentita solo se ruolo autorizzato (chef/manager/admin).

## Contratto `label_payload` (v1)

```json
{
  "schema_version": "1.0.0",
  "label_type": "LOT_LABEL|PRODUCTION_LABEL|TRANSFORMATION_LABEL|REPRINT_LABEL",
  "site_code": "PARIS01",
  "lot": {
    "id": "uuid",
    "internal_lot_code": "PARIS01-20260308-0011",
    "supplier_name": "Fornitore Rossi",
    "supplier_lot_code": "LOT-AB12",
    "received_date": "2026-03-07",
    "production_date": "2026-03-08",
    "dlc_date": "2026-03-11",
    "quantity_value": "10.000",
    "quantity_unit": "kg",
    "category_snapshot": "Carni",
    "status": "ACTIVE"
  },
  "product": {
    "fiche_product_id": "optional-uuid",
    "fiche_source_app": "fiches-recettes",
    "fiche_export_version": "1.1",
    "fiche_updated_at": "2026-03-08T08:10:00Z",
    "title": "Ragu bolognese",
    "allergens": ["sedano", "latte"],
    "storage_profile_name": "0-3C 3 giorni",
    "storage_instructions": "Conservare tra 0 e 3 C"
  },
  "lifecycle": {
    "source_lot_id": "optional-uuid",
    "action": "TRANSFORMED|FREEZING|THAWING|OPENED|VACUUM_PACKING|SOUS_VIDE_COOK",
    "event_time": "2026-03-08T09:15:00Z"
  },
  "render": {
    "template_code": "RAW_MATERIAL|PREPARATION|TRANSFORMATION",
    "template_version": "1.0.0",
    "language": "it",
    "qr_value": "lot:PARIS01-20260308-0011"
  },
  "warnings": [
    {
      "code": "MISSING_FICHE_LINK",
      "severity": "warning",
      "message": "Lotto non collegato a fiche: usare fallback lotto/OCR."
    }
  ],
  "trace": {
    "source_mode": "LIFECYCLE|FICHE_PROFILE|LOT_FALLBACK",
    "resolution_path": [
      "lot.base",
      "fiche.storage_profile",
      "label_hints.template"
    ]
  }
}
```

## Regole minime di validita

Bloccanti (no stampa):
- `site_code` mancante
- `lot.id` mancante
- `lot.internal_lot_code` mancante
- `product.title` vuoto
- `lot.dlc_date` mancante per template che la richiedono

Non bloccanti (si stampa con warning):
- fiche non collegata
- allergeni non disponibili
- storage profile non disponibile
- mismatch fiche/lotto non critico

## Endpoint consigliati

- `POST /api/labels/preview`
  - input: `lot_id`, `label_type` opzionale
  - output: `label_payload` + preview render (html/pdf/url)
  - include warning di coerenza con fiches

- `POST /api/labels/print`
  - input: `label_payload` + `copies`
  - output: esito stampa + `print_job_id`
  - side effect: evento audit `LABEL_PRINTED`

- `POST /api/labels/reprint`
  - input: `print_job_id` o `lot_id`
  - output: nuovo `print_job_id`
  - side effect: audit `LABEL_REPRINTED`

## Audit obbligatorio stampa

Per ogni stampa salvare:
- chi ha stampato
- quando
- da quale lotto/fonte
- template/versione
- hash del payload
- numero copie
- esito (`PRINTED|FAILED`)
- versione sorgente fiche usata (`fiche_export_version`, `fiche_updated_at`)

## Nota implementativa

La UI non deve ricostruire campi etichetta.
La UI deve solo:
1) chiedere preview,
2) mostrare payload/anteprima,
3) confermare stampa.

La composizione dati resta nel backend.
La sincronizzazione da `fiches-recettes` deve essere osservabile (ultimo sync riuscito, ultimo errore, versione importata).
