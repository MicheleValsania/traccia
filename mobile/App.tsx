import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
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

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "capture", label: "Capture" },
  { key: "drafts", label: "Draft" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "temperatures", label: "Temperatures" },
  { key: "reports", label: "Reports" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("capture");
  const [siteCode, setSiteCode] = useState("MAIN");
  const [supplierName, setSupplierName] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [captureResult, setCaptureResult] = useState<CaptureResponse | null>(null);
  const [drafts, setDrafts] = useState<DraftLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    setActiveTab("capture");
  }

  return (
    <SafeAreaView style={appStyles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={appStyles.container}>
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
        ) : (
          <View style={appStyles.card}>
            <Text style={appStyles.sectionTitle}>Sessione attiva</Text>
            <Text style={appStyles.tokenPreview}>Utente: {username}</Text>
            <Text style={appStyles.tokenPreview}>Site: {siteCode}</Text>
            <Pressable style={appStyles.buttonSecondary} onPress={logout}>
              <Text style={appStyles.buttonSecondaryText}>Logout</Text>
            </Pressable>
          </View>
        )}

        {token ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={appStyles.tabsRow}>
            {TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[appStyles.tabButton, activeTab === tab.key ? appStyles.tabButtonActive : undefined]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[appStyles.tabText, activeTab === tab.key ? appStyles.tabTextActive : undefined]}>{tab.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {token && activeTab === "capture" ? (
          <CaptureScreen
            token={token}
            siteCode={siteCode}
            setSiteCode={setSiteCode}
            supplierName={supplierName}
            setSupplierName={setSupplierName}
            loading={loading}
            setLoading={setLoading}
            captureResult={captureResult}
            setCaptureResult={setCaptureResult}
            setError={setError}
            refreshDrafts={refreshDrafts}
          />
        ) : null}

        {token && activeTab === "drafts" ? (
          <DraftsScreen token={token} drafts={drafts} setError={setError} refreshDrafts={refreshDrafts} />
        ) : null}

        {token && activeTab === "lifecycle" ? <LifecycleScreen token={token} setError={setError} /> : null}
        {token && activeTab === "temperatures" ? (
          <TemperatureScreen token={token} siteCode={siteCode} setSiteCode={setSiteCode} setError={setError} />
        ) : null}
        {token && activeTab === "reports" ? <ReportsScreen siteCode={siteCode} token={token} /> : null}
        {error ? <Text style={appStyles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
