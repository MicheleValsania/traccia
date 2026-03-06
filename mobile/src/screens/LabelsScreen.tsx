import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  createLabelProfile,
  fetchActiveLotsSearch,
  fetchLabelProfiles,
  requestLabelPrint,
  updateLabelProfile,
} from "../api";
import { ActiveLotSearchItem, LabelProfile, LabelShelfLifeUnit, LabelTemplateType } from "../types";
import { appStyles } from "../styles";

type Props = {
  token: string;
  siteCode: string;
  setError: (value: string) => void;
};

const TEMPLATE_TYPES: LabelTemplateType[] = ["PREPARATION", "RAW_MATERIAL", "TRANSFORMATION"];
const SHELF_LIFE_UNITS: LabelShelfLifeUnit[] = ["days", "hours", "months"];

export function LabelsScreen(props: Props) {
  const [profiles, setProfiles] = useState<LabelProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [templateType, setTemplateType] = useState<LabelTemplateType>("PREPARATION");
  const [shelfLifeValue, setShelfLifeValue] = useState("1");
  const [shelfLifeUnit, setShelfLifeUnit] = useState<LabelShelfLifeUnit>("days");
  const [packaging, setPackaging] = useState("");
  const [storageInstructions, setStorageInstructions] = useState("");
  const [allergenText, setAllergenText] = useState("");

  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [useOriginLot, setUseOriginLot] = useState(false);
  const [lotQuery, setLotQuery] = useState("");
  const [lotResults, setLotResults] = useState<ActiveLotSearchItem[]>([]);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [searchingLots, setSearchingLots] = useState(false);
  const [copies, setCopies] = useState("1");
  const [printResult, setPrintResult] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );

  async function loadProfiles() {
    setLoadingProfiles(true);
    props.setError("");
    try {
      const rows = await fetchLabelProfiles(props.token, props.siteCode);
      setProfiles(rows);
      if (!selectedProfileId && rows[0]) {
        setSelectedProfileId(rows[0].id);
      }
      if (selectedProfileId && !rows.some((row) => row.id === selectedProfileId)) {
        setSelectedProfileId(rows[0]?.id || "");
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Caricamento profili etichetta fallito.");
    } finally {
      setLoadingProfiles(false);
    }
  }

  useEffect(() => {
    if (!props.token) return;
    void loadProfiles();
  }, [props.token, props.siteCode]);

  function openProgramForm(profile?: LabelProfile) {
    if (profile) {
      setEditingProfileId(profile.id);
      setName(profile.name);
      setTemplateType(profile.template_type);
      setShelfLifeValue(String(profile.shelf_life_value));
      setShelfLifeUnit(profile.shelf_life_unit);
      setPackaging(profile.packaging || "");
      setStorageInstructions(profile.storage_instructions || "");
      setAllergenText(profile.allergen_text || "");
    } else {
      setEditingProfileId(null);
      setName("");
      setTemplateType("PREPARATION");
      setShelfLifeValue("1");
      setShelfLifeUnit("days");
      setPackaging("");
      setStorageInstructions("");
      setAllergenText("");
    }
    setProgramOpen(true);
  }

  async function saveProfile() {
    const cleanName = name.trim();
    const lifeValue = Number.parseInt(shelfLifeValue, 10);
    if (!cleanName) {
      props.setError("Inserisci un nome profilo.");
      return;
    }
    if (!Number.isFinite(lifeValue) || lifeValue < 1) {
      props.setError("Shelf life non valida.");
      return;
    }
    props.setError("");
    setPrintResult("");
    try {
      if (editingProfileId) {
        await updateLabelProfile({
          token: props.token,
          profileId: editingProfileId,
          name: cleanName,
          templateType,
          shelfLifeValue: lifeValue,
          shelfLifeUnit,
          packaging,
          storageInstructions,
          allergenText,
        });
      } else {
        await createLabelProfile({
          token: props.token,
          siteCode: props.siteCode,
          name: cleanName,
          templateType,
          shelfLifeValue: lifeValue,
          shelfLifeUnit,
          packaging,
          storageInstructions,
          allergenText,
        });
      }
      setProgramOpen(false);
      await loadProfiles();
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Salvataggio profilo etichetta fallito.");
    }
  }

  async function searchLots() {
    setSearchingLots(true);
    props.setError("");
    try {
      const rows = await fetchActiveLotsSearch({
        token: props.token,
        siteCode: props.siteCode,
        q: lotQuery.trim() || undefined,
        limit: 20,
      });
      setLotResults(rows);
      if (selectedLotId && !rows.some((row) => row.id === selectedLotId)) {
        setSelectedLotId("");
      }
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Ricerca lotti fallita.");
    } finally {
      setSearchingLots(false);
    }
  }

  async function printLabels() {
    if (!selectedProfile) {
      props.setError("Seleziona una preparazione/profilo.");
      return;
    }
    const copiesNum = Number.parseInt(copies, 10);
    if (!Number.isFinite(copiesNum) || copiesNum < 1) {
      props.setError("Numero etichette non valido.");
      return;
    }
    if (useOriginLot && !selectedLotId) {
      props.setError("Se hai scelto lotto origine, seleziona un lotto.");
      return;
    }
    props.setError("");
    setPrintResult("");
    try {
      const job = await requestLabelPrint({
        token: props.token,
        siteCode: props.siteCode,
        profileId: selectedProfile.id,
        lotId: useOriginLot ? selectedLotId : undefined,
        copies: copiesNum,
      });
      setPrintResult(
        `Stampa pronta: ${job.copies} etichette | Produzione ${job.production_date} | DLC ${job.dlc_date}`,
      );
    } catch (e) {
      props.setError(e instanceof Error ? e.message : "Richiesta stampa fallita.");
    }
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>Etichette</Text>
      <Text style={appStyles.tokenPreview}>Site: {props.siteCode}</Text>

      <Pressable
        style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
        onPress={() => openProgramForm()}
      >
        <Text style={appStyles.buttonSecondaryText}>Programma</Text>
      </Pressable>

      {programOpen ? (
        <View style={appStyles.card}>
          <Text style={appStyles.sectionTitle}>{editingProfileId ? "Modifica profilo" : "Nuovo profilo"}</Text>
          <Text style={appStyles.label}>Nome profilo</Text>
          <TextInput style={appStyles.input} value={name} onChangeText={setName} placeholder="Es. Tajine d'agnello SV" />
          <Text style={appStyles.label}>Tipo template</Text>
          <View style={appStyles.tabsRow}>
            {TEMPLATE_TYPES.map((candidate) => (
              <Pressable
                key={candidate}
                style={({ pressed }) => [
                  appStyles.tabButton,
                  templateType === candidate ? appStyles.tabButtonActive : undefined,
                  pressed ? appStyles.tabButtonPressed : undefined,
                ]}
                onPress={() => setTemplateType(candidate)}
              >
                <Text style={[appStyles.tabText, templateType === candidate ? appStyles.tabTextActive : undefined]}>
                  {candidate}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={appStyles.label}>Shelf life</Text>
          <TextInput
            style={appStyles.input}
            value={shelfLifeValue}
            onChangeText={setShelfLifeValue}
            keyboardType="number-pad"
            placeholder="1"
          />
          <View style={appStyles.tabsRow}>
            {SHELF_LIFE_UNITS.map((candidate) => (
              <Pressable
                key={candidate}
                style={({ pressed }) => [
                  appStyles.tabButton,
                  shelfLifeUnit === candidate ? appStyles.tabButtonActive : undefined,
                  pressed ? appStyles.tabButtonPressed : undefined,
                ]}
                onPress={() => setShelfLifeUnit(candidate)}
              >
                <Text style={[appStyles.tabText, shelfLifeUnit === candidate ? appStyles.tabTextActive : undefined]}>
                  {candidate}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={appStyles.label}>Confezionamento</Text>
          <TextInput style={appStyles.input} value={packaging} onChangeText={setPackaging} placeholder="Es. sotto vuoto" />
          <Text style={appStyles.label}>Conservazione</Text>
          <TextInput
            style={appStyles.input}
            value={storageInstructions}
            onChangeText={setStorageInstructions}
            placeholder="Es. 0/+3 C"
          />
          <Text style={appStyles.label}>Allergeni (testo)</Text>
          <TextInput style={appStyles.input} value={allergenText} onChangeText={setAllergenText} />
          <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={saveProfile}>
            <Text style={appStyles.buttonText}>{editingProfileId ? "Salva modifica" : "Crea profilo"}</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={appStyles.label}>Profili disponibili</Text>
      {loadingProfiles ? <Text style={appStyles.tokenPreview}>Caricamento profili...</Text> : null}
      {profiles.map((profile) => (
        <View key={profile.id} style={appStyles.chipWithDelete}>
          <Pressable
            style={({ pressed }) => [
              appStyles.tabButton,
              { flex: 1 },
              selectedProfileId === profile.id ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setSelectedProfileId(profile.id)}
          >
            <Text style={[appStyles.tabText, selectedProfileId === profile.id ? appStyles.tabTextActive : undefined]}>
              {profile.name}
            </Text>
            <Text style={[appStyles.tokenPreview, selectedProfileId === profile.id ? appStyles.tabTextActive : undefined]}>
              {profile.shelf_life_value} {profile.shelf_life_unit} | {profile.template_type}
            </Text>
          </Pressable>
          <Pressable style={appStyles.chipDelete} onPress={() => openProgramForm(profile)}>
            <Text style={appStyles.chipDeleteText}>✏️</Text>
          </Pressable>
        </View>
      ))}

      <Text style={appStyles.label}>Lotto d'origine (opzionale)</Text>
      <View style={appStyles.tabsRow}>
        <Pressable
          style={({ pressed }) => [
            appStyles.tabButton,
            useOriginLot ? appStyles.tabButtonActive : undefined,
            pressed ? appStyles.tabButtonPressed : undefined,
          ]}
          onPress={() => setUseOriginLot(true)}
        >
          <Text style={[appStyles.tabText, useOriginLot ? appStyles.tabTextActive : undefined]}>Si, inserisci lotto</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            appStyles.tabButton,
            !useOriginLot ? appStyles.tabButtonActive : undefined,
            pressed ? appStyles.tabButtonPressed : undefined,
          ]}
          onPress={() => {
            setUseOriginLot(false);
            setSelectedLotId("");
          }}
        >
          <Text style={[appStyles.tabText, !useOriginLot ? appStyles.tabTextActive : undefined]}>No lotto</Text>
        </Pressable>
      </View>

      {useOriginLot ? (
        <>
          <TextInput
            style={appStyles.input}
            value={lotQuery}
            onChangeText={setLotQuery}
            placeholder="Cerca lotto (prodotto, fornitore, codice)"
          />
          <Pressable
            style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
            onPress={() => void searchLots()}
            disabled={searchingLots}
          >
            <Text style={appStyles.buttonSecondaryText}>{searchingLots ? "Ricerca..." : "Suggerisci lotto"}</Text>
          </Pressable>
          {lotResults.map((lot) => (
            <Pressable
              key={lot.id}
              style={({ pressed }) => [
                appStyles.tabButton,
                selectedLotId === lot.id ? appStyles.tabButtonActive : undefined,
                pressed ? appStyles.tabButtonPressed : undefined,
              ]}
              onPress={() => setSelectedLotId(lot.id)}
            >
              <Text style={[appStyles.tabText, selectedLotId === lot.id ? appStyles.tabTextActive : undefined]}>
                {lot.display_product_name} | {lot.internal_lot_code}
              </Text>
              <Text style={[appStyles.tokenPreview, selectedLotId === lot.id ? appStyles.tabTextActive : undefined]}>
                {lot.supplier_name || "-"} | DLC {lot.dlc_date || "-"}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={appStyles.label}>Quante etichette vuoi stampare?</Text>
      <TextInput style={appStyles.input} value={copies} onChangeText={setCopies} keyboardType="number-pad" placeholder="1" />
      <Pressable
        style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]}
        onPress={printLabels}
        disabled={!selectedProfile}
      >
        <Text style={appStyles.buttonText}>Stampa</Text>
      </Pressable>
      {printResult ? <Text style={appStyles.success}>{printResult}</Text> : null}
    </View>
  );
}
