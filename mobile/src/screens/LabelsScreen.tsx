import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { fetchActiveLotsSearch, fetchLabelProfiles, requestLabelPrint } from "../api";
import { useI18n } from "../i18n";
import { ActiveLotSearchItem, LabelProfile } from "../types";
import { appStyles } from "../styles";

type Props = {
  token: string;
  siteCode: string;
  setError: (value: string) => void;
};

function normalizeCategoryName(value: string | null | undefined, fallback: string) {
  const cleanValue = (value || "").trim();
  return cleanValue || fallback;
}

export function LabelsScreen(props: Props) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<LabelProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [useOriginLot, setUseOriginLot] = useState(false);
  const [lotQuery, setLotQuery] = useState("");
  const [lotResults, setLotResults] = useState<ActiveLotSearchItem[]>([]);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [searchingLots, setSearchingLots] = useState(false);
  const [copies, setCopies] = useState("1");
  const [printResult, setPrintResult] = useState("");

  const groupedProfiles = useMemo(() => {
    const buckets: Record<string, LabelProfile[]> = {};
    profiles.forEach((profile) => {
      const bucketName = normalizeCategoryName(profile.category, t("labels.uncategorized"));
      if (!buckets[bucketName]) buckets[bucketName] = [];
      buckets[bucketName].push(profile);
    });
    return buckets;
  }, [profiles]);

  const categoryOptions = useMemo(
    () => Object.keys(groupedProfiles).sort((a, b) => a.localeCompare(b)),
    [groupedProfiles],
  );

  const sessionProfiles = useMemo(() => {
    if (!selectedCategory) return profiles;
    return groupedProfiles[selectedCategory] || [];
  }, [groupedProfiles, profiles, selectedCategory]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );

  async function loadProfiles(preferredProfileId?: string) {
    setLoadingProfiles(true);
    props.setError("");
    try {
      const rows = await fetchLabelProfiles(props.token, props.siteCode);
      setProfiles(rows);
      const nextSelectedId = preferredProfileId && rows.some((row) => row.id === preferredProfileId)
        ? preferredProfileId
        : selectedProfileId && rows.some((row) => row.id === selectedProfileId)
          ? selectedProfileId
          : rows[0]?.id || "";
      setSelectedProfileId(nextSelectedId);
      const nextProfile = rows.find((row) => row.id === nextSelectedId) || rows[0] || null;
      setSelectedCategory(nextProfile ? normalizeCategoryName(nextProfile.category, t("labels.uncategorized")) : "");
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("labels.load_error"));
    } finally {
      setLoadingProfiles(false);
    }
  }

  useEffect(() => {
    if (!props.token) return;
    void loadProfiles();
  }, [props.token, props.siteCode]);

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
      props.setError(e instanceof Error ? e.message : t("labels.search_error"));
    } finally {
      setSearchingLots(false);
    }
  }

  async function printLabels() {
    if (!selectedProfile) {
      props.setError(t("labels.select_profile"));
      return;
    }
    const copiesNum = Number.parseInt(copies, 10);
    if (!Number.isFinite(copiesNum) || copiesNum < 1) {
      props.setError(t("labels.invalid_copies"));
      return;
    }
    if (useOriginLot && !selectedLotId) {
      props.setError(t("labels.select_origin_lot"));
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
      setPrintResult(t("labels.print_ready", { copies: job.copies, production: job.production_date, dlc: job.dlc_date }));
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("labels.print_error"));
    }
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>{t("labels.title")}</Text>
      <Text style={appStyles.tokenPreview}>{t("labels.site", { value: props.siteCode })}</Text>
      <Text style={appStyles.tokenPreview}>{t("labels.subtitle")}</Text>

      <Pressable
        style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
        onPress={() => void loadProfiles(selectedProfileId || undefined)}
        disabled={loadingProfiles}
      >
        <Text style={appStyles.buttonSecondaryText}>{loadingProfiles ? t("labels.refreshing_profiles") : t("labels.refresh_profiles")}</Text>
      </Pressable>

      <Text style={appStyles.label}>{t("labels.categories")}</Text>
      <View style={appStyles.tabsRow}>
        {categoryOptions.map((categoryName) => (
          <Pressable
            key={categoryName}
            style={({ pressed }) => [
              appStyles.tabButton,
              selectedCategory === categoryName ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => {
              setSelectedCategory(categoryName);
              const firstProfile = groupedProfiles[categoryName]?.[0];
              if (firstProfile) setSelectedProfileId(firstProfile.id);
            }}
          >
            <Text style={[appStyles.tabText, selectedCategory === categoryName ? appStyles.tabTextActive : undefined]}>{categoryName}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={appStyles.label}>{t("labels.available_profiles")}</Text>
      {loadingProfiles ? <Text style={appStyles.tokenPreview}>{t("labels.loading_profiles")}</Text> : null}
      {sessionProfiles.length ? (
        sessionProfiles.map((profile) => (
          <Pressable
            key={profile.id}
            style={({ pressed }) => [
              appStyles.tabButton,
              selectedProfileId === profile.id ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setSelectedProfileId(profile.id)}
          >
            <Text style={[appStyles.tabText, selectedProfileId === profile.id ? appStyles.tabTextActive : undefined]}>{profile.name}</Text>
            <Text style={[appStyles.tokenPreview, selectedProfileId === profile.id ? appStyles.tabTextActive : undefined]}>
              {profile.shelf_life_value} {profile.shelf_life_unit} | {profile.template_type}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={appStyles.tokenPreview}>{t("labels.no_profiles_category")}</Text>
      )}

      <Text style={appStyles.label}>{t("labels.origin_lot")}</Text>
      <View style={appStyles.tabsRow}>
        <Pressable
          style={({ pressed }) => [
            appStyles.tabButton,
            useOriginLot ? appStyles.tabButtonActive : undefined,
            pressed ? appStyles.tabButtonPressed : undefined,
          ]}
          onPress={() => setUseOriginLot(true)}
        >
          <Text style={[appStyles.tabText, useOriginLot ? appStyles.tabTextActive : undefined]}>{t("labels.select_lot")}</Text>
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
          <Text style={[appStyles.tabText, !useOriginLot ? appStyles.tabTextActive : undefined]}>{t("labels.without_lot")}</Text>
        </Pressable>
      </View>

      {useOriginLot ? (
        <>
          <TextInput style={appStyles.input} value={lotQuery} onChangeText={setLotQuery} placeholder={t("labels.search_lot_placeholder")} />
          <Pressable
            style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
            onPress={() => void searchLots()}
            disabled={searchingLots}
          >
            <Text style={appStyles.buttonSecondaryText}>{searchingLots ? t("labels.searching") : t("labels.search_lots")}</Text>
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
              <Text style={[appStyles.tabText, selectedLotId === lot.id ? appStyles.tabTextActive : undefined]}>{lot.display_product_name} | {lot.internal_lot_code}</Text>
              <Text style={[appStyles.tokenPreview, selectedLotId === lot.id ? appStyles.tabTextActive : undefined]}>
                {lot.supplier_name || "-"} | DLC {lot.dlc_date || "-"}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={appStyles.label}>{t("labels.copies")}</Text>
      <TextInput style={appStyles.input} value={copies} onChangeText={setCopies} keyboardType="number-pad" placeholder="1" />
      <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={printLabels} disabled={!selectedProfile}>
        <Text style={appStyles.buttonText}>{t("labels.print")}</Text>
      </Pressable>
      {printResult ? <Text style={appStyles.success}>{printResult}</Text> : null}
    </View>
  );
}
