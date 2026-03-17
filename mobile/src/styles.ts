import { Platform, StyleSheet, TextStyle } from "react-native";

const COLORS = {
  // Light theme
  bg: "#f5f7f5",        // Leggermente più luminoso
  surface: "#ffffff",    // Pure white per contrast
  border: "#d4dfd8",    // More visible
  borderSoft: "#e5ede9",
  text: "#1a3f3b",      // Leggermente più scuro
  textMuted: "#5a7370", // Migliore contrasto
  textMuted2: "#a0ada9", // Nuovo grey più scuro per placeholder
  
  // Primary - Mantieni teal ma più saturi
  primary: "#1b8f89",    // Più scuro e saturo
  primaryPressed: "#166c67",
  primarySoft: "#e6f2f0",
  primaryLight: "#f0fffe",
  
  // Accent
  accent: "#1d6bb3",     // Più scuro
  accentLight: "#e8f1ff",
  
  // Semantic - Più saturi per visibilità
  warn: "#c97e1c",       // Più saturo
  critical: "#c72e42",   // Più saturo
  success: "#2a8f7f",    // Più saturo
  info: "#1d6bb3",
  
  // Auth theme - Dark con miglior contrasto
  authBg: "#0f1618",
  authSurface: "#1a2427",
  authBorder: "#3d5d63",
  authText: "#f2f9f7",
  authTextMuted: "#b8d0ce",
};

const FONT = Platform.select({ ios: "System", android: "sans-serif", default: "System" });

// Typography system
const TYPOGRAPHY = {
  h1: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  subtitle1: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  subtitle2: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  body1: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20, // +40% miglioramento readability
  },
  body2: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  caption: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
  },
  overline: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
    letterSpacing: 0.8,
  },
} satisfies Record<string, TextStyle>;

