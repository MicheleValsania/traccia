import * as ImagePicker from "expo-image-picker";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { captureTemperaturePhoto, fetchTemperatureReadings } from "../api";
import { appStyles } from "../styles";
import { TemperatureCaptureResponse, TemperatureReading } from "../types";

type Props = {
  token: string;
  siteCode: string;
  setSiteCode: (value: string) => void;
  setError: (value: string) => void;
};

export function TemperatureScreen(props: Props) {
  const [loading, setLoading] = React.useState(false);
  const [deviceLabel, setDeviceLabel] = React.useState("");
  const [deviceType, setDeviceType] = React.useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("OTHER");
  const [lastCapture, setLastCapture] = React.useState<TemperatureCaptureResponse | null>(null);
  const [readings, setReadings] = React.useState<TemperatureReading[]>([]);

  async function refreshReadings() {
    if (!props.token) {
      props.setError("Effettua login prima di caricare lo storico temperature.");
      return;
    }
    try {
      const rows = await fetchTemperatureReadings(props.token, props.siteCode, 20);
      setReadings(rows);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento temperature.");
    }
  }

  async function submitAsset(asset: { base64?: string | null; fileName?: string | null; mimeType?: string | null }) {
    if (!asset.base64) {
      props.setError("Immagine non valida: base64 assente.");
      return;
    }
    const response = await captureTemperaturePhoto({
      token: props.token,
      siteCode: props.siteCode,
      fileName: asset.fileName || `temperature_${Date.now()}.jpg`,
      fileMimeType: asset.mimeType || "image/jpeg",
      fileBase64: asset.base64,
      deviceLabel,
      deviceType,
    });
    setLastCapture(response);
    await refreshReadings();
  }

  async function captureFromCamera() {
    props.setError("");
    setLoading(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        props.setError("Permesso camera negato.");
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (shot.canceled || !shot.assets[0]) {
        return;
      }
      await submitAsset(shot.assets[0]);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore acquisizione temperatura.");
    } finally {
      setLoading(false);
    }
  }

  async function pickFromGallery() {
    props.setError("");
    setLoading(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        props.setError("Permesso galleria negato.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (picked.canceled || !picked.assets[0]) {
        return;
      }
      await submitAsset(picked.assets[0]);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore acquisizione temperatura.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Temperature frigo/congelatori</Text>
      <Text style={appStyles.tokenPreview}>Le foto sono elaborate per OCR e non vengono conservate.</Text>

      <Text style={appStyles.label}>Site code</Text>
      <TextInput
        style={appStyles.input}
        value={props.siteCode}
        onChangeText={props.setSiteCode}
        autoCapitalize="characters"
        placeholder="MAIN"
      />

      <Text style={appStyles.label}>Dispositivo (opzionale)</Text>
      <TextInput
        style={appStyles.input}
        value={deviceLabel}
        onChangeText={setDeviceLabel}
        placeholder="Frigo linea 1"
      />

      <Text style={appStyles.label}>Tipo dispositivo</Text>
      <View style={appStyles.tabsRow}>
        {(["FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"] as const).map((type) => (
          <Pressable
            key={type}
            style={[appStyles.tabButton, deviceType === type ? appStyles.tabButtonActive : undefined]}
            onPress={() => setDeviceType(type)}
            disabled={loading}
          >
            <Text style={[appStyles.tabText, deviceType === type ? appStyles.tabTextActive : undefined]}>{type}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={appStyles.button} onPress={captureFromCamera} disabled={!props.token || loading}>
        <Text style={appStyles.buttonText}>{loading ? "Elaborazione..." : "Scatta temperatura"}</Text>
      </Pressable>
      <Pressable style={appStyles.buttonSecondary} onPress={pickFromGallery} disabled={!props.token || loading}>
        <Text style={appStyles.buttonSecondaryText}>Fallback: scegli dalla galleria</Text>
      </Pressable>
      <Pressable style={appStyles.linkButton} onPress={refreshReadings} disabled={!props.token || loading}>
        <Text style={appStyles.linkText}>Aggiorna storico temperature</Text>
      </Pressable>

      {lastCapture ? (
        <View style={appStyles.draftRow}>
          <Text style={appStyles.sectionTitle}>Ultima rilevazione</Text>
          <Text>Temperatura: {lastCapture.reading.temperature_celsius} {lastCapture.reading.unit}</Text>
          <Text>Tipo: {lastCapture.reading.device_type}</Text>
          <Text>Dispositivo: {lastCapture.reading.device_label || "-"}</Text>
          <Text>OCR provider: {lastCapture.reading.ocr_provider || "-"}</Text>
          <Text>Foto persistita: {lastCapture.privacy.photo_persisted ? "SI" : "NO"}</Text>
        </View>
      ) : null}

      {readings.length > 0 ? (
        <View style={appStyles.draftRow}>
          <Text style={appStyles.sectionTitle}>Storico (ultime 20)</Text>
          {readings.map((row) => (
            <Text key={row.id}>
              {row.observed_at.slice(0, 16)} | {row.device_type} | {row.temperature_celsius} {row.unit}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
