Traceability App — Client Requirements (Michele)
1. Visione

Sviluppare un’applicazione mobile-first per la gestione operativa della tracciabilità HACCP in ristorante/cucina professionale, integrata con:

Export v1.1 da Fiches Recettes (knowledge layer)

Claude API per OCR e supporto decisionale

Google Drive per storage immagini

Backend Django + PostgreSQL

2. Obiettivi principali

Creare lotti rapidamente tramite foto etichetta

Automatizzare riconoscimento lotto/DLC tramite AI

Gestire ciclo di vita prodotto (trasformazioni)

Generare alert automatici scadenza

Gestire matching con bolle/fatture

Stampare etichette conformi HACCP

Garantire audit trail completo

3. Modalità operative
Modalità 1 — Capture Rapido

Foto

OCR

Creazione draft lotto

Conferma operatore

Modalità 2 — Lifecycle

Selezione lotto

Scelta trasformazione

Calcolo nuova DLC

Generazione nuovo lotto

4. Requisiti non funzionali

Multi-sede

Ruoli utente

Warning non bloccanti

Audit completo

Nessuna dipendenza operativa da Fiches (solo import knowledge)

Sistema resiliente a dati incompleti