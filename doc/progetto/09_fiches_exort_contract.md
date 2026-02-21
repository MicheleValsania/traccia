📄 09_fiches_export_contract.md
Fiches Export Contract v1.1 (Knowledge → Traceability)
Envelope
{
  "export_version": "1.1",
  "exported_at": "ISO_DATE",
  "source_app": "fiches-recettes",
  "fiches": [],
  "warnings": []
}
Per-fiche structure
{
  "fiche_id": "UUID",
  "updated_at": "ISO_DATE",
  "title": "string",
  "language": "fr",
  "category": "string|null",
  "allergens": [],
  "ingredients": [],
  "procedure_steps": [],
  "haccp_profiles": [],
  "storage_profiles": [],
  "label_hints": null,
  "warnings": []
}
storage_profiles

id

mode

dlc_type

shelf_life { value:number|null, unit }

temp_range_c { min:number|null, max:number|null }

start_point

allowed_transformations

source

notes

label_hints

label_type

display_name

allergen_display

date_fields

lot_fields

storage_display

qr_target

template_hint

Warning codes

NUMERIC_PARSE_FAILED

INVALID_START_POINT

LABEL_DEFAULT_STORAGE_PROFILE_NOT_FOUND

MISSING_STORAGE_PROFILES

INVALID_DATE

MISSING_FICHE_ID