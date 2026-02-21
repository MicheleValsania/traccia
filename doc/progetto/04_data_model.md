Data Model (State Layer)
Site

id

name

User

id

role

site_id

Product

(importato da fiches)

id (UUID)

title

allergens

storage_profiles

label_hints

Lot

id

product_id

internal_lot_code

supplier_lot_code

quantity_value

quantity_unit

production_date

received_at

dlc_date

status

LotEvent

id

lot_id

type

metadata JSON

created_at

Asset

id

drive_file_id

type

lot_id (nullable)

Alert

id

lot_id

trigger_date

status