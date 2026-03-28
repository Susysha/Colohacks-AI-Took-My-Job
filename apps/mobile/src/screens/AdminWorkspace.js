import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { createStaff, deactivateStaff, fetchAdminDashboard, updateStaff } from "../lib/api";
import { ActionButton, Badge, Field, InsetCard, SectionCard, StatPill } from "../ui/primitives";
import { palette } from "../ui/theme";

const initialStaffForm = {
  name: "",
  role: "doctor",
  department: "",
  facility: "",
  email: ""
};

export default function AdminWorkspace({ session, setStatusMessage }) {
  const [dashboard, setDashboard] = useState(null);
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [latestCredentials, setLatestCredentials] = useState(null);

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
    try {
      const result = await createStaff(session.accessToken, {
        ...staffForm,
        facility: staffForm.facility || session.user.facility
      });
      setLatestCredentials(result.credentials);
      setStaffForm(initialStaffForm);
      await loadDashboard();
      setStatusMessage(`Created ${result.staff.name} with login ID ${result.credentials.loginId}.`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handleDeactivate(userId, name) {
    try {
      await deactivateStaff(session.accessToken, userId);
      await loadDashboard();
      setStatusMessage(`${name} has been removed from active staff access.`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handleResetPassword(userId, name) {
    try {
      const result = await updateStaff(session.accessToken, userId, { resetPassword: true });
      setLatestCredentials(result.credentials);
      await loadDashboard();
      setStatusMessage(`Temporary password reset for ${name}.`);
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

      <SectionCard
        title="Create staff account"
        subtitle="Only hospital admins can create doctors and nurses. Each new account gets a login ID and temporary password."
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
            <Field
              label="Facility"
              value={staffForm.facility}
              onChangeText={(value) => setStaffForm((current) => ({ ...current, facility: value }))}
              placeholder={session.user.facility}
            />
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
        <ActionButton label="Create staff credentials" onPress={handleCreateStaff} />
        {latestCredentials ? (
          <InsetCard tone="strong">
            <Text style={styles.sectionLabel}>Latest generated credentials</Text>
            <Text style={styles.helperText}>Login ID: {latestCredentials.loginId}</Text>
            <Text style={styles.helperText}>Temporary password: {latestCredentials.temporaryPassword}</Text>
          </InsetCard>
        ) : null}
      </SectionCard>

      {dashboard?.departmentBreakdown?.length ? (
        <SectionCard
          title="Department breakdown"
          subtitle="Quick view of how staff is distributed across the hospital."
        >
          {dashboard.departmentBreakdown.map((item) => (
            <InsetCard key={item.department}>
              <Text style={styles.staffTitle}>{item.department}</Text>
              <Text style={styles.helperText}>
                {item.staffCount} staff | {item.doctors} doctors | {item.nurses} nurses
              </Text>
            </InsetCard>
          ))}
        </SectionCard>
      ) : null}

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
                <View style={styles.half}>
                  <ActionButton
                    label="Reset password"
                    variant="secondary"
                    onPress={() => handleResetPassword(member.userId, member.name)}
                  />
                </View>
                <View style={styles.half}>
                  <ActionButton
                    label="Remove access"
                    variant="ghost"
                    onPress={() => handleDeactivate(member.userId, member.name)}
                  />
                </View>
              </View>
            </InsetCard>
          ))
        ) : (
          <Text style={styles.helperText}>No staff records yet.</Text>
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
                {log.actor} | {log.department || "No department"} | {log.patientName || "Unknown patient"}
              </Text>
              <Text style={styles.helperText}>
                Patient ID: {log.patientId || "Unknown"} | {new Date(log.timestamp).toLocaleString()}
              </Text>
            </InsetCard>
          ))
        ) : (
          <Text style={styles.helperText}>QR activity will appear here after doctors generate or scan codes.</Text>
        )}
      </SectionCard>

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
                {item.department || "No department"} | Access count: {item.accessCount}
              </Text>
            </InsetCard>
          ))
        ) : (
          <Text style={styles.helperText}>Doctor access counts will appear after QR scans happen.</Text>
        )}
      </SectionCard>
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
  }
});
