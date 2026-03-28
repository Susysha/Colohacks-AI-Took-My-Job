import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { changePassword, fetchDoctorActivity, login } from "./src/lib/api";
import AdminWorkspace from "./src/screens/AdminWorkspace";
import NurseWorkspace from "./src/screens/NurseWorkspace";
import ReceiverWorkspace from "./src/screens/ReceiverWorkspace";
import SenderWorkspace from "./src/screens/SenderWorkspace";
import SuperAdminWorkspace from "./src/screens/SuperAdminWorkspace";
import { ActionButton, Badge, BackgroundGlow, Field, InsetCard, SectionCard } from "./src/ui/primitives";
import { palette, radii } from "./src/ui/theme";

const doctorWorkspaceCopy = {
  sender: {
    eyebrow: "Doctor sender tools",
    title: "Generate the QR handoff",
    subtitle: "Create the structured transfer, run safety checks, and generate the tracked QR or secure link."
  },
  receiver: {
    eyebrow: "Doctor receiver tools",
    title: "Scan and access the patient record",
    subtitle: "Only doctors can scan the QR, open the patient handoff, and submit arrival acknowledgement."
  }
};

function WorkspaceCard({ title, subtitle, accent, onPress }) {
  return (
    <Pressable style={styles.roleCard} onPress={onPress}>
      <View style={[styles.roleAccent, { backgroundColor: accent }]} />
      <Text style={styles.roleTitle}>{title}</Text>
      <Text style={styles.roleSubtitle}>{subtitle}</Text>
      <Text style={[styles.roleAction, { color: accent }]}>Open</Text>
    </Pressable>
  );
}

function LoginCard({ credentials, setCredentials, handleLogin }) {
  return (
    <SectionCard
      title="Hospital-controlled sign in"
      subtitle="No self-registration. Super admin creates hospitals, hospital admins create staff, and every login uses issued credentials."
      tone="raised"
    >
      <Field
        label="Login ID or email"
        value={credentials.identifier}
        onChangeText={(value) => setCredentials((current) => ({ ...current, identifier: value }))}
        placeholder="DOC-1001 or admin@medirelay.demo"
      />
      <Field
        label="Password"
        value={credentials.password}
        onChangeText={(value) => setCredentials((current) => ({ ...current, password: value }))}
        placeholder="medirelay123"
        secureTextEntry
      />
      <ActionButton label="Sign in" onPress={handleLogin} />
      <View style={styles.demoBox}>
        <Text style={styles.demoTitle}>Demo credentials</Text>
        <Text style={styles.demoText}>Super Admin: SUPER-ADMIN-001 / medirelay123</Text>
        <Text style={styles.demoText}>Admin: HOSP-ADMIN-001 / medirelay123</Text>
        <Text style={styles.demoText}>Doctor: DOC-1001 / medirelay123</Text>
        <Text style={styles.demoText}>Nurse: NUR-1001 / medirelay123</Text>
      </View>
    </SectionCard>
  );
}

function PasswordChangeCard({ passwordForm, setPasswordForm, handlePasswordChange }) {
  return (
    <SectionCard
      title="Password update required"
      subtitle="This staff account was created by the hospital. Set a new password before using any QR workflow."
      tone="caution"
    >
      <Field
        label="Current password"
        value={passwordForm.currentPassword}
        onChangeText={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))}
        secureTextEntry
      />
      <Field
        label="New password"
        value={passwordForm.newPassword}
        onChangeText={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))}
        secureTextEntry
      />
      <ActionButton label="Update password" onPress={handlePasswordChange} />
    </SectionCard>
  );
}

