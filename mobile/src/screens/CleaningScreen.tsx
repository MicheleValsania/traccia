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
      const [sectorRows, scheduleRows] = await Promise.all([
        fetchHaccpSectors(props.token, props.siteCode),
        fetchHaccpSchedules(props.token, props.siteCode, "cleaning"),
      ]);
      setSectorOptions(sectorRows.map((row) => ({ id: row.id, name: row.name })));
      setSchedules(scheduleRows);
      const dueIds = Object.fromEntries(
        scheduleRows
          .filter((row) => row.status === "planned" && row.starts_at <= startOfTodayIso())
          .map((row) => [row.id, true]),
      );
      setSelectedIds(dueIds);
      setInfoMessage(`Pulizie caricate: ${scheduleRows.length}`);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento pulizie.");
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
                    <Text style={appStyles.listMeta}>Prevista: {new Date(row.starts_at).toLocaleString()}</Text>
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
    </ScrollView>
  );
}
