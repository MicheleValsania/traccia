import React from "react";
import { Text, View } from "react-native";

import { appStyles } from "../styles";
import { OcrWarning } from "../types";

type Props = {
  warnings: OcrWarning[];
  maxItems?: number;
};

export function WarningList({ warnings, maxItems }: Props) {
  const items = typeof maxItems === "number" ? warnings.slice(0, maxItems) : warnings;
  if (!items.length) {
    return null;
  }
  return (
    <View>
      {items.map((item, index) => (
        <Text key={`${item.code}-${index}`} style={item.severity === "critical" ? appStyles.critical : appStyles.warn}>
          - {item.message}
        </Text>
      ))}
    </View>
  );
}
