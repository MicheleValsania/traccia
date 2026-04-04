import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { fetchMe, loginToken } from "./src/api";
import { chefsideLogoXml } from "./src/assets/chefsideLogoXml";
import { AuthCard } from "./src/components/AuthCard";
import { LANGUAGE_OPTIONS, I18nProvider, useI18n } from "./src/i18n";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { CleaningScreen } from "./src/screens/CleaningScreen";
import { LabelsScreen } from "./src/screens/LabelsScreen";
import { ReportsScreen } from "./src/screens/ReportsScreen";
import { TemperatureScreen } from "./src/screens/TemperatureScreen";
import { appStyles } from "./src/styles";
import { MeMembership, TabKey } from "./src/types";

function AppShell() {
  const { language, setLanguage, t } = useI18n();
  const tabs: Array<{ key: TabKey; icon: string; label: string }> = [
    { key: "camera", icon: "\u{1F4F7}", label: t("tab.camera") },
    { key: "dashboard", icon: "\u{1F37D}\uFE0F", label: t("tab.dashboard") },
    { key: "temperatures", icon: "\u{1F321}\uFE0F", label: t("tab.temperatures") },
    { key: "cleaning", icon: "\u{1F9FD}", label: t("tab.cleaning") },
    { key: "labels", icon: "\u{1F3F7}\uFE0F", label: t("tab.labels") },
    { key: "settings", icon: "\u2699\uFE0F", label: t("tab.settings") },
  ];

  const [activeTab, setActiveTab] = useState<TabKey>("camera");
  const [navHint, setNavHint] = useState("");
  const [siteCode, setSiteCode] = useState("MAIN");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [memberships, setMemberships] = useState<MeMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  async function refreshProfile(nextToken = token) {
    if (!nextToken) return;
    const profile = await fetchMe(nextToken);
    const nextMemberships = Array.isArray(profile.memberships) ? profile.memberships : [];
    setMemberships(nextMemberships);
    const hasCurrentSite = nextMemberships.some((membership) => membership.site_code === siteCode);
    if (!hasCurrentSite) {
      const firstMembership = nextMemberships[0];
      if (firstMembership) {
        setSiteCode(firstMembership.site_code);
      }
    }
  }

  async function login() {
    setError("");
    try {
      const nextToken = await loginToken(username, password);
      setToken(nextToken);
      try {
        await refreshProfile(nextToken);
      } catch {
        // Keep current site code if profile loading fails.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("app.login_error"));
    }
  }

  function logout() {
    setToken("");
    setError("");
    setMemberships([]);
    setActiveTab("camera");
  }

  function showNavHint(label: string) {
    setNavHint(label);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setNavHint(""), 900);
  }

  return (
    <SafeAreaView style={token ? appStyles.safe : appStyles.authSafe}>
      <StatusBar style={token ? "dark" : "light"} />
      <ScrollView contentContainerStyle={[appStyles.container, token ? { paddingBottom: 176 } : undefined]}>
        {!token ? (
          <View style={appStyles.authLanding}>
            <View style={appStyles.authLogoCard}>
              <SvgXml xml={chefsideLogoXml} width={220} height={66} />
            </View>
            <View style={appStyles.tabsRow}>
              {LANGUAGE_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    appStyles.tabButton,
                    option === language ? appStyles.tabButtonActive : undefined,
                    pressed ? appStyles.tabButtonPressed : undefined,
                  ]}
                  onPress={() => setLanguage(option)}
                >
                  <Text style={[appStyles.tabText, option === language ? appStyles.tabTextActive : undefined]}>{t(`lang.${option}`)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={appStyles.authTitle}>{t("app.title")}</Text>
            <Text style={appStyles.authSubtitle}>{t("app.subtitle")}</Text>
            <AuthCard
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              token={token}
              onLogin={login}
            />
          </View>
        ) : null}

        {token && activeTab === "camera" ? <CaptureScreen token={token} siteCode={siteCode} loading={loading} setLoading={setLoading} setError={setError} /> : null}
        {token && activeTab === "dashboard" ? <ReportsScreen siteCode={siteCode} token={token} /> : null}
        {token && activeTab === "temperatures" ? <TemperatureScreen token={token} siteCode={siteCode} setError={setError} /> : null}
        {token && activeTab === "cleaning" ? <CleaningScreen token={token} siteCode={siteCode} setError={setError} /> : null}
        {token && activeTab === "labels" ? <LabelsScreen token={token} siteCode={siteCode} setError={setError} /> : null}

        {token && activeTab === "settings" ? (
          <View style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>{t("settings.title")}</Text>
            <Text style={appStyles.tokenPreview}>{t("settings.user", { value: username })}</Text>
            <Text style={appStyles.tokenPreview}>{t("settings.site", { value: siteCode })}</Text>
            <Text style={appStyles.tokenPreview}>{t("settings.available_sites")}</Text>
            {memberships.length ? (
              <View style={appStyles.tabsRow}>
                {memberships.map((membership) => (
                  <Pressable
                    key={`${membership.site_code}-${membership.role}`}
                    style={({ pressed }) => [
                      appStyles.tabButton,
                      membership.site_code === siteCode ? appStyles.tabButtonActive : undefined,
                      pressed ? appStyles.tabButtonPressed : undefined,
                    ]}
                    onPress={() => setSiteCode(membership.site_code)}
                  >
                    <Text style={[appStyles.tabText, membership.site_code === siteCode ? appStyles.tabTextActive : undefined]}>{membership.site_name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={appStyles.tokenPreview}>{t("settings.no_sites")}</Text>
            )}

            <Text style={appStyles.label}>{t("settings.language")}</Text>
            <View style={appStyles.tabsRow}>
              {LANGUAGE_OPTIONS.map((option) => (
                <Pressable
                  key={`settings-${option}`}
                  style={({ pressed }) => [
                    appStyles.tabButton,
                    option === language ? appStyles.tabButtonActive : undefined,
                    pressed ? appStyles.tabButtonPressed : undefined,
                  ]}
                  onPress={() => setLanguage(option)}
                >
                  <Text style={[appStyles.tabText, option === language ? appStyles.tabTextActive : undefined]}>{t(`lang.${option}`)}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
              onPress={async () => {
                try {
                  setError("");
                  await refreshProfile();
                } catch (e) {
                  setError(e instanceof Error ? e.message : t("settings.reload_error"));
                }
              }}
            >
              <Text style={appStyles.buttonSecondaryText}>{t("settings.reload_sites")}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]} onPress={logout}>
              <Text style={appStyles.buttonSecondaryText}>{t("settings.logout")}</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={appStyles.error}>{error}</Text> : null}
      </ScrollView>

      {token ? (
        <View style={appStyles.bottomNavWrap}>
          {navHint ? <Text style={appStyles.bottomNavHint}>{navHint}</Text> : null}
          <View style={appStyles.bottomNav}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.key}
                style={({ pressed }) => [
                  appStyles.bottomNavItem,
                  activeTab === tab.key ? appStyles.bottomNavItemActive : undefined,
                  pressed ? appStyles.tabButtonPressed : undefined,
                ]}
                onPressIn={() => showNavHint(tab.label)}
                onPress={() => {
                  setActiveTab(tab.key);
                  showNavHint(tab.label);
                }}
              >
                <Text style={[appStyles.bottomNavIcon, activeTab === tab.key ? appStyles.bottomNavIconActive : undefined]}>{tab.icon}</Text>
                <Text style={[appStyles.bottomNavText, activeTab === tab.key ? appStyles.bottomNavTextActive : undefined]}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
