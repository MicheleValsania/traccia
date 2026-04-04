import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  captureTemperaturePreview,
  confirmTemperatureReading,
  fetchHaccpColdPoints,
  fetchHaccpSectors,
  fetchTemperatureReadings,
} from "../api";
import { useI18n } from "../i18n";
import { appStyles } from "../styles";
import { ColdPoint, ColdSector, TemperatureCaptureResponse, TemperaturePreviewResponse, TemperatureReading } from "../types";

type Props = {
  token: string;
  siteCode: string;
  setError: (value: string) => void;
};

export function TemperatureScreen(props: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"single" | "sequence" | "manual">("single");

  const [sectors, setSectors] = React.useState<ColdSector[]>([]);
  const [points, setPoints] = React.useState<ColdPoint[]>([]);
  const [selectedSectorId, setSelectedSectorId] = React.useState("");
  const [selectedPointId, setSelectedPointId] = React.useState("");

  const [readings, setReadings] = React.useState<TemperatureReading[]>([]);
  const [lastCapture, setLastCapture] = React.useState<TemperatureCaptureResponse | null>(null);
  const [pendingPreview, setPendingPreview] = React.useState<TemperaturePreviewResponse | null>(null);
  const [confirmTempInput, setConfirmTempInput] = React.useState("");
  const [manualOutOfRangeTempInput, setManualOutOfRangeTempInput] = React.useState("");
  const [manualReasonInput, setManualReasonInput] = React.useState("");
  const [manualActionInput, setManualActionInput] = React.useState("");
  const [savingManual, setSavingManual] = React.useState(false);
  const [infoMessage, setInfoMessage] = React.useState("");

  const [sequenceCameraOpen, setSequenceCameraOpen] = React.useState(false);
  const [sequenceStepIndex, setSequenceStepIndex] = React.useState(0);
  const [takingShot, setTakingShot] = React.useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = React.useRef<CameraView | null>(null);

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
      props.setError(t("temperature.login_required"));
      return;
    }
    setLoading(true);
    try {
      const sectorRows = await fetchHaccpSectors(props.token, props.siteCode);
      setSectors(sectorRows);
      const nextSectorId =
        selectedSectorId && sectorRows.some((s) => s.id === selectedSectorId) ? selectedSectorId : (sectorRows[0]?.id ?? "");
      setSelectedSectorId(nextSectorId);

      if (!nextSectorId) {
        setPoints([]);
        setSelectedPointId("");
        setInfoMessage(t("temperature.no_sector", { value: props.siteCode }));
        return;
      }
      await loadPoints(nextSectorId);
      setInfoMessage(t("temperature.config_loaded", { count: sectorRows.length }));
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("temperature.config_error"));
      setInfoMessage(t("temperature.config_error"));
    } finally {
      setLoading(false);
    }
  }

  async function loadPoints(sectorId: string) {
    const pointRows = await fetchHaccpColdPoints(props.token, props.siteCode, sectorId);
    const sorted = pointRows.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    setPoints(sorted);
    const nextPointId = selectedPointId && sorted.some((p) => p.id === selectedPointId) ? selectedPointId : (sorted[0]?.id ?? "");
    setSelectedPointId(nextPointId);
    setSequenceStepIndex(0);
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
      props.setError(e instanceof Error ? e.message : t("temperature.history_error"));
    }
  }

  async function submitCapture(asset: { base64?: string | null; fileName?: string | null; mimeType?: string | null }, point: ColdPoint) {
    if (!asset.base64) {
      props.setError(t("temperature.invalid_image"));
      return;
    }
    const preview = await captureTemperaturePreview({
      token: props.token,
      siteCode: props.siteCode,
      fileName: asset.fileName || `temperature_${Date.now()}.jpg`,
      fileMimeType: asset.mimeType || "image/jpeg",
      fileBase64: asset.base64,
      coldPointId: point.id,
      deviceLabel: point.name,
      deviceType: point.device_type,
    });
    setPendingPreview(preview);
    setConfirmTempInput(String(preview.preview.suggested_temperature_celsius));
  }

  async function confirmPreview() {
    if (!pendingPreview) {
      props.setError(t("temperature.no_preview"));
      return;
    }
    const normalized = confirmTempInput.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (!normalized || Number.isNaN(parsed)) {
      props.setError(t("temperature.enter_confirmed"));
      return;
    }
    try {
      const saved = await confirmTemperatureReading({
        token: props.token,
        siteCode: props.siteCode,
        coldPointId: pendingPreview.preview.cold_point_id || undefined,
        deviceLabel: pendingPreview.preview.device_label,
        deviceType: pendingPreview.preview.device_type,
        confirmedTemperatureCelsius: parsed.toFixed(2),
        observedAt: pendingPreview.preview.observed_at,
        ocrProvider: pendingPreview.preview.ocr_provider,
        ocrConfidence: pendingPreview.preview.ocr_confidence ?? undefined,
        ocrSuggestedTemperatureCelsius: pendingPreview.preview.suggested_temperature_celsius,
        ocrWarnings: pendingPreview.preview.warnings,
      });
      setLastCapture(saved);
      setPendingPreview(null);
      setConfirmTempInput("");
      if (mode === "sequence") {
        let baseIndex = sequenceStepIndex;
        const confirmedPointId = pendingPreview.preview.cold_point_id;
        if (confirmedPointId) {
          const idxById = sequencePoints.findIndex((p) => p.id === confirmedPointId);
          if (idxById >= 0) {
            baseIndex = idxById;
          }
        }
        const nextIndex = baseIndex + 1;
        const isLastStep = nextIndex >= sequencePoints.length;
        if (isLastStep) {
          setInfoMessage("Sequenza completata.");
          setInfoMessage(t("temperature.sequence_done"));
        } else {
          const nextPoint = sequencePoints[nextIndex];
          setSequenceStepIndex(nextIndex);
          setInfoMessage(
            nextPoint
              ? t("temperature.next_point", { value: `${nextPoint.sort_order}. ${nextPoint.name}` })
              : t("temperature.next_generic"),
          );
        }
      }
      try {
        await refreshReadings();
      } catch {
        // Non bloccare la sequenza se il refresh storico fallisce.
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("temperature.confirm_error"));
    }
  }

  function manualPresetValues(deviceType: ColdPoint["device_type"] | undefined): number[] {
    if (deviceType === "FREEZER") {
      return [-21, -20, -19, -18, -17, -16, -15];
    }
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  }

  async function saveManualReading(rawTemperature: string, outOfRange: boolean) {
    if (!selectedPoint) {
      props.setError(t("temperature.select_point"));
      return;
    }
    const normalized = rawTemperature.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (!normalized || Number.isNaN(parsed)) {
      props.setError(t("temperature.enter_valid"));
      return;
    }
    const reason = manualReasonInput.trim();
    const action = manualActionInput.trim();
    if (outOfRange && (!reason || !action)) {
      props.setError(t("temperature.manual_reason_required"));
      return;
    }

    setSavingManual(true);
    try {
      const saved = await confirmTemperatureReading({
        token: props.token,
        siteCode: props.siteCode,
        coldPointId: selectedPoint.id,
        deviceLabel: selectedPoint.name,
        deviceType: selectedPoint.device_type,
        confirmedTemperatureCelsius: parsed.toFixed(2),
        source: outOfRange ? "MANUAL_OUT_OF_RANGE" : "MANUAL_PRESET",
        observedAt: new Date().toISOString(),
        manualDeviationReason: outOfRange ? reason : "",
        correctiveAction: outOfRange ? action : "",
      });
      setLastCapture(saved);
      setManualOutOfRangeTempInput("");
      setManualReasonInput("");
      setManualActionInput("");
      setInfoMessage(outOfRange ? t("temperature.manual_out_saved") : t("temperature.manual_saved"));
      await refreshReadings();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("temperature.manual_save_error"));
    } finally {
      setSavingManual(false);
    }
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
      props.setError(e instanceof Error ? e.message : t("temperature.single_error"));
    } finally {
      setLoading(false);
    }
  }

  async function openSequenceCamera() {
    if (!sequencePoints.length) {
      props.setError(t("temperature.no_points_sector"));
      return;
    }
    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        props.setError(t("temperature.camera_denied"));
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
        props.setError(t("temperature.photo_read_error"));
        return;
      }
      await submitCapture(
        { base64: photo.base64, fileName: `temperature_${Date.now()}.jpg`, mimeType: "image/jpeg" },
        currentSequencePoint,
      );
      setInfoMessage(t("temperature.preview_ready"));
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("temperature.sequence_error"));
    } finally {
      setTakingShot(false);
    }
  }

  return (
    <>
      <View style={appStyles.card}>
        <Text style={appStyles.sectionTitle}>{t("temperature.title")}</Text>
        <Text style={appStyles.tokenPreview}>{t("temperature.subtitle")}</Text>
        {infoMessage ? <Text style={appStyles.infoText}>{infoMessage}</Text> : null}
      </View>

      <View style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>{t("temperature.operations")}</Text>
            <Text style={appStyles.label}>{t("temperature.sector")}</Text>
            <View style={appStyles.tabsRow}>
              {sectors.map((sector) => (
                <Pressable
                  key={sector.id}
                  style={({ pressed }) => [
                    appStyles.tabButton,
                    selectedSectorId === sector.id ? appStyles.tabButtonActive : undefined,
                    pressed ? appStyles.tabButtonPressed : undefined,
                  ]}
                  onPress={() => {
                    setSelectedSectorId(sector.id);
                    void loadPoints(sector.id);
                  }}
                >
                  <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>{sector.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={appStyles.label}>{t("temperature.points")}</Text>
            <View style={appStyles.tabsRow}>
              {sequencePoints.map((point) => (
                <Pressable
                  key={point.id}
                  style={({ pressed }) => [
                    appStyles.tabButton,
                    selectedPointId === point.id ? appStyles.tabButtonActive : undefined,
                    pressed ? appStyles.tabButtonPressed : undefined,
                  ]}
                  onPress={() => setSelectedPointId(point.id)}
                >
                  <Text style={[appStyles.tabText, selectedPointId === point.id ? appStyles.tabTextActive : undefined]}>
                    {point.sort_order}. {point.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={appStyles.label}>{t("temperature.mode")}</Text>
            <View style={appStyles.tabsRow}>
              <Pressable
                style={({ pressed }) => [
                  appStyles.tabButton,
                  mode === "single" ? appStyles.tabButtonActive : undefined,
                  pressed ? appStyles.tabButtonPressed : undefined,
                ]}
                onPress={() => setMode("single")}
              >
                <Text style={[appStyles.tabText, mode === "single" ? appStyles.tabTextActive : undefined]}>{t("temperature.mode_single")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  appStyles.tabButton,
                  mode === "sequence" ? appStyles.tabButtonActive : undefined,
                  pressed ? appStyles.tabButtonPressed : undefined,
                ]}
                onPress={() => setMode("sequence")}
              >
                <Text style={[appStyles.tabText, mode === "sequence" ? appStyles.tabTextActive : undefined]}>{t("temperature.mode_sequence")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  appStyles.tabButton,
                  mode === "manual" ? appStyles.tabButtonActive : undefined,
                  pressed ? appStyles.tabButtonPressed : undefined,
                ]}
                onPress={() => setMode("manual")}
              >
                <Text style={[appStyles.tabText, mode === "manual" ? appStyles.tabTextActive : undefined]}>{t("temperature.mode_manual")}</Text>
              </Pressable>
            </View>

            {mode === "single" ? (
              <>
                {!selectedPoint ? <Text style={appStyles.warn}>{t("temperature.select_point_first")}</Text> : null}
                <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={captureSingle} disabled={loading || !!pendingPreview}>
                  <Text style={appStyles.buttonText}>{loading ? t("temperature.processing") : t("temperature.single_shot")}</Text>
                </Pressable>
              </>
            ) : mode === "sequence" ? (
              <>
                {!sequencePoints.length ? <Text style={appStyles.warn}>{t("temperature.no_points_configured")}</Text> : null}
                <Text style={appStyles.tokenPreview}>
                  {currentSequencePoint
                    ? t("temperature.next", { value: `${currentSequencePoint.sort_order}. ${currentSequencePoint.name}` })
                    : t("temperature.sequence_complete")}
                </Text>
                <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={openSequenceCamera} disabled={loading || !!pendingPreview}>
                  <Text style={appStyles.buttonText}>{t("temperature.open_sequence_camera")}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {!selectedPoint ? <Text style={appStyles.warn}>{t("temperature.select_point_first")}</Text> : null}
                <Text style={appStyles.tokenPreview}>
                  {t("temperature.manual_for", { value: selectedPoint ? `${selectedPoint.sort_order}. ${selectedPoint.name}` : t("temperature.manual_none") })}
                </Text>
                <Text style={appStyles.label}>{t("temperature.preset", { value: selectedPoint?.device_type === "FREEZER" ? t("temperature.freezer_range") : t("temperature.fridge_range") })}</Text>
                <View style={appStyles.tabsRow}>
                  {manualPresetValues(selectedPoint?.device_type).map((value) => (
                    <Pressable
                      key={`manual-preset-${value}`}
                      style={({ pressed }) => [appStyles.tabButton, pressed ? appStyles.tabButtonPressed : undefined]}
                      onPress={() => void saveManualReading(String(value), false)}
                      disabled={!selectedPoint || savingManual}
                    >
                      <Text style={appStyles.tabText}>{value} C</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={appStyles.label}>{t("temperature.out_of_range")}</Text>
                <TextInput
                  style={appStyles.input}
                  value={manualOutOfRangeTempInput}
                  onChangeText={setManualOutOfRangeTempInput}
                  keyboardType="decimal-pad"
                  placeholder={t("temperature.out_placeholder")}
                />
                <TextInput
                  style={appStyles.input}
                  value={manualReasonInput}
                  onChangeText={setManualReasonInput}
                  placeholder={t("temperature.reason_placeholder")}
                />
                <TextInput
                  style={appStyles.input}
                  value={manualActionInput}
                  onChangeText={setManualActionInput}
                  placeholder={t("temperature.action_placeholder")}
                />
                <Pressable
                  style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
                  onPress={() => void saveManualReading(manualOutOfRangeTempInput, true)}
                  disabled={!selectedPoint || savingManual}
                >
                  <Text style={appStyles.buttonSecondaryText}>{savingManual ? t("temperature.saving") : t("temperature.save_out_of_range")}</Text>
                </Pressable>
              </>
            )}
      </View>

      {mode === "sequence" && sequenceCameraOpen ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>{t("temperature.sequence_camera")}</Text>
          <CameraView ref={cameraRef} style={appStyles.cameraPreview} facing="back" />
          <Text style={appStyles.tokenPreview}>
            {t("temperature.step", {
              current: Math.min(sequenceStepIndex + 1, Math.max(sequencePoints.length, 1)),
              total: Math.max(sequencePoints.length, 1),
              name: currentSequencePoint?.name || t("temperature.completed"),
            })}
          </Text>
          <View style={appStyles.tabsRow}>
            <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={takeSequenceShot} disabled={takingShot || !currentSequencePoint || !!pendingPreview}>
              <Text style={appStyles.buttonText}>{takingShot ? t("temperature.taking") : t("temperature.take")}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]} onPress={() => setSequenceCameraOpen(false)}>
              <Text style={appStyles.buttonSecondaryText}>{t("temperature.end_session")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {pendingPreview ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>{t("temperature.operator_confirm")}</Text>
          <Text>{t("temperature.point", { value: pendingPreview.preview.device_label || "-" })}</Text>
          <Text>{t("temperature.ocr_suggested", { value: pendingPreview.preview.suggested_temperature_celsius })}</Text>
          <Text style={appStyles.label}>{t("temperature.confirmed_temp")}</Text>
          <TextInput
            style={appStyles.input}
            value={confirmTempInput}
            onChangeText={setConfirmTempInput}
            keyboardType="decimal-pad"
            placeholder="e.g. 4.5"
          />
          {pendingPreview.preview.warnings.length ? (
            <View>
              <Text style={appStyles.warn}>{t("temperature.ocr_warnings")}</Text>
              {pendingPreview.preview.warnings.map((warn, idx) => (
                <Text key={`${warn}-${idx}`} style={appStyles.warn}>
                  - {warn}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={appStyles.tabsRow}>
            <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={confirmPreview}>
              <Text style={appStyles.buttonText}>{t("temperature.confirm_save")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
              onPress={() => {
                setPendingPreview(null);
                setConfirmTempInput("");
              }}
            >
              <Text style={appStyles.buttonSecondaryText}>{t("temperature.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {lastCapture ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>{t("temperature.last_reading")}</Text>
          <Text>
            {lastCapture.reading.cold_point_name || lastCapture.reading.device_label || "-"}: {lastCapture.reading.temperature_celsius}{" "}
            {lastCapture.reading.unit}
          </Text>
          <Text>{t("temperature.photo_persisted", { value: lastCapture.privacy.photo_persisted ? t("temperature.yes") : t("temperature.no") })}</Text>
        </View>
      ) : null}

      {readings.length > 0 ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>{t("temperature.history")}</Text>
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
