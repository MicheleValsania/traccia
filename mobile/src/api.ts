import {
  ActiveLotSearchItem,
  AlertItem,
  CaptureUploadResponse,
  ColdPoint,
  ColdSector,
  HaccpSchedule,
  LabelPrintJob,
  LabelProfile,
  MeResponse,
  TemperatureCaptureResponse,
  TemperaturePreviewResponse,
  TemperatureReading,
  TemperatureRoute,
} from "./types";
import { translate } from "./i18n";

export type AlertResolutionReason = Exclude<AlertItem["resolved_reason"], "" | undefined | null>;

function buildApiBase(): string {
  const raw = (process.env.EXPO_PUBLIC_API_BASE || "").trim();
  if (!raw) {
    console.warn(
      "EXPO_PUBLIC_API_BASE non impostato: uso fallback locale http://127.0.0.1:8000/api",
    );
    return "http://127.0.0.1:8000/api";
  }
  const normalized = raw.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

export const API_BASE = buildApiBase();

function withAuth(token: string, init?: RequestInit): RequestInit {
  return {
    ...(init || {}),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...((init?.headers as Record<string, string>) || {}),
    },
  };
}

export async function loginToken(username: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/auth/token`,
      withAuth("", { method: "POST", body: JSON.stringify({ username, password }) }),
    );
  } catch (error) {
    throw new Error(translate("api.login_unreachable", { value: `${API_BASE}/auth/token` }));
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: string; non_field_errors?: string[] };
      detail = body.detail || (body.non_field_errors && body.non_field_errors[0]) || "";
    } catch {
      detail = (await response.text()).trim();
    }
    throw new Error(translate("api.login_failed", { status: response.status, detail: detail ? `: ${detail}` : "" }));
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const response = await fetch(`${API_BASE}/auth/me`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || translate("api.me_failed"));
  }
  return (await response.json()) as MeResponse;
}

export async function fetchHaccpSectors(token: string, siteCode: string): Promise<ColdSector[]> {
  const response = await fetch(
    `${API_BASE}/v1/haccp/sectors/?site=${encodeURIComponent(siteCode)}`,
    withAuth(token, { method: "GET" }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento settori HACCP fallito.");
  }
  const body = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return Array.isArray(body.results)
    ? body.results.map((row) => ({
        id: String(row.id ?? ""),
        site_code: String(row.site_code ?? siteCode),
        name: String(row.name ?? ""),
        sort_order: Number(row.sort_order ?? 0),
        is_active: row.is_active !== false,
        created_at: "",
        updated_at: "",
      }))
    : [];
}

export async function fetchHaccpColdPoints(token: string, siteCode: string, sectorId?: string): Promise<ColdPoint[]> {
  const query = new URLSearchParams({ site: siteCode });
  if (sectorId) query.set("sector", sectorId);
  const response = await fetch(`${API_BASE}/v1/haccp/cold-points/?${query.toString()}`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento punti freddo HACCP fallito.");
  }
  const body = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return Array.isArray(body.results)
    ? body.results.map((row) => ({
        id: String(row.id ?? ""),
        site_code: String(row.site_code ?? siteCode),
        sector_id: String(row.sector ?? ""),
        sector_name: String(row.sector_label ?? ""),
        name: String(row.name ?? row.cold_point_label ?? ""),
        device_type: String(row.equipment_type ?? "OTHER") as ColdPoint["device_type"],
        sort_order: Number(row.sort_order ?? 0),
        min_temp_celsius: row.min_temp_celsius == null ? null : String(row.min_temp_celsius),
        max_temp_celsius: row.max_temp_celsius == null ? null : String(row.max_temp_celsius),
        is_active: row.is_active !== false,
        created_at: "",
        updated_at: "",
      }))
    : [];
}

export async function fetchHaccpSchedules(
  token: string,
  siteCode: string,
  taskType?: "label_print" | "temperature_register" | "cleaning",
): Promise<HaccpSchedule[]> {
  const query = new URLSearchParams({ site: siteCode });
  if (taskType) query.set("task_type", taskType);
  const response = await fetch(`${API_BASE}/v1/haccp/schedules/?${query.toString()}`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento planning HACCP fallito.");
  }
  const body = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return Array.isArray(body.results)
    ? body.results.map((row) => ({
        id: String(row.id ?? ""),
        site: String(row.site ?? ""),
        site_code: String(row.site_code ?? siteCode),
        task_type: String(row.task_type ?? "cleaning") as HaccpSchedule["task_type"],
        title: String(row.title ?? ""),
        area: row.area == null ? null : String(row.area),
        sector: row.sector == null ? null : String(row.sector),
        sector_code: String(row.sector_code ?? ""),
        sector_label: String(row.sector_label ?? ""),
        cold_point: row.cold_point == null ? null : String(row.cold_point),
        cold_point_code: String(row.cold_point_code ?? ""),
        cold_point_label: String(row.cold_point_label ?? ""),
        equipment_type: String(row.equipment_type ?? "") as HaccpSchedule["equipment_type"],
        starts_at: String(row.starts_at ?? ""),
        ends_at: row.ends_at == null ? null : String(row.ends_at),
        recurrence_rule: (row.recurrence_rule ?? {}) as Record<string, unknown>,
        status: String(row.status ?? "planned") as HaccpSchedule["status"],
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        completed_at: row.completed_at == null ? null : String(row.completed_at),
      }))
    : [];
}

export async function updateHaccpScheduleStatus(
  token: string,
  scheduleId: string,
  statusValue: HaccpSchedule["status"],
): Promise<HaccpSchedule> {
  const response = await fetch(
    `${API_BASE}/v1/haccp/schedules/${scheduleId}/`,
    withAuth(token, { method: "PATCH", body: JSON.stringify({ status: statusValue }) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Aggiornamento schedule HACCP fallito.");
  }
  return (await response.json()) as HaccpSchedule;
}

export async function captureLabelPhoto(params: {
  token: string;
  siteCode: string;
  fileName: string;
  fileMimeType: string;
  fileBase64: string;
}): Promise<CaptureUploadResponse> {
  const payload = {
    site_code: params.siteCode,
    file_name: params.fileName,
    file_mime_type: params.fileMimeType,
    file_b64: params.fileBase64,
  };
  const response = await fetch(
    `${API_BASE}/capture/label-photo`,
    withAuth(params.token, { method: "POST", body: JSON.stringify(payload) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Errore in capture.");
  }
  return (await response.json()) as CaptureUploadResponse;
}


export async function fetchActiveLotsSearch(params: {
  token: string;
  siteCode: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
  category?: string;
  limit?: number;
}): Promise<ActiveLotSearchItem[]> {
  const query = new URLSearchParams({ site_code: params.siteCode });
  if (params.q) query.set("q", params.q);
  if (params.fromDate) query.set("from_date", params.fromDate);
  if (params.toDate) query.set("to_date", params.toDate);
  if (params.category) query.set("category", params.category);
  query.set("limit", String(params.limit ?? 30));

  const response = await fetch(`${API_BASE}/lots/active-search?${query.toString()}`, withAuth(params.token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Ricerca lotti attivi fallita.");
  }
  return (await response.json()) as ActiveLotSearchItem[];
}

export async function fetchLabelProfiles(token: string, siteCode: string): Promise<LabelProfile[]> {
  const response = await fetch(
    `${API_BASE}/labels/profiles?site_code=${encodeURIComponent(siteCode)}`,
    withAuth(token, { method: "GET" }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento profili etichetta fallito.");
  }
  return (await response.json()) as LabelProfile[];
}

export async function createLabelProfile(params: {
  token: string;
  siteCode: string;
  name: string;
  category?: string;
  templateType?: "RAW_MATERIAL" | "PREPARATION" | "TRANSFORMATION";
  shelfLifeValue?: number;
  shelfLifeUnit?: "hours" | "days" | "months";
  packaging?: string;
  storageInstructions?: string;
  allergenText?: string;
  isActive?: boolean;
}): Promise<LabelProfile> {
  const response = await fetch(
    `${API_BASE}/labels/profiles`,
    withAuth(params.token, {
      method: "POST",
      body: JSON.stringify({
        site_code: params.siteCode,
        name: params.name,
        category: params.category || "",
        template_type: params.templateType || "PREPARATION",
        shelf_life_value: params.shelfLifeValue ?? 1,
        shelf_life_unit: params.shelfLifeUnit || "days",
        packaging: params.packaging || "",
        storage_instructions: params.storageInstructions || "",
        allergen_text: params.allergenText || "",
        is_active: params.isActive ?? true,
      }),
    }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Creazione profilo etichetta fallita.");
  }
  return (await response.json()) as LabelProfile;
}

export async function updateLabelProfile(params: {
  token: string;
  profileId: string;
  name?: string;
  category?: string;
  templateType?: "RAW_MATERIAL" | "PREPARATION" | "TRANSFORMATION";
  shelfLifeValue?: number;
  shelfLifeUnit?: "hours" | "days" | "months";
  packaging?: string;
  storageInstructions?: string;
  allergenText?: string;
  isActive?: boolean;
}): Promise<LabelProfile> {
  const body: Record<string, unknown> = {};
  if (params.name !== undefined) body.name = params.name;
  if (params.category !== undefined) body.category = params.category;
  if (params.templateType !== undefined) body.template_type = params.templateType;
  if (params.shelfLifeValue !== undefined) body.shelf_life_value = params.shelfLifeValue;
  if (params.shelfLifeUnit !== undefined) body.shelf_life_unit = params.shelfLifeUnit;
  if (params.packaging !== undefined) body.packaging = params.packaging;
  if (params.storageInstructions !== undefined) body.storage_instructions = params.storageInstructions;
  if (params.allergenText !== undefined) body.allergen_text = params.allergenText;
  if (params.isActive !== undefined) body.is_active = params.isActive;

  const response = await fetch(
    `${API_BASE}/labels/profiles/${params.profileId}`,
    withAuth(params.token, { method: "PUT", body: JSON.stringify(body) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Aggiornamento profilo etichetta fallito.");
  }
  return (await response.json()) as LabelProfile;
}

export async function requestLabelPrint(params: {
  token: string;
  siteCode: string;
  profileId: string;
  lotId?: string;
  copies: number;
}): Promise<LabelPrintJob> {
  const response = await fetch(
    `${API_BASE}/labels/print`,
    withAuth(params.token, {
      method: "POST",
      body: JSON.stringify({
        site_code: params.siteCode,
        profile_id: params.profileId,
        lot_id: params.lotId || undefined,
        copies: params.copies,
      }),
    }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Richiesta stampa etichette fallita.");
  }
  const body = (await response.json()) as { print_job: LabelPrintJob };
  return body.print_job;
}

export function reportCsvUrl(siteCode: string, token: string): string {
  return `${API_BASE}/reports/lots.csv?site_code=${siteCode}&token=${token}`;
}

export function reportPdfUrl(siteCode: string, token: string): string {
  return `${API_BASE}/reports/lots.pdf?site_code=${siteCode}&token=${token}`;
}

export function reportTemperatureCsvUrl(siteCode: string, token: string): string {
  return `${API_BASE}/reports/temperatures.csv?site_code=${siteCode}&token=${token}`;
}

export async function fetchAlerts(token: string, siteCode: string): Promise<AlertItem[]> {
  const response = await fetch(
    `${API_BASE}/alerts?site_code=${siteCode}&due_only=1&include_resolved=0`,
    withAuth(token, { method: "GET" }),
  );
  if (!response.ok) {
    throw new Error("Caricamento alert fallito.");
  }
  return (await response.json()) as AlertItem[];
}

export async function captureTemperaturePreview(params: {
  token: string;
  siteCode: string;
  fileName: string;
  fileMimeType: string;
  fileBase64: string;
  deviceLabel?: string;
  deviceType?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  coldPointId?: string;
}): Promise<TemperaturePreviewResponse> {
  const payload = {
    site_code: params.siteCode,
    file_name: params.fileName,
    file_mime_type: params.fileMimeType,
    file_b64: params.fileBase64,
    device_label: params.deviceLabel || "",
    device_type: params.deviceType || undefined,
    cold_point_id: params.coldPointId || undefined,
  };
  const response = await fetch(
    `${API_BASE}/temperatures/capture-preview`,
    withAuth(params.token, { method: "POST", body: JSON.stringify(payload) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Anteprima OCR temperatura fallita.");
  }
  return (await response.json()) as TemperaturePreviewResponse;
}

export async function confirmTemperatureReading(params: {
  token: string;
  siteCode: string;
  coldPointId?: string;
  deviceLabel?: string;
  deviceType?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  confirmedTemperatureCelsius: string;
  source?: "OCR_PHOTO_CONFIRMED" | "MANUAL_PRESET" | "MANUAL_OUT_OF_RANGE";
  observedAt?: string;
  ocrProvider?: string;
  ocrConfidence?: number | null;
  ocrSuggestedTemperatureCelsius?: number;
  ocrWarnings?: string[];
  manualDeviationReason?: string;
  correctiveAction?: string;
}): Promise<TemperatureCaptureResponse> {
  const payload = {
    site_code: params.siteCode,
    cold_point_id: params.coldPointId || undefined,
    device_label: params.deviceLabel || "",
    device_type: params.deviceType || undefined,
    confirmed_temperature_celsius: params.confirmedTemperatureCelsius,
    source: params.source || undefined,
    observed_at: params.observedAt || undefined,
    ocr_provider: params.ocrProvider || "",
    ocr_confidence: params.ocrConfidence ?? undefined,
    ocr_suggested_temperature_celsius: params.ocrSuggestedTemperatureCelsius ?? undefined,
    ocr_warnings: params.ocrWarnings || [],
    manual_deviation_reason: params.manualDeviationReason || "",
    corrective_action: params.correctiveAction || "",
  };
  const response = await fetch(
    `${API_BASE}/temperatures/confirm`,
    withAuth(params.token, { method: "POST", body: JSON.stringify(payload) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Conferma operatore fallita.");
  }
  return (await response.json()) as TemperatureCaptureResponse;
}

export async function fetchTemperatureReadings(
  token: string,
  siteCode: string,
  limit = 20,
  options?: { sectorId?: string; coldPointId?: string },
): Promise<TemperatureReading[]> {
  const query = new URLSearchParams({
    site_code: siteCode,
    limit: String(limit),
  });
  if (options?.sectorId) query.set("sector_id", options.sectorId);
  if (options?.coldPointId) query.set("cold_point_id", options.coldPointId);
  const response = await fetch(
    `${API_BASE}/temperatures?${query.toString()}`,
    withAuth(token, { method: "GET" }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento storico temperature fallito.");
  }
  return (await response.json()) as TemperatureReading[];
}

export async function fetchColdSectors(token: string, siteCode: string): Promise<ColdSector[]> {
  const response = await fetch(
    `${API_BASE}/cold-sectors?site_code=${encodeURIComponent(siteCode)}`,
    withAuth(token, { method: "GET" }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento settori freddo fallito.");
  }
  return (await response.json()) as ColdSector[];
}

export async function createColdSector(params: {
  token: string;
  siteCode: string;
  name: string;
  sortOrder?: number;
}): Promise<ColdSector> {
  const response = await fetch(
    `${API_BASE}/cold-sectors`,
    withAuth(params.token, {
      method: "POST",
      body: JSON.stringify({
        site_code: params.siteCode,
        name: params.name,
        sort_order: params.sortOrder ?? 0,
      }),
    }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Creazione settore fallita.");
  }
  return (await response.json()) as ColdSector;
}

export async function updateColdSector(params: {
  token: string;
  sectorId: string;
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ColdSector> {
  const response = await fetch(
    `${API_BASE}/cold-sectors/${params.sectorId}`,
    withAuth(params.token, {
      method: "PUT",
      body: JSON.stringify({
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.sortOrder !== undefined ? { sort_order: params.sortOrder } : {}),
        ...(params.isActive !== undefined ? { is_active: params.isActive } : {}),
      }),
    }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Modifica settore fallita.");
  }
  return (await response.json()) as ColdSector;
}

export async function fetchColdPoints(token: string, siteCode: string, sectorId?: string): Promise<ColdPoint[]> {
  const query = new URLSearchParams({ site_code: siteCode });
  if (sectorId) query.set("sector_id", sectorId);
  const response = await fetch(`${API_BASE}/cold-points?${query.toString()}`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento punti freddo fallito.");
  }
  return (await response.json()) as ColdPoint[];
}

export async function createColdPoint(params: {
  token: string;
  siteCode: string;
  sectorId: string;
  name: string;
  deviceType: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  sortOrder?: number;
}): Promise<ColdPoint> {
  const response = await fetch(
    `${API_BASE}/cold-points`,
    withAuth(params.token, {
      method: "POST",
      body: JSON.stringify({
        site_code: params.siteCode,
        sector_id: params.sectorId,
        name: params.name,
        device_type: params.deviceType,
        sort_order: params.sortOrder ?? 0,
      }),
    }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Creazione punto freddo fallita.");
  }
  return (await response.json()) as ColdPoint;
}

export async function updateColdPoint(params: {
  token: string;
  pointId: string;
  sectorId?: string;
  name?: string;
  deviceType?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ColdPoint> {
  const response = await fetch(
    `${API_BASE}/cold-points/${params.pointId}`,
    withAuth(params.token, {
      method: "PUT",
      body: JSON.stringify({
        ...(params.sectorId !== undefined ? { sector_id: params.sectorId } : {}),
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.deviceType !== undefined ? { device_type: params.deviceType } : {}),
        ...(params.sortOrder !== undefined ? { sort_order: params.sortOrder } : {}),
        ...(params.isActive !== undefined ? { is_active: params.isActive } : {}),
      }),
    }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Modifica punto freddo fallita.");
  }
  return (await response.json()) as ColdPoint;
}

export async function deleteColdPoint(token: string, pointId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/cold-points/${pointId}`,
    withAuth(token, { method: "DELETE" }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Eliminazione punto freddo fallita.");
  }
}

export async function fetchTemperatureRoutes(token: string, siteCode: string, sectorId?: string): Promise<TemperatureRoute[]> {
  const query = new URLSearchParams({ site_code: siteCode });
  if (sectorId) query.set("sector_id", sectorId);
  const response = await fetch(`${API_BASE}/temperature-routes?${query.toString()}`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento sequenze temperature fallito.");
  }
  return (await response.json()) as TemperatureRoute[];
}

export async function fetchTemperatureRouteSequence(token: string, routeId: string): Promise<TemperatureRoute> {
  const response = await fetch(`${API_BASE}/temperature-routes/${routeId}/sequence`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento sequenza route fallito.");
  }
  return (await response.json()) as TemperatureRoute;
}

export async function updateAlertStatus(
  token: string,
  alertId: string,
  status: "RESOLVED",
  resolvedReason: AlertResolutionReason,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/alerts/${alertId}/status`,
    withAuth(token, { method: "POST", body: JSON.stringify({ status, resolved_reason: resolvedReason }) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Aggiornamento alert fallito.");
  }
}


