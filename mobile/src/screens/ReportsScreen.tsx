import React from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { reportCsvUrl, reportPdfUrl } from "../api";
import { appStyles } from "../styles";

type Props = {
  siteCode: string;
  token: string;
};

export function ReportsScreen(props: Props) {
  const csv = reportCsvUrl(props.siteCode, props.token);
  const pdf = reportPdfUrl(props.siteCode, props.token);

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Report</Text>
      <Pressable style={appStyles.linkButton} onPress={() => Linking.openURL(csv)} disabled={!props.token}>
        <Text style={appStyles.linkText}>Apri export CSV</Text>
      </Pressable>
      <Pressable style={appStyles.linkButton} onPress={() => Linking.openURL(pdf)} disabled={!props.token}>
        <Text style={appStyles.linkText}>Apri export PDF</Text>
      </Pressable>
    </View>
  );
}
