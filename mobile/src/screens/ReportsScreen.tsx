import React from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { AlertResolutionReason, fetchAlerts, reportCsvUrl, reportPdfUrl, reportTemperatureCsvUrl, updateAlertStatus } from "../api";
import { useI18n } from "../i18n";
import { appStyles } from "../styles";
import { AlertItem } from "../types";

type Props = {
  siteCode: string;
  token: string;
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
  onMark: (alertId: string, reason: AlertResolutionReason) => void;
}) {
  const { t } = useI18n();
  const alertLabels: Record<AlertItem["alert_type"], string> = {
    EXPIRY_D3: t("reports.expires_in", { days: 3 }),
    EXPIRY_D2: t("reports.expires_in", { days: 2 }),
    EXPIRY_D1: t("reports.expires_in", { days: 1 }),
    EXPIRED: t("reports.expires_today"),
  };
  const alertActions: Array<{ reason: AlertResolutionReason; label: string; style: "secondary" | "danger" | "primary" }> = [
    { reason: "CONSUMED", label: t("reports.resolve.consumed"), style: "secondary" },
    { reason: "DISCARDED", label: t("reports.resolve.discarded"), style: "danger" },
    { reason: "TRANSFORMED", label: t("reports.resolve.transformed"), style: "primary" },
  ];
  return (
    <View style={appStyles.draftRow}>
      <Text style={appStyles.infoText}>{alert.lot_code} - {alertLabels[alert.alert_type]}</Text>
      <Text style={appStyles.tokenPreview}>{t("reports.supplier", { value: alert.supplier_name || "-" })}</Text>
      <Text style={appStyles.tokenPreview}>{t("reports.supplier_lot", { value: alert.supplier_lot_code || "-" })}</Text>
      <Text style={appStyles.tokenPreview}>{t("reports.dlc", { value: formatDateFr(alert.dlc_date) })}</Text>
      {alert.days_to_expiry !== null ? (
        <Text style={alert.days_to_expiry < 0 ? appStyles.critical : appStyles.warn}>
          {alert.days_to_expiry < 0
            ? t("reports.expired", { days: Math.abs(alert.days_to_expiry) })
            : alert.days_to_expiry === 0
              ? t("reports.expires_today")
              : t("reports.expires_in", { days: alert.days_to_expiry })}
        </Text>
      ) : null}
      <Text style={appStyles.tokenPreview}>{t("reports.close_as")}</Text>
      <View style={appStyles.tabsRow}>
        {alertActions.map((action) => {
          const buttonStyle =
            action.style === "secondary"
              ? appStyles.buttonSecondary
              : action.style === "danger"
                ? appStyles.buttonDanger
                : appStyles.button;
          const pressedStyle =
            action.style === "secondary"
              ? appStyles.buttonSecondaryPressed
              : action.style === "danger"
                ? appStyles.buttonDangerPressed
                : appStyles.buttonPressed;
          const textStyle =
            action.style === "secondary" ? appStyles.buttonSecondaryText : appStyles.buttonText;

          return (
            <Pressable
              key={action.reason}
              style={({ pressed }) => [buttonStyle, { flex: 1, marginTop: 4, minWidth: 96 }, pressed ? pressedStyle : undefined]}
              onPress={() => onMark(alert.id, action.reason)}
              disabled={!canAct}
            >
              <Text style={textStyle}>{action.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ReportsScreen(props: Props) {
  const { t } = useI18n();
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
      setError(e instanceof Error ? e.message : t("reports.alert_error"));
    } finally {
      setLoadingAlerts(false);
    }
  }

  async function markAlert(alertId: string, reason: AlertResolutionReason) {
    try {
      await updateAlertStatus(props.token, alertId, "RESOLVED", reason);
      await refreshAlerts();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reports.update_error"));
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
      <Text style={appStyles.sectionTitle}>{t("reports.dashboard")}</Text>
      <Text style={appStyles.tokenPreview}>{t("labels.site", { value: props.siteCode })}</Text>

      <View style={appStyles.tabsRow}>
        <View style={[appStyles.tabButton, { flex: 1, minWidth: 68 }]}> 
          <Text style={appStyles.tabText}>{t("reports.today_short")}</Text>
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
        <Text style={appStyles.linkText}>{loadingAlerts ? t("reports.loading") : t("reports.refresh_alerts")}</Text>
      </Pressable>

      {grouped.today.length > 0 ? <Text style={appStyles.sectionTitle}>{t("reports.today_section")}</Text> : null}
      {grouped.today.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {grouped.d1.length > 0 ? <Text style={appStyles.sectionTitle}>{t("reports.d1_section")}</Text> : null}
      {grouped.d1.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {grouped.d2.length > 0 ? <Text style={appStyles.sectionTitle}>{t("reports.d2_section")}</Text> : null}
      {grouped.d2.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {grouped.d3.length > 0 ? <Text style={appStyles.sectionTitle}>{t("reports.d3_section")}</Text> : null}
      {grouped.d3.map((alert) => (
        <AlertRow key={alert.id} alert={alert} canAct={!!props.token} onMark={markAlert} />
      ))}

      {!alerts.length ? <Text>{t("reports.no_alerts")}</Text> : null}

      <Text style={appStyles.sectionTitle}>{t("reports.report")}</Text>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => Linking.openURL(csv)} disabled={!props.token}>
        <Text style={appStyles.linkText}>{t("reports.open_csv")}</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => Linking.openURL(pdf)} disabled={!props.token}>
        <Text style={appStyles.linkText}>{t("reports.open_pdf")}</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => Linking.openURL(tempCsv)} disabled={!props.token}>
        <Text style={appStyles.linkText}>{t("reports.open_temp_csv")}</Text>
      </Pressable>
      {error ? <Text style={appStyles.error}>{error}</Text> : null}
    </View>
  );
}