function DoctorActivityCard({ activity, refreshActivity }) {
  return (
    <SectionCard
      title="Patient interaction history"
      subtitle="Recent QR access and acknowledgement activity for this doctor account."
    >
      <ActionButton label="Refresh activity" variant="secondary" onPress={refreshActivity} />
      {activity.length ? (
        activity.slice(0, 6).map((item, index) => (
          <InsetCard key={`${item.handoffId}-${item.timestamp}-${index}`} tone="strong">
            <Text style={styles.activityTitle}>{item.eventType}</Text>
            <Text style={styles.demoText}>
              {item.patientName || "Unknown patient"} ({item.patientId || "Unknown ID"})
            </Text>
            <Text style={styles.demoText}>
              {item.department || "No department"} | {new Date(item.timestamp).toLocaleString()}
            </Text>
          </InsetCard>
        ))
      ) : (
        <Text style={styles.demoText}>No doctor interaction history yet.</Text>
      )}
    </SectionCard>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [doctorWorkspace, setDoctorWorkspace] = useState(null);
  const [doctorActivity, setDoctorActivity] = useState([]);
  const [credentials, setCredentials] = useState({
    identifier: "DOC-1001",
    password: "medirelay123"
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "medirelay123",
    newPassword: ""
  });
  const [statusMessage, setStatusMessage] = useState("Sign in with the hospital-issued account to continue.");

  async function refreshDoctorActivity(accessToken = session?.accessToken) {
    if (!accessToken) return;

    try {
      const result = await fetchDoctorActivity(accessToken);
      setDoctorActivity(result.activity || []);
    } catch (_error) {
      setDoctorActivity([]);
    }
  }

  async function handleLogin() {
    try {
      const result = await login(credentials.identifier, credentials.password);
      setSession(result);
      if (result.user.role === "doctor" && !result.user.forcePasswordChange) {
        await refreshDoctorActivity(result.accessToken);
      } else {
        setDoctorActivity([]);
      }
      setDoctorWorkspace(result.user.role === "doctor" ? "sender" : null);
      setPasswordForm({ currentPassword: credentials.password, newPassword: "" });
      setStatusMessage(`Signed in as ${result.user.name}.`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handlePasswordChange() {
    if (!session?.accessToken) {
      return;
    }

    try {
      const result = await changePassword(
        session.accessToken,
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      setSession(result);
      if (result.user.role === "doctor") {
        await refreshDoctorActivity(result.accessToken);
      }
      setCredentials((current) => ({ ...current, password: passwordForm.newPassword }));
      setPasswordForm({ currentPassword: passwordForm.newPassword, newPassword: "" });
      setStatusMessage("Password updated. QR and dashboard access is now unlocked.");
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  const activeDoctorCopy = useMemo(
    () => (doctorWorkspace ? doctorWorkspaceCopy[doctorWorkspace] : null),
    [doctorWorkspace]
  );

  const roleLabel = session?.user?.role === "hospital_admin"
    ? "Hospital Admin"
    : session?.user?.role === "system_admin"
      ? "Super Admin"
    : session?.user?.role === "doctor"
      ? "Doctor"
      : session?.user?.role === "nurse"
        ? "Nurse"
        : "Guest";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <BackgroundGlow />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {!session ? (
            <>
              <View style={styles.hero}>
                <Badge label="MediRelay Hospital Auth" tone="success" />
                <Text style={styles.heroEyebrow}>Secure hospital-controlled QR access</Text>
                <Text style={styles.heroTitle}>Hospital creates every account</Text>
                <Text style={styles.heroSubtitle}>
                  Super admin onboards hospitals. Hospital admins manage staff. Doctors generate and scan QR records with full activity tracking.
                </Text>
              </View>
              <LoginCard
                credentials={credentials}
                setCredentials={setCredentials}
                handleLogin={handleLogin}
              />
            </>
          ) : (
            <>
              <View style={styles.workspaceHero}>
                <View style={styles.workspaceTopRow}>
                  <Badge label={roleLabel} tone={["hospital_admin", "system_admin"].includes(session.user.role) ? "caution" : "success"} />
                  <Pressable
                    style={styles.backButton}
                    onPress={() => {
                      setSession(null);
                      setDoctorWorkspace(null);
                      setStatusMessage("Signed out.");
                    }}
                  >
                    <Text style={styles.backButtonText}>Sign out</Text>
                  </Pressable>
                </View>
                <Text style={styles.workspaceEyebrow}>{session.user.facility}</Text>
                <Text style={styles.workspaceTitle}>{session.user.name}</Text>
                <Text style={styles.workspaceSubtitle}>
                  Login ID: {session.user.loginId} | {session.user.department || "No department assigned"}
                </Text>
                <View style={styles.statusCard}>
                  <Text style={styles.statusText}>{statusMessage}</Text>
                </View>
              </View>

              {session.user.forcePasswordChange ? (
                <PasswordChangeCard
                  passwordForm={passwordForm}
                  setPasswordForm={setPasswordForm}
                  handlePasswordChange={handlePasswordChange}
                />
              ) : null}

              {!session.user.forcePasswordChange && session.user.role === "system_admin" ? (
                <SuperAdminWorkspace session={session} setStatusMessage={setStatusMessage} />
              ) : null}

              {!session.user.forcePasswordChange && session.user.role === "hospital_admin" ? (
                <AdminWorkspace session={session} setStatusMessage={setStatusMessage} />
              ) : null}

              {!session.user.forcePasswordChange && session.user.role === "doctor" ? (
                <>
                  {!doctorWorkspace ? (
                    <>
                      <View style={styles.roleStack}>
                        <WorkspaceCard
                          title="Sender"
                          subtitle="Create a transfer and generate the secure QR or link."
                          accent={palette.teal}
                          onPress={() => {
                            setDoctorWorkspace("sender");
                            setStatusMessage("Doctor sender dashboard opened.");
                          }}
                        />
                        <WorkspaceCard
                          title="Receiver"
                          subtitle="Scan the QR, access the patient record, and acknowledge arrival."
                          accent={palette.amber}
                          onPress={() => {
                            setDoctorWorkspace("receiver");
                            setStatusMessage("Doctor receiver dashboard opened.");
                          }}
                        />
                      </View>
                      <DoctorActivityCard activity={doctorActivity} refreshActivity={refreshDoctorActivity} />
                    </>
                  ) : (
                    <>
                      <View style={styles.workspaceHero}>
                        <View style={styles.workspaceTopRow}>
                          <Pressable style={styles.backButton} onPress={() => setDoctorWorkspace(null)}>
                            <Text style={styles.backButtonText}>Back</Text>
                          </Pressable>
                          <Badge label={doctorWorkspace === "sender" ? "Sender QR" : "Receiver QR"} tone="default" />
                        </View>
                        <Text style={styles.workspaceEyebrow}>{activeDoctorCopy.eyebrow}</Text>
                        <Text style={styles.workspaceTitle}>{activeDoctorCopy.title}</Text>
                        <Text style={styles.workspaceSubtitle}>{activeDoctorCopy.subtitle}</Text>
                      </View>
                      {doctorWorkspace === "sender" ? (
                        <SenderWorkspace
                          session={session}
                          setStatusMessage={setStatusMessage}
                          onActivityChanged={refreshDoctorActivity}
                        />
                      ) : (
                        <ReceiverWorkspace
                          session={session}
                          setStatusMessage={setStatusMessage}
                          onActivityChanged={refreshDoctorActivity}
                        />
                      )}
                    </>
                  )}
                </>
              ) : null}

              {!session.user.forcePasswordChange && session.user.role === "nurse" ? (
                <NurseWorkspace session={session} />
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg
  },
  keyboard: {
    flex: 1
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 56,
    gap: 18
  },
  hero: {
    gap: 12,
    paddingTop: 12
  },
  heroEyebrow: {
    color: palette.mint,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    fontSize: 12,
    fontWeight: "700"
  },
  heroTitle: {
    color: palette.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "900"
  },
  heroSubtitle: {
    color: palette.textSoft,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 340
  },
  demoBox: {
    borderRadius: radii.lg,
    backgroundColor: palette.panelSoft,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 4
  },
  demoTitle: {
    color: palette.text,
    fontWeight: "800"
  },
  demoText: {
    color: palette.textSoft,
    lineHeight: 20
  },
  activityTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 16
  },
  roleStack: {
    gap: 14
  },
  roleCard: {
    borderRadius: radii.xl,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 22,
    gap: 10
  },
  roleAccent: {
    width: 52,
    height: 4,
    borderRadius: 999,
    marginBottom: 4
  },
  roleTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "800"
  },
  roleSubtitle: {
    color: palette.textSoft,
    lineHeight: 21,
    maxWidth: 320
  },
  roleAction: {
    marginTop: 8,
    fontWeight: "800",
    fontSize: 15
  },
  workspaceHero: {
    borderRadius: radii.xl,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 22,
    gap: 10
  },
  workspaceTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 6
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panelSoft
  },
  backButtonText: {
    color: palette.text,
    fontWeight: "800"
  },
  workspaceEyebrow: {
    color: palette.mint,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: "700"
  },
  workspaceTitle: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900"
  },
  workspaceSubtitle: {
    color: palette.textSoft,
    lineHeight: 21
  },
  statusCard: {
    marginTop: 8,
    borderRadius: radii.lg,
    backgroundColor: palette.bgSoft,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  statusText: {
    color: palette.textSoft,
    lineHeight: 20
  }
});
