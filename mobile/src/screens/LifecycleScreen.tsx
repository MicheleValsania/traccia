import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { transformLot } from "../api";
import { appStyles } from "../styles";

const ACTIONS = ["FREEZING", "THAWING", "OPENED", "VACUUM_PACKING", "SOUS_VIDE_COOK"];

type Props = {
  token: string;
  setError: (value: string) => void;
};

export function LifecycleScreen(props: Props) {
  const [lotId, setLotId] = useState("");
  const [action, setAction] = useState("FREEZING");
  const [outputDlcDate, setOutputDlcDate] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [outputUnit, setOutputUnit] = useState("kg");
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");

  async function submitTransform() {
    props.setError("");
    setResult("");
    try {
      const response = await transformLot({
        token: props.token,
        lotId,
        action,
        outputDlcDate,
        outputQuantityValue: outputQty,
        outputQuantityUnit: outputUnit,
        note,
      });
      setResult(`Creato lotto derivato: ${response.derived_internal_lot_code}`);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Trasformazione fallita.");
    }
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Lifecycle (Fase 2 base)</Text>
      <Text style={appStyles.label}>Lot ID sorgente (ACTIVE)</Text>
      <TextInput style={appStyles.input} value={lotId} onChangeText={setLotId} placeholder="uuid lotto" autoCapitalize="none" />

      <Text style={appStyles.label}>Azione</Text>
      <View style={appStyles.tabsRow}>
        {ACTIONS.map((candidate) => (
          <Pressable
            key={candidate}
            style={[appStyles.tabButton, action === candidate ? appStyles.tabButtonActive : undefined]}
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

      <Pressable style={appStyles.button} onPress={submitTransform} disabled={!props.token || !lotId}>
        <Text style={appStyles.buttonText}>Esegui trasformazione</Text>
      </Pressable>
      {result ? <Text style={appStyles.success}>{result}</Text> : null}
    </View>
  );
}
