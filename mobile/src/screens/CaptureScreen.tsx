import { CameraView, useCameraPermissions } from "expo-camera";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { captureLabelPhoto } from "../api";
import { appStyles } from "../styles";

type Props = {
  token: string;
  siteCode: string;
  loading: boolean;
  setLoading: (value: boolean) => void;
  setError: (value: string) => void;
};

type UploadAsset = {
  base64?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

export function CaptureScreen(props: Props) {
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

  async function submitPickedAsset(asset: UploadAsset) {
    const fileBase64 = asset.base64;
    if (!fileBase64) {
      props.setError("Immagine non valida: base64 assente.");
      return;
    }
    const body = await captureLabelPhoto({
      token: props.token,
      siteCode: props.siteCode,
      fileName: asset.fileName || `capture_${Date.now()}.jpg`,
      fileMimeType: asset.mimeType || "image/jpeg",
      fileBase64,
    });
    const provider = String(body.asset?.drive_provider || "");
    const fallbackReason = String(body.asset?.drive_fallback_reason || "");
    if (provider.toLowerCase() === "stub" || fallbackReason) {
      throw new Error(`Upload Drive non riuscito (${fallbackReason || "fallback_stub"})`);
    }
  }

  function queueShotUpload(asset: UploadAsset) {
    setPendingUploads((prev) => prev + 1);
    uploadQueueRef.current = uploadQueueRef.current
      .then(async () => {
        try {
          await submitPickedAsset(asset);
          setUploadedShots((prev) => prev + 1);
        } catch (e) {
          setFailedShots((prev) => prev + 1);
          props.setError(e instanceof Error ? e.message : "Upload Drive fallito.");
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

      queueShotUpload({
        base64: photo.base64,
        fileName: `capture_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
      });
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
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore sincronizzazione.");
    } finally {
      props.setLoading(false);
    }
  }

  return (
    <>
      <View style={appStyles.card}>
        <Text style={appStyles.sectionTitle}>Camera continua</Text>
        <Text style={appStyles.tokenPreview}>
          Le foto vengono inviate a Drive e poi trattate centralmente in CookOps.
        </Text>

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
    </>
  );
}
