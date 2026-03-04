import { AlertItem, CaptureResponse, DraftLot, TemperatureCaptureResponse, TemperatureReading, TransformResponse } from "./types";

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

export function reportCsvUrl(siteCode: string, token: string): string {
  return `${API_BASE}/reports/lots.csv?site_code=${siteCode}&token=${token}`;
}

export function reportPdfUrl(siteCode: string, token: string): string {
  return `${API_BASE}/reports/lots.pdf?site_code=${siteCode}&token=${token}`;
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

export async function captureTemperaturePhoto(params: {
  token: string;
  siteCode: string;
  fileName: string;
  fileMimeType: string;
  fileBase64: string;
  deviceLabel?: string;
  deviceType?: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER";
}): Promise<TemperatureCaptureResponse> {
  const payload = {
    site_code: params.siteCode,
    file_name: params.fileName,
    file_mime_type: params.fileMimeType,
    file_b64: params.fileBase64,
    device_label: params.deviceLabel || "",
    device_type: params.deviceType || undefined,
  };
  const response = await fetch(
    `${API_BASE}/temperatures/capture`,
    withAuth(params.token, { method: "POST", body: JSON.stringify(payload) }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Rilevazione temperatura fallita.");
  }
  return (await response.json()) as TemperatureCaptureResponse;
}

export async function fetchTemperatureReadings(token: string, siteCode: string, limit = 20): Promise<TemperatureReading[]> {
  const response = await fetch(
    `${API_BASE}/temperatures?site_code=${encodeURIComponent(siteCode)}&limit=${limit}`,
    withAuth(token, { method: "GET" }),
  );
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Caricamento storico temperature fallito.");
  }
  return (await response.json()) as TemperatureReading[];
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
