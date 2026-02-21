import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text } from "react-native";

import { loginToken, fetchDrafts } from "./src/api";
import { AuthCard } from "./src/components/AuthCard";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { DraftsScreen } from "./src/screens/DraftsScreen";
import { LifecycleScreen } from "./src/screens/LifecycleScreen";
import { ReportsScreen } from "./src/screens/ReportsScreen";
import { appStyles } from "./src/styles";
import { CaptureResponse, DraftLot, TabKey } from "./src/types";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "capture", label: "Capture" },
  { key: "drafts", label: "Draft" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "reports", label: "Reports" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("capture");
  const [siteCode, setSiteCode] = useState("PARIS01");
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

  return (
    <SafeAreaView style={appStyles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={appStyles.container}>
        <Text style={appStyles.title}>Traceability Mobile</Text>
        <Text style={appStyles.subtitle}>App mobile-first con componenti separati per capture, draft, lifecycle e report.</Text>

        <AuthCard
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          token={token}
          onLogin={login}
        />

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

        {activeTab === "capture" ? (
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

        {activeTab === "drafts" ? (
          <DraftsScreen token={token} drafts={drafts} setError={setError} refreshDrafts={refreshDrafts} />
        ) : null}

        {activeTab === "lifecycle" ? <LifecycleScreen token={token} setError={setError} /> : null}

        {activeTab === "reports" ? <ReportsScreen siteCode={siteCode} token={token} /> : null}

        {error ? <Text style={appStyles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
