# 12 - CookOps <-> Traccia Integration Contract v1

## Obiettivo
Definire un contratto dati stabile tra CookOps (inventari/listini/ordini/ricezione) e Traccia (lotti, OCR etichette, lifecycle, alert), mantenendo retrocompatibilita e integrazione deterministica.

## Versionamento
- Campo obbligatorio: `schema_version`.
- Versione iniziale proposta: `1.0.0`.
- Regole:
  - patch/minor: solo campi opzionali nuovi.
  - major: breaking change con nuova pipeline.

## Identificatori canonici cross-app
- `fiche_product_id` (UUID): identita ricetta/prodotto da Fiches.
- `supplier_id` (UUID/string stabile): identita fornitore.
- `supplier_product_id` (UUID/string stabile): identita articolo fornitore.
- `site_code` (string): sito operativo.
- `supplier_lot_code` (string normalizzata): lotto esterno.
- `internal_lot_code` (string): lotto interno generato da Traccia.

## Unita e date canoniche
- Date: ISO `YYYY-MM-DD`.
- Datetime: ISO 8601 UTC (`...Z`).
- Quantita: oggetto strutturato `{ "value": number, "unit": "kg|g|l|ml|cl|pc" }`.

## Envelope condiviso (v1)
```json
{
  "schema_version": "1.0.0",
  "source_app": "cookops",
  "exported_at": "2026-02-26T10:04:44.541Z",
  "site_code": "PARIS01",
  "fiches": [
    {
      "fiche_product_id": "55d4ce30-3d97-4752-8b04-9fe4da457a89",
      "title": "fish burger",
      "category": "Burger",
      "portions": 1,
      "allergens": [],
      "storage_profiles": [],
      "label_hints": {},
      "ingredients": [
        {
          "line_id": "uuid-opzionale",
          "name": "Cabillaud Panee",
          "display_name": "Cabillaud Panee",
          "note": "",
          "qty": { "value": 130, "unit": "g" },
          "supplier": {
            "supplier_id": "561fa673-9b83-4c95-a3ea-fbd55370f8f0",
            "supplier_name": "Miko"
          },
          "supplier_product": {
            "supplier_product_id": "obbligatorio-se-disponibile",
            "supplier_sku": "opzionale",
            "raw_name": "Cabillaud Panee"
          }
        }
      ],
      "steps": ["..."],
      "notes": "",
      "updated_at": "2026-02-26T10:04:44.541Z"
    }
  ]
}
```

## Mapping dal JSON reale `fish burger.json`
- `id` -> `fiche_product_id`
- `title` -> `title`
- `category` -> `category`
- `portions` -> `portions`
- `allergens` -> `allergens`
- `storageProfiles` -> `storage_profiles`
- `labelHints` -> `label_hints`
- `updatedAt` -> `updated_at`
- `ingredients[*].supplierId` -> `ingredients[*].supplier.supplier_id`
- `ingredients[*].supplier` -> `ingredients[*].supplier.supplier_name`
- `ingredients[*].name` -> `ingredients[*].supplier_product.raw_name`
- `ingredients[*].displayName` -> `ingredients[*].display_name`
- `ingredients[*].qty` (string) -> `ingredients[*].qty` (oggetto value/unit normalizzato)

## Regole di normalizzazione input
- `qty` stringa (`"130 g"`, `"1 pz"`, `"30 ml"`) -> parser in:
  - `value` decimale (virgola -> punto)
  - `unit` canonica (`pz|pcs|piece` -> `pc`, `gr` -> `g`)
- `supplier_lot_code`: uppercase + trim + spazi multipli -> `-`.
- Ignore campi sconosciuti in ingresso, ma loggarli.

## Politica validazione
Errore bloccante:
- `schema_version` mancante/non supportata
- UUID invalidi su chiavi critiche (`fiche_product_id`, `supplier_id` se presente)
- `qty` non parseabile quando l'ingrediente e marcato come tracciabile/sensibile
- data non ISO nei campi data

Warning non bloccante:
- `supplier_product_id` mancante
- `supplier_name` presente senza `supplier_id`
- `display_name` mancante

## Estensioni DB minime consigliate (Traccia)
1. `Supplier(id, name, vat, metadata)`
2. `SupplierProduct(id, supplier_id, name, sku, uom, traceability_flag, active)`
3. `PriceList(id, supplier_id, valid_from, valid_to, currency)`
4. `PriceListLine(id, price_list_id, supplier_product_id, unit_price, pack_qty)`
5. `RecipeIngredientLink(id, fiche_product_id, supplier_product_id, qty_value, qty_unit, note)`
6. `GoodsReceipt(id, site_id, supplier_id, delivery_note_number, received_at)`
7. `GoodsReceiptLine(id, receipt_id, supplier_product_id, supplier_lot_code, dlc_date, qty_value, qty_unit)`
8. `InventoryMovement(id, site_id, supplier_product_id, lot_id, movement_type, qty_value, qty_unit, happened_at, ref_type, ref_id)`

## API da aggiungere (v1 consigliato)
- `POST /api/integration/cookops/fiches` (nuovo import esteso)
- `POST /api/integration/cookops/receipts` (BL/ricezione)
- `POST /api/integration/cookops/pricelists` (listini)
- `GET /api/integration/traccia/lots?site_code=...&updated_since=...`
- `GET /api/integration/traccia/consumption?site_code=...&from=...&to=...`
- `POST /api/lots/reconcile-identical` (merge controllato lotti identici + tracciamento righe documento)

## Regola "lotti identici" (operativa)
- Merge consentito solo se coincidono: `site_code`, `supplier_name`, `supplier_lot_code`, `dlc_date`, `quantity_unit` e attributi critici (`supplier_product_id`, firma allergeni/ingredienti).
- Se il merge e consentito: aggiornare `quantity_value` del lotto attivo e incrementare `package_count`.
- Sempre obbligatorio salvare le evidenze di provenienza per ogni riga documento (bolla/fattura/ricezione) con relazione N:1 verso il lotto.
- Se anche un solo attributo critico differisce, creare nuovo lotto.

## Strategia di migrazione
Fase A (compatibile):
- mantenere `POST /api/import/fiches` invariato
- introdurre endpoint `/api/integration/cookops/*` paralleli
- doppio mapping in backend (legacy + v1)

Fase B (adozione):
- popolare nuove tabelle master (`Supplier`, `SupplierProduct`, `PriceList*`)
- collegare validazione lotto a `supplier_product_id`
- attivare riconciliazione `GoodsReceiptLine <-> Lot`

Fase C (governance):
- golden payload tests valid/warning/error
- KPI: success rate >= 99%, unresolved reconciliation <= 3%

## Sicurezza e audit
- tutte le chiamate integrazione con TokenAuth + RBAC sito.
- idempotency key obbligatoria sui POST bulk.
- audit event dedicato per ogni import batch (`INTEGRATION_IMPORT_*`).

## Output minimi da Traccia verso CookOps
- lotto validato: `lot_id, internal_lot_code, supplier_lot_code, fiche_product_id, supplier_product_id, dlc_date, qty, status`
- trasformazione: `source_lot_id, derived_lot_id, action, new_dlc_date, qty_out`
- alert: `alert_type, lot_id, trigger_at, status`
