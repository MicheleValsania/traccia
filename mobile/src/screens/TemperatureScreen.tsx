import * as ImagePicker from "expo-image-picker";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  captureTemperaturePhoto,
  createColdPoint,
  createColdSector,
  fetchColdPoints,
  fetchColdSectors,
  fetchTemperatureReadings,
  fetchTemperatureRouteSequence,
  fetchTemperatureRoutes,
} from "../api";
import { appStyles } from "../styles";
import { ColdPoint, ColdSector, TemperatureCaptureResponse, TemperatureReading, TemperatureRoute } from "../types";

type Props = {
  token: string;
  siteCode: string;
  setSiteCode: (value: string) => void;
  setError: (value: string) => void;
};

export function TemperatureScreen(props: Props) {
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"manual" | "sequence">("manual");
  const [manualLabel, setManualLabel] = React.useState("");
  const [manualType, setManualType] = React.useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("OTHER");
  const [lastCapture, setLastCapture] = React.useState<TemperatureCaptureResponse | null>(null);
  const [readings, setReadings] = React.useState<TemperatureReading[]>([]);
  const [sectors, setSectors] = React.useState<ColdSector[]>([]);
  const [coldPoints, setColdPoints] = React.useState<ColdPoint[]>([]);
  const [routes, setRoutes] = React.useState<TemperatureRoute[]>([]);
  const [selectedSectorId, setSelectedSectorId] = React.useState("");
  const [selectedPointId, setSelectedPointId] = React.useState("");
  const [selectedRouteId, setSelectedRouteId] = React.useState("");
  const [selectedRoute, setSelectedRoute] = React.useState<TemperatureRoute | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [newSectorName, setNewSectorName] = React.useState("");
  const [newPointName, setNewPointName] = React.useState("");
  const [newPointType, setNewPointType] = React.useState<"FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER">("FRIDGE");

  React.useEffect(() => {
    if (!props.token) return;
    void refreshConfiguration();
  }, [props.token, props.siteCode]);

  React.useEffect(() => {
    if (!props.token || !selectedSectorId) {
      setColdPoints([]);
      setRoutes([]);
      return;
    }
    void refreshSectorData(selectedSectorId);
  }, [props.token, props.siteCode, selectedSectorId]);

  async function refreshReadings() {
    if (!props.token) {
      props.setError("Effettua login prima di caricare lo storico temperature.");
      return;
    }
    try {
      const rows = await fetchTemperatureReadings(props.token, props.siteCode, 20, {
        sectorId: selectedSectorId || undefined,
        coldPointId: mode === "manual" ? selectedPointId || undefined : undefined,
      });
      setReadings(rows);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento temperature.");
    }
  }

  async function refreshConfiguration() {
    try {
      const sectorRows = await fetchColdSectors(props.token, props.siteCode);
      setSectors(sectorRows);
      const activeSectorId =
        selectedSectorId && sectorRows.some((s) => s.id === selectedSectorId) ? selectedSectorId : (sectorRows[0]?.id ?? "");
      setSelectedSectorId(activeSectorId);
      if (!activeSectorId) {
        setColdPoints([]);
        setRoutes([]);
        setSelectedPointId("");
        setSelectedRouteId("");
        setSelectedRoute(null);
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento settori.");
    }
  }

  async function refreshSectorData(sectorId: string) {
    try {
      const [pointRows, routeRows] = await Promise.all([
        fetchColdPoints(props.token, props.siteCode, sectorId),
        fetchTemperatureRoutes(props.token, props.siteCode, sectorId),
      ]);
      setColdPoints(pointRows);
      setRoutes(routeRows);

      const activePointId =
        selectedPointId && pointRows.some((p) => p.id === selectedPointId) ? selectedPointId : (pointRows[0]?.id ?? "");
      setSelectedPointId(activePointId);

      const activeRouteId =
        selectedRouteId && routeRows.some((r) => r.id === selectedRouteId) ? selectedRouteId : (routeRows[0]?.id ?? "");
      setSelectedRouteId(activeRouteId);
      if (activeRouteId) {
        const route = await fetchTemperatureRouteSequence(props.token, activeRouteId);
        setSelectedRoute(route);
      } else {
        setSelectedRoute(null);
      }
      setCurrentStepIndex(0);
      await refreshReadings();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento punti/route.");
    }
  }

  async function onSelectRoute(routeId: string) {
    setSelectedRouteId(routeId);
    setCurrentStepIndex(0);
    try {
      const route = await fetchTemperatureRouteSequence(props.token, routeId);
      setSelectedRoute(route);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore caricamento sequenza.");
      setSelectedRoute(null);
    }
  }

  async function addSector() {
    const name = newSectorName.trim();
    if (!name) return;
    try {
      await createColdSector({ token: props.token, siteCode: props.siteCode, name, sortOrder: sectors.length + 1 });
      setNewSectorName("");
      await refreshConfiguration();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore creazione settore.");
    }
  }

  async function addColdPoint() {
    const name = newPointName.trim();
    if (!name || !selectedSectorId) {
      props.setError("Seleziona un settore e inserisci il nome del punto freddo.");
      return;
    }
    try {
      await createColdPoint({
        token: props.token,
        siteCode: props.siteCode,
        sectorId: selectedSectorId,
        name,
        deviceType: newPointType,
        sortOrder: coldPoints.length + 1,
      });
      setNewPointName("");
      await refreshSectorData(selectedSectorId);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Errore creazione punto freddo.");
    }
  }

  async function submitAsset(asset: { base64?: string | null; fileName?: string | null; mimeType?: string | null }) {
    if (!asset.base64) {
      props.setError("Immagine non valida: base64 assente.");
      return;
    }

    let coldPointId: string | undefined;
    let deviceLabel = manualLabel;
    let deviceType: "FRIDGE" | "FREEZER" | "COLD_ROOM" | "OTHER" | undefined = manualType;
    if (mode === "manual") {
      const point = coldPoints.find((p) => p.id === selectedPointId);
      if (point) {
        coldPointId = point.id;
        deviceLabel = point.name;
        deviceType = point.device_type;
      }
    } else {
      const step = selectedRoute?.steps[currentStepIndex];
      if (!step) {
        props.setError("Sequenza non configurata o terminata.");
        return;
      }
      coldPointId = step.cold_point;
      deviceLabel = step.cold_point_name;
      deviceType = step.cold_point_device_type;
    }

    const response = await captureTemperaturePhoto({
      token: props.token,
      siteCode: props.siteCode,
      fileName: asset.fileName || `temperature_${Date.now()}.jpg`,
      fileMimeType: asset.mimeType || "image/jpeg",
      fileBase64: asset.base64,
      deviceLabel,
      deviceType,
      coldPointId,
    });
    setLastCapture(response);
    await refreshReadings();
    if (mode === "sequence" && selectedRoute) {
      setCurrentStepIndex((prev) => Math.min(prev + 1, Math.max(selectedRoute.steps.length - 1, 0)));
    }
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
      <Pressable style={appStyles.linkButton} onPress={refreshConfiguration} disabled={!props.token || loading}>
        <Text style={appStyles.linkText}>Aggiorna configurazione</Text>
      </Pressable>

      <Text style={appStyles.label}>Settori</Text>
      <View style={appStyles.tabsRow}>
        {sectors.map((sector) => (
          <Pressable
            key={sector.id}
            style={[appStyles.tabButton, selectedSectorId === sector.id ? appStyles.tabButtonActive : undefined]}
            onPress={() => setSelectedSectorId(sector.id)}
            disabled={loading}
          >
            <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>
              {sector.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={appStyles.input}
        value={newSectorName}
        onChangeText={setNewSectorName}
        placeholder="Nuovo settore (es: Restaurant)"
      />
      <Pressable style={appStyles.buttonSecondary} onPress={addSector} disabled={!props.token || loading}>
        <Text style={appStyles.buttonSecondaryText}>Aggiungi settore</Text>
      </Pressable>

      <Text style={appStyles.label}>Modalita</Text>
      <View style={appStyles.tabsRow}>
        <Pressable
          style={[appStyles.tabButton, mode === "manual" ? appStyles.tabButtonActive : undefined]}
          onPress={() => setMode("manual")}
          disabled={loading}
        >
          <Text style={[appStyles.tabText, mode === "manual" ? appStyles.tabTextActive : undefined]}>Manuale</Text>
        </Pressable>
        <Pressable
          style={[appStyles.tabButton, mode === "sequence" ? appStyles.tabButtonActive : undefined]}
          onPress={() => setMode("sequence")}
          disabled={loading}
        >
          <Text style={[appStyles.tabText, mode === "sequence" ? appStyles.tabTextActive : undefined]}>Sequenza</Text>
        </Pressable>
      </View>

      <Text style={appStyles.label}>Punti freddo</Text>
      <View style={appStyles.tabsRow}>
        {coldPoints.map((point) => (
          <Pressable
            key={point.id}
            style={[appStyles.tabButton, selectedPointId === point.id ? appStyles.tabButtonActive : undefined]}
            onPress={() => setSelectedPointId(point.id)}
            disabled={loading}
          >
            <Text style={[appStyles.tabText, selectedPointId === point.id ? appStyles.tabTextActive : undefined]}>
              {point.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={appStyles.input}
        value={newPointName}
        onChangeText={setNewPointName}
        placeholder="Nuovo punto freddo (es: table frigo 1)"
      />
      <View style={appStyles.tabsRow}>
        {(["FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"] as const).map((type) => (
          <Pressable
            key={`new-${type}`}
            style={[appStyles.tabButton, newPointType === type ? appStyles.tabButtonActive : undefined]}
            onPress={() => setNewPointType(type)}
            disabled={loading}
          >
            <Text style={[appStyles.tabText, newPointType === type ? appStyles.tabTextActive : undefined]}>{type}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={appStyles.buttonSecondary} onPress={addColdPoint} disabled={!props.token || loading || !selectedSectorId}>
        <Text style={appStyles.buttonSecondaryText}>Aggiungi punto freddo</Text>
      </Pressable>

      {mode === "manual" ? (
        <>
          <Text style={appStyles.label}>Etichetta manuale (fallback)</Text>
          <TextInput
            style={appStyles.input}
            value={manualLabel}
            onChangeText={setManualLabel}
            placeholder="Frigo linea 1"
          />
          <Text style={appStyles.label}>Tipo manuale (fallback)</Text>
          <View style={appStyles.tabsRow}>
            {(["FRIDGE", "FREEZER", "COLD_ROOM", "OTHER"] as const).map((type) => (
              <Pressable
                key={`manual-${type}`}
                style={[appStyles.tabButton, manualType === type ? appStyles.tabButtonActive : undefined]}
                onPress={() => setManualType(type)}
                disabled={loading}
              >
                <Text style={[appStyles.tabText, manualType === type ? appStyles.tabTextActive : undefined]}>{type}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {mode === "sequence" ? (
        <>
          <Text style={appStyles.label}>Sequenze</Text>
          <View style={appStyles.tabsRow}>
            {routes.map((route) => (
              <Pressable
                key={route.id}
                style={[appStyles.tabButton, selectedRouteId === route.id ? appStyles.tabButtonActive : undefined]}
                onPress={() => void onSelectRoute(route.id)}
                disabled={loading}
              >
                <Text style={[appStyles.tabText, selectedRouteId === route.id ? appStyles.tabTextActive : undefined]}>
                  {route.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {selectedRoute ? (
            <Text style={appStyles.tokenPreview}>
              Step {Math.min(currentStepIndex + 1, selectedRoute.steps.length)} / {selectedRoute.steps.length}:{" "}
              {selectedRoute.steps[currentStepIndex]?.cold_point_name || "sequenza completata"}
            </Text>
          ) : null}
        </>
      ) : null}

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
          <Text>Punto freddo: {lastCapture.reading.cold_point_name || "-"}</Text>
          <Text>OCR provider: {lastCapture.reading.ocr_provider || "-"}</Text>
          <Text>Foto persistita: {lastCapture.privacy.photo_persisted ? "SI" : "NO"}</Text>
        </View>
      ) : null}

      {readings.length > 0 ? (
        <View style={appStyles.draftRow}>
          <Text style={appStyles.sectionTitle}>Storico (ultime 20)</Text>
          {readings.map((row) => (
            <Text key={row.id}>
              {row.observed_at.slice(0, 16)} | {row.sector_name || "-"} | {row.cold_point_name || row.device_label || "-"} |{" "}
              {row.temperature_celsius} {row.unit}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
