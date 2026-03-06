import { CameraView, useCameraPermissions } from "expo-camera";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { captureLabelPhoto } from "../api";
import { WarningList } from "../components/WarningList";
import { appStyles } from "../styles";
import { CaptureResponse } from "../types";

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
type UploadAsset = {
  base64?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

export function CaptureScreen(props: Props) {
  const [mode, setMode] = React.useState<CaptureMode>("camera_only");
  const [sessionShots, setSessionShots] = React.useState(0);
  const [uploadedShots, setUploadedShots] = React.useState(0);
  const [failedShots, setFailedShots] = React.useState(0);
  const [pendingUploads, setPendingUploads] = React.useState(0);
  const [takingShot, setTakingShot] = React.useState(false);
  const cameraRef = React.useRef<CameraView | null>(null);
  const uploadQueueRef = React.useRef(Promise.resolve());
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  React.useEffect(() => {
    if (!cameraPermission) return;
    if (!cameraPermission.granted) {
      void requestCameraPermission();
    }
  }, [cameraPermission?.granted]);

  async function submitPickedAsset(
    asset: UploadAsset,
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

  function queueShotUpload(asset: UploadAsset) {
    setPendingUploads((prev) => prev + 1);
    uploadQueueRef.current = uploadQueueRef.current
      .then(async () => {
        try {
          await submitPickedAsset(asset, { showResult: false, refreshDrafts: false });
          setUploadedShots((prev) => prev + 1);
        } catch {
          setFailedShots((prev) => prev + 1);
        }
      })
      .finally(() => {
        setPendingUploads((prev) => Math.max(0, prev - 1));
      });
  }

  async function takeShot() {
    if (!cameraRef.current || takingShot || props.loading) {
      return;
    }
    if (!cameraPermission?.granted) {
      props.setError("Permesso camera non disponibile.");
      return;
    }

    setTakingShot(true);
    props.setError("");
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
      });
      if (!photo?.base64) {
        props.setError("Impossibile leggere la foto (base64 assente).");
        return;
      }
      setSessionShots((prev) => prev + 1);

      if (mode === "camera_only") {
        queueShotUpload({
          base64: photo.base64,
          fileName: `capture_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
        });
        return;
      }

      props.setLoading(true);
      await submitPickedAsset(
        {
          base64: photo.base64,
          fileName: `capture_${Date.now()}.jpg`,
          mimeType: "image/jpeg",
        },
        { showResult: true, refreshDrafts: true },
      );
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore scatto.");
    } finally {
      props.setLoading(false);
      setTakingShot(false);
    }
  }

  async function syncQueue() {
    props.setError("");
    props.setLoading(true);
    try {
      await uploadQueueRef.current;
      await props.refreshDrafts();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore sincronizzazione.");
    } finally {
      props.setLoading(false);
    }
  }

  return (
    <>
      <View style={appStyles.card}>
        <View style={appStyles.tabsRow}>
          <Pressable
            style={({ pressed }) => [
              appStyles.tabButton,
              { flex: 1, minWidth: 0 },
              mode === "camera_only" ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setMode("camera_only")}
            disabled={props.loading}
          >
            <Text style={[appStyles.tabText, mode === "camera_only" ? appStyles.tabTextActive : undefined]}>
              Modalita camera
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              appStyles.tabButton,
              { flex: 1, minWidth: 0 },
              mode === "full_flow" ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setMode("full_flow")}
            disabled={props.loading}
          >
            <Text style={[appStyles.tabText, mode === "full_flow" ? appStyles.tabTextActive : undefined]}>
              Modalita flusso completo
            </Text>
          </Pressable>
        </View>

        {cameraPermission?.granted ? (
          <>
            <CameraView ref={cameraRef} style={appStyles.cameraPreview} facing="back" />
            <Text style={appStyles.tokenPreview}>
              Scatti: {sessionShots} | Caricati: {uploadedShots} | In coda: {pendingUploads} | Errori: {failedShots}
            </Text>
            <View style={appStyles.tabsRow}>
              <Pressable
                style={({ pressed }) => [
                  appStyles.button,
                  { flex: 1 },
                  pressed ? appStyles.buttonPressed : undefined,
                ]}
                onPress={takeShot}
                disabled={takingShot || props.loading || !props.token}
              >
                <Text style={appStyles.buttonText}>{takingShot ? "Scatto..." : "Scatta"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  appStyles.buttonSecondary,
                  { flex: 1, marginTop: 8 },
                  pressed ? appStyles.buttonSecondaryPressed : undefined,
                ]}
                onPress={syncQueue}
                disabled={takingShot || props.loading || !props.token}
              >
                <Text style={appStyles.buttonSecondaryText}>{props.loading ? "Sincronizzo..." : "Sincronizza"}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]}
            onPress={() => void requestCameraPermission()}
          >
            <Text style={appStyles.buttonText}>Abilita camera</Text>
          </Pressable>
        )}
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