// Spacing system
const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// Elevation utilities
const ELEVATION = {
  none: {
    shadowColor: "transparent",
    elevation: 0,
  },
  sm: {
    shadowColor: COLORS.text,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.text,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.text,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
};

export const appStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  authSafe: { flex: 1, backgroundColor: COLORS.authBg },
  container: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xxl },

  authLanding: {
    flex: 1,
    minHeight: 640,
    justifyContent: "center",
    gap: 10,
    paddingVertical: 22,
  },
  authLogoCard: {
    backgroundColor: "#f7faf9",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#1f3436",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 2,
  },
  authTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#eff8f6",
    textAlign: "center",
    fontFamily: FONT,
    letterSpacing: 0.2,
  },
  authSubtitle: {
    fontSize: 12,
    color: "#a8c2be",
    textAlign: "center",
    fontFamily: FONT,
    marginBottom: 4,
  },
  authCard: {
    backgroundColor: COLORS.authSurface,
    borderRadius: 14,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.authBorder,
  },
  authCardTitle: { ...TYPOGRAPHY.subtitle1, color: COLORS.authText, fontFamily: FONT },
  authInput: {
    borderWidth: 1.5, // Maggior visibilità
    borderColor: COLORS.authBorder,
    borderRadius: 12, // Modern rounded
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44, // iOS standard
    backgroundColor: COLORS.authSurface,
    color: COLORS.authText,
    fontSize: 14, // Body2 size
    fontFamily: FONT,
  },
  authButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12, // Modern
    minHeight: 44, // iOS standard
    justifyContent: "center",
    marginTop: SPACING.sm,
  },
  authButtonPressed: { backgroundColor: COLORS.primaryPressed },
  authButtonText: { color: "#ffffff", textAlign: "center", ...TYPOGRAPHY.subtitle2, fontFamily: FONT },
  authTokenPreview: { color: COLORS.authTextMuted, ...TYPOGRAPHY.overline, fontFamily: FONT },

  title: { ...TYPOGRAPHY.h2, color: COLORS.text, fontFamily: FONT },
  subtitle: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontFamily: FONT },

  tabsRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap", marginBottom: SPACING.sm },
  tabButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 40,
    justifyContent: "center",
  },
  tabButtonPressed: { backgroundColor: COLORS.primarySoft, borderColor: "#a8c1bd" },
  tabButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: COLORS.textMuted, ...TYPOGRAPHY.caption, fontFamily: FONT },
  tabTextActive: { color: "#ffffff" },

  chipWithDelete: { flexDirection: "row", alignItems: "center", gap: 4 },
  chipDelete: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  chipDeleteText: { color: COLORS.critical, fontWeight: "700", fontSize: 11, fontFamily: FONT },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    ...ELEVATION.md,
  },

  label: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted, marginTop: 4, fontFamily: FONT },
  input: {
    borderWidth: 1.5, // Maggior visibilità
    borderColor: COLORS.border,
    borderRadius: 12, // Modern rounded
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44, // iOS standard
    backgroundColor: COLORS.surface,
    fontSize: 14, // Body2 size
    color: COLORS.text,
    fontFamily: FONT,
  },

  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12, // Modern
    marginTop: SPACING.sm,
    minHeight: 44, // iOS standard
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: COLORS.primaryPressed },
  buttonText: { color: "white", textAlign: "center", ...TYPOGRAPHY.subtitle2, fontFamily: FONT },

  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonSecondaryPressed: { backgroundColor: COLORS.primarySoft },
  buttonSecondaryText: { color: COLORS.primary, textAlign: "center", ...TYPOGRAPHY.subtitle2, fontFamily: FONT },

  buttonDanger: {
    backgroundColor: COLORS.critical,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonDangerPressed: { backgroundColor: "#a91f33" },

  sectionTitle: { ...TYPOGRAPHY.h3, color: COLORS.text, fontFamily: FONT, marginBottom: SPACING.xs },
  infoText: { color: COLORS.primary, ...TYPOGRAPHY.caption, fontFamily: FONT },

  linkButton: { paddingVertical: 4 },
  linkText: { color: COLORS.accent, ...TYPOGRAPHY.caption, fontFamily: FONT },

  draftRow: { borderTopWidth: 1, borderTopColor: "#e8efed", paddingTop: SPACING.sm, gap: SPACING.xs },

  smallButton: { backgroundColor: "#3e617b", paddingVertical: SPACING.sm, borderRadius: 10, alignItems: "center" },
  smallButtonText: { color: "white", ...TYPOGRAPHY.caption, fontFamily: FONT },

  error: { color: COLORS.critical, ...TYPOGRAPHY.caption, fontFamily: FONT },
  tokenPreview: { color: COLORS.textMuted, ...TYPOGRAPHY.overline, fontFamily: FONT },
  warn: { color: COLORS.warn, ...TYPOGRAPHY.caption, fontFamily: FONT },
  critical: { color: COLORS.critical, ...TYPOGRAPHY.caption, fontFamily: FONT },
  success: { color: COLORS.success, ...TYPOGRAPHY.caption, fontFamily: FONT },

  cameraPreview: {
    width: "100%",
    height: 320,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0b0f10",
  },

  bottomNavWrap: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: Platform.select({ android: 56, ios: 10, default: 14 }),
    alignItems: "center",
  },
  bottomNavHint: {
    marginBottom: 5,
    backgroundColor: COLORS.text,
    color: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "600",
    fontFamily: FONT,
  },
  bottomNav: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, // Top border, not all-around
    borderTopColor: COLORS.border,
    borderRadius: 0, // Extend edge-to-edge
    paddingVertical: SPACING.sm,
    paddingHorizontal: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 2,
    ...ELEVATION.lg,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    minHeight: 56, // iOS standard tab height
    gap: SPACING.xs,
  },
  bottomNavItemActive: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 10,
    marginVertical: SPACING.xs,
    marginHorizontal: SPACING.xs,
  },
  bottomNavIcon: {
    fontSize: 24,
    color: COLORS.textMuted,
  },
  bottomNavIconActive: {
    color: COLORS.primary,
    fontSize: 26, // Slightly larger
  },
  bottomNavText: { ...TYPOGRAPHY.overline, color: COLORS.textMuted, fontFamily: FONT, marginTop: 2 },
  bottomNavTextActive: { ...TYPOGRAPHY.overline, color: COLORS.primary, fontWeight: "700", fontFamily: FONT, marginTop: 2 },
});
