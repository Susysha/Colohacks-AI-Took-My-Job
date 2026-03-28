import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  buildTransferPayload,
  cleanAllergies,
  cleanMedications,
  createCriticalSnapshot,
  evaluateDrugInteractions,
  initialTransferForm,
  validateTransferPayload
} from "@medirelay/shared";
import { useVoiceSummary } from "../hooks/useVoiceSummary";
import {
  initializeDatabase,
  listTransfers,
  markSynced,
  pendingMutations,
  queueMutation,
  saveTransfer
} from "../lib/db";
import { shareTransfer, syncQueuedTransfers } from "../lib/api";
import { ActionButton, Badge, Field, InsetCard, SectionCard, StatPill } from "../ui/primitives";
import { palette, radii } from "../ui/theme";

export default function SenderWorkspace({ session, setStatusMessage, onActivityChanged = async () => {} }) {
  const [form, setForm] = useState(initialTransferForm);
  const [errors, setErrors] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [shareState, setShareState] = useState(null);

  useEffect(() => {
    async function bootstrap() {
      await initializeDatabase();
      const saved = await listTransfers();
      setTransfers(saved);
      setStatusMessage("Local SQLite is ready. Build the handoff, then sync when the network returns.");
    }

    bootstrap().catch(() => {
      setStatusMessage("Local database failed to initialize.");
    });
  }, [setStatusMessage]);

  const warnings = useMemo(
    () =>
      evaluateDrugInteractions({
        allergies: cleanAllergies(form.allergies),
        medications: cleanMedications(form.medications)
      }),
    [form]
  );
  const severeWarnings = warnings.filter((item) => item.severity === "high");
  const queuedCount = transfers.filter((item) => item.syncStatus !== "synced").length;
  const syncedCount = transfers.filter((item) => item.syncStatus === "synced").length;

  const voice = useVoiceSummary({
    onTranscript: (transcript) => {
      setForm((current) => ({ ...current, clinicalSummary: transcript }));
      setStatusMessage("Voice transcript captured. Review it before you lock the handoff.");
    }
  });

  async function refreshTransfers() {
    const saved = await listTransfers();
    setTransfers(saved);
  }

  async function handleSave() {
    const payload = buildTransferPayload(form, createCriticalSnapshot);
    const validation = validateTransferPayload(payload);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (severeWarnings.length && !form.overrideReason.trim()) {
      setErrors(["High-severity interaction flagged. Add an override reason before saving."]);
      return;
    }

    const record = {
      ...payload,
      status: "queued",
      overrideReason: form.overrideReason,
      localWarnings: warnings,
      createdAt: new Date().toISOString()
    };

    await saveTransfer(record, "queued");
    await queueMutation(record);
    await refreshTransfers();
    setSelectedTransfer(record);
    setErrors([]);
    setStatusMessage("Transfer saved offline and added to the sync queue.");
  }

  async function handleSync() {
    if (!session?.accessToken) {
      setStatusMessage("Sign in before syncing queued transfers.");
      return;
    }

    const queued = await pendingMutations();

    if (queued.length === 0) {
      setStatusMessage("No queued transfers are waiting for sync.");
      return;
    }

    try {
      const result = await syncQueuedTransfers(session.accessToken, queued);
      const acceptedIds = result.results
        .filter((item) => item.status === "accepted")
        .map((item) => item.handoffId);
      await markSynced(acceptedIds);
      await refreshTransfers();
      setStatusMessage(`Synced ${acceptedIds.length} transfer(s) to the server.`);
    } catch (error) {
      setStatusMessage(`Sync failed: ${error.message}`);
    }
  }

  async function handleShare(record) {
    if (!session?.accessToken) {
      setStatusMessage("Sign in before generating a secure share link.");
      return;
    }

    try {
      const response = await shareTransfer(session.accessToken, record.handoffId);
      setShareState(response);
      setSelectedTransfer(record);
      await onActivityChanged(session.accessToken);
      setStatusMessage("Secure link and QR payload are ready for the receiving team.");
    } catch (error) {
      setStatusMessage(`Share failed: ${error.message}`);
    }
  }

  function updateMedication(index, key, value) {
    setForm((current) => {
      const medications = [...current.medications];
      medications[index] = { ...medications[index], [key]: value };
      return { ...current, medications };
    });
  }

  function updateAllergy(index, key, value) {
    setForm((current) => {
      const allergies = [...current.allergies];
      allergies[index] = { ...current.allergies[index], [key]: value };
      return { ...current, allergies };
    });
  }

  return (
    <>
      <SectionCard
        title="Sender command deck"
        subtitle="Build the transfer, check for clinical risk, and push a share package without leaving the bedside."
        tone="raised"
      >
        <View style={styles.metricRow}>
          <StatPill value={String(queuedCount)} label="Queued locally" tone={queuedCount ? "caution" : "default"} />
          <StatPill value={String(syncedCount)} label="Synced to server" tone={syncedCount ? "success" : "default"} />
          <StatPill
            value={String(severeWarnings.length)}
            label="Severe alerts"
            tone={severeWarnings.length ? "danger" : "default"}
          />
        </View>
        <View style={styles.badgeRow}>
          <Badge label={session ? "Secure sync enabled" : "Offline-only until sign-in"} tone={session ? "success" : "caution"} />
          <Badge label="QR backup ready" tone="default" />
          <Badge label="SQLite cache active" tone="default" />
        </View>
      </SectionCard>

      <SectionCard
        title="Patient and transfer context"
        subtitle="Capture who the patient is, where they are going, and why the transfer cannot wait."
      >
        <Field
          label="Facility patient ID"
          value={form.facilityPatientId}
          onChangeText={(value) => setForm((current) => ({ ...current, facilityPatientId: value }))}
          placeholder="PT-101"
        />
        <Field
          label="Patient name"
          value={form.patientName}
          onChangeText={(value) => setForm((current) => ({ ...current, patientName: value }))}
          placeholder="Ravi Kumar"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Age"
              value={form.patientAge}
              onChangeText={(value) => setForm((current) => ({ ...current, patientAge: value }))}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Sex"
              value={form.patientSex}
              onChangeText={(value) => setForm((current) => ({ ...current, patientSex: value }))}
              placeholder="Male"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Sending facility"
              value={form.sendingFacility}
              onChangeText={(value) => setForm((current) => ({ ...current, sendingFacility: value }))}
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Receiving facility"
              value={form.receivingFacility}
              onChangeText={(value) => setForm((current) => ({ ...current, receivingFacility: value }))}
            />
          </View>
        </View>
        <Field
          label="Primary diagnosis"
          value={form.primaryDiagnosis}
          onChangeText={(value) => setForm((current) => ({ ...current, primaryDiagnosis: value }))}
          placeholder="Sepsis with dehydration"
        />
        <Field
          label="Reason for transfer"
          value={form.reasonForTransfer}
          onChangeText={(value) => setForm((current) => ({ ...current, reasonForTransfer: value }))}
          multiline
          placeholder="Needs ICU support and urgent monitoring"
        />
      </SectionCard>

      <SectionCard
        title="Medication handoff"
        subtitle="Flag what must continue and what might clash with allergy history before the patient leaves."
      >
        <Text style={styles.sectionLabel}>Active medications</Text>
        {form.medications.map((item, index) => (
          <InsetCard key={`med-${index}`}>
            <Field label="Medication" value={item.name} onChangeText={(value) => updateMedication(index, "name", value)} />
            <View style={styles.row}>
              <View style={styles.third}>
                <Field label="Dose" value={item.dose} onChangeText={(value) => updateMedication(index, "dose", value)} />
              </View>
              <View style={styles.third}>
                <Field label="Route" value={item.route} onChangeText={(value) => updateMedication(index, "route", value)} />
              </View>
              <View style={styles.third}>
                <Field
                  label="Must continue"
                  value={item.mustContinue ? "Yes" : "No"}
                  onChangeText={(value) => updateMedication(index, "mustContinue", value.toLowerCase() !== "no")}
                />
              </View>
            </View>
          </InsetCard>
        ))}
        <ActionButton
          label="Add medication"
          variant="secondary"
          onPress={() =>
            setForm((current) => ({
              ...current,
              medications: [...current.medications, { name: "", dose: "", route: "", mustContinue: false }]
            }))
          }
        />

        <Text style={styles.sectionLabel}>Known allergies</Text>
        {form.allergies.map((item, index) => (
          <InsetCard key={`allergy-${index}`} tone="strong">
            <Field label="Allergy" value={item.name} onChangeText={(value) => updateAllergy(index, "name", value)} />
            <Field
              label="Reaction"
              value={item.reaction}
              onChangeText={(value) => updateAllergy(index, "reaction", value)}
            />
          </InsetCard>
        ))}
        <ActionButton
          label="Add allergy"
          variant="secondary"
          onPress={() =>
            setForm((current) => ({
              ...current,
              allergies: [...current.allergies, { name: "", reaction: "" }]
            }))
          }
        />
      </SectionCard>

      <SectionCard
        title="Clinical picture"
        subtitle="Make the clinical story easy to scan when the receiving doctor has only seconds."
      >
        <Text style={styles.sectionLabel}>Vitals</Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Blood pressure"
              value={form.vitals.bloodPressure}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, vitals: { ...current.vitals, bloodPressure: value } }))
              }
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Pulse"
              value={form.vitals.pulse}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, vitals: { ...current.vitals, pulse: value } }))
              }
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="SpO2"
              value={form.vitals.spo2}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, vitals: { ...current.vitals, spo2: value } }))
              }
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Temperature"
              value={form.vitals.temperature}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, vitals: { ...current.vitals, temperature: value } }))
              }
            />
          </View>
        </View>
        <Field
          label="Pending investigations"
          value={form.pendingInvestigationsText}
          onChangeText={(value) => setForm((current) => ({ ...current, pendingInvestigationsText: value }))}
          multiline
          placeholder="One investigation per line"
        />
        <Field
          label="Clinical summary"
          value={form.clinicalSummary}
          onChangeText={(value) => setForm((current) => ({ ...current, clinicalSummary: value }))}
          multiline
          placeholder="Patient unstable, febrile, hypotensive, referred for higher center management."
        />
        <View style={styles.inlineActionRow}>
          <ActionButton
            label={voice.isProcessing ? "Transcribing..." : voice.isListening ? "Stop recording" : "Record summary"}
            variant="secondary"
            onPress={voice.isProcessing ? () => {} : voice.isListening ? voice.stopListening : voice.startListening}
          />
          <Text style={styles.helperText}>
            {voice.error ||
              (voice.isProcessing
                ? "Whisper.cpp is transcribing the audio. Hold on for a moment."
                : "Record a short clinical summary and review the transcript before saving.")}
          </Text>
        </View>
      </SectionCard>

      {warnings.length ? (
        <SectionCard
          title="Safety gate"
          subtitle="Resolve or document flagged medication risk before the transfer package is shared."
          tone={severeWarnings.length ? "danger" : "caution"}
        >
          {warnings.map((warning) => (
            <InsetCard key={warning.id} tone="strong">
              <Text style={styles.alertLabel}>{warning.severity.toUpperCase()}</Text>
              <Text style={styles.alertText}>{warning.message}</Text>
            </InsetCard>
          ))}
          {severeWarnings.length ? (
            <Field
              label="Override reason"
              value={form.overrideReason}
              onChangeText={(value) => setForm((current) => ({ ...current, overrideReason: value }))}
              multiline
              placeholder="Document why transfer proceeds despite the interaction warning"
            />
          ) : null}
        </SectionCard>
      ) : null}

      {errors.length ? (
        <SectionCard
          title="Form issues"
          subtitle="These fields still need attention before the handoff can be locked."
          tone="danger"
        >
          {errors.map((item) => (
            <Text key={item} style={styles.errorText}>
              {item}
            </Text>
          ))}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Lock and share"
        subtitle="Save immediately to the device, then sync and generate a receiver-ready package when network is available."
        tone="raised"
      >
        <View style={styles.row}>
          <View style={styles.half}>
            <ActionButton label="Save offline" onPress={handleSave} />
          </View>
          <View style={styles.half}>
            <ActionButton label="Sync queue" variant="secondary" onPress={handleSync} />
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Saved transfer board"
        subtitle="Recent handoffs stay local until synced, then become share-ready for the receiving team."
      >
        {transfers.length ? (
          transfers.map((item) => (
            <InsetCard key={item.handoffId}>
              <View style={styles.transferRow}>
                <View style={styles.transferInfo}>
                  <Text style={styles.transferTitle}>{item.patientDemographics.name || "Unknown patient"}</Text>
                  <Text style={styles.transferMeta}>{item.primaryDiagnosis || "No diagnosis yet"}</Text>
                  <Text style={styles.transferTime}>
                    Updated {new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleString()}
                  </Text>
                </View>
                <Badge label={item.syncStatus === "synced" ? "Synced" : "Queued"} tone={item.syncStatus === "synced" ? "success" : "caution"} />
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <ActionButton label="Inspect" variant="ghost" onPress={() => setSelectedTransfer(item)} />
                </View>
                <View style={styles.half}>
                  <ActionButton label="Share" variant="secondary" onPress={() => handleShare(item)} />
                </View>
              </View>
            </InsetCard>
          ))
        ) : (
          <Text style={styles.helperText}>No local transfers yet. Start with the structured form above.</Text>
        )}
      </SectionCard>

      {shareState ? (
        <SectionCard
          title="Share center"
          subtitle="This package is what the receiving side can open from link, QR, or offline payload."
          tone="neutral"
        >
          <InsetCard tone="strong">
            <Text style={styles.shareLabel}>Short link</Text>
            <Text style={styles.shareValue}>{shareState.shortUrl}</Text>
          </InsetCard>
          <View style={styles.qrShell}>
            <QRCode value={shareState.qrPayload} size={184} />
          </View>
          <View style={styles.badgeRow}>
            <Badge label={`QR mode: ${shareState.qrMode}`} tone="default" />
            <Badge label={`Chunks: ${shareState.qrChunks.length}`} tone="default" />
          </View>
          <Text style={styles.helperText}>
            Critical snapshot: {selectedTransfer?.criticalSnapshot?.allergies?.join(", ") || "No allergies"} |{" "}
            {selectedTransfer?.criticalSnapshot?.reasonForTransfer || "No reason supplied"}
          </Text>
        </SectionCard>
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
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
    flexWrap: "wrap"
  },
  inlineActionRow: {
    gap: 12
  },
  half: {
    flex: 1,
    minWidth: 132
  },
  third: {
    flex: 1,
    minWidth: 94
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
  alertLabel: {
    color: palette.coral,
    fontWeight: "900",
    letterSpacing: 1,
    fontSize: 12
  },
  alertText: {
    color: palette.text,
    lineHeight: 20
  },
  errorText: {
    color: palette.coral,
    lineHeight: 20
  },
  transferRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  transferInfo: {
    flex: 1,
    gap: 4
  },
  transferTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 18
  },
  transferMeta: {
    color: palette.textSoft
  },
  transferTime: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  qrShell: {
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: radii.lg,
    backgroundColor: "#f5f4ef"
  },
  shareLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  shareValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22
  }
});
