import React from "react";
import { Pressable, Text, View } from "react-native";

import { validateDraftLot } from "../api";
import { appStyles } from "../styles";
import { DraftLot } from "../types";
import { WarningList } from "../components/WarningList";

type Props = {
  token: string;
  drafts: DraftLot[];
  setError: (value: string) => void;
  refreshDrafts: () => Promise<void>;
};

export function DraftsScreen(props: Props) {
  function readAiField(lot: DraftLot, key: string): string {
    const value = lot.ai_payload?.[key];
    return typeof value === "string" ? value : "";
  }

  async function validateDraft(lot: DraftLot) {
    try {
      await validateDraftLot(props.token, lot);
      await props.refreshDrafts();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Convalida fallita.");
    }
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Draft da convalidare (tablet/PC)</Text>
      <Pressable style={({ pressed }) => [appStyles.linkButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={props.refreshDrafts} disabled={!props.token}>
        <Text style={appStyles.linkText}>Aggiorna elenco draft</Text>
      </Pressable>
      {props.drafts.map((lot) => (
        <View key={lot.id} style={appStyles.draftRow}>
          <Text>{lot.internal_lot_code}</Text>
          <Text>Fornitore: {lot.supplier_name || "-"}</Text>
          <Text>Lotto fornitore: {lot.supplier_lot_code || readAiField(lot, "supplier_lot_code") || "-"}</Text>
          <Text>DLC: {lot.dlc_date || readAiField(lot, "dlc_date") || "-"}</Text>
          <Text>Peso: {readAiField(lot, "weight") || "-"}</Text>
          <Text>Prodotto OCR: {readAiField(lot, "product_guess") || "-"}</Text>
          <WarningList warnings={lot.ocr_warnings || []} maxItems={2} />
          <Pressable style={({ pressed }) => [appStyles.smallButton, pressed ? appStyles.buttonPressed : undefined]} onPress={() => validateDraft(lot)} disabled={!props.token}>
            <Text style={appStyles.smallButtonText}>Convalida</Text>
          </Pressable>
        </View>
      ))}
      {!props.drafts.length ? <Text>Nessun draft presente.</Text> : null}
    </View>
  );
}
