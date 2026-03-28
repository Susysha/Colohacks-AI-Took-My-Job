import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createStaff, fetchAdminDashboard, updateStaff } from "../lib/api";
import { ActionButton, Badge, Field, InsetCard, SectionCard, StatPill } from "../ui/primitives";
import { palette } from "../ui/theme";

const initialStaffForm = {
  name: "",
  role: "doctor",
  department: "",
  email: "",
  password: ""
};

const adminPanels = [
  { key: "create", label: "Create", shortLabel: "CR" },
  { key: "staff", label: "Staff", shortLabel: "ST" },
  { key: "logs", label: "Logs", shortLabel: "LG" },
  { key: "insights", label: "Stats", shortLabel: "IN" }
];

export default function AdminWorkspace({ session, setStatusMessage }) {
  const [dashboard, setDashboard] = useState(null);
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [latestCredentials, setLatestCredentials] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [selectedActiveRole, setSelectedActiveRole] = useState(null);

  const activeDoctors = (dashboard?.staff || [])
    .filter((member) => member.isActive && member.role === "doctor")
    .sort((left, right) => left.name.localeCompare(right.name));
  const activeNurses = (dashboard?.staff || [])
    .filter((member) => member.isActive && member.role === "nurse")
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedRoleMembers = selectedActiveRole === "doctor"
    ? activeDoctors
    : selectedActiveRole === "nurse"
      ? activeNurses
      : [];
  const selectedRoleTitle = selectedActiveRole === "doctor" ? "Active doctors" : "Active nurses";

  async function loadDashboard() {
    const data = await fetchAdminDashboard(session.accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    loadDashboard()
      .then(() => {
        setStatusMessage("Hospital dashboard loaded. You can manage staff and audit QR access.");
      })
      .catch((error) => {
        setStatusMessage(error.message);
      });
  }, [session.accessToken, setStatusMessage]);

  async function handleCreateStaff() {
    if (isCreatingStaff) {
      return;
    }

    setIsCreatingStaff(true);
    try {
      const result = await createStaff(session.accessToken, staffForm);
      setLatestCredentials(result.credentials);
      setStaffForm(initialStaffForm);
      await loadDashboard();
      setStatusMessage(`Created ${result.staff.name} with login ID ${result.credentials.loginId}.`);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setIsCreatingStaff(false);
    }
  }

  async function handleAccessToggle(member) {
    try {
      await updateStaff(session.accessToken, member.userId, { isActive: !member.isActive });
      await loadDashboard();
      setStatusMessage(
        member.isActive
          ? `${member.name} access removed.`
          : `${member.name} access granted again.`
      );
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  return (
    <>
      <SectionCard
        title="Hospital admin dashboard"
        subtitle="Full control over doctors, nurses, and every QR interaction inside your hospital."
        tone="raised"
      >
        <View style={styles.metricRow}>
          <StatPill value={String(dashboard?.summary?.totalStaff || 0)} label="Active staff" tone="default" />
          <StatPill value={String(dashboard?.summary?.totalDoctors || 0)} label="Doctors" tone="success" />
          <StatPill value={String(dashboard?.summary?.totalNurses || 0)} label="Nurses" tone="caution" />
        </View>
        <View style={styles.badgeRow}>
          <Badge label={`Facility: ${session.user.facility}`} tone="default" />
          <Badge label="QR logs tracked" tone="success" />
          <Badge label="Self-registration disabled" tone="caution" />
        </View>
      </SectionCard>

      <View style={styles.dockWrap}>
        <View style={styles.dockBar}>
          {adminPanels.map((panel) => {
            const isActive = activePanel === panel.key;
            return (
              <Pressable
                key={panel.key}
                accessibilityRole="button"
                accessibilityLabel={`Open ${panel.label}`}
                onPress={() => setActivePanel((current) => (current === panel.key ? null : panel.key))}
                style={({ pressed }) => [
                  styles.dockItem,
                  isActive && styles.dockItemActive,
                  pressed && styles.dockItemPressed
                ]}
              >
                <View style={[styles.dockIcon, isActive && styles.dockIconActive]}>
                  <Text style={[styles.dockIconText, isActive && styles.dockIconTextActive]}>{panel.shortLabel}</Text>
                </View>
                <Text style={[styles.dockLabel, isActive && styles.dockLabelActive]}>{panel.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {activePanel ? (
        <InsetCard tone="soft">
          <Text style={styles.sectionLabel}>
            {adminPanels.find((panel) => panel.key === activePanel)?.label || "Dashboard"}
          </Text>
          <Text style={styles.helperText}>Sirf selected section ki info dikh rahi hai. Baaki cards hidden hain.</Text>
        </InsetCard>
      ) : (
        <InsetCard tone="soft">
          <Text style={styles.sectionLabel}>Select a section</Text>
          <Text style={styles.helperText}>Neeche ke menu se jis section par tap karoge, sirf wahi info khulegi.</Text>
        </InsetCard>
      )}

      {activePanel === "create" ? (
        <>
          <SectionCard
            title="Create staff account"
            subtitle="Only hospital admins can create doctors and nurses. Set a temporary password yourself or leave it blank to auto-generate one."
          >
            <Field
              label="Staff name"
              value={staffForm.name}
              onChangeText={(value) => setStaffForm((current) => ({ ...current, name: value }))}
              placeholder="Dr Ritu Sharma"
            />
            <View style={styles.row}>
              <View style={styles.half}>
                <Field
                  label="Role"
                  value={staffForm.role}
                  onChangeText={(value) => setStaffForm((current) => ({ ...current, role: value.toLowerCase() }))}
                  placeholder="doctor"
                />
              </View>
              <View style={styles.half}>
                <Field
                  label="Department"
                  value={staffForm.department}
                  onChangeText={(value) => setStaffForm((current) => ({ ...current, department: value }))}
                  placeholder="Cardiology"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <InsetCard>
                  <Text style={styles.sectionLabel}>Assigned hospital</Text>
                  <Text style={styles.helperText}>{session.user.facility}</Text>
                </InsetCard>
              </View>
              <View style={styles.half}>
                <Field
                  label="Email (optional)"
                  value={staffForm.email}
                  onChangeText={(value) => setStaffForm((current) => ({ ...current, email: value }))}
                  placeholder="ritu@hospital.org"
                />
              </View>
            </View>
            <Field
              label="Temporary password (optional)"
              value={staffForm.password}
              onChangeText={(value) => setStaffForm((current) => ({ ...current, password: value }))}
              placeholder="Leave blank to auto-generate"
              secureTextEntry
            />
            <Text style={styles.helperText}>
              Doctors and nurses will still be forced to change this temporary password on first login.
            </Text>
            <ActionButton
              label={isCreatingStaff ? "Creating staff..." : "Create staff credentials"}
              onPress={handleCreateStaff}
              disabled={isCreatingStaff}
            />
            {latestCredentials ? (
              <InsetCard tone="strong">
                <Text style={styles.sectionLabel}>Latest staff credentials</Text>
                <Text style={styles.helperText}>Login ID: {latestCredentials.loginId}</Text>
                <Text style={styles.helperText}>Temporary password: {latestCredentials.temporaryPassword}</Text>
                <Text style={styles.helperText}>
                  Source: {latestCredentials.passwordSource === "manual" ? "Set by hospital admin" : "Auto-generated"}
                </Text>
              </InsetCard>
            ) : null}
          </SectionCard>
        </>
      ) : null}

      {activePanel === "staff" ? (
        <>
          <SectionCard
            title="Active staff breakdown"
            subtitle="Tap active doctors or active nurses to see exactly who is active right now."
          >
            <View style={styles.breakdownGrid}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show active doctors"
                onPress={() => setSelectedActiveRole((current) => (current === "doctor" ? null : "doctor"))}
                style={({ pressed }) => [
                  styles.breakdownCard,
                  selectedActiveRole === "doctor" && styles.breakdownCardActive,
                  pressed && styles.breakdownCardPressed
                ]}
              >
                <Text style={styles.breakdownEyebrow}>Tap to view</Text>
                <Text style={styles.staffTitle}>Active doctors</Text>
                <Text style={styles.helperText}>{activeDoctors.length} active</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show active nurses"
                onPress={() => setSelectedActiveRole((current) => (current === "nurse" ? null : "nurse"))}
                style={({ pressed }) => [
                  styles.breakdownCard,
                  selectedActiveRole === "nurse" && styles.breakdownCardActive,
                  pressed && styles.breakdownCardPressed
                ]}
              >
                <Text style={styles.breakdownEyebrow}>Tap to view</Text>
                <Text style={styles.staffTitle}>Active nurses</Text>
                <Text style={styles.helperText}>{activeNurses.length} active</Text>
              </Pressable>
            </View>

            {selectedActiveRole ? (
              <InsetCard tone="strong">
                <Text style={styles.sectionLabel}>{selectedRoleTitle}</Text>
                {selectedRoleMembers.length ? (
                  selectedRoleMembers.map((member) => (
                    <View key={member.userId} style={styles.breakdownMemberRow}>
                      <Text style={styles.breakdownMemberName}>{member.name}</Text>
                      <Text style={styles.helperText}>
                        {member.loginId} | {member.department || "Unassigned"}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.helperText}>
                    No active {selectedActiveRole === "doctor" ? "doctors" : "nurses"} right now.
                  </Text>
                )}
              </InsetCard>
            ) : (
              <InsetCard tone="soft">
                <Text style={styles.helperText}>Tap active doctors ya active nurses to open the live list.</Text>
              </InsetCard>
            )}
          </SectionCard>

          <SectionCard
            title="Staff roster"
            subtitle="Doctors and nurses created by the hospital stay visible here, along with account status."
          >
            {dashboard?.staff?.length ? (
              dashboard.staff.map((member) => (
                <InsetCard key={member.userId}>
                  <View style={styles.staffHeader}>
                    <View style={styles.staffInfo}>
                      <Text style={styles.staffTitle}>{member.name}</Text>
                      <Text style={styles.helperText}>
                        {member.role} | {member.department || "Unassigned"} | {member.loginId}
                      </Text>
                    </View>
                    <Badge label={member.isActive ? "Active" : "Inactive"} tone={member.isActive ? "success" : "danger"} />
                  </View>
                  <View style={styles.row}>
                    <View style={styles.fullWidth}>
                      <ActionButton
                        label={member.isActive ? "Remove access" : "Grant access"}
                        variant="ghost"
                        onPress={() => handleAccessToggle(member)}
                      />
                    </View>
                  </View>
                </InsetCard>
              ))
            ) : (
              <Text style={styles.helperText}>No staff records yet.</Text>
            )}
          </SectionCard>
        </>
      ) : null}

      {activePanel === "logs" ? (
        <>
          <SectionCard
            title="Doctor patient access"
            subtitle="Track exactly which doctor opened which patient record, with both IDs."
          >
            {dashboard?.doctorPatientAccess?.length ? (
              dashboard.doctorPatientAccess.map((item, index) => (
                <InsetCard key={`${item.handoffId}-${item.timestamp}-${index}`} tone="strong">
                  <Text style={styles.staffTitle}>
                    {item.doctorName} ({item.doctorLoginId || item.doctorId || "Unknown doctor ID"})
                  </Text>
                  <Text style={styles.helperText}>{item.department || "No department"} | {item.accessFacility || "Unknown hospital"}</Text>
                  <Text style={styles.helperText}>
                    {item.patientName} ({item.patientId || "Unknown patient ID"})
                  </Text>
                  <Text style={styles.helperText}>{new Date(item.timestamp).toLocaleString()}</Text>
                </InsetCard>
              ))
            ) : (
              <Text style={styles.helperText}>Doctor-patient access entries will appear here after receiver-side scans happen.</Text>
            )}
          </SectionCard>

          <SectionCard
            title="QR activity logs"
            subtitle="Every scan, access, and acknowledgement is visible to the hospital admin."
          >
            {dashboard?.qrActivityLogs?.length ? (
              dashboard.qrActivityLogs.map((log, index) => (
                <InsetCard key={`${log.handoffId}-${log.timestamp}-${index}`} tone="strong">
                  <Text style={styles.staffTitle}>{log.eventType}</Text>
                  <Text style={styles.helperText}>
                    {log.doctorName || log.actor} ({log.doctorLoginId || log.doctorId || "Unknown doctor ID"}) | {log.department || "No department"} | {log.accessFacility || "Unknown hospital"}
                  </Text>
                  <Text style={styles.helperText}>
                    {log.patientName || "Unknown patient"} ({log.patientId || "Unknown"}) | {new Date(log.timestamp).toLocaleString()}
                  </Text>
                </InsetCard>
              ))
            ) : (
              <Text style={styles.helperText}>QR activity will appear here after doctors generate or scan codes.</Text>
            )}
          </SectionCard>
        </>
      ) : null}

      {activePanel === "insights" ? (
        <>
          <SectionCard
            title="Patient access summary"
            subtitle="See how many doctors opened each patient record and how often it was viewed."
          >
            {dashboard?.patientAccessSummary?.length ? (
              dashboard.patientAccessSummary.map((item) => (
                <InsetCard key={item.patientId} tone="strong">
                  <Text style={styles.staffTitle}>{item.patientName}</Text>
                  <Text style={styles.helperText}>
                    Patient ID: {item.patientId} | Accesses: {item.accessCount}
                  </Text>
                  <Text style={styles.helperText}>Unique doctors: {item.uniqueDoctors}</Text>
                </InsetCard>
              ))
            ) : (
              <Text style={styles.helperText}>No patient-level QR access has been tracked yet.</Text>
            )}
          </SectionCard>

          <SectionCard
            title="Doctor access summary"
            subtitle="Track which doctors are opening the most patient handoff records."
          >
            {dashboard?.doctorAccessSummary?.length ? (
              dashboard.doctorAccessSummary.map((item) => (
                <InsetCard key={item.doctorId || item.doctorName}>
                  <Text style={styles.staffTitle}>{item.doctorName}</Text>
                  <Text style={styles.helperText}>
                    {item.doctorLoginId || item.doctorId || "Unknown doctor ID"} | {item.department || "No department"} | Access count: {item.accessCount}
                  </Text>
                </InsetCard>
              ))
            ) : (
              <Text style={styles.helperText}>Doctor access counts will appear after QR scans happen.</Text>
            )}
          </SectionCard>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  dockWrap: {
    paddingHorizontal: 8
  },
  dockBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 10,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  dockItem: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  dockItemActive: {
    transform: [{ translateY: -12 }]
  },
  dockItemPressed: {
    opacity: 0.86
  },
  dockIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: palette.lineBright,
    backgroundColor: "#f7fbfa",
    alignItems: "center",
    justifyContent: "center"
  },
  dockIconActive: {
    backgroundColor: palette.teal,
    borderColor: palette.teal
  },
  dockIconText: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.8
  },
  dockIconTextActive: {
    color: "#ffffff"
  },
  dockLabel: {
    color: palette.textSoft,
    fontSize: 12,
    fontWeight: "700"
  },
  dockLabelActive: {
    color: palette.text
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
    flexWrap: "wrap"
  },
  half: {
    flex: 1,
    minWidth: 132
  },
  fullWidth: {
    width: "100%"
  },
  sectionLabel: {
    color: palette.mint,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  helperText: {
    color: palette.textSoft,
    lineHeight: 20
  },
  staffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  staffInfo: {
    flex: 1,
    gap: 4
  },
  staffTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 18
  },
  breakdownGrid: {
    gap: 12
  },
  breakdownCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#f8fbfa",
    padding: 16,
    gap: 8
  },
  breakdownCardActive: {
    borderColor: palette.teal,
    backgroundColor: "#ecf8f6"
  },
  breakdownCardPressed: {
    opacity: 0.86
  },
  breakdownEyebrow: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  breakdownMemberRow: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  breakdownMemberName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800"
  }
});
