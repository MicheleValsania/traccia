System Architecture
1. Layer Separation
Fiches Recettes (Knowledge Layer)
        ↓ Export v1.1
Traceability Backend (State Layer)
        ↓
Mobile App (UI + Capture)
2. Principi architetturali

Knowledge ≠ State

Export contract è il confine

AI non modifica knowledge originale

Tutte le trasformazioni sono eventi append-only

3. Componenti principali
Backend

API REST

Rules Engine

Lifecycle Engine

Alert Engine

AI Workers

Document Matching Engine

Mobile

Capture

Draft management

Alert dashboard

Lifecycle manager