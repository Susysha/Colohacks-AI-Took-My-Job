import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createHospital, fetchSuperAdminDashboard } from "../lib/api";
import { ActionButton, Badge, Field, InsetCard, SectionCard, StatPill } from "../ui/primitives";
import { palette } from "../ui/theme";

const initialHospitalForm = {
  name: "",
  code: "",
  address: "",
  adminName: "",
  adminEmail: "",
  adminLoginId: "",
  temporaryPassword: ""
};

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveHospitalAdminDetails(hospital, dashboard, latestProvisioned) {
  const directAdmin = hospital?.primaryAdmin;

  if (directAdmin?.name || directAdmin?.loginId || directAdmin?.email) {
    return directAdmin;
  }

  const matchedRecentAdmin = (dashboard?.recentHospitalAdmins || []).find((admin) => {
    if (hospital?.hospitalId && admin.hospitalId === hospital.hospitalId) {
      return true;
    }

    return normalizeName(admin.facility) === normalizeName(hospital?.name);
  });

  if (matchedRecentAdmin) {
    return matchedRecentAdmin;
  }

  if (latestProvisioned?.hospital?.hospitalId === hospital?.hospitalId) {
    return latestProvisioned.admin;
  }

  return null;
}

export default function SuperAdminWorkspace({ session, setStatusMessage }) {
  const [dashboard, setDashboard] = useState(null);
  const [hospitalForm, setHospitalForm] = useState(initialHospitalForm);
  const [latestProvisioned, setLatestProvisioned] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);

  async function loadDashboard() {
    const data = await fetchSuperAdminDashboard(session.accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    loadDashboard()
      .then(() => {
        setStatusMessage("Super admin dashboard loaded. You can create hospitals and provision their first admin accounts.");
      })
      .catch((error) => {
        setStatusMessage(error.message);
      });
  }, [session.accessToken, setStatusMessage]);

  async function handleCreateHospital() {
    try {
      const result = await createHospital(session.accessToken, hospitalForm);
      setLatestProvisioned(result);
      setHospitalForm(initialHospitalForm);
      await loadDashboard();
      setStatusMessage(`Created ${result.hospital.name} and provisioned ${result.admin.name}.`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  if (selectedHospital) {
    const resolvedAdmin = resolveHospitalAdminDetails(selectedHospital, dashboard, latestProvisioned);

    return (
      <>
        <SectionCard
          title="Hospital details"
          subtitle="Yahan wahi saved hospital onboarding info dikh rahi hai jo create karte waqt fill ki gayi thi."
          tone="raised"
        >
          <View style={styles.detailTopRow}>
            <Badge label={selectedHospital.code || "No code"} tone="success" />
            <ActionButton
              label="Back"
              variant="ghost"
              onPress={() => {
                setSelectedHospital(null);
                setStatusMessage("Hospital list reopened.");
              }}
            />
          </View>

          <InsetCard tone="strong">
            <Text style={styles.sectionLabel}>Hospital info</Text>
            <Text style={styles.title}>{selectedHospital.name}</Text>
            <Text style={styles.helperText}>Hospital code: {selectedHospital.code || "Not added"}</Text>
            <Text style={styles.helperText}>Address: {selectedHospital.address || "Not added"}</Text>
            <Text style={styles.helperText}>
              Created at: {selectedHospital.createdAt ? new Date(selectedHospital.createdAt).toLocaleString() : "Unknown"}
            </Text>
          </InsetCard>

          <InsetCard>
            <Text style={styles.sectionLabel}>First hospital admin</Text>
            <Text style={styles.helperText}>Name: {resolvedAdmin?.name || "Not available"}</Text>
            <Text style={styles.helperText}>Login ID: {resolvedAdmin?.loginId || "Not available"}</Text>
            <Text style={styles.helperText}>Email: {resolvedAdmin?.email || "Not added"}</Text>
          </InsetCard>

          <InsetCard>
            <Text style={styles.sectionLabel}>Current staffing snapshot</Text>
            <Text style={styles.helperText}>Admins: {selectedHospital.hospitalAdmins}</Text>
            <Text style={styles.helperText}>Doctors: {selectedHospital.doctors}</Text>
            <Text style={styles.helperText}>Nurses: {selectedHospital.nurses}</Text>
          </InsetCard>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <SectionCard
        title="Network super admin"
        subtitle="Create hospitals, provision their first admin accounts, and track network-wide onboarding."
        tone="raised"
      >
        <View style={styles.metricRow}>
          <StatPill value={String(dashboard?.summary?.totalHospitals || 0)} label="Hospitals" tone="default" />
          <StatPill value={String(dashboard?.summary?.totalHospitalAdmins || 0)} label="Hospital admins" tone="caution" />
          <StatPill value={String(dashboard?.summary?.totalDoctors || 0)} label="Doctors" tone="success" />
          <StatPill value={String(dashboard?.summary?.totalNurses || 0)} label="Nurses" tone="default" />
        </View>
        <View style={styles.badgeRow}>
          <Badge label="System-wide onboarding" tone="success" />
          <Badge label="Hospital creation locked to super admin" tone="caution" />
        </View>
      </SectionCard>

      <SectionCard
        title="Create hospital"
        subtitle="Each new hospital gets its own first hospital-admin account. That admin will then create doctors and nurses."
      >
        <Field
          label="Hospital name"
          value={hospitalForm.name}
          onChangeText={(value) => setHospitalForm((current) => ({ ...current, name: value }))}
          placeholder="Lotus Heart Institute"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Hospital code (optional)"
              value={hospitalForm.code}
              onChangeText={(value) => setHospitalForm((current) => ({ ...current, code: value }))}
              placeholder="LHI"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Address (optional)"
              value={hospitalForm.address}
              onChangeText={(value) => setHospitalForm((current) => ({ ...current, address: value }))}
              placeholder="Medical District, Jaipur"
            />
          </View>
        </View>
        <Field
          label="First hospital admin name"
          value={hospitalForm.adminName}
          onChangeText={(value) => setHospitalForm((current) => ({ ...current, adminName: value }))}
          placeholder="Ritika Singh"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Admin login ID (optional)"
              value={hospitalForm.adminLoginId}
              onChangeText={(value) => setHospitalForm((current) => ({ ...current, adminLoginId: value }))}
              placeholder="HOSP-ADMIN-4301"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Admin email (optional)"
              value={hospitalForm.adminEmail}
              onChangeText={(value) => setHospitalForm((current) => ({ ...current, adminEmail: value }))}
              placeholder="admin@lotusheart.org"
            />
          </View>
        </View>
        <Field
          label="Temporary password (optional)"
          value={hospitalForm.temporaryPassword}
          onChangeText={(value) => setHospitalForm((current) => ({ ...current, temporaryPassword: value }))}
          placeholder="Leave blank to auto-generate"
          secureTextEntry
        />
        <Text style={styles.helperText}>
          The first hospital admin will still be forced to change this temporary password on first login.
        </Text>
        <ActionButton label="Create hospital + admin" onPress={handleCreateHospital} />
        {latestProvisioned ? (
          <InsetCard tone="strong">
            <Text style={styles.sectionLabel}>Latest hospital provisioning</Text>
            <Text style={styles.helperText}>Hospital: {latestProvisioned.hospital.name}</Text>
            <Text style={styles.helperText}>Code: {latestProvisioned.hospital.code}</Text>
            <Text style={styles.helperText}>Admin login ID: {latestProvisioned.credentials.loginId}</Text>
            <Text style={styles.helperText}>Temporary password: {latestProvisioned.credentials.temporaryPassword}</Text>
          </InsetCard>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Hospitals"
        subtitle="Any hospital par tap karo to uski saved details aur filled onboarding info open ho jayegi."
      >
        {dashboard?.hospitals?.length ? (
          dashboard.hospitals.map((hospital) => (
            <Pressable
              key={hospital.hospitalId}
              onPress={() => {
                setSelectedHospital(hospital);
                setStatusMessage(`${hospital.name} details opened.`);
              }}
              style={({ pressed }) => [styles.hospitalCardWrap, pressed && styles.hospitalCardPressed]}
            >
              <InsetCard>
                <Text style={styles.title}>{hospital.name}</Text>
                <Text style={styles.helperText}>
                  {hospital.code} | {hospital.address || "Address not added"}
                </Text>
                <Text style={styles.helperText}>
                  Admins: {hospital.hospitalAdmins} | Doctors: {hospital.doctors} | Nurses: {hospital.nurses}
                </Text>
              </InsetCard>
            </Pressable>
          ))
        ) : (
          <Text style={styles.helperText}>No hospitals created yet.</Text>
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
  detailTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
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
  hospitalCardWrap: {
    borderRadius: 18
  },
  hospitalCardPressed: {
    opacity: 0.86
  },
  title: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 18
  }
});
