import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import {
  closeInventorySession,
  createInventorySession,
  fetchInventoryProducts,
  fetchInventorySectors,
  fetchInventorySessionDetail,
  fetchInventorySessions,
  fetchInventoryStockPoints,
  fetchInventorySuppliers,
  saveInventorySessionLines,
} from "../api";
import { useI18n } from "../i18n";
import { appStyles } from "../styles";
import { InventoryProduct, InventorySector, InventorySession, InventorySessionLine, InventoryStockPoint, InventorySupplier } from "../types";

type Props = {
  token: string;
  siteCode: string;
  setError: (value: string) => void;
};

const CATEGORY_OPTIONS = ["", "epicerie", "viande", "poissons", "legumes", "bof", "glaces", "surgeles", "boissons", "entretien", "emballages"];

export function InventoryScreen(props: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [infoMessage, setInfoMessage] = React.useState("");
  const [sectors, setSectors] = React.useState<InventorySector[]>([]);
  const [stockPoints, setStockPoints] = React.useState<InventoryStockPoint[]>([]);
  const [suppliers, setSuppliers] = React.useState<InventorySupplier[]>([]);
  const [sessions, setSessions] = React.useState<InventorySession[]>([]);
  const [products, setProducts] = React.useState<InventoryProduct[]>([]);
  const [draftLines, setDraftLines] = React.useState<InventorySessionLine[]>([]);
  const [savedLines, setSavedLines] = React.useState<InventorySessionLine[]>([]);
  const [savedLineCount, setSavedLineCount] = React.useState(0);
  const [selectedSectorId, setSelectedSectorId] = React.useState("");
  const [selectedStockPointId, setSelectedStockPointId] = React.useState("");
  const [selectedSupplierId, setSelectedSupplierId] = React.useState("");
  const [selectedSessionId, setSelectedSessionId] = React.useState("");
  const [sessionLabel, setSessionLabel] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [showOnlyDifferences, setShowOnlyDifferences] = React.useState(false);
  const [showOnlyInStock, setShowOnlyInStock] = React.useState(false);

  React.useEffect(() => {
    if (!props.token) return;
    void loadConfiguration();
  }, [props.token, props.siteCode]);

  React.useEffect(() => {
    if (!props.token) return;
    const hasSearchCriteria =
      search.trim().length >= 2 ||
      Boolean(category) ||
      Boolean(selectedSupplierId) ||
      showOnlyInStock;
    if (!hasSearchCriteria) {
      setProducts([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      void searchProducts();
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [props.token, props.siteCode, search, category, selectedSupplierId, showOnlyInStock]);

  async function loadConfiguration() {
    setLoading(true);
    try {
      const [sectorRows, sessionRows, supplierRows] = await Promise.all([
        fetchInventorySectors(props.token, props.siteCode),
        fetchInventorySessions(props.token, props.siteCode),
        fetchInventorySuppliers(props.token, props.siteCode),
      ]);
      setSectors(sectorRows);
      setSessions(sessionRows);
      setSuppliers(supplierRows);
      const nextSectorId = selectedSectorId && sectorRows.some((row) => row.id === selectedSectorId) ? selectedSectorId : (sectorRows[0]?.id ?? "");
      setSelectedSectorId(nextSectorId);
      if (nextSectorId) {
        const pointRows = await fetchInventoryStockPoints(props.token, props.siteCode, nextSectorId);
        setStockPoints(pointRows);
        const nextPointId = selectedStockPointId && pointRows.some((row) => row.id === selectedStockPointId) ? selectedStockPointId : (pointRows[0]?.id ?? "");
        setSelectedStockPointId(nextPointId);
      } else {
        setStockPoints([]);
        setSelectedStockPointId("");
      }
      if (selectedSessionId && sessionRows.some((row) => row.id === selectedSessionId)) {
        await loadSessionDetail(selectedSessionId);
      }
      setInfoMessage(t("inventory.loaded", { count: sessionRows.length }));
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.load_error"));
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionDetail(sessionId: string) {
    const detail = await fetchInventorySessionDetail(props.token, props.siteCode, sessionId);
    const nextSavedLines = Array.isArray(detail.lines) ? detail.lines : [];
    setSavedLines(nextSavedLines);
    setSavedLineCount(nextSavedLines.length);
    setDraftLines([]);
  }

  async function onSectorChange(nextSectorId: string) {
    setSelectedSectorId(nextSectorId);
    setSelectedStockPointId("");
    if (!nextSectorId) {
      setStockPoints([]);
      return;
    }
    try {
      const pointRows = await fetchInventoryStockPoints(props.token, props.siteCode, nextSectorId);
      setStockPoints(pointRows);
      setSelectedStockPointId(pointRows[0]?.id ?? "");
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.load_error"));
    }
  }

  async function searchProducts() {
    setLoading(true);
    try {
      const rows = await fetchInventoryProducts(props.token, props.siteCode, {
        q: search.trim() || undefined,
        category: category || undefined,
        supplierId: selectedSupplierId || undefined,
      });
      const filtered = showOnlyInStock ? rows.filter((row) => Number.parseFloat(row.current_stock || "0") !== 0) : rows;
      setProducts(filtered);
      setInfoMessage(t("inventory.products_loaded", { count: filtered.length }));
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.products_error"));
    } finally {
      setLoading(false);
    }
  }

  async function createSession() {
    setSaving(true);
    try {
      const session = await createInventorySession({
        token: props.token,
        siteCode: props.siteCode,
        sectorId: selectedSectorId || undefined,
        label: sessionLabel.trim() || undefined,
        countScope: selectedStockPointId ? "point" : selectedSectorId ? "sector" : "site",
      });
      setSessions((prev) => [session, ...prev]);
      setSelectedSessionId(session.id);
      setDraftLines([]);
      setSavedLines([]);
      setSavedLineCount(0);
      setSessionLabel("");
      setInfoMessage(t("inventory.session_created"));
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.session_create_error"));
    } finally {
      setSaving(false);
    }
  }

  function addProduct(product: InventoryProduct) {
    if (!selectedSessionId) {
      props.setError(t("inventory.session_required"));
      return;
    }
    setDraftLines((prev) => {
      const exists = prev.some(
        (line) => line.supplier_product === product.supplier_product_id && line.qty_unit === product.qty_unit && (line.stock_point || "") === selectedStockPointId,
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          stock_point: selectedStockPointId || null,
          stock_point_name: stockPoints.find((row) => row.id === selectedStockPointId)?.name ?? null,
          supplier_product: product.supplier_product_id,
          supplier_product_name: product.product_name,
          supplier_id: product.supplier_id,
          supplier_name: product.supplier_name,
          supplier_code: product.supplier_code,
          qty_value: product.current_stock,
          qty_unit: product.qty_unit,
          expected_qty: product.current_stock,
          delta_qty: "0.000",
          line_order: prev.length,
        },
      ];
    });
    setSearch("");
    setProducts([]);
  }

  function updateLine(index: number, qtyValue: string, stockPointId?: string | null) {
    setDraftLines((prev) =>
      prev.map((line, rowIndex) => {
        if (rowIndex !== index) return line;
        const next = {
          ...line,
          qty_value: qtyValue,
          stock_point: typeof stockPointId === "undefined" ? line.stock_point : stockPointId,
        };
        const qty = Number.parseFloat(String(next.qty_value ?? "0").replace(",", "."));
        const expected = Number.parseFloat(String(next.expected_qty ?? "0").replace(",", "."));
        const delta = Number.isFinite(qty) && Number.isFinite(expected) ? qty - expected : 0;
        return { ...next, delta_qty: delta.toFixed(3) };
      }),
    );
  }

  function adjustLine(index: number, action: "match" | "zero" | "inc" | "dec") {
    const line = draftLines[index];
    if (!line) return;
    const current = Number.parseFloat(String(line.qty_value ?? "0").replace(",", "."));
    const expected = Number.parseFloat(String(line.expected_qty ?? "0").replace(",", "."));
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const safeExpected = Number.isFinite(expected) ? expected : 0;
    if (action === "match") {
      updateLine(index, safeExpected.toFixed(3));
      return;
    }
    if (action === "zero") {
      updateLine(index, "0.000");
      return;
    }
    if (action === "inc") {
      updateLine(index, (safeCurrent + 1).toFixed(3));
      return;
    }
    updateLine(index, Math.max(0, safeCurrent - 1).toFixed(3));
  }

  async function saveLines() {
    if (!selectedSessionId) {
      props.setError(t("inventory.session_required"));
      return;
    }
    if (!draftLines.length) {
      props.setError(t("inventory.lines_required"));
      return;
    }
    setSaving(true);
    try {
      const payload = draftLines.map((line, index) => ({
        stock_point: line.stock_point || null,
        supplier_product: line.supplier_product,
        qty_value: String(line.qty_value ?? "0").replace(",", "."),
        qty_unit: line.qty_unit,
        line_order: typeof line.line_order === "number" ? line.line_order : index,
      }));
      const result = await saveInventorySessionLines({
        token: props.token,
        siteCode: props.siteCode,
        sessionId: selectedSessionId,
        lines: payload,
      });
      setSavedLines((prev) => {
        const merged = mergeInventoryLines(prev, result.lines);
        setSavedLineCount(merged.length);
        return merged;
      });
      setDraftLines([]);
      setInfoMessage(t("inventory.lines_saved", { count: result.saved_count }));
      const nextSessions = await fetchInventorySessions(props.token, props.siteCode);
      setSessions(nextSessions);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.lines_save_error"));
    } finally {
      setSaving(false);
    }
  }

  async function saveSingleLine(index: number) {
    const line = draftLines[index];
    if (!line || !selectedSessionId) {
      props.setError(t("inventory.session_required"));
      return;
    }
    setSaving(true);
    try {
      const result = await saveInventorySessionLines({
        token: props.token,
        siteCode: props.siteCode,
        sessionId: selectedSessionId,
        lines: [
          {
            stock_point: line.stock_point || null,
            supplier_product: line.supplier_product,
            qty_value: String(line.qty_value ?? "0").replace(",", "."),
            qty_unit: line.qty_unit,
            line_order: typeof line.line_order === "number" ? line.line_order : index,
          },
        ],
      });
      setSavedLines((prev) => {
        const merged = mergeInventoryLines(prev, result.lines);
        setSavedLineCount(merged.length);
        return merged;
      });
      setDraftLines((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
      setInfoMessage(t("inventory.line_saved"));
      const nextSessions = await fetchInventorySessions(props.token, props.siteCode);
      setSessions(nextSessions);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.lines_save_error"));
    } finally {
      setSaving(false);
    }
  }

  async function closeSession() {
    if (!selectedSessionId) {
      props.setError(t("inventory.session_required"));
      return;
    }
    setSaving(true);
    try {
      const result = await closeInventorySession({
        token: props.token,
        siteCode: props.siteCode,
        sessionId: selectedSessionId,
      });
      setInfoMessage(t("inventory.session_closed", { count: result.created_adjustments }));
      const nextSessions = await fetchInventorySessions(props.token, props.siteCode);
      setSessions(nextSessions);
      setDraftLines([]);
      await loadSessionDetail(selectedSessionId);
    } catch (e) {
      props.setError(e instanceof Error ? e.message : t("inventory.close_error"));
    } finally {
      setSaving(false);
    }
  }

  const filteredLines = draftLines.filter((line) => {
    if (!showOnlyDifferences) return true;
    const delta = Number.parseFloat(String(line.delta_qty ?? "0").replace(",", "."));
    return Number.isFinite(delta) ? delta !== 0 : true;
  });

  function deltaTone(deltaRaw?: string) {
    const delta = Number.parseFloat(String(deltaRaw ?? "0").replace(",", "."));
    if (!Number.isFinite(delta) || delta === 0) return appStyles.tokenPreview;
    return delta > 0 ? appStyles.success : appStyles.critical;
  }

  function mergeInventoryLines(current: InventorySessionLine[], incoming: InventorySessionLine[]) {
    const merged = [...current];
    incoming.forEach((line) => {
      const existingIndex = merged.findIndex(
        (item) =>
          item.supplier_product === line.supplier_product &&
          item.qty_unit === line.qty_unit &&
          String(item.stock_point || "") === String(line.stock_point || ""),
      );
      if (existingIndex >= 0) {
        merged[existingIndex] = line;
      } else {
        merged.push(line);
      }
    });
    return merged;
  }

  return (
    <View style={appStyles.card}>
      <Text style={appStyles.sectionTitle}>{t("inventory.title")}</Text>
      <Text style={appStyles.tokenPreview}>{t("inventory.subtitle")}</Text>
      <Text style={appStyles.tokenPreview}>{t("inventory.site", { value: props.siteCode })}</Text>
      <Text style={appStyles.success}>{t("inventory.saved_lines_count", { count: savedLineCount })}</Text>
      {infoMessage ? <Text style={appStyles.success}>{infoMessage}</Text> : null}

      <Text style={appStyles.label}>{t("inventory.sector")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={appStyles.tabsRow}>
          {sectors.map((sector) => (
            <Pressable
              key={sector.id}
              style={({ pressed }) => [
                appStyles.tabButton,
                selectedSectorId === sector.id ? appStyles.tabButtonActive : undefined,
                pressed ? appStyles.tabButtonPressed : undefined,
              ]}
              onPress={() => void onSectorChange(sector.id)}
            >
              <Text style={[appStyles.tabText, selectedSectorId === sector.id ? appStyles.tabTextActive : undefined]}>{sector.name}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={appStyles.label}>{t("inventory.stock_point")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={appStyles.tabsRow}>
          {stockPoints.map((point) => (
            <Pressable
              key={point.id}
              style={({ pressed }) => [
                appStyles.tabButton,
                selectedStockPointId === point.id ? appStyles.tabButtonActive : undefined,
                pressed ? appStyles.tabButtonPressed : undefined,
              ]}
              onPress={() => setSelectedStockPointId(point.id)}
            >
              <Text style={[appStyles.tabText, selectedStockPointId === point.id ? appStyles.tabTextActive : undefined]}>{point.name}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={appStyles.label}>{t("inventory.new_session")}</Text>
      <TextInput
        style={appStyles.input}
        value={sessionLabel}
        onChangeText={setSessionLabel}
        placeholder={t("inventory.session_placeholder")}
        placeholderTextColor="#8aa29e"
      />
      <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={() => void createSession()}>
        <Text style={appStyles.buttonText}>{saving ? t("inventory.processing") : t("inventory.create_session")}</Text>
      </Pressable>

      <Text style={appStyles.label}>{t("inventory.sessions")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={appStyles.tabsRow}>
          {sessions.map((session) => (
            <Pressable
              key={session.id}
              style={({ pressed }) => [
                appStyles.tabButton,
                selectedSessionId === session.id ? appStyles.tabButtonActive : undefined,
                pressed ? appStyles.tabButtonPressed : undefined,
              ]}
              onPress={() => {
                setSelectedSessionId(session.id);
                void loadSessionDetail(session.id);
              }}
            >
              <Text style={[appStyles.tabText, selectedSessionId === session.id ? appStyles.tabTextActive : undefined]}>
                {(session.label || session.id.slice(0, 8))} · {session.status}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Text style={appStyles.sectionTitle}>{t("inventory.products")}</Text>
      <TextInput
        style={appStyles.input}
        value={search}
        onChangeText={setSearch}
        placeholder={t("inventory.search_placeholder")}
        placeholderTextColor="#8aa29e"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={appStyles.tabsRow}>
          <Pressable
            style={({ pressed }) => [
              appStyles.tabButton,
              showOnlyInStock ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setShowOnlyInStock((prev) => !prev)}
          >
            <Text style={[appStyles.tabText, showOnlyInStock ? appStyles.tabTextActive : undefined]}>{t("inventory.only_in_stock")}</Text>
          </Pressable>
          {CATEGORY_OPTIONS.filter(Boolean).map((item) => (
            <Pressable
              key={item}
              style={({ pressed }) => [
                appStyles.tabButton,
                category === item ? appStyles.tabButtonActive : undefined,
                pressed ? appStyles.tabButtonPressed : undefined,
              ]}
              onPress={() => setCategory((prev) => (prev === item ? "" : item))}
            >
              <Text style={[appStyles.tabText, category === item ? appStyles.tabTextActive : undefined]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={appStyles.tabsRow}>
          {suppliers.slice(0, 30).map((supplier) => (
            <Pressable
              key={supplier.id}
              style={({ pressed }) => [
                appStyles.tabButton,
                selectedSupplierId === supplier.id ? appStyles.tabButtonActive : undefined,
                pressed ? appStyles.tabButtonPressed : undefined,
              ]}
              onPress={() => setSelectedSupplierId((prev) => (prev === supplier.id ? "" : supplier.id))}
            >
              <Text style={[appStyles.tabText, selectedSupplierId === supplier.id ? appStyles.tabTextActive : undefined]}>{supplier.name}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {loading ? <Text style={appStyles.tokenPreview}>{t("inventory.loading_products")}</Text> : null}

      {products.map((product) => (
        <View key={product.supplier_product_id} style={appStyles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={appStyles.listTitle}>{product.product_name}</Text>
            <Text style={appStyles.listMeta}>{`${product.supplier_name} · ${product.supplier_code || "-"} · ${product.current_stock} ${product.qty_unit}`}</Text>
          </View>
          <Pressable style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]} onPress={() => addProduct(product)}>
            <Text style={appStyles.buttonSecondaryText}>{t("inventory.add")}</Text>
          </Pressable>
        </View>
      ))}

      <Text style={appStyles.sectionTitle}>{t("inventory.count_lines")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={appStyles.tabsRow}>
          <Pressable
            style={({ pressed }) => [
              appStyles.tabButton,
              showOnlyDifferences ? appStyles.tabButtonActive : undefined,
              pressed ? appStyles.tabButtonPressed : undefined,
            ]}
            onPress={() => setShowOnlyDifferences((prev) => !prev)}
          >
            <Text style={[appStyles.tabText, showOnlyDifferences ? appStyles.tabTextActive : undefined]}>{t("inventory.only_differences")}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {filteredLines.length === 0 ? <Text style={appStyles.tokenPreview}>{t("inventory.no_lines")}</Text> : null}
      {filteredLines.map((line) => {
        const index = draftLines.findIndex((item) => item === line);
        return (
          <View key={`${line.supplier_product}-${index}`} style={[appStyles.listItem, { alignItems: "flex-start", flexDirection: "column" }]}>
            <View style={{ width: "100%", gap: 4 }}>
              <Text style={appStyles.listTitle}>{line.supplier_product_name || "-"}</Text>
              <Text style={appStyles.listMeta}>
                {`${line.supplier_name || "-"} · ${line.supplier_code || "-"} · ${t("inventory.theoretical_short", { value: `${line.expected_qty || "0.000"} ${line.qty_unit}` })}`}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={appStyles.tabsRow}>
                {stockPoints.map((point) => (
                  <Pressable
                    key={`${line.supplier_product}-${point.id}`}
                    style={({ pressed }) => [
                      appStyles.tabButton,
                      (line.stock_point || "") === point.id ? appStyles.tabButtonActive : undefined,
                      pressed ? appStyles.tabButtonPressed : undefined,
                    ]}
                    onPress={() => updateLine(index, line.qty_value, point.id)}
                  >
                    <Text style={[appStyles.tabText, (line.stock_point || "") === point.id ? appStyles.tabTextActive : undefined]}>{point.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={appStyles.input}
                  value={line.qty_value}
                  onChangeText={(value) => updateLine(index, value)}
                  keyboardType="decimal-pad"
                  placeholder="0.000"
                  placeholderTextColor="#8aa29e"
                />
              </View>
              <Pressable style={({ pressed }) => [appStyles.tabButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => adjustLine(index, "match")}>
                <Text style={appStyles.tabText}>{t("inventory.quick_match")}</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [appStyles.tabButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => adjustLine(index, "zero")}>
                <Text style={appStyles.tabText}>0</Text>
              </Pressable>
            </View>
            <View style={{ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={({ pressed }) => [appStyles.tabButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => adjustLine(index, "dec")}>
                  <Text style={appStyles.tabText}>-1</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [appStyles.tabButton, pressed ? appStyles.tabButtonPressed : undefined]} onPress={() => adjustLine(index, "inc")}>
                  <Text style={appStyles.tabText}>+1</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [appStyles.tabButton, appStyles.tabButtonActive, pressed ? appStyles.tabButtonPressed : undefined]}
                  onPress={() => void saveSingleLine(index)}
                >
                  <Text style={[appStyles.tabText, appStyles.tabTextActive]}>{t("inventory.validate_line")}</Text>
                </Pressable>
              </View>
              <Text style={deltaTone(line.delta_qty)}>{t("inventory.delta", { value: line.delta_qty || "0.000" })}</Text>
            </View>
          </View>
        );
      })}

      <Pressable style={({ pressed }) => [appStyles.button, pressed ? appStyles.buttonPressed : undefined]} onPress={() => void saveLines()}>
        <Text style={appStyles.buttonText}>{saving ? t("inventory.processing") : t("inventory.save_lines")}</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [appStyles.buttonSecondary, pressed ? appStyles.buttonSecondaryPressed : undefined]} onPress={() => void closeSession()}>
        <Text style={appStyles.buttonSecondaryText}>{saving ? t("inventory.processing") : t("inventory.close_session")}</Text>
      </Pressable>
    </View>
  );
}
