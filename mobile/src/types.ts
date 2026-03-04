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
  asset: { drive_file_id: string; drive_link: string };
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

export type AlertItem = {
  id: string;
  lot: string;
  lot_code: string;
  supplier_name: string;
  supplier_lot_code: string;
  dlc_date: string | null;
  alert_type: "EXPIRY_D3" | "EXPIRY_D2" | "EXPIRY_D1" | "EXPIRED";
  trigger_at: string;
  status: "PENDING" | "SENT" | "ACKED" | "RESOLVED";
};

export type TemperatureReading = {
  id: string;
  site_code: string;
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

export type TabKey = "capture" | "drafts" | "lifecycle" | "temperatures" | "reports";
