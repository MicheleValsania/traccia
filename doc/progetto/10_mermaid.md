erDiagram
  ORGANIZATION ||--o{ SITE : has
  SITE ||--o{ LOCATION : has
  ORGANIZATION ||--o{ USER : has
  USER ||--o{ MEMBERSHIP : has
  SITE ||--o{ MEMBERSHIP : has

  %% Knowledge import
  FICHE_PRODUCT ||--o{ FICHE_STORAGE_PROFILE : has
  FICHE_PRODUCT ||--o| FICHE_LABEL_HINT : has
  FICHE_PRODUCT ||--o{ FICHE_HACCP_PROFILE : has
  SITE ||--o{ PRODUCT_ALIAS : has
  FICHE_PRODUCT ||--o{ PRODUCT_ALIAS : aliases

  %% State layer
  SITE ||--o{ LOT : owns
  LOCATION ||--o{ LOT : stores
  FICHE_PRODUCT ||--o{ LOT : references

  LOT ||--o{ LOT_EVENT : has
  LOT ||--o{ ASSET : has
  LOT ||--o{ ALERT : has

  %% Transformations
  LOT_EVENT }o--|| LOT : about
  LOT_EVENT ||--o| LOT_TRANSFORMATION : may_create
  LOT_TRANSFORMATION }o--|| LOT : from_lot
  LOT_TRANSFORMATION }o--|| LOT : to_lot

  %% Documents & matching
  SITE ||--o{ DOCUMENT : has
  DOCUMENT ||--o{ DOCUMENT_LINE : has
  ASSET }o--|| DOCUMENT : source_asset
  LOT ||--o{ LOT_DOCUMENT_MATCH : matched_with
  DOCUMENT_LINE ||--o{ LOT_DOCUMENT_MATCH : matched_with

  %% Printing
  SITE ||--o{ LABEL_TEMPLATE : has
  SITE ||--o{ PRINT_JOB : has
  PRINT_JOB ||--o{ PRINT_ITEM : has
  PRINT_ITEM }o--|| LOT : prints_for
  LABEL_TEMPLATE }o--|| PRINT_JOB : uses

  ORGANIZATION {
    uuid id PK
    string name
    datetime created_at
    datetime updated_at
  }

  SITE {
    uuid id PK
    uuid organization_id FK
    string name
    string timezone
    datetime created_at
    datetime updated_at
  }

  LOCATION {
    uuid id PK
    uuid site_id FK
    string name
    string kind  "FRIDGE|FREEZER|DRY|HOT"
    datetime created_at
    datetime updated_at
  }

  USER {
    uuid id PK
    uuid organization_id FK
    string email
    string full_name
    boolean is_active
    datetime created_at
    datetime updated_at
  }

  MEMBERSHIP {
    uuid id PK
    uuid user_id FK
    uuid site_id FK
    string role "ADMIN|MANAGER|CHEF|OPERATOR|AUDITOR"
    datetime created_at
    datetime updated_at
  }

  FICHE_PRODUCT {
    uuid id PK  "fiche_id from export v1.1"
    string title
    string language
    string category
    json allergens
    datetime updated_at_source
    string source_app
    string export_version
    datetime imported_at
  }

  FICHE_STORAGE_PROFILE {
    uuid id PK
    uuid fiche_product_id FK
    string profile_id "id from export"
    string mode
    string dlc_type "DLC|DDM"
    float shelf_life_value
    string shelf_life_unit "hours|days|months"
    float temp_min_c
    float temp_max_c
    string start_point
    json allowed_transformations
    string source "chef_defined|imported|ai_suggested"
    text notes
  }

  FICHE_LABEL_HINT {
    uuid id PK
    uuid fiche_product_id FK
    string label_type
    string display_name
    json allergen_display
    json date_fields
    json lot_fields
    json storage_display
    string qr_target
    string template_hint
  }

  FICHE_HACCP_PROFILE {
    uuid id PK
    uuid fiche_product_id FK
    string profile_id
    string process
    json params
    json controls
    text notes
  }

  PRODUCT_ALIAS {
    uuid id PK
    uuid site_id FK
    uuid fiche_product_id FK
    string alias_text
    string supplier_name
    string supplier_sku
    datetime created_at
  }

  LOT {
    uuid id PK
    uuid site_id FK
    uuid location_id FK
    uuid fiche_product_id FK
    string internal_lot_code
    string supplier_lot_code
    date received_date
    date production_date
    date dlc_date
    string dlc_type "DLC|DDM"
    float quantity_value
    string quantity_unit "kg|g|l|ml|pcs|colis"
    float quantity_current
    string status "DRAFT|ACTIVE|TRANSFORMED|CONSUMED|DISCARDED"
    json metadata
    datetime created_at
    datetime updated_at
  }

  LOT_EVENT {
    uuid id PK
    uuid lot_id FK
    uuid created_by_user_id FK
    string event_type
    datetime event_time
    float quantity_delta
    json data
  }

  LOT_TRANSFORMATION {
    uuid id PK
    uuid event_id FK
    uuid from_lot_id FK
    uuid to_lot_id FK
    string action
    float input_qty
    float output_qty
    date new_dlc_date
    string new_dlc_type
  }

  ASSET {
    uuid id PK
    uuid site_id FK
    uuid lot_id FK "nullable"
    uuid created_by_user_id FK
    string asset_type "PHOTO_LABEL|PHOTO_PRODUCT|DELIVERY_NOTE|INVOICE"
    string drive_file_id
    string drive_folder_id
    string mime_type
    string sha256
    datetime captured_at
    datetime uploaded_at
    json metadata
  }

  ALERT {
    uuid id PK
    uuid lot_id FK
    string alert_type "EXPIRY_D3|EXPIRY_D1|EXPIRED"
    datetime trigger_at
    string status "PENDING|SENT|ACKED|RESOLVED"
    datetime sent_at
    datetime acked_at
  }

  DOCUMENT {
    uuid id PK
    uuid site_id FK
    uuid asset_id FK
    string doc_type "DELIVERY_NOTE|INVOICE"
    string supplier_name
    date doc_date
    string doc_number
    json ocr_raw
    datetime created_at
  }

  DOCUMENT_LINE {
    uuid id PK
    uuid document_id FK
    int line_no
    string product_text
    float quantity_value
    string quantity_unit
    float unit_price_value
    string currency
    json metadata
  }

  LOT_DOCUMENT_MATCH {
    uuid id PK
    uuid lot_id FK
    uuid document_line_id FK
    float confidence
    string status "PROPOSED|CONFIRMED|REJECTED"
    uuid confirmed_by_user_id FK
    datetime confirmed_at
    json rationale
  }

  LABEL_TEMPLATE {
    uuid id PK
    uuid site_id FK
    string template_key
    string format "PDF|ZPL"
    string paper "A4|THERMAL_58|THERMAL_80"
    json config
    datetime created_at
  }

  PRINT_JOB {
    uuid id PK
    uuid site_id FK
    uuid created_by_user_id FK
    uuid label_template_id FK
    string status "PENDING|RENDERED|PRINTED|FAILED"
    string output_drive_file_id
    datetime created_at
    datetime updated_at
    json warnings
  }

  PRINT_ITEM {
    uuid id PK
    uuid print_job_id FK
    uuid lot_id FK
    int copies
    json payload_snapshot
  }