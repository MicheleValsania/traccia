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

export function CaptureScreen(props: Props) {
  async function submitPickedAsset(asset: ImagePicker.ImagePickerAsset) {
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
      fileBase64,
    });
    props.setCaptureResult(body);
    await props.refreshDrafts();
  }

  async function captureLabel() {
    props.setError("");
    props.setLoading(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        props.setError("Camera non disponibile su emulatore. Usa 'Scegli dalla galleria'.");
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
      const asset = shot.assets[0];
      await submitPickedAsset(asset);
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
        <TextInput style={appStyles.input} value={props.siteCode} onChangeText={props.setSiteCode} autoCapitalize="characters" />
        <Text style={appStyles.label}>Fornitore (opzionale)</Text>
        <TextInput style={appStyles.input} value={props.supplierName} onChangeText={props.setSupplierName} />
        <Pressable style={appStyles.button} onPress={captureLabel} disabled={props.loading || !props.token}>
          <Text style={appStyles.buttonText}>{props.loading ? "Elaborazione..." : "Scatta foto etichetta"}</Text>
        </Pressable>
        <Pressable style={appStyles.buttonSecondary} onPress={pickFromGallery} disabled={props.loading || !props.token}>
          <Text style={appStyles.buttonSecondaryText}>{props.loading ? "Elaborazione..." : "Scegli dalla galleria"}</Text>
        </Pressable>
      </View>

      {props.captureResult ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>Ultimo draft creato</Text>
          <Text>Codice: {props.captureResult.internal_lot_code}</Text>
          <Text>Stato: {props.captureResult.draft_status}</Text>
          <Text>DLC OCR: {String(props.captureResult.ocr_result.dlc_date || "-")}</Text>
          <Text>Fornitore lotto OCR: {String(props.captureResult.ocr_result.supplier_lot_code || "-")}</Text>
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
