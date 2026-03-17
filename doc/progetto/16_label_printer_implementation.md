# 16. Label Printer Implementation

## Scopo

Definire:

- la stampante target consigliata per il progetto;
- cosa manca oggi per parlare con una stampante reale;
- il piano minimo per rendere la stampa etichette realmente funzionante nell'app mobile.

## Stato attuale

Oggi la stampa non e implementata verso hardware reale.

Il flusso attuale fa solo questo:

1. la UI mobile raccoglie i dati di stampa;
2. il mobile chiama `POST /api/labels/print`;
3. il backend crea un `LabelPrintJob`;
4. la UI mostra un messaggio tipo `Stampa pronta`.

Quindi oggi:

- non esiste connessione a stampante `Bluetooth`, `Wi-Fi` o `USB`;
- non esiste discovery o pairing della stampante;
- non esiste invio di un job reale al device;
- il backend registra una richiesta stampa, non un esito fisico di stampa.

## Stampante consigliata

### Target consigliato

`Brother QL-820NWBc`

Motivazione:

- supporta `Bluetooth`, `Wi-Fi`, `Ethernet`, `USB` e `AirPrint`;
- permette di evitare `USB`, che da telefono e la strada piu fragile;
- supporta etichette `DK` piu grandi delle classiche `P-touch`;
- il formato e piu adatto a etichette operative con `prodotto`, `data produzione`, `DLC`, `lotto`, note brevi e codici;
- e una stampante piu coerente con un flusso di tracciabilita rispetto a modelli consumer stretti da `12 mm`.

### Alternativa secondaria

`Brother PT-E720BT`

Motivazione:

- valida se serve un formato a nastro fino a `24 mm`;
- utile per etichette sintetiche operative;
- meno adatta di una `QL` se l'etichetta deve contenere piu campi ed essere letta rapidamente in cucina o laboratorio.

## Decisione tecnica

Per il progetto la direzione consigliata e:

- usare una stampante Brother con `Bluetooth` o `Wi-Fi`;
- implementare la stampa mobile tramite integrazione nativa;
- evitare una soluzione `USB-only` come target principale.

## Vincoli tecnici del mobile

Il client mobile e oggi `Expo React Native`.

Per stampare davvero su una Brother dal telefono non basta il codice JavaScript attuale:

- serve integrazione con SDK o librerie native del vendor;
- `Expo Go` non basta;
- serve almeno una `development build` / `custom dev client` oppure un percorso `prebuild` con moduli nativi.

## Obiettivo funzionale corretto

Il flusso finale non deve essere:

- `print requested`

ma:

1. backend genera payload stampa canonico;
2. mobile mostra preview coerente;
3. mobile seleziona stampante;
4. mobile invia job alla stampante reale;
5. mobile riceve esito;
6. backend registra audit finale `PRINTED` o `FAILED`.

## Cosa bisogna fare

## 1. Confermare la stampante target

Decisione da prendere:

- `Brother QL-820NWBc` come target principale;
- `Brother PT-E720BT` solo se si decide che `24 mm` sono sufficienti.

Serve una sola stampante target iniziale per evitare branching inutile nel codice.

## 2. Scegliere il canale di connessione

Ordine consigliato:

1. `Bluetooth`
2. `Wi-Fi`
3. `USB` solo come fallback o fuori scope iniziale

Motivo:

- `Bluetooth` e `Wi-Fi` sono piu naturali da smartphone;
- `USB` introduce variabilita di cavo, OTG, permessi e compatibilita OS.

## 3. Integrare la stampa reale nel mobile

Serve aggiungere nel progetto mobile:

- modulo nativo Brother o bridge equivalente;
- schermata o pannello di selezione stampante;
- stato connessione stampante;
- comando `printLabel(payload, copies, printerConfig)`;
- gestione errori hardware e timeout.

Da implementare nel mobile:

- discovery dispositivi disponibili;
- salvataggio stampante preferita per sito o dispositivo;
- test connessione;
- stampa;
- eventuale ristampa ultimo job.

