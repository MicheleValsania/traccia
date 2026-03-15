import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { fetchMe, loginToken } from "./src/api";
import { chefsideLogoXml } from "./src/assets/chefsideLogoXml";
import { AuthCard } from "./src/components/AuthCard";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { LabelsScreen } from "./src/screens/LabelsScreen";
import { ReportsScreen } from "./src/screens/ReportsScreen";
import { TemperatureScreen } from "./src/screens/TemperatureScreen";
import { appStyles } from "./src/styles";
import { MeMembership, TabKey } from "./src/types";

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: "camera", icon: "\u{1F4F7}", label: "Camera" },
  { key: "dashboard", icon: "\u{1F37D}\uFE0F", label: "Dashboard" },
  { key: "temperatures", icon: "\u{1F321}\uFE0F", label: "Temperature" },
  { key: "labels", icon: "\u{1F3F7}\uFE0F", label: "Etichette" },
  { key: "settings", icon: "\u2699\uFE0F", label: "Parametri" },
];

export default function App() {
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
      setError(e instanceof Error ? e.message : "Errore login.");
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
            <Text style={appStyles.authTitle}>Traccia HACCP</Text>
            <Text style={appStyles.authSubtitle}>Camera continua, temperature, etichette operative e alert.</Text>
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

        {token && activeTab === "camera" ? (
          <CaptureScreen
            token={token}
            siteCode={siteCode}
            setSiteCode={setSiteCode}
            supplierName=""
            setSupplierName={() => {}}
            loading={loading}
            setLoading={setLoading}
            setError={setError}
          />
        ) : null}

        {token && activeTab === "dashboard" ? (
          <ReportsScreen siteCode={siteCode} token={token} />
        ) : null}

        {token && activeTab === "temperatures" ? (
          <TemperatureScreen token={token} siteCode={siteCode} setSiteCode={setSiteCode} setError={setError} />
        ) : null}
        {token && activeTab === "labels" ? (
          <LabelsScreen token={token} siteCode={siteCode} setError={setError} />
        ) : null}
        {token && activeTab === "settings" ? (
          <View style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>Parametri</Text>
            <Text style={appStyles.tokenPreview}>Utente: {username}</Text>
            <Text style={appStyles.tokenPreview}>Site attivo: {siteCode}</Text>
            <Text style={appStyles.tokenPreview}>Siti disponibili</Text>
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
                    <Text style={[appStyles.tabText, membership.site_code === siteCode ? appStyles.tabTextActive : undefined]}>
                      {membership.site_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={appStyles.tokenPreview}>Nessun site disponibile nel profilo.</Text>
            )}
            <Pressable
              style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]}
              onPress={async () => {
                try {
                  setError("");
                  await refreshProfile();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Errore caricamento profilo.");
                }
              }}
            >
              <Text style={appStyles.buttonSecondaryText}>Ricarica siti</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]} onPress={logout}>
              <Text style={appStyles.buttonSecondaryText}>Logout</Text>
            </Pressable>
          </View>
        ) : null}
        {error ? <Text style={appStyles.error}>{error}</Text> : null}
      </ScrollView>
      {token ? (
        <View style={appStyles.bottomNavWrap}>
          {navHint ? <Text style={appStyles.bottomNavHint}>{navHint}</Text> : null}
          <View style={appStyles.bottomNav}>
            {TABS.map((tab) => (
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
