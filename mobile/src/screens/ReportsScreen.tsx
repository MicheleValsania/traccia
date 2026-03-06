import React from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { fetchAlerts, reportCsvUrl, reportPdfUrl, reportTemperatureCsvUrl, updateAlertStatus } from "../api";
import { appStyles } from "../styles";
import { AlertItem } from "../types";

type Props = {
  siteCode: string;
  token: string;
};

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
    refreshAlerts();
  }, [props.token, props.siteCode]);

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Alert</Text>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={refreshAlerts} disabled={!props.token || loadingAlerts}>
        <Text style={appStyles.linkText}>{loadingAlerts ? "Aggiornamento..." : "Aggiorna alert"}</Text>
      </Pressable>
      {alerts.map((alert) => (
        <View key={alert.id} style={appStyles.draftRow}>
          <Text>{alert.lot_code} - {alert.alert_type}</Text>
          <Text>Fornitore: {alert.supplier_name || "-"}</Text>
          <Text>Lotto fornitore: {alert.supplier_lot_code || "-"}</Text>
          <Text>DLC: {alert.dlc_date || "-"}</Text>
          <Text>Stato: {alert.status}</Text>
          <View style={appStyles.tabsRow}>
            <Pressable
              style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
              onPress={() => markAlert(alert.id, "ACKED")}
              disabled={!props.token}
            >
              <Text style={appStyles.buttonSecondaryText}>Ack</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [appStyles.smallButton, pressed ? appStyles.buttonPressed : undefined]} onPress={() => markAlert(alert.id, "RESOLVED")} disabled={!props.token}>
              <Text style={appStyles.smallButtonText}>Risolto</Text>
            </Pressable>
          </View>
        </View>
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
