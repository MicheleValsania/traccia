import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { fetchHaccpSchedules, fetchHaccpSectors, updateHaccpScheduleStatus } from "../api";
import { appStyles } from "../styles";
import { HaccpSchedule } from "../types";

type Props = {
  token: string;
  siteCode: string;
  setError: (value: string) => void;
};

function startOfTodayIso(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function CleaningScreen(props: Props) {
  const [loading, setLoading] = React.useState(false);
  const [schedules, setSchedules] = React.useState<HaccpSchedule[]>([]);
  const [selectedSector, setSelectedSector] = React.useState<string>("all");
  const [selectedIds, setSelectedIds] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [infoMessage, setInfoMessage] = React.useState("");
  const [sectorOptions, setSectorOptions] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    if (!props.token) return;
    void loadData();
  }, [props.token, props.siteCode]);

  async function loadData() {
    setLoading(true);
    try {
      const [sectorResult, scheduleResult] = await Promise.allSettled([
        fetchHaccpSectors(props.token, props.siteCode),
        fetchHaccpSchedules(props.token, props.siteCode, "cleaning"),
      ]);

      if (sectorResult.status === "fulfilled") {
        setSectorOptions(sectorResult.value.map((row) => ({ id: row.id, name: row.name })));
      }

      if (scheduleResult.status === "fulfilled") {
        setSchedules(scheduleResult.value);
        const dueIds = Object.fromEntries(
          scheduleResult.value
            .filter((row) => row.status === "planned" && row.starts_at <= startOfTodayIso())
            .map((row) => [row.id, true]),
        );
        setSelectedIds(dueIds);
        setInfoMessage(`Pulizie caricate: ${scheduleResult.value.length}`);
      } else {
        setSchedules([]);
        setSelectedIds({});
        props.setError(scheduleResult.reason instanceof Error ? scheduleResult.reason.message : "Errore caricamento planning pulizie.");
        setInfoMessage("Planning pulizie non disponibile al momento.");
      }

      if (sectorResult.status === "rejected") {
        props.setError(sectorResult.reason instanceof Error ? sectorResult.reason.message : "Errore caricamento settori HACCP.");
      }
    } finally {
      setLoading(false);
    }
  }

  const dueRows = React.useMemo(() => {
    return schedules.filter((row) => row.status === "planned" && row.starts_at <= startOfTodayIso());
  }, [schedules]);

  const filteredRows = React.useMemo(() => {
    if (selectedSector === "all") return dueRows;
    return dueRows.filter((row) => row.sector === selectedSector);
  }, [dueRows, selectedSector]);

  const groupedRows = React.useMemo(() => {
    const groups = new Map<string, HaccpSchedule[]>();
    for (const row of filteredRows) {
      const key = row.sector || row.sector_label || row.area || "site";
      const label = row.sector_label || row.area || "Intero sito";
      const bucket = groups.get(key) || [];
      bucket.push({ ...row, sector_label: label });
      groups.set(key, bucket);
    }
    return Array.from(groups.values());
  }, [filteredRows]);

  const completedRows = React.useMemo(() => {
    const rows = schedules
      .filter((row) => row.status === "done" && row.completed_at)
      .filter((row) => (selectedSector === "all" ? true : row.sector === selectedSector))
      .sort((a, b) => {
        const left = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const right = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return right - left;
      });
    return rows.slice(0, 20);
  }, [schedules, selectedSector]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => ({ ...current, [id]: !current[id] }));
  }

  async function markSchedulesDone(ids: string[], message: string) {
    const uniqueIds = Array.from(new Set(ids)).filter((id) => selectedIds[id]);
    if (!uniqueIds.length) {
      setInfoMessage("Nessuna pulizia selezionata.");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(uniqueIds.map((id) => updateHaccpScheduleStatus(props.token, id, "done")));
      setInfoMessage(message);
      await loadData();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore convalida pulizie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={appStyles.container}>
      <View style={appStyles.card}>
        <Text style={appStyles.sectionTitle}>Pulizie</Text>
        <Text style={appStyles.muted}>Convalida le pulizie pianificate per oggi o scadute, per sezione o per intero sito.</Text>
        <View style={appStyles.tabsRow}>
          <Pressable
            style={({ pressed }) => [appStyles.tabButton, selectedSector === "all" ? appStyles.tabButtonActive : undefined, pressed ? appStyles.tabButtonPressed : undefined]}
            onPress={() => setSelectedSector("all")}
          >
            <Text style={[appStyles.tabText, selectedSector === "all" ? appStyles.tabTextActive : undefined]}>Tutto il sito</Text>
          </Pressable>
          {sectorOptions.map((sector) => (
            <Pressable
              key={sector.id}
              style={({ pressed }) => [appStyles.tabButton, selectedSector === sector.id ? appStyles.tabButtonActive : undefined, pressed ? appStyles.tabButtonPressed : undefined]}
              onPress={() => setSelectedSector(sector.id)}
            >
              <Text style={[appStyles.tabText, selectedSector === sector.id ? appStyles.tabTextActive : undefined]}>{sector.name}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined, saving ? { opacity: 0.6 } : undefined]}
          disabled={saving}
          onPress={() => void markSchedulesDone(filteredRows.map((row) => row.id), "Pulizie confermate.")}
        >
          <Text style={appStyles.buttonText}>{saving ? "Convalida in corso..." : "Convalida selezione"}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
          onPress={() => void loadData()}
        >
          <Text style={appStyles.buttonSecondaryText}>{loading ? "Aggiornamento..." : "Aggiorna elenco"}</Text>
        </Pressable>
        {infoMessage ? <Text style={appStyles.muted}>{infoMessage}</Text> : null}
      </View>

      {groupedRows.length === 0 ? (
        <View style={appStyles.card}>
          <Text style={appStyles.listEmpty}>Nessuna pulizia in scadenza per il filtro selezionato.</Text>
        </View>
      ) : null}

      {groupedRows.map((rows) => {
        const groupLabel = rows[0]?.sector_label || rows[0]?.area || "Intero sito";
        const groupIds = rows.map((row) => row.id);
        return (
          <View key={groupIds.join("-")} style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>{groupLabel}</Text>
            <Pressable
              style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined, saving ? { opacity: 0.6 } : undefined]}
              disabled={saving}
              onPress={() => void markSchedulesDone(groupIds, `Pulizie confermate: ${groupLabel}`)}
            >
              <Text style={appStyles.buttonSecondaryText}>Convalida sezione</Text>
            </Pressable>
            {rows.map((row) => {
              const selected = !!selectedIds[row.id];
              return (
                <Pressable key={row.id} style={appStyles.listItem} onPress={() => toggleSelected(row.id)}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={appStyles.listTitle}>{row.title}</Text>
                    <Text style={appStyles.listMeta}>{row.area || row.cold_point_label || row.sector_label || "Pulizia sito"}</Text>
                    <Text style={appStyles.listMeta}>Prevista: {formatDateTime(row.starts_at)}</Text>
                  </View>
                  <View style={[appStyles.statusPill, selected ? appStyles.statusResolved : appStyles.statusPending]}>
                    <Text style={selected ? appStyles.statusResolvedText : appStyles.statusPendingText}>{selected ? "Selezionata" : "Esclusa"}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      <View style={appStyles.card}>
        <Text style={appStyles.sectionTitle}>Registro convalide</Text>
        <Text style={appStyles.muted}>Ultime pulizie confermate per il sito o la sezione selezionata.</Text>
        {completedRows.length === 0 ? (
          <Text style={appStyles.listEmpty}>Nessuna convalida registrata per questo filtro.</Text>
        ) : (
          completedRows.map((row) => (
            <View key={`done-${row.id}`} style={appStyles.listItem}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={appStyles.listTitle}>{row.title}</Text>
                <Text style={appStyles.listMeta}>{row.area || row.cold_point_label || row.sector_label || "Pulizia sito"}</Text>
                <Text style={appStyles.listMeta}>Convalidata: {formatDateTime(row.completed_at)}</Text>
              </View>
              <View style={[appStyles.statusPill, appStyles.statusResolved]}>
                <Text style={appStyles.statusResolvedText}>Done</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
