import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { palette, radii, shadow } from "./theme";

export function BackgroundGlow() {
  return (
    <>
      <View style={[styles.glow, styles.glowA]} pointerEvents="none" />
      <View style={[styles.glow, styles.glowB]} pointerEvents="none" />
    </>
  );
}

export function Badge({ label, tone = "default" }) {
  return (
    <View style={[styles.badge, badgeToneStyles[tone] || badgeToneStyles.default]}>
      <Text style={[styles.badgeText, badgeTextToneStyles[tone] || badgeTextToneStyles.default]}>{label}</Text>
    </View>
  );
}

export function StatPill({ value, label, tone = "default" }) {
  return (
    <View style={[styles.statPill, statToneStyles[tone] || statToneStyles.default]}>
      <Text style={[styles.statValue, statTextToneStyles[tone] || statTextToneStyles.default]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function SectionCard({ title, subtitle, tone = "default", children }) {
  return (
    <View style={[styles.card, cardToneStyles[tone] || cardToneStyles.default]}>
      {(title || subtitle) && (
        <View style={styles.sectionHeader}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secureTextEntry = false,
  keyboardType = "default"
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

export function ActionButton({ label, onPress, variant = "primary" }) {
  return (
    <Pressable style={({ pressed }) => [styles.button, buttonToneStyles[variant] || buttonToneStyles.primary, pressed && styles.buttonPressed]} onPress={onPress}>
      <Text style={[styles.buttonText, buttonTextToneStyles[variant] || buttonTextToneStyles.primary]}>{label}</Text>
    </Pressable>
  );
}

export function InsetCard({ children, tone = "soft" }) {
  return <View style={[styles.insetCard, insetToneStyles[tone] || insetToneStyles.soft]}>{children}</View>;
}

const badgeToneStyles = StyleSheet.create({
  default: {
    backgroundColor: "#eef5f3",
    borderColor: "#d9e8e4"
  },
  success: {
    backgroundColor: "#e8f7f3",
    borderColor: "#b7e3db"
  },
  caution: {
    backgroundColor: "#fff4df",
    borderColor: "#f2ddb1"
  },
  danger: {
    backgroundColor: "#fff0ec",
    borderColor: "#f3ccc4"
  }
});

const badgeTextToneStyles = StyleSheet.create({
  default: { color: palette.textSoft },
  success: { color: palette.mint },
  caution: { color: palette.amber },
  danger: { color: palette.coral }
});

const statToneStyles = StyleSheet.create({
  default: {
    backgroundColor: "#f8fbfa",
    borderColor: palette.line
  },
  success: {
    backgroundColor: "#eefaf7",
    borderColor: "#cce8e1"
  },
  caution: {
    backgroundColor: "#fff8e8",
    borderColor: "#eddcb5"
  },
  danger: {
    backgroundColor: "#fff3ef",
    borderColor: "#efcec7"
  }
});

const statTextToneStyles = StyleSheet.create({
  default: { color: palette.text },
  success: { color: palette.mint },
  caution: { color: palette.amber },
  danger: { color: palette.coral }
});

const cardToneStyles = StyleSheet.create({
  default: {
    backgroundColor: palette.panel,
    borderColor: palette.line
  },
  raised: {
    backgroundColor: palette.panelRaised,
    borderColor: palette.lineBright
  },
  danger: {
    backgroundColor: palette.surfaceDanger,
    borderColor: "#efcec7"
  },
  caution: {
    backgroundColor: palette.surfaceCaution,
    borderColor: "#eddcb5"
  },
  neutral: {
    backgroundColor: palette.surfaceNeutral,
    borderColor: "#cce8e1"
  }
});

const buttonToneStyles = StyleSheet.create({
  primary: {
    backgroundColor: palette.teal,
    borderColor: palette.teal
  },
  secondary: {
    backgroundColor: "#ffffff",
    borderColor: palette.lineBright
  },
  ghost: {
    backgroundColor: "#f7faf9",
    borderColor: palette.line
  }
});

const buttonTextToneStyles = StyleSheet.create({
  primary: { color: "#ffffff" },
  secondary: { color: palette.text },
  ghost: { color: palette.textSoft }
});

const insetToneStyles = StyleSheet.create({
  soft: {
    backgroundColor: "#f8fbfa",
    borderColor: palette.line
  },
  strong: {
    backgroundColor: "#f1f7f6",
    borderColor: "#d9e5e2"
  }
});

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderRadius: radii.pill
  },
  glowA: {
    width: 240,
    height: 240,
    backgroundColor: "rgba(22,163,148,0.08)",
    top: -60,
    right: -70
  },
  glowB: {
    width: 190,
    height: 190,
    backgroundColor: "rgba(15,140,127,0.06)",
    bottom: 160,
    left: -80
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  statPill: {
    flex: 1,
    minWidth: 92,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 4
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800"
  },
  statLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  card: {
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    gap: 14,
    ...shadow
  },
  sectionHeader: {
    gap: 6
  },
  cardTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "800"
  },
  cardSubtitle: {
    color: palette.textSoft,
    lineHeight: 20
  },
  field: {
    gap: 8
  },
  label: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  input: {
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fbfdfd",
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.lineBright,
    fontSize: 16
  },
  textarea: {
    minHeight: 116,
    textAlignVertical: "top"
  },
  button: {
    minHeight: 52,
    borderRadius: radii.md,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonPressed: {
    opacity: 0.86
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800"
  },
  insetCard: {
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    gap: 8
  }
});
