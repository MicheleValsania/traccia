import {
  ActiveLotSearchItem,
  AlertItem,
  CaptureResponse,
  ColdPoint,
  ColdSector,
  DraftLot,
  MeResponse,
  TemperatureCaptureResponse,
  TemperaturePreviewResponse,
  TemperatureReading,
  TemperatureRoute,
  TransformResponse,
} from "./types";

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
    throw new Error(`API non raggiungibile (${API_BASE}/auth/token). Verifica EXPO_PUBLIC_API_BASE e rete.`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { detail?: string; non_field_errors?: string[] };
      detail = body.detail || (body.non_field_errors && body.non_field_errors[0]) || "";
    } catch {
      detail = (await response.text()).trim();
    }
    throw new Error(`Login fallito [${response.status}]${detail ? `: ${detail}` : ""}`);
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const response = await fetch(`${API_BASE}/auth/me`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento profilo utente fallito.");
  }
  return (await response.json()) as MeResponse;
}

export async function captureLabelPhoto(params: {
  token: string;
  siteCode: string;
  supplierName: string;
  fileName: string;
  fileMimeType: string;
  fileBase64: string;
}): Promise<CaptureResponse> {
  const payload = {
    site_code: params.siteCode,
    supplier_name: params.supplierName,
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
  return (await response.json()) as CaptureResponse;
}

export async function fetchDrafts(token: string, siteCode: string): Promise<DraftLot[]> {
  const response = await fetch(`${API_BASE}/lots/drafts?site_code=${siteCode}`, withAuth(token, { method: "GET" }));
  if (!response.ok) {
    throw new Error("Caricamento draft fallito.");
  }
  return (await response.json()) as DraftLot[];
}

export async function validateDraftLot(token: string, lot: DraftLot): Promise<void> {
  if (!lot.suggestions[0]) {
    throw new Error("Nessun prodotto suggerito disponibile.");
  }
  const payload = {
    fiche_product_id: lot.suggestions[0].id,
    supplier_lot_code: lot.supplier_lot_code,
    dlc_date: lot.dlc_date,
    validated_by: "mobile_operator",
    role: "OPERATOR",
  };
  const response = await fetch(
    `${API_BASE}/lots/${lot.id}/validate`,
    withAuth(token, { method: "POST", body: JSON.stringify(payload) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Convalida fallita.");
  }
}

export async function transformLot(params: {
  token: string;
  lotId: string;
  action: string;
  outputDlcDate?: string;
  outputQuantityValue?: string;
  outputQuantityUnit?: string;
  note?: string;
}): Promise<TransformResponse> {
  const payload = {
    action: params.action,
    output_dlc_date: params.outputDlcDate || undefined,
    output_quantity_value: params.outputQuantityValue || undefined,
    output_quantity_unit: params.outputQuantityUnit || undefined,
    note: params.note || "",
  };
  const response = await fetch(
    `${API_BASE}/lots/${params.lotId}/transform`,
    withAuth(params.token, { method: "POST", body: JSON.stringify(payload) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Trasformazione fallita.");
  }
  return (await response.json()) as TransformResponse;
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
  status: "ACKED" | "RESOLVED",
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/alerts/${alertId}/status`,
    withAuth(token, { method: "POST", body: JSON.stringify({ status }) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Aggiornamento alert fallito.");
  }
}