## 4. Separare preview e print

La UI non deve comporre il contenuto libero dell'etichetta.

Serve separare due endpoint/logiche:

- `preview`: payload pronto + rappresentazione preview;
- `print confirm`: invio a stampante reale e registrazione esito.

Il backend resta il punto unico di composizione del contenuto etichetta.

## 5. Estendere il contratto backend

L'endpoint di stampa va evoluto.

Oggi:

- crea solo il `LabelPrintJob`.

Da aggiungere:

- stato job: `REQUESTED | PRINTING | PRINTED | FAILED`;
- `printer_model`;
- `printer_identifier`;
- `printer_connection_type`;
- `failure_reason`;
- `printed_at`;
- eventuale `preview_url` o struttura preview serializzata;
- endpoint di `reprint`.

## 6. Aggiornare il modello dati

`LabelPrintJob` dovrebbe includere almeno:

- `status`;
- `printer_model`;
- `printer_identifier`;
- `printer_connection_type`;
- `failure_reason`;
- `printed_at`;
- opzionalmente `preview_payload_hash`.

Questo serve per audit e supporto operativo.

## 7. Aggiungere audit corretto

Oggi il log utile e solo `LABEL_PRINT_REQUESTED`.

Da aggiungere:

- `LABEL_PRINT_STARTED`;
- `LABEL_PRINTED`;
- `LABEL_PRINT_FAILED`;
- `LABEL_REPRINTED`.

## 8. Definire un payload stampa stabile

Prima di integrare l'hardware, il payload va tenuto stabile.

Campi minimi consigliati:

- `product_name`;
- `template_type`;
- `production_date`;
- `dlc_date`;
- `lot_internal_code`;
- `storage_instructions`;
- `allergen_text`;
- `site_code`;
- `copies`;
- eventuale `qr_value` o `barcode_value`.

Il mobile non deve ricostruire questi campi a partire da form sparsi.

## 9. Gestire layout per formato etichetta

Serve una decisione per formato target:

- layout `24 mm` se si sceglie `PT-E720BT`;
- layout `DK` largo se si sceglie `QL-820NWBc`.

I due layout non sono equivalenti.

Per `24 mm` servono etichette sintetiche:

- nome breve;
- data produzione;
- DLC;
- lotto.

Per `QL-820NWBc` si puo stampare di piu:

- nome prodotto piu leggibile;
- date;
- lotto;
- conservazione breve;
- codice QR o barcode;
- eventuali allergeni compatti.

## 10. Implementare una soluzione intermedia se serve velocita

Se l'integrazione nativa richiede troppo tempo, si puo introdurre una fase intermedia:

- backend genera preview;
- mobile esporta immagine o PDF;
- operatore apre l'app Brother per stampare.

Questa non e la soluzione finale, ma puo sbloccare test di layout e contenuto etichette.

## Backlog minimo

Ordine consigliato:

1. fissare stampante target (`QL-820NWBc` consigliata);
2. definire layout finale etichetta;
3. estendere `LabelPrintJob` con stato ed esito reale;
4. introdurre preview esplicita lato backend;
5. integrare stampa nativa nel mobile;
6. salvare stampante preferita;
7. aggiungere audit `PRINTED/FAILED`;
8. testare su dispositivo reale.

## Definizione di done

La funzione stampa etichette puo dirsi funzionante solo quando:

- un operatore seleziona un profilo etichetta;
- vede la preview corretta;
- seleziona o usa una stampante gia associata;
- stampa davvero una o piu etichette da telefono;
- l'app mostra esito reale;
- il backend registra `PRINTED` o `FAILED`;
- la ristampa e possibile senza reinserire tutto il contenuto.

## Nota finale

La scelta della stampante influenza direttamente:

- layout;
- esperienza operatore;
- difficolta di integrazione;
- affidabilita del flusso in cucina.

Per questo il progetto deve scegliere una stampante target unica prima di implementare la parte nativa.
