# 15 - Continuous Capture, Central Ingestion and Drive Backup

Date: 2026-03-14
Owner: traccia team

## 1. Objective

This document defines the target operational flow for image capture and archival after the move to central traceability governance in CookOps.

It covers:
- continuous capture on site from Traccia
- Drive as image inbox or storage handoff
- central ingestion and OCR validation in CookOps
- role of existing Traccia registries during transition
- Drive backup strategy for operational evidence

## 2. Target flow

### 2.1 Continuous capture flow

Target flow:
1. Traccia continuous camera captures images on site.
2. Images are sent to Drive.
3. CookOps imports new files from Drive.
4. CookOps runs OCR extraction centrally.
5. A central operator validates and corrects extracted data.
6. CookOps creates or consolidates the central lot.
7. Traccia later uses centrally governed label profiles and source-lot suggestions for local execution.

This replaces the previous target flow where mobile capture immediately created local draft lots.

## 3. What is no longer the target flow

The following flow is being deprecated:
- single-photo capture
- immediate OCR on the Traccia backend
- immediate local validation on the phone
- direct mobile-driven creation of central traceability records

The continuous camera remains valid.
The immediate OCR flow does not remain a product target.

## 4. Role of Drive

Drive is used as the shared image inbox between local capture and central governance.

### 4.1 Current role
- receives images from site capture
- stores original visual evidence
- acts as a retrieval point for central ingestion if needed

### 4.2 Target operational rule
- Drive is not the final business state layer
- CookOps must import the file and create a managed central document record
- deduplication should rely on `drive_file_id` or an equivalent stable file identifier

## 5. Role of Traccia backend in this flow

In the target model, Traccia is no longer the primary OCR validation backend for incoming central traceability images.

Traccia still remains relevant for:
- local execution data
- local temperature records
- local label execution
- local cleaning records
- integration APIs consumed by CookOps

Existing OCR-related backend capabilities should be treated as transitional until cleanup is complete.

## 6. Existing registries and their relevance

### 6.1 Registries still useful during transition

- `Asset`: still useful as file metadata structure and evidence reference
- `OcrJob`: transitional, useful only if legacy OCR paths remain temporarily enabled
- `AuditLog`: still important for traceability and immutable event history
- `TemperatureReading`: remains the operational temperature register
- `TemperatureRegister`: remains the structure for temperature execution by sector
- `ColdSector`, `ColdPoint`, `TemperatureRoute`, `TemperatureRouteStep`: still valid for temperature execution structure

### 6.2 Registries no longer considered central truth for incoming capture

- `Lot` creation directly from mobile capture is no longer the target central governance path
- OCR result validation in Traccia is no longer the primary validation workflow for incoming Drive photos

## 7. Central ingestion model

The target central model is:
- Traccia captures
- Drive stores
- CookOps imports
- CookOps validates
- CookOps creates the central lot

This means the business checkpoint moves from local draft validation to central dossier validation.

## 8. Backup strategy on Drive

### 8.1 What still makes sense to back up

Drive should keep:
- original captured images
- optional exported operational evidence when needed for audit

### 8.2 What should not be confused with backup

Drive is not the same thing as:
- central traceability state
- validated lot state
- document reconciliation state

Those belong in CookOps.

### 8.3 Operational exports still relevant

The following exports remain useful as audit support:
- temperature register CSV
- optional lot or operational summaries if still needed during transition

## 9. Operational checks

Daily checks should become:
1. continuous capture is still uploading images successfully
2. Drive inbox is receiving files
3. CookOps central import is not accumulating unprocessed files
4. central validation queue is operational
5. local temperature execution remains exportable and visible

## 10. Cleanup implications

This document assumes the following cleanup direction in Traccia main:
- keep continuous camera
- remove immediate OCR as target flow
- remove standalone lifecycle UI
- keep local execution modules
- keep integration APIs required by CookOps

## 11. Related documents

- `doc/progetto/17_target_operating_model.md`
- `doc/progetto/18_documentation_inventory.md`
- `doc/progetto/03_architecture.md`
- `doc/progetto/16_label_printer_implementation.md`
