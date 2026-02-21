import { CaptureResponse, DraftLot, TransformResponse } from "./types";

export const API_BASE = "http://127.0.0.1:8000/api";

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
  const response = await fetch(
    `${API_BASE}/auth/token`,
    withAuth("", { method: "POST", body: JSON.stringify({ username, password }) }),
  );
  if (!response.ok) {
    throw new Error("Login fallito.");
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

export async function captureLabelPhoto(params: {
  token: string;
  siteCode: string;
  supplierName: string;
  fileName: string;
  fileBase64: string;
}): Promise<CaptureResponse> {
  const payload = {
    site_code: params.siteCode,
    supplier_name: params.supplierName,
    file_name: params.fileName,
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
