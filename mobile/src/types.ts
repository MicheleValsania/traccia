export type OcrWarning = {
  code: string;
  severity: string;
  message: string;
};

export type CaptureResponse = {
  lot_id: string;
  internal_lot_code: string;
  draft_status: string;
  ocr_result: Record<string, unknown>;
  ocr_warnings: OcrWarning[];
  product_suggestions: Array<{ id: string; title: string; category: string }>;
  asset: {
    drive_file_id: string;
    drive_link: string;
    drive_provider?: string;
    drive_fallback_reason?: string;
  };
};

export type DraftLot = {
  id: string;
  internal_lot_code: string;
  supplier_name: string;
  supplier_lot_code: string;
  dlc_date: string;
  quantity_value: string;
  quantity_unit: string;
  status: string;
  ai_payload?: Record<string, unknown>;
  ocr_warnings: OcrWarning[];
  suggestions: Array<{ id: string; title: string; category: string }>;
};

export type TransformResponse = {
  source_lot_id: string;
  source_status: string;
  derived_lot_id: string;
  derived_internal_lot_code: string;
  action: string;
};

export type ActiveLotSearchItem = {
  id: string;
  internal_lot_code: string;
  display_product_name: string;
  supplier_name: string;
  supplier_lot_code: string;
  received_date: string;
  dlc_date: string | null;
  quantity_value: string | null;
  quantity_unit: string;
  status: string;
  category_snapshot: string;
};

export type AlertItem = {
  id: string;
  lot: string;
  lot_code: string;
  lot_status: string;
  supplier_name: string;
  supplier_lot_code: string;
  dlc_date: string | null;
  days_to_expiry: number | null;
  alert_type: "EXPIRY_D3" | "EXPIRY_D2" | "EXPIRY_D1" | "EXPIRED";
  trigger_at: string;
  status: "PENDING" | "SENT" | "ACKED" | "RESOLVED";
};

export type TemperatureReading = {
  id: string;
  site_code: string;
  cold_point_id?: string;
  cold_point_name?: string;
  sector_id?: string;
  sector_name?: string;
  device_type: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  device_label: string;
  temperature_celsius: string;
  unit: string;
  observed_at: string;
  source: string;
  ocr_provider: string;
  confidence: number | null;
  created_at: string;
};

export type TemperatureCaptureResponse = {
  reading: TemperatureReading;
  privacy: { photo_persisted: boolean };
};

export type TemperaturePreviewResponse = {
  requires_confirmation: boolean;
  preview: {
    site_code: string;
    cold_point_id: string;
    device_type: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
    device_label: string;
    suggested_temperature_celsius: number;
    ocr_provider: string;
    ocr_confidence: number | null;
    warnings: string[];
    observed_at: string;
  };
  privacy: { photo_persisted: boolean };
};

export type ColdSector = {
  id: string;
  site_code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ColdPoint = {
  id: string;
  site_code: string;
  sector_id: string;
  sector_name: string;
  name: string;
  device_type: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  sort_order: number;
  min_temp_celsius: string | null;
  max_temp_celsius: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TemperatureRouteStep = {
  id: string;
  route: string;
  cold_point: string;
  cold_point_name: string;
  cold_point_device_type: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  sector_name: string;
  step_order: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
};

export type TemperatureRoute = {
  id: string;
  site_code: string;
  sector_id?: string;
  sector_name?: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  steps: TemperatureRouteStep[];
  created_at: string;
  updated_at: string;
};

export type MeResponse = {
  username: string;
  is_superuser: boolean;
  memberships: Array<{ site_code: string; site_name: string; role: string }>;
};

export type LabelTemplateType = "RAW_MATERIAL" | "PREPARATION" | "TRANSFORMATION";
export type LabelShelfLifeUnit = "hours" | "days" | "months";

export type LabelProfile = {
  id: string;
  site_code: string;
  name: string;
  template_type: LabelTemplateType;
  shelf_life_value: number;
  shelf_life_unit: LabelShelfLifeUnit;
  packaging: string;
  storage_instructions: string;
  show_internal_lot: boolean;
  show_supplier_lot: boolean;
  allergen_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LabelPrintJob = {
  id: string;
  site_code: string;
  profile: string;
  profile_name: string;
  lot: string | null;
  lot_internal_code: string;
  production_date: string;
  dlc_date: string;
  copies: number;
  payload: Record<string, unknown>;
  created_at: string;
};

export type TabKey = "camera" | "dashboard" | "lifecycle" | "temperatures" | "labels" | "settings";
