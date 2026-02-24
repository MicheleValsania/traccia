
# Compatibility Contract (Fiches <-> Traceability)

## Obiettivo

Mantenere le due applicazioni indipendenti, ma con interoperabilita dati stabile, verificabile e retrocompatibile.

## Versionamento contratto

- Campo obbligatorio: `schema_version` (es. `1.0`).
- Ogni payload import/export deve dichiarare la versione.
- Regola:
  - patch/minor: aggiunte backward-compatible (campi opzionali).
  - major: breaking change, supportata con nuova pipeline/mapping.

## Campi chiave condivisi

- Identita prodotto:
  - `fiche_product_id` (UUID) preferito.
  - fallback: `supplier_id + normalized_product_name`.
- Identita fornitore:
  - `supplier_id` stabile.
  - `supplier_name` solo informativo, non chiave primaria.
- Lotto:
  - `supplier_lot_code` stringa normalizzata uppercase.
  - `internal_lot_code` generato dal backend traceability.
- Date:
  - formato ISO `YYYY-MM-DD`.
  - timezone operativa: `Europe/Paris`.
- Quantita:
  - `quantity_value` numerico.
  - `quantity_unit` in enum controllata: `kg|g|l|ml|cl|pc`.

## Regole di normalizzazione

- Input libero (OCR/import) va normalizzato prima del salvataggio.
- Conversioni ammesse:
  - date FR -> ISO.
  - separatore decimale `,` -> `.`.
  - unita sinonime (`gr`, `pcs`, `piece`) -> enum canonica.
- Dati non risolvibili:
  - salvare warning non bloccante.
  - inviare record in review queue quando manca chiave critica.

## Policy di validazione

- Strict validation su envelope e tipi:
  - rigettare payload malformati.
  - errore esplicito con campo e motivo.
- Semantica:
  - date non parseabili -> errore.
  - unita fuori enum -> errore.
  - ID invalidi -> errore.
  - chiavi opzionali mancanti -> warning.

## Retrocompatibilita

- Mai rimuovere o cambiare semantica dei campi esistenti senza nuova major.
- Nuovi campi introdotti come opzionali.
- Parser tollerante a campi sconosciuti in ingresso (ignore + log).

## Test di compatibilita

- Golden payload set:
  - campioni validi reali.
  - campioni con warning.
  - campioni invalidi attesi in errore.
- Check automatici ad ogni release:
  - parse/import/export.
  - roundtrip consistency.
  - mapping product/supplier deterministico.

## KPI minimi

- Import success rate >= 99% su payload validi.
- Record in review queue <= 3% su flusso operativo standard.
- Errori bloccanti dovuti a regressione schema: 0.

## Governance

- Owner contratto: backend traceability.
- Modifica contratto:
  1. update documento,
  2. update validator/mapping,
  3. update golden tests,
  4. comunicazione versione ai consumer.
