# Lifecycle Human Search Contract (Kitchen-First)

## Obiettivo

Permettere all'operatore cucina di trovare un lotto `ACTIVE` senza ricordare codici interni.

Ricerca tipica reale:
- "carne macinata"
- "fornitore X"
- "ieri"
- "15 kg"

## Dati disponibili oggi (backend)

Per ogni lotto esistono gia:
- `internal_lot_code`
- `supplier_name`
- `supplier_lot_code`
- `received_date`
- `production_date`
- `dlc_date`
- `quantity_value`
- `quantity_unit`
- `category_snapshot`
- `status`
- `fiche_product` (quando associato in validazione)
- `ai_payload.product_guess` (fallback OCR)

## Gap attuale

Esiste `POST /api/lots/{lot_id}/transform`, ma manca endpoint UX per selezione lotto umana.

Oggi su mobile lifecycle serve inserire `lot_id` manualmente.

## Contratto proposto (nuovo endpoint)

`GET /api/lots/active-search`

Query params:
- `site_code` (required)
- `q` (optional, testo libero: prodotto/fornitore/lotto)
- `from_date` (optional)
- `to_date` (optional)
- `category` (optional)
- `limit` (optional, default 30)

Risposta (schema suggerito):

```json
[
  {
    "id": "uuid",
    "internal_lot_code": "TOURNELS01-20260307-0012",
    "display_product_name": "Carne macinata manzo",
    "supplier_name": "Fornitore Rossi",
    "supplier_lot_code": "LOT-AB12",
    "received_date": "2026-03-06",
    "dlc_date": "2026-03-10",
    "quantity_value": "15.000",
    "quantity_unit": "kg",
    "status": "ACTIVE",
    "category_snapshot": "Carni"
  }
]
```

## Regole UX cucina

- Ordinamento default: `received_date desc`, poi `updated_at desc`.
- Mostrare in card:
  - prodotto (grande)
  - fornitore + data ricezione
  - quantita residua
  - lotto interno (piccolo)
- Filtri rapidi: `Oggi`, `Ieri`, `Ultimi 7 giorni`, `Solo ACTIVE`.

## Nota su "draft" e "payload"

- `draft`: bozza dati non ancora convalidata.
- `label payload`: pacchetto dati finale pronto stampa.

Nel flusso pratico:
1) capture -> draft
2) validazione -> lotto ACTIVE
3) ricerca lotto umana -> transform lifecycle
4) stampa etichetta da payload finale
