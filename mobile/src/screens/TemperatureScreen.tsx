import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  captureTemperaturePhoto,
  createColdPoint,
  createColdSector,
  deleteColdPoint,
  fetchColdPoints,
  fetchColdSectors,
  fetchTemperatureReadings,
  updateColdPoint,
  updateColdSector,
} from "../api";
import { appStyles } from "../styles";
import { ColdPoint, ColdSector, TemperatureCaptureResponse, TemperatureReading } from "../types";

type Props = {
  token: string;
  siteCode: string;
  setSiteCode: (value: string) => void;
  setError: (value: string) => void;
};

export function TemperatureScreen(props: Props) {
  const [programming, setProgramming] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"single" | "sequence">("single");

  const [sectors, setSectors] = React.useState<ColdSector[]>([]);
  const [points, setPoints] = React.useState<ColdPoint[]>([]);
  const [selectedSectorId, setSelectedSectorId] = React.useState("");
  const [selectedPointId, setSelectedPointId] = React.useState("");

  const [editingSectorId, setEditingSectorId] = React.useState("");
  const [sectorInput, setSectorInput] = React.useState("");
  const [editingPointId, setEditingPointId] = React.useState("");
  const [pointNameInput, setPointNameInput] = React.useState("");
  const [pointOrderInput, setPointOrderInput] = React.useState("1");
  const [pointTypeInput, setPointTypeInput] = React.useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("FRIDGE");

  const [readings, setReadings] = React.useState<TemperatureReading[]>([]);
  const [lastCapture, setLastCapture] = React.useState<TemperatureCaptureResponse | null>(null);
  const [infoMessage, setInfoMessage] = React.useState("");

  const [sequenceCameraOpen, setSequenceCameraOpen] = React.useState(false);
  const [sequenceStepIndex, setSequenceStepIndex] = React.useState(0);
  const [takingShot, setTakingShot] = React.useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = React.useRef<CameraView | null>(null);

  const selectedSector = sectors.find((s) => s.id === selectedSectorId) || null;
  const selectedPoint = points.find((p) => p.id === selectedPointId) || null;
  const sequencePoints = points.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const currentSequencePoint = sequencePoints[sequenceStepIndex] || null;

  React.useEffect(() => {
    if (!props.token) return;
    void loadConfiguration();
  }, [props.token, props.siteCode]);

  React.useEffect(() => {
    if (!props.token) return;
    if (!selectedSectorId) return;
    void refreshReadings();
  }, [props.token, selectedSectorId, selectedPointId, mode]);

  async function loadConfiguration() {
    if (!props.token) {
      props.setError("Effettua login prima di usare Temperature.");
      return;
    }
    setLoading(true);
    try {
      const sectorRows = await fetchColdSectors(props.token, props.siteCode);
      setSectors(sectorRows);
      const nextSectorId =
        selectedSectorId && sectorRows.some((s) => s.id === selectedSectorId) ? selectedSectorId : (sectorRows[0]?.id ?? "");
      setSelectedSectorId(nextSectorId);

      if (!nextSectorId) {
        setPoints([]);
        setSelectedPointId("");
        setInfoMessage(`Nessun settore su site ${props.siteCode}.`);
        return;
      }
      await loadPoints(nextSectorId);
      setInfoMessage(`Configurazione caricata (${sectorRows.length} settori).`);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento configurazione.");
      setInfoMessage("Errore caricamento configurazione.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPoints(sectorId: string) {
    const pointRows = await fetchColdPoints(props.token, props.siteCode, sectorId);
    const sorted = pointRows.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    setPoints(sorted);
    const nextPointId = selectedPointId && sorted.some((p) => p.id === selectedPointId) ? selectedPointId : (sorted[0]?.id ?? "");
    setSelectedPointId(nextPointId);
    setSequenceStepIndex(0);
  }

  function startCreateSector() {
    setEditingSectorId("");
    setSectorInput("");
  }

  function startEditSector(sector: ColdSector) {
    setEditingSectorId(sector.id);
    setSectorInput(sector.name);
  }

  async function submitSector() {
    const name = sectorInput.trim();
    if (!name) {
      props.setError("Inserisci un nome settore.");
      return;
    }
    try {
      if (editingSectorId) {
        await updateColdSector({ token: props.token, sectorId: editingSectorId, name });
        setInfoMessage("Settore aggiornato.");
      } else {
        await createColdSector({ token: props.token, siteCode: props.siteCode, name, sortOrder: sectors.length + 1 });
        setInfoMessage("Settore aggiunto.");
      }
      startCreateSector();
      await loadConfiguration();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore salvataggio settore.");
    }
  }

  function startCreatePoint() {
    setEditingPointId("");
    setPointNameInput("");
    setPointOrderInput(String((points[points.length - 1]?.sort_order || 0) + 1));
    setPointTypeInput("FRIDGE");
  }

  function startEditPoint(point: ColdPoint) {
    setEditingPointId(point.id);
    setPointNameInput(point.name);
    setPointOrderInput(String(point.sort_order));
    setPointTypeInput(point.device_type);
  }

  async function submitPoint() {
    if (!selectedSector) {
      props.setError("Seleziona prima un settore.");
      return;
    }
    const name = pointNameInput.trim();
    if (!name) {
      props.setError("Inserisci il nome del punto freddo.");
      return;
    }
    const sortOrder = Number(pointOrderInput) || 1;
    try {
      if (editingPointId) {
        await updateColdPoint({
          token: props.token,
          pointId: editingPointId,
          sectorId: selectedSector.id,
          name,
          sortOrder,
          deviceType: pointTypeInput,
        });
        setInfoMessage("Punto freddo aggiornato.");
      } else {
        await createColdPoint({
          token: props.token,
          siteCode: props.siteCode,
          sectorId: selectedSector.id,
          name,
          sortOrder,
          deviceType: pointTypeInput,
        });
        setInfoMessage("Punto freddo aggiunto.");
      }
      startCreatePoint();
      await loadPoints(selectedSector.id);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore salvataggio punto freddo.");
    }
  }

  async function removePoint(point: ColdPoint) {
    try {
      await deleteColdPoint(props.token, point.id);
      if (editingPointId === point.id) {
        startCreatePoint();
      }
      setInfoMessage("Punto freddo eliminato.");
      if (selectedSector) {
        await loadPoints(selectedSector.id);
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore eliminazione punto freddo.");
    }
  }

  async function refreshReadings() {
    if (!selectedSectorId) return;
    try {
      const rows = await fetchTemperatureReadings(props.token, props.siteCode, 20, {
        sectorId: selectedSectorId,
        coldPointId: mode === "single" ? selectedPointId || undefined : undefined,
      });
      setReadings(rows);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento storico.");
    }
  }

  async function submitCapture(asset: { base64?: string | null; fileName?: string | null; mimeType?: string | null }, point: ColdPoint) {
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
      coldPointId: point.id,
      deviceLabel: point.name,
      deviceType: point.device_type,
    });
    setLastCapture(response);
    await refreshReadings();
  }

  async function captureSingle() {
    if (!selectedPoint) {
      props.setError("Seleziona un punto freddo.");
      return;
    }
    setLoading(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        props.setError("Permesso camera negato.");
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (shot.canceled || !shot.assets[0]) return;
      await submitCapture(shot.assets[0], selectedPoint);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore scatto singolo.");
    } finally {
      setLoading(false);
    }
  }

  async function openSequenceCamera() {
    if (!sequencePoints.length) {
      props.setError("Configura almeno un punto freddo nel settore.");
      return;
    }
    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        props.setError("Permesso camera negato.");
        return;
      }
    }
    setSequenceStepIndex(0);
    setSequenceCameraOpen(true);
  }

  async function takeSequenceShot() {
    if (!cameraRef.current || !currentSequencePoint || takingShot) return;
    setTakingShot(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: true });
      if (!photo?.base64) {
        props.setError("Impossibile leggere la foto.");
        return;
      }
      await submitCapture(
        { base64: photo.base64, fileName: `temperature_${Date.now()}.jpg`, mimeType: "image/jpeg" },
        currentSequencePoint,
      );
      if (sequenceStepIndex >= sequencePoints.length - 1) {
        setInfoMessage("Sequenza completata.");
      } else {
        setSequenceStepIndex((prev) => prev + 1);
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore scatto sequenza.");
    } finally {
      setTakingShot(false);
    }
  }

  return (
    <>
      <View style={appStyles.card}>
        <Text style={appStyles.sectionTitle}>Temperature</Text>
        <Text style={appStyles.tokenPreview}>Site: {props.siteCode}</Text>
        {infoMessage ? <Text style={appStyles.tokenPreview}>{infoMessage}</Text> : null}

        <View style={appStyles.tabsRow}>
          {!programming ? (
            <Pressable style={appStyles.button} onPress={() => setProgramming(true)}>
              <Text style={appStyles.buttonText}>Programmazione</Text>
            </Pressable>
          ) : (
            <Pressable style={appStyles.buttonSecondary} onPress={() => setProgramming(false)}>
              <Text style={appStyles.buttonSecondaryText}>Torna a Temperature</Text>
            </Pressable>
          )}
        </View>
      </View>

      {programming ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>Programmazione</Text>

          <Text style={appStyles.label}>Settori</Text>
          <View style={appStyles.tabsRow}>
            {sectors.map((sector) => (
              <Pressable
                key={sector.id}
                style={[appStyles.tabButton, selectedSectorId === sector.id ? appStyles.tabButtonActive : undefined]}
                onPress={() => {
                  setSelectedSectorId(sector.id);
                  startEditSector(sector);
                  void loadPoints(sector.id);
                }}
              >
                <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>{sector.name}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={appStyles.input} value={sectorInput} onChangeText={setSectorInput} placeholder="Nuovo settore" />
          <View style={appStyles.tabsRow}>
            <Pressable style={appStyles.buttonSecondary} onPress={submitSector}>
              <Text style={appStyles.buttonSecondaryText}>{editingSectorId ? "Salva modifiche settore" : "Aggiungi settore"}</Text>
            </Pressable>
            {editingSectorId ? (
              <Pressable style={appStyles.buttonSecondary} onPress={startCreateSector}>
                <Text style={appStyles.buttonSecondaryText}>Nuovo</Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={appStyles.label}>Punti freddo del settore</Text>
          <View style={appStyles.tabsRow}>
            {sequencePoints.map((point) => (
              <View key={point.id} style={appStyles.chipWithDelete}>
                <Pressable
                  style={[appStyles.tabButton, selectedPointId === point.id ? appStyles.tabButtonActive : undefined]}
                  onPress={() => {
                    setSelectedPointId(point.id);
                    startEditPoint(point);
                  }}
                >
                  <Text style={[appStyles.tabText, selectedPointId === point.id ? appStyles.tabTextActive : undefined]}>
                    {point.sort_order}. {point.name}
                  </Text>
                </Pressable>
                <Pressable style={appStyles.chipDelete} onPress={() => void removePoint(point)}>
                  <Text style={appStyles.chipDeleteText}>X</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <TextInput style={appStyles.input} value={pointNameInput} onChangeText={setPointNameInput} placeholder="Nuovo punto freddo" />
          <TextInput style={appStyles.input} value={pointOrderInput} onChangeText={setPointOrderInput} placeholder="Ordine sequenza" keyboardType="numeric" />
          <View style={appStyles.tabsRow}>
            {(["FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"] as const).map((type) => (
              <Pressable
                key={type}
                style={[appStyles.tabButton, pointTypeInput === type ? appStyles.tabButtonActive : undefined]}
                onPress={() => setPointTypeInput(type)}
              >
                <Text style={[appStyles.tabText, pointTypeInput === type ? appStyles.tabTextActive : undefined]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <View style={appStyles.tabsRow}>
            <Pressable style={appStyles.buttonSecondary} onPress={submitPoint} disabled={!selectedSector}>
              <Text style={appStyles.buttonSecondaryText}>{editingPointId ? "Salva modifiche" : "Aggiungi punto freddo"}</Text>
            </Pressable>
            {editingPointId ? (
              <Pressable style={appStyles.buttonSecondary} onPress={startCreatePoint}>
                <Text style={appStyles.buttonSecondaryText}>Nuovo</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <View style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>Operativa</Text>
            <Text style={appStyles.label}>Settore</Text>
            <View style={appStyles.tabsRow}>
              {sectors.map((sector) => (
                <Pressable
                  key={sector.id}
                  style={[appStyles.tabButton, selectedSectorId === sector.id ? appStyles.tabButtonActive : undefined]}
                  onPress={() => {
                    setSelectedSectorId(sector.id);
                    void loadPoints(sector.id);
                  }}
                >
                  <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>{sector.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={appStyles.label}>Punti freddo</Text>
            <View style={appStyles.tabsRow}>
              {sequencePoints.map((point) => (
                <Pressable
                  key={point.id}
                  style={[appStyles.tabButton, selectedPointId === point.id ? appStyles.tabButtonActive : undefined]}
                  onPress={() => setSelectedPointId(point.id)}
                >
                  <Text style={[appStyles.tabText, selectedPointId === point.id ? appStyles.tabTextActive : undefined]}>
                    {point.sort_order}. {point.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={appStyles.label}>Modalita</Text>
            <View style={appStyles.tabsRow}>
              <Pressable style={[appStyles.tabButton, mode === "single" ? appStyles.tabButtonActive : undefined]} onPress={() => setMode("single")}>
                <Text style={[appStyles.tabText, mode === "single" ? appStyles.tabTextActive : undefined]}>Scatto singolo</Text>
              </Pressable>
              <Pressable style={[appStyles.tabButton, mode === "sequence" ? appStyles.tabButtonActive : undefined]} onPress={() => setMode("sequence")}>
                <Text style={[appStyles.tabText, mode === "sequence" ? appStyles.tabTextActive : undefined]}>Modalita sequenza</Text>
              </Pressable>
            </View>

            {mode === "single" ? (
              <Pressable style={appStyles.button} onPress={captureSingle} disabled={loading || !selectedPoint}>
                <Text style={appStyles.buttonText}>{loading ? "Elaborazione..." : "Scatta singolo"}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={appStyles.tokenPreview}>
                  {currentSequencePoint
                    ? `Prossimo: ${currentSequencePoint.sort_order}. ${currentSequencePoint.name}`
                    : "Sequenza completata o non configurata"}
                </Text>
                <Pressable style={appStyles.button} onPress={openSequenceCamera} disabled={loading || !sequencePoints.length}>
                  <Text style={appStyles.buttonText}>Apri camera sequenza</Text>
                </Pressable>
              </>
            )}
          </View>

          {mode === "sequence" && sequenceCameraOpen ? (
            <View style={appStyles.card}>
              <Text style={appStyles.sectionTitle}>Camera Sequenza</Text>
              <CameraView ref={cameraRef} style={appStyles.cameraPreview} facing="back" />
              <Text style={appStyles.tokenPreview}>
                Step {Math.min(sequenceStepIndex + 1, Math.max(sequencePoints.length, 1))}/{Math.max(sequencePoints.length, 1)} -{" "}
                {currentSequencePoint?.name || "Completata"}
              </Text>
              <View style={appStyles.tabsRow}>
                <Pressable style={appStyles.button} onPress={takeSequenceShot} disabled={takingShot || !currentSequencePoint}>
                  <Text style={appStyles.buttonText}>{takingShot ? "Scatto..." : "Scatta"}</Text>
                </Pressable>
                <Pressable style={appStyles.buttonSecondary} onPress={() => setSequenceCameraOpen(false)}>
                  <Text style={appStyles.buttonSecondaryText}>Fine sessione</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {lastCapture ? (
            <View style={appStyles.card}>
              <Text style={appStyles.sectionTitle}>Ultima rilevazione</Text>
              <Text>
                {lastCapture.reading.cold_point_name || lastCapture.reading.device_label || "-"}: {lastCapture.reading.temperature_celsius}{" "}
                {lastCapture.reading.unit}
              </Text>
              <Text>Foto persistita: {lastCapture.privacy.photo_persisted ? "SI" : "NO"}</Text>
            </View>
          ) : null}

          {readings.length > 0 ? (
            <View style={appStyles.card}>
              <Text style={appStyles.sectionTitle}>Storico</Text>
              {readings.map((row) => (
                <Text key={row.id}>
                  {row.observed_at.slice(0, 16)} | {row.sector_name || "-"} | {row.cold_point_name || row.device_label || "-"} |{" "}
                  {row.temperature_celsius} {row.unit}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}
    </>
  );
}
