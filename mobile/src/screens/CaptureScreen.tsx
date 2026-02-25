import * as ImagePicker from "expo-image-picker";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { captureLabelPhoto } from "../api";
import { appStyles } from "../styles";
import { CaptureResponse } from "../types";
import { WarningList } from "../components/WarningList";

type Props = {
  token: string;
  siteCode: string;
  setSiteCode: (value: string) => void;
  supplierName: string;
  setSupplierName: (value: string) => void;
  loading: boolean;
  setLoading: (value: boolean) => void;
  captureResult: CaptureResponse | null;
  setCaptureResult: (value: CaptureResponse | null) => void;
  setError: (value: string) => void;
  refreshDrafts: () => Promise<void>;
};

type CaptureMode = "camera_only" | "full_flow";

export function CaptureScreen(props: Props) {
  const [mode, setMode] = React.useState<CaptureMode>("camera_only");
  const [sessionShots, setSessionShots] = React.useState(0);

  async function submitPickedAsset(
    asset: ImagePicker.ImagePickerAsset,
    options?: { showResult?: boolean; refreshDrafts?: boolean },
  ) {
    const fileBase64 = asset.base64;
    if (!fileBase64) {
      props.setError("Immagine non valida: base64 assente.");
      return;
    }
    const body = await captureLabelPhoto({
      token: props.token,
      siteCode: props.siteCode,
      supplierName: props.supplierName,
      fileName: asset.fileName || `capture_${Date.now()}.jpg`,
      fileMimeType: asset.mimeType || "image/jpeg",
      fileBase64,
    });
    if (options?.showResult ?? true) {
      props.setCaptureResult(body);
    }
    if (options?.refreshDrafts ?? true) {
      await props.refreshDrafts();
    }
  }

  async function captureLabel() {
    props.setError("");
    props.setLoading(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        props.setError("Camera non disponibile su emulatore. Usa il fallback galleria.");
        return;
      }
      if (mode === "camera_only") {
        let localCount = 0;
        while (true) {
          const shot = await ImagePicker.launchCameraAsync({
            quality: 0.6,
            base64: true,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });
          if (shot.canceled || !shot.assets[0]?.base64) {
            break;
          }
          await submitPickedAsset(shot.assets[0], { showResult: false, refreshDrafts: false });
          localCount += 1;
          setSessionShots((prev) => prev + 1);
        }
        if (localCount > 0) {
          await props.refreshDrafts();
          props.setError("");
        }
        props.setCaptureResult(null);
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (shot.canceled || !shot.assets[0]?.base64) {
        return;
      }
      await submitPickedAsset(shot.assets[0], { showResult: true, refreshDrafts: true });
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore sconosciuto.");
    } finally {
      props.setLoading(false);
    }
  }

  async function pickFromGallery() {
    props.setError("");
    props.setLoading(true);
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
      await submitPickedAsset(picked.assets[0]);
      if (mode === "camera_only") {
        props.setCaptureResult(null);
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore sconosciuto.");
    } finally {
      props.setLoading(false);
    }
  }

  return (
    <>
      <View style={appStyles.card}>
        <Text style={appStyles.label}>Site code</Text>
        <TextInput
          style={appStyles.input}
          value={props.siteCode}
          onChangeText={props.setSiteCode}
          autoCapitalize="characters"
          placeholder="MAIN"
        />
        <Text style={appStyles.label}>Fornitore (opzionale)</Text>
        <TextInput style={appStyles.input} value={props.supplierName} onChangeText={props.setSupplierName} />
        <Text style={appStyles.label}>Modalità operativa</Text>
        <View style={appStyles.tabsRow}>
          <Pressable
            style={[appStyles.tabButton, mode === "camera_only" ? appStyles.tabButtonActive : undefined]}
            onPress={() => setMode("camera_only")}
            disabled={props.loading}
          >
            <Text style={[appStyles.tabText, mode === "camera_only" ? appStyles.tabTextActive : undefined]}>
              Modalità camera
            </Text>
          </Pressable>
          <Pressable
            style={[appStyles.tabButton, mode === "full_flow" ? appStyles.tabButtonActive : undefined]}
            onPress={() => setMode("full_flow")}
            disabled={props.loading}
          >
            <Text style={[appStyles.tabText, mode === "full_flow" ? appStyles.tabTextActive : undefined]}>
              Modalità flusso completo
            </Text>
          </Pressable>
        </View>
        <Text style={appStyles.tokenPreview}>
          {mode === "camera_only"
            ? "Default consigliato: scatti rapidi, elaborazione in backend, validazione dopo."
            : "Flusso completo: scatto + estrazione + validazione immediata del draft."}
        </Text>
        {mode === "camera_only" ? (
          <Text style={appStyles.success}>Scatti inviati in sessione: {sessionShots}</Text>
        ) : null}
        <Pressable style={appStyles.button} onPress={captureLabel} disabled={props.loading || !props.token}>
          <Text style={appStyles.buttonText}>
            {props.loading
              ? "Elaborazione..."
              : mode === "camera_only"
                ? "Avvia sessione camera continua"
                : "Apri camera (estrazione immediata)"}
          </Text>
        </Pressable>
        <Pressable style={appStyles.buttonSecondary} onPress={pickFromGallery} disabled={props.loading || !props.token}>
          <Text style={appStyles.buttonSecondaryText}>
            {props.loading ? "Elaborazione..." : "Fallback: scegli dalla galleria"}
          </Text>
        </Pressable>
      </View>

      {props.captureResult && mode === "full_flow" ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>Ultimo draft creato</Text>
          <Text>Codice: {props.captureResult.internal_lot_code}</Text>
          <Text>Stato: {props.captureResult.draft_status}</Text>
          <Text>DLC OCR: {String(props.captureResult.ocr_result.dlc_date || "-")}</Text>
          <Text>Fornitore lotto OCR: {String(props.captureResult.ocr_result.supplier_lot_code || "-")}</Text>
          <Text>Peso OCR: {String(props.captureResult.ocr_result.weight || "-")}</Text>
          <Text>Prodotto OCR: {String(props.captureResult.ocr_result.product_guess || "-")}</Text>
          <Text style={appStyles.label}>Warning OCR</Text>
          <WarningList warnings={props.captureResult.ocr_warnings || []} />
          <Text style={appStyles.label}>Suggerimenti prodotto</Text>
          {props.captureResult.product_suggestions.map((item) => (
            <Text key={item.id}>- {item.title}</Text>
          ))}
        </View>
      ) : null}
    </>
  );
}
