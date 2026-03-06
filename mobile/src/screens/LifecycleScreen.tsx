import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { fetchActiveLotsSearch, transformLot } from "../api";
import { ActiveLotSearchItem } from "../types";
import { appStyles } from "../styles";

const ACTIONS = ["FREEZING", "THAWING", "OPENED", "VACUUM_PACKING", "SOUS_VIDE_COOK"];
type DateFilterKey = "today" | "yesterday" | "last7";

type Props = {
  token: string;
  siteCode: string;
  setError: (value: string) => void;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateRangeFromFilter(filter: DateFilterKey): { fromDate: string; toDate: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") {
    const d = toIsoDate(today);
    return { fromDate: d, toDate: d };
  }
  if (filter === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const day = toIsoDate(d);
    return { fromDate: day, toDate: day };
  }
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  return { fromDate: toIsoDate(from), toDate: toIsoDate(today) };
}

export function LifecycleScreen(props: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("last7");
  const [searching, setSearching] = useState(false);
  const [lots, setLots] = useState<ActiveLotSearchItem[]>([]);
  const [selectedLot, setSelectedLot] = useState<ActiveLotSearchItem | null>(null);

  const [action, setAction] = useState("FREEZING");
  const [outputDlcDate, setOutputDlcDate] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [outputUnit, setOutputUnit] = useState("kg");
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");

  async function searchLots() {
    if (!props.token) return;
    props.setError("");
    setSearching(true);
    try {
      const range = dateRangeFromFilter(dateFilter);
      const rows = await fetchActiveLotsSearch({
        token: props.token,
        siteCode: props.siteCode,
        q: searchQuery.trim() || undefined,
        fromDate: range.fromDate,
        toDate: range.toDate,
        limit: 30,
      });
      setLots(rows);
      if (selectedLot && !rows.some((row) => row.id === selectedLot.id)) {
        setSelectedLot(null);
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Ricerca lotti fallita.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    void searchLots();
  }, [props.token, props.siteCode, dateFilter]);

  async function submitTransform() {
    if (!selectedLot) {
      props.setError("Seleziona prima un lotto attivo.");
      return;
    }
    props.setError("");
    setResult("");
    try {
      const response = await transformLot({
        token: props.token,
        lotId: selectedLot.id,
        action,
        outputDlcDate,
        outputQuantityValue: outputQty,
        outputQuantityUnit: outputUnit,
        note,
      });
      setResult(`Creato lotto derivato: ${response.derived_internal_lot_code}`);
      await searchLots();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Trasformazione fallita.");
    }
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Lifecycle</Text>

      <Text style={appStyles.label}>Ricerca lotto attivo</Text>
      <TextInput
        style={appStyles.input}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Prodotto, fornitore, lotto..."
      />
      <View style={appStyles.tabsRow}>
        <Pressable
          style={({ pressed }) => [appStyles.tabButton, dateFilter === "today" ? appStyles.tabButtonActive : undefined, pressed ? appStyles.tabButtonPressed : undefined]}
          onPress={() => setDateFilter("today")}
        >
          <Text style={[appStyles.tabText, dateFilter === "today" ? appStyles.tabTextActive : undefined]}>Oggi</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [appStyles.tabButton, dateFilter === "yesterday" ? appStyles.tabButtonActive : undefined, pressed ? appStyles.tabButtonPressed : undefined]}
          onPress={() => setDateFilter("yesterday")}
        >
          <Text style={[appStyles.tabText, dateFilter === "yesterday" ? appStyles.tabTextActive : undefined]}>Ieri</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [appStyles.tabButton, dateFilter === "last7" ? appStyles.tabButtonActive : undefined, pressed ? appStyles.tabButtonPressed : undefined]}
          onPress={() => setDateFilter("last7")}
        >
          <Text style={[appStyles.tabText, dateFilter === "last7" ? appStyles.tabTextActive : undefined]}>Ultimi 7g</Text>
        </Pressable>
      </View>
      <Pressable style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]} onPress={() => void searchLots()} disabled={searching}>
        <Text style={appStyles.buttonSecondaryText}>{searching ? "Ricerca..." : "Aggiorna lista lotti"}</Text>
      </Pressable>

      {lots.map((lot) => (
        <Pressable
          key={lot.id}
          style={({ pressed }) => [
            appStyles.tabButton,
            selectedLot?.id === lot.id ? appStyles.tabButtonActive : undefined,
            pressed ? appStyles.tabButtonPressed : undefined,
          ]}
          onPress={() => setSelectedLot(lot)}
        >
          <Text style={[appStyles.tabText, selectedLot?.id === lot.id ? appStyles.tabTextActive : undefined]}>
            {lot.display_product_name} | {lot.quantity_value || "-"} {lot.quantity_unit || ""}
          </Text>
          <Text style={[appStyles.tokenPreview, selectedLot?.id === lot.id ? appStyles.tabTextActive : undefined]}>
            {lot.supplier_name || "-"} | ricevuto {lot.received_date} | DLC {lot.dlc_date || "-"}
          </Text>
        </Pressable>
      ))}
      {!lots.length ? <Text style={appStyles.tokenPreview}>Nessun lotto attivo per i filtri selezionati.</Text> : null}

      <Text style={appStyles.label}>Azione</Text>
      <View style={appStyles.tabsRow}>
        {ACTIONS.map((candidate) => (
          <Pressable
            key={candidate}
            style={({ pressed }) => [
              appStyles.tabButton,
              action === candidate ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setAction(candidate)}
          >
            <Text style={[appStyles.tabText, action === candidate ? appStyles.tabTextActive : undefined]}>{candidate}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={appStyles.label}>Nuova DLC (YYYY-MM-DD)</Text>
      <TextInput style={appStyles.input} value={outputDlcDate} onChangeText={setOutputDlcDate} placeholder="2026-03-31" />
      <Text style={appStyles.label}>Quantita output</Text>
      <TextInput style={appStyles.input} value={outputQty} onChangeText={setOutputQty} keyboardType="numeric" placeholder="10.0" />
      <Text style={appStyles.label}>Unita output</Text>
      <TextInput style={appStyles.input} value={outputUnit} onChangeText={setOutputUnit} placeholder="kg" />
      <Text style={appStyles.label}>Note</Text>
      <TextInput style={appStyles.input} value={note} onChangeText={setNote} />

      <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={submitTransform} disabled={!props.token || !selectedLot}>
        <Text style={appStyles.buttonText}>Esegui trasformazione</Text>
      </Pressable>
      {result ? <Text style={appStyles.success}>{result}</Text> : null}
    </View>
  );
}
