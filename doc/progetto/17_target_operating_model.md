# Target Operating Model

## Ruoli delle applicazioni

- Traccia: applicazione mobile operativa per punto vendita.
- CookOps: backoffice centrale per governance, convalida e consolidamento della tracciabilita.

## Principi

- Tutti i dati documentali entrano inizialmente come centrali.
- Temperature, etichette e pulizie restano eseguite per punto vendita in Traccia.
- La programmazione e la configurazione vengono governate centralmente in CookOps.
- Il lifecycle non resta piu una sezione autonoma in Traccia: la logica operativa residua confluisce in Etichette.
- L'estrazione immediata da camera singola viene dismessa: resta solo la camera continua.

## Scope Traccia da mantenere

### Camera
- Solo camera continua.
- Invio immagini verso Drive o pipeline centrale.
- Nessuna validazione OCR locale come flusso principale.

### Temperature
- Esecuzione locale dei rilevamenti per settore e punto freddo.
- Registrazione letture e consultazione locale.
- Dati visibili anche in CookOps via report centrali.

### Etichette
- Consumo di profili etichetta precompilati in CookOps.
- Inserimento o conferma del lotto d'origine.
- Stampa locale.
- Registrazione evento operativo locale.

### Pulizie
- Esecuzione e conferma task per sito.

### Parametri
- Solo impostazioni minime di sito e device.
- Nessuna amministrazione centrale duplicata.

## Scope Traccia da ridurre o rimuovere

### Da rimuovere
- Sezione Lifecycle autonoma.
- Pipeline OCR immediata da foto singola.
- Convalida locale dei dati estratti.
- Flussi che creano dati centrali senza passare da CookOps.

### Da rifondere in Etichette
- Selezione profilo.
- Lotto d'origine.
- Azione operativa di trasformazione o stampa.
- Evento locale associato al prodotto.

## Scope CookOps centrale

- Import foto da Drive.
- OCR e convalida dati estratti.
- Upload manuale di bolle e fatture.
- Confronto tra foto, bolle e fatture.
- Creazione lotto centrale.
- Riconciliazione documentale.
- Programmazione HACCP.
- Gestione strutture site, secteur, point froid.
- Gestione profili etichetta.
- Distribuzione dei lotti verso le unita.

## Flusso target

1. Traccia camera continua acquisisce immagini.
2. Le immagini entrano nel flusso centrale.
3. CookOps estrae e presenta i dati in convalida.
4. L'operatore centrale confronta foto, bolle e fatture.
5. CookOps crea o consolida il lotto centrale.
6. Traccia usa profili e suggerimenti centrali per le operazioni locali.

## Cleanup target per main

### Keep
- camera continua
- temperature
- etichette
- pulizie
- sync dati da CookOps

### Shared
- etichette
- lifecycle come sottoflusso di etichette
- temperature
- pulizie

### Deprecate
- lifecycle standalone
- OCR camera immediato
- validazione locale dati estratti
- creazione libera di dati centrali da mobile
