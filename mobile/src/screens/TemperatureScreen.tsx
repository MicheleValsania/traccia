import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  captureTemperaturePhoto,
  createColdPoint,
  createColdSector,
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
  const [loading, setLoading] = React.useState(false);
  const [programming, setProgramming] = React.useState(false);
  const [mode, setMode] = React.useState<"single" | "sequence">("single");
  const [sectors, setSectors] = React.useState<ColdSector[]>([]);
  const [points, setPoints] = React.useState<ColdPoint[]>([]);
  const [selectedSectorId, setSelectedSectorId] = React.useState("");
  const [selectedPointId, setSelectedPointId] = React.useState("");
  const [readings, setReadings] = React.useState<TemperatureReading[]>([]);
  const [lastCapture, setLastCapture] = React.useState<TemperatureCaptureResponse | null>(null);

  const [newSectorName, setNewSectorName] = React.useState("");
  const [editSectorName, setEditSectorName] = React.useState("");
  const [newPointName, setNewPointName] = React.useState("");
  const [newPointType, setNewPointType] = React.useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("FRIDGE");
  const [newPointOrder, setNewPointOrder] = React.useState("1");
  const [editPointName, setEditPointName] = React.useState("");
  const [editPointType, setEditPointType] = React.useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("FRIDGE");
  const [editPointOrder, setEditPointOrder] = React.useState("1");

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
    if (!selectedSector) {
      setEditSectorName("");
      return;
    }
    setEditSectorName(selectedSector.name);
  }, [selectedSectorId, sectors]);

  React.useEffect(() => {
    if (!selectedPoint) {
      setEditPointName("");
      return;
    }
    setEditPointName(selectedPoint.name);
    setEditPointType(selectedPoint.device_type);
    setEditPointOrder(String(selectedPoint.sort_order));
  }, [selectedPointId, points]);

  React.useEffect(() => {
    if (!props.token) return;
    void refreshReadings();
  }, [selectedSectorId, selectedPointId, mode]);

  async function loadConfiguration() {
    try {
      const sectorRows = await fetchColdSectors(props.token, props.siteCode);
      setSectors(sectorRows);
      const nextSectorId = selectedSectorId && sectorRows.some((s) => s.id === selectedSectorId)
        ? selectedSectorId
        : (sectorRows[0]?.id ?? "");
      setSelectedSectorId(nextSectorId);
      if (!nextSectorId) {
        setPoints([]);
        setSelectedPointId("");
        return;
      }
      await loadPoints(nextSectorId);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento configurazione.");
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

  async function refreshReadings() {
    if (!props.token) return;
    try {
      const rows = await fetchTemperatureReadings(props.token, props.siteCode, 20, {
        sectorId: selectedSectorId || undefined,
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
      if (shot.canceled || !shot.assets[0]) return;
      await submitCapture(shot.assets[0], selectedPoint);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore scatto singolo.");
    } finally {
      setLoading(false);
    }
  }

  async function openSequenceCamera() {
    props.setError("");
    if (!sequencePoints.length) {
      props.setError("Configura almeno un punto freddo nel settore selezionato.");
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
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
      });
      if (!photo?.base64) {
        props.setError("Impossibile leggere la foto.");
        return;
      }
      await submitCapture(
        { base64: photo.base64, fileName: `temperature_${Date.now()}.jpg`, mimeType: "image/jpeg" },
        currentSequencePoint,
      );
      if (sequenceStepIndex >= sequencePoints.length - 1) {
        props.setError("Sequenza completata.");
      } else {
        setSequenceStepIndex((prev) => prev + 1);
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore scatto sequenza.");
    } finally {
      setTakingShot(false);
    }
  }

  async function addSector() {
    const name = newSectorName.trim();
    if (!name) return;
    try {
      await createColdSector({ token: props.token, siteCode: props.siteCode, name, sortOrder: sectors.length + 1 });
      setNewSectorName("");
      await loadConfiguration();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore creazione settore.");
    }
  }

  async function saveSectorEdit() {
    if (!selectedSector) {
      props.setError("Seleziona un settore da modificare.");
      return;
    }
    try {
      await updateColdSector({ token: props.token, sectorId: selectedSector.id, name: editSectorName.trim() });
      await loadConfiguration();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore modifica settore.");
    }
  }

  async function addPoint() {
    if (!selectedSector) {
      props.setError("Seleziona un settore prima di aggiungere un punto freddo.");
      return;
    }
    const name = newPointName.trim();
    if (!name) return;
    try {
      await createColdPoint({
        token: props.token,
        siteCode: props.siteCode,
        sectorId: selectedSector.id,
        name,
        deviceType: newPointType,
        sortOrder: Number(newPointOrder) || points.length + 1,
      });
      setNewPointName("");
      await loadPoints(selectedSector.id);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore creazione punto freddo.");
    }
  }

  async function savePointEdit() {
    if (!selectedPoint || !selectedSector) {
      props.setError("Seleziona un punto freddo da modificare.");
      return;
    }
    try {
      await updateColdPoint({
        token: props.token,
        pointId: selectedPoint.id,
        sectorId: selectedSector.id,
        name: editPointName.trim(),
        deviceType: editPointType,
        sortOrder: Number(editPointOrder) || selectedPoint.sort_order,
      });
      await loadPoints(selectedSector.id);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore modifica punto freddo.");
    }
  }

  return (
    <>
      <View style={appStyles.card}>
        <Text style={appStyles.sectionTitle}>Temperature</Text>
        <Text style={appStyles.tokenPreview}>Le foto sono elaborate OCR senza persistenza immagine.</Text>

        <Text style={appStyles.label}>Site code</Text>
        <TextInput
          style={appStyles.input}
          value={props.siteCode}
          onChangeText={props.setSiteCode}
          autoCapitalize="characters"
          placeholder="MAIN"
        />
        <View style={appStyles.tabsRow}>
          <Pressable style={appStyles.buttonSecondary} onPress={loadConfiguration} disabled={!props.token || loading}>
            <Text style={appStyles.buttonSecondaryText}>Aggiorna</Text>
          </Pressable>
          <Pressable style={appStyles.button} onPress={() => setProgramming((prev) => !prev)} disabled={!props.token || loading}>
            <Text style={appStyles.buttonText}>{programming ? "Torna a Temperature" : "Programmazione"}</Text>
          </Pressable>
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
                  void loadPoints(sector.id);
                }}
              >
                <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>
                  {sector.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={appStyles.input} value={newSectorName} onChangeText={setNewSectorName} placeholder="Nuovo settore" />
          <Pressable style={appStyles.buttonSecondary} onPress={addSector} disabled={!props.token || loading}>
            <Text style={appStyles.buttonSecondaryText}>Aggiungi settore</Text>
          </Pressable>
          <TextInput style={appStyles.input} value={editSectorName} onChangeText={setEditSectorName} placeholder="Modifica settore selezionato" />
          <Pressable style={appStyles.buttonSecondary} onPress={saveSectorEdit} disabled={!props.token || loading || !selectedSectorId}>
            <Text style={appStyles.buttonSecondaryText}>Salva settore</Text>
          </Pressable>

          <Text style={appStyles.label}>Punti freddo del settore</Text>
          <View style={appStyles.tabsRow}>
            {points.map((point) => (
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
          <TextInput style={appStyles.input} value={newPointName} onChangeText={setNewPointName} placeholder="Nuovo punto freddo" />
          <TextInput style={appStyles.input} value={newPointOrder} onChangeText={setNewPointOrder} placeholder="Ordine (es: 1)" keyboardType="numeric" />
          <View style={appStyles.tabsRow}>
            {(["FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"] as const).map((type) => (
              <Pressable
                key={`new-${type}`}
                style={[appStyles.tabButton, newPointType === type ? appStyles.tabButtonActive : undefined]}
                onPress={() => setNewPointType(type)}
              >
                <Text style={[appStyles.tabText, newPointType === type ? appStyles.tabTextActive : undefined]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={appStyles.buttonSecondary} onPress={addPoint} disabled={!props.token || loading || !selectedSectorId}>
            <Text style={appStyles.buttonSecondaryText}>Aggiungi punto freddo</Text>
          </Pressable>

          <TextInput style={appStyles.input} value={editPointName} onChangeText={setEditPointName} placeholder="Modifica punto selezionato" />
          <TextInput style={appStyles.input} value={editPointOrder} onChangeText={setEditPointOrder} placeholder="Nuovo ordine" keyboardType="numeric" />
          <View style={appStyles.tabsRow}>
            {(["FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"] as const).map((type) => (
              <Pressable
                key={`edit-${type}`}
                style={[appStyles.tabButton, editPointType === type ? appStyles.tabButtonActive : undefined]}
                onPress={() => setEditPointType(type)}
              >
                <Text style={[appStyles.tabText, editPointType === type ? appStyles.tabTextActive : undefined]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={appStyles.buttonSecondary} onPress={savePointEdit} disabled={!props.token || loading || !selectedPointId}>
            <Text style={appStyles.buttonSecondaryText}>Salva punto freddo</Text>
          </Pressable>
        </View>
      ) : (
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
                <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>
                  {sector.name}
                </Text>
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
            <Pressable
              style={[appStyles.tabButton, mode === "single" ? appStyles.tabButtonActive : undefined]}
              onPress={() => setMode("single")}
            >
              <Text style={[appStyles.tabText, mode === "single" ? appStyles.tabTextActive : undefined]}>Scatto singolo</Text>
            </Pressable>
            <Pressable
              style={[appStyles.tabButton, mode === "sequence" ? appStyles.tabButtonActive : undefined]}
              onPress={() => setMode("sequence")}
            >
              <Text style={[appStyles.tabText, mode === "sequence" ? appStyles.tabTextActive : undefined]}>Modalita sequenza</Text>
            </Pressable>
          </View>

          {mode === "single" ? (
            <Pressable style={appStyles.button} onPress={captureSingle} disabled={!props.token || loading || !selectedPointId}>
              <Text style={appStyles.buttonText}>{loading ? "Elaborazione..." : "Scatta singolo"}</Text>
            </Pressable>
          ) : (
            <>
              <Text style={appStyles.tokenPreview}>
                {currentSequencePoint
                  ? `Prossimo: ${currentSequencePoint.sort_order}. ${currentSequencePoint.name}`
                  : "Sequenza completata o non configurata"}
              </Text>
              <Pressable style={appStyles.button} onPress={openSequenceCamera} disabled={!props.token || loading || !sequencePoints.length}>
                <Text style={appStyles.buttonText}>Apri camera sequenza</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {mode === "sequence" && sequenceCameraOpen ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>Camera Sequenza</Text>
          <CameraView ref={cameraRef} style={appStyles.cameraPreview} facing="back" />
          <Text style={appStyles.tokenPreview}>
            Step {Math.min(sequenceStepIndex + 1, Math.max(sequencePoints.length, 1))}/{Math.max(sequencePoints.length, 1)} -{" "}
            {currentSequencePoint?.name || "Completata"}
          </Text>
          <View style={appStyles.tabsRow}>
            <Pressable
              style={appStyles.button}
              onPress={takeSequenceShot}
              disabled={takingShot || !currentSequencePoint}
            >
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
  );
}
