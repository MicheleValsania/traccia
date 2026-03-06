import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { fetchDrafts, fetchMe, loginToken } from "./src/api";
import { AuthCard } from "./src/components/AuthCard";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { DraftsScreen } from "./src/screens/DraftsScreen";
import { LifecycleScreen } from "./src/screens/LifecycleScreen";
import { ReportsScreen } from "./src/screens/ReportsScreen";
import { TemperatureScreen } from "./src/screens/TemperatureScreen";
import { appStyles } from "./src/styles";
import { CaptureResponse, DraftLot, TabKey } from "./src/types";

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: "camera", icon: "📷", label: "Camera" },
  { key: "dashboard", icon: "🍽️", label: "Dashboard" },
  { key: "lifecycle", icon: "🔁", label: "Lifecycle" },
  { key: "temperatures", icon: "🌡️", label: "Temperature" },
  { key: "settings", icon: "⚙️", label: "Parametri" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("camera");
  const [navHint, setNavHint] = useState("");
  const [siteCode, setSiteCode] = useState("MAIN");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [captureResult, setCaptureResult] = useState<CaptureResponse | null>(null);
  const [drafts, setDrafts] = useState<DraftLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  async function login() {
    setError("");
    try {
      const nextToken = await loginToken(username, password);
      setToken(nextToken);
      try {
        const profile = await fetchMe(nextToken);
        const firstMembership = profile.memberships[0];
        if (firstMembership) {
          setSiteCode(firstMembership.site_code);
        }
      } catch {
        // Keep current site code if profile loading fails.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore login.");
    }
  }

  async function refreshDrafts() {
    if (!token) {
      setError("Effettua login prima di caricare i draft.");
      return;
    }
    try {
      const next = await fetchDrafts(token, siteCode);
      setDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento draft.");
    }
  }

  function logout() {
    setToken("");
    setError("");
    setDrafts([]);
    setCaptureResult(null);
    setActiveTab("camera");
  }

  function showNavHint(label: string) {
    setNavHint(label);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setNavHint(""), 900);
  }

  return (
    <SafeAreaView style={appStyles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[appStyles.container, token ? { paddingBottom: 112 } : undefined]}>
        {!token ? (
          <>
            <Text style={appStyles.title}>Traceability Mobile</Text>
            <Text style={appStyles.subtitle}>Accedi per usare l'app.</Text>
            <AuthCard
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              token={token}
              onLogin={login}
            />
          </>
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
            captureResult={captureResult}
            setCaptureResult={setCaptureResult}
            setError={setError}
            refreshDrafts={refreshDrafts}
          />
        ) : null}

        {token && activeTab === "dashboard" ? (
          <>
            <ReportsScreen siteCode={siteCode} token={token} />
            <DraftsScreen token={token} drafts={drafts} setError={setError} refreshDrafts={refreshDrafts} />
          </>
        ) : null}

        {token && activeTab === "lifecycle" ? <LifecycleScreen token={token} setError={setError} /> : null}
        {token && activeTab === "temperatures" ? (
          <TemperatureScreen token={token} siteCode={siteCode} setSiteCode={setSiteCode} setError={setError} />
        ) : null}
        {token && activeTab === "settings" ? (
          <View style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>Parametri</Text>
            <Text style={appStyles.tokenPreview}>Utente: {username}</Text>
            <Text style={appStyles.tokenPreview}>Site attivo: {siteCode}</Text>
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
            </Pressable>
          ))}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
