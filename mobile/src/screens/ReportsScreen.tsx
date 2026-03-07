import React from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { fetchAlerts, reportCsvUrl, reportPdfUrl, reportTemperatureCsvUrl, updateAlertStatus } from "../api";
import { appStyles } from "../styles";
import { AlertItem } from "../types";

type Props = {
  siteCode: string;
  token: string;
};

const ALERT_LABELS: Record<AlertItem["alert_type"], string> = {
  EXPIRY_D3: "Scade tra 3 giorni",
  EXPIRY_D2: "Scade tra 2 giorni",
  EXPIRY_D1: "Scade domani",
  EXPIRED: "Scaduto",
};

function formatDateFr(dateIso: string | null): string {
  if (!dateIso) return "-";
  const [year, month, day] = dateIso.split("-");
  if (!year || !month || !day) return dateIso;
  return `${day}-${month}-${year}`;
}

function groupAlertBucket(alert: AlertItem): "today" | "d1" | "d2" | "d3" | "other" {
  const days = alert.days_to_expiry;
  if (days === null) return "other";
  if (days <= 0) return "today";
  if (days === 1) return "d1";
  if (days === 2) return "d2";
  if (days === 3) return "d3";
  return "other";
}

function AlertRow({
  alert,
  canAct,
  onMark,
}: {
  alert: AlertItem;
  canAct: boolean;
  onMark: (alertId: string, status: "ACKED" | "RESOLVED") => void;
}) {
  return (
    <View style={appStyles.draftRow}>
      <Text style={appStyles.infoText}>{alert.lot_code} - {ALERT_LABELS[alert.alert_type]}</Text>
      <Text style={appStyles.tokenPreview}>Fornitore: {alert.supplier_name || "-"}</Text>
      <Text style={appStyles.tokenPreview}>Lotto fornitore: {alert.supplier_lot_code || "-"}</Text>
      <Text style={appStyles.tokenPreview}>DLC: {formatDateFr(alert.dlc_date)}</Text>
      {alert.days_to_expiry !== null ? (
        <Text style={alert.days_to_expiry < 0 ? appStyles.critical : appStyles.warn}>
          {alert.days_to_expiry < 0
            ? `Scaduto da ${Math.abs(alert.days_to_expiry)} giorni`
            : alert.days_to_expiry === 0
              ? "Scadenza oggi"
              : `Scade tra ${alert.days_to_expiry} giorni`}
        </Text>
      ) : null}
      <View style={appStyles.tabsRow}>
        <Pressable
          style={({ pressed }) => [appStyles.buttonSecondary, { flex: 1, marginTop: 0 }, pressed ? appStyles.buttonSecondaryPressed : undefined]}
          onPress={() => onMark(alert.id, "ACKED")}
          disabled={!canAct}
        >
          <Text style={appStyles.buttonSecondaryText}>Ack</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [appStyles.button, { flex: 1, marginTop: 0 }, pressed ? appStyles.buttonPressed : undefined]}
          onPress={() => onMark(alert.id, "RESOLVED")}
          disabled={!canAct}
        >
          <Text style={appStyles.buttonText}>Risolto</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ReportsScreen(props: Props) {
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [loadingAlerts, setLoadingAlerts] = React.useState(false);
  const [error, setError] = React.useState("");
  const csv = reportCsvUrl(props.siteCode, props.token);
  const pdf = reportPdfUrl(props.siteCode, props.token);
  const tempCsv = reportTemperatureCsvUrl(props.siteCode, props.token);

  async function refreshAlerts() {
    if (!props.token) return;
    setLoadingAlerts(true);
    setError("");
    try {
      const next = await fetchAlerts(props.token, props.siteCode);
      setAlerts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore alert.");
    } finally {
      setLoadingAlerts(false);
    }
  }

  async function markAlert(alertId: string, status: "ACKED" | "RESOLVED") {
    try {
      await updateAlertStatus(props.token, alertId, status);
      await refreshAlerts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore aggiornamento alert.");
    }
  }

  React.useEffect(() => {
    void refreshAlerts();
  }, [props.token, props.siteCode]);

  const grouped = alerts.reduce(
    (acc, alert) => {
      const key = groupAlertBucket(alert);
      acc[key].push(alert);
      return acc;
    },
    { today: [] as AlertItem[], d1: [] as AlertItem[], d2: [] as AlertItem[], d3: [] as AlertItem[], other: [] as AlertItem[] },
  );

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Dashboard Alert</Text>
      <Text style={appStyles.tokenPreview}>Site: {props.siteCode}</Text>

      <View style={appStyles.tabsRow}>
        <View style={[appStyles.tabButton, { flex: 1, minWidth: 68 }]}> 
          <Text style={appStyles.tabText}>Oggi/Scad.</Text>
          <Text style={grouped.today.length > 0 ? appStyles.critical : appStyles.tokenPreview}>{grouped.today.length}</Text>
        </View>
        <View style={[appStyles.tabButton, { flex: 1, minWidth: 68 }]}> 
          <Text style={appStyles.tabText}>D-1</Text>
          <Text style={grouped.d1.length > 0 ? appStyles.warn : appStyles.tokenPreview}>{grouped.d1.length}</Text>
        </View>
        <View style={[appStyles.tabButton, { flex: 1, minWidth: 68 }]}> 
          <Text style={appStyles.tabText}>D-2</Text>
          <Text style={grouped.d2.length > 0 ? appStyles.warn : appStyles.tokenPreview}>{grouped.d2.length}</Text>
        </View>
        <View style={[appStyles.tabButton, { flex: 1, minWidth: 68 }]}> 
          <Text style={appStyles.tabText}>D-3</Text>
          <Text style={grouped.d3.length > 0 ? appStyles.infoText : appStyles.tokenPreview}>{grouped.d3.length}</Text>
        </View>
      </View>

      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={refreshAlerts} disabled={!props.token || loadingAlerts}>
        <Text style={appStyles.linkText}>{loadingAlerts ? "Aggiornamento..." : "Aggiorna alert"}</Text>
      </Pressable>

      {grouped.today.length > 0 ? <Text style={appStyles.sectionTitle}>Scadenze oggi / scaduti</Text> : null}
      {grouped.today.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {grouped.d1.length > 0 ? <Text style={appStyles.sectionTitle}>Scadenze D-1</Text> : null}
      {grouped.d1.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {grouped.d2.length > 0 ? <Text style={appStyles.sectionTitle}>Scadenze D-2</Text> : null}
      {grouped.d2.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {grouped.d3.length > 0 ? <Text style={appStyles.sectionTitle}>Scadenze D-3</Text> : null}
      {grouped.d3.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {!alerts.length ? <Text>Nessun alert attivo.</Text> : null}

      <Text style={appStyles.sectionTitle}>Report</Text>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => Linking.openURL(csv)} disabled={!props.token}>
        <Text style={appStyles.linkText}>Apri export CSV</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => Linking.openURL(pdf)} disabled={!props.token}>
        <Text style={appStyles.linkText}>Apri export PDF</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => Linking.openURL(tempCsv)} disabled={!props.token}>
        <Text style={appStyles.linkText}>Apri registro temperature CSV</Text>
      </Pressable>
      {error ? <Text style={appStyles.error}>{error}</Text> : null}
    </View>
  );
}
