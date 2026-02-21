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
      <Pressable style={appStyles.linkButton} onPress={props.refreshDrafts} disabled={!props.token}>
        <Text style={appStyles.linkText}>Aggiorna elenco draft</Text>
      </Pressable>
      {props.drafts.map((lot) => (
        <View key={lot.id} style={appStyles.draftRow}>
          <Text>{lot.internal_lot_code}</Text>
          <Text>{lot.supplier_name}</Text>
          <Text>DLC: {lot.dlc_date || "-"}</Text>
          <WarningList warnings={lot.ocr_warnings || []} maxItems={2} />
          <Pressable style={appStyles.smallButton} onPress={() => validateDraft(lot)} disabled={!props.token}>
            <Text style={appStyles.smallButtonText}>Convalida</Text>
          </Pressable>
        </View>
      ))}
      {!props.drafts.length ? <Text>Nessun draft presente.</Text> : null}
    </View>
  );
}
