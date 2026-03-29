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

const FORM_STEPS = [
  {
    key: "context",
    title: "Patient and transfer context",
    subtitle: "Patient identity, facilities, diagnosis, aur transfer ka reason complete karo."
  },
  {
    key: "medication",
    title: "Medication and allergies",
    subtitle: "Jo medicine continue rehni chahiye aur known allergies hain, woh yahan lock karo."
  },
  {
    key: "clinical",
    title: "Clinical picture",
    subtitle: "Vitals, pending investigations, aur summary fill karke receiving doctor ko quick context do."
  },
  {
    key: "review",
    title: "Safety, save, sync, and generate",
    subtitle: "Final review ke baad Save & Lock, phir Sync, aur uske baad Generate QR karo."
  }
];

const SENDER_PANELS = [
  { key: "form", label: "Form", shortLabel: "FM" },
  { key: "records", label: "Records", shortLabel: "RC" }
];

function buildStepIssues(form, stepIndex, severeWarnings) {
  const issues = [];

  if (stepIndex === 0) {
    if (!form.facilityPatientId.trim()) issues.push("Facility patient ID required hai.");
    if (!form.patientName.trim()) issues.push("Patient name required hai.");
    if (!form.patientAge.trim()) issues.push("Patient age required hai.");
    if (!form.patientSex.trim()) issues.push("Patient sex required hai.");
    if (!form.sendingFacility.trim()) issues.push("Sending facility required hai.");
    if (!form.receivingFacility.trim()) issues.push("Receiving facility required hai.");
    if (!form.primaryDiagnosis.trim()) issues.push("Primary diagnosis required hai.");
    if (!form.reasonForTransfer.trim()) issues.push("Reason for transfer required hai.");
  }

  if (stepIndex === 1) {
    if (!cleanMedications(form.medications).length) issues.push("Kam se kam ek medication add karo.");
    if (!cleanAllergies(form.allergies).length) issues.push("Kam se kam ek allergy add karo.");
  }

  if (stepIndex === 2) {
    if (!Object.values(form.vitals || {}).filter(Boolean).length) {
      issues.push("Kam se kam ek vital sign bharna zaroori hai.");
    }

    const wordCount = (form.clinicalSummary || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    if (wordCount > 200) {
      issues.push("Clinical summary 200 words se kam rakho.");
    }
  }

  if (stepIndex === 3 && severeWarnings.length && !form.overrideReason.trim()) {
    issues.push("High-severity warning ke liye override reason dena zaroori hai.");
  }

  return issues;
}

export default function SenderWorkspace({ session, setStatusMessage, onActivityChanged = async () => {} }) {
  const [form, setForm] = useState(initialTransferForm);
  const [errors, setErrors] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [inspectedTransferId, setInspectedTransferId] = useState("");
  const [shareState, setShareState] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [draftIdentity, setDraftIdentity] = useState({ handoffId: "", transferChainId: "" });
  const [activePanel, setActivePanel] = useState("form");
  const [recordsView, setRecordsView] = useState("list");

  useEffect(() => {
    async function bootstrap() {
      await initializeDatabase();
      await refreshTransfers();
      setStatusMessage("Doctor form wizard ready hai. Steps complete karo, phir Save & Lock karke Sync aur Generate QR karo.");
    }

    bootstrap().catch(() => {
      setStatusMessage("Local database initialize nahi ho paya.");
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
  const inspectedTransfer = transfers.find((item) => item.handoffId === inspectedTransferId) || transfers[0] || null;
  const currentStepIssues = useMemo(
    () => buildStepIssues(form, currentStep, severeWarnings),
    [currentStep, form, severeWarnings]
  );
  const isLastStep = currentStep === FORM_STEPS.length - 1;

  const voice = useVoiceSummary({
    onTranscript: (transcript) => {
      updateForm((current) => ({ ...current, clinicalSummary: transcript }));
      setStatusMessage("Voice transcript capture ho gaya. Generate karne se pehle review kar lo.");
    }
  });

  async function refreshTransfers(targetTransferId = "") {
    const saved = await listTransfers();
    setTransfers(saved);

    if (targetTransferId) {
      const match = saved.find((item) => item.handoffId === targetTransferId);
      setSelectedTransfer(match || null);
    }
  }

  function updateForm(updater) {
    setForm((current) => (typeof updater === "function" ? updater(current) : updater));
    setErrors([]);
    setShareState(null);
    setCopyStatus("");
    setSelectedTransfer(null);
  }

  function updateMedication(index, key, value) {
    updateForm((current) => {
      const medications = [...current.medications];
      medications[index] = { ...medications[index], [key]: value };
      return { ...current, medications };
    });
  }

  function updateAllergy(index, key, value) {
    updateForm((current) => {
      const allergies = [...current.allergies];
      allergies[index] = { ...current.allergies[index], [key]: value };
      return { ...current, allergies };
    });
  }

  function updateVitals(key, value) {
    updateForm((current) => ({
      ...current,
      vitals: { ...current.vitals, [key]: value }
    }));
  }

  function handleNextStep() {
    if (currentStepIssues.length) {
      setErrors(currentStepIssues);
      setStatusMessage(currentStepIssues[0]);
      return;
    }

    setErrors([]);
    setCurrentStep((step) => Math.min(step + 1, FORM_STEPS.length - 1));
  }

  function handlePreviousStep() {
    setErrors([]);
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  async function handleSave() {
    const payload = buildTransferPayload(form, createCriticalSnapshot, draftIdentity);
    const validation = validateTransferPayload(payload);

    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatusMessage(validation.errors[0]);
      return;
    }

    if (severeWarnings.length && !form.overrideReason.trim()) {
      const nextErrors = ["High-severity interaction flagged. Save & Lock se pehle override reason add karo."];
      setErrors(nextErrors);
      setStatusMessage(nextErrors[0]);
      return;
    }

    const record = {
      ...payload,
      status: "queued",
      syncStatus: "queued",
      overrideReason: form.overrideReason,
      localWarnings: warnings,
      createdAt: selectedTransfer?.createdAt || new Date().toISOString()
    };

    await saveTransfer(record, "queued");
    await queueMutation(record);
    await refreshTransfers(record.handoffId);
    setDraftIdentity({
      handoffId: record.handoffId,
      transferChainId: record.transferChainId
    });
    setSelectedTransfer(record);
    setInspectedTransferId(record.handoffId);
    setErrors([]);
    setStatusMessage("Form save ho gaya aur lock bhi ho gaya. Ab Sync karke QR generate karo.");
  }

  async function handleSync() {
    if (!session?.accessToken) {
      setStatusMessage("Sync se pehle doctor sign-in zaroori hai.");
      return;
    }

    const queued = await pendingMutations();

    if (queued.length === 0) {
      setStatusMessage("Sync queue empty hai.");
      return;
    }

    try {
      const result = await syncQueuedTransfers(session.accessToken, queued);
      const acceptedIds = result.results
        .filter((item) => item.status === "accepted")
        .map((item) => item.handoffId);
      await markSynced(acceptedIds);
      await refreshTransfers(selectedTransfer?.handoffId || draftIdentity.handoffId);

      if (selectedTransfer?.handoffId && acceptedIds.includes(selectedTransfer.handoffId)) {
        setSelectedTransfer((current) => (current ? { ...current, syncStatus: "synced" } : current));
      }

      setStatusMessage(`Sync complete. ${acceptedIds.length} transfer server par chala gaya.`);
    } catch (error) {
      setStatusMessage(`Sync failed: ${error.message}`);
    }
  }

  async function generateQrForTransfer(record) {
    if (!session?.accessToken) {
      setStatusMessage("Generate QR se pehle doctor sign-in zaroori hai.");
      return;
    }

    if (!record) {
      setStatusMessage("Pehle Save & Lock karo.");
      return;
    }

    if (record.syncStatus !== "synced") {
      setStatusMessage("Generate QR se pehle transfer ko sync karna zaroori hai.");
      return;
    }

    try {
      const response = await shareTransfer(session.accessToken, record.handoffId);
      setSelectedTransfer(record);
      setInspectedTransferId(record.handoffId);
      setShareState(response);
      await onActivityChanged(session.accessToken);
      setCopyStatus("");
      setStatusMessage("QR aur secure link ready hain.");
    } catch (error) {
      setStatusMessage(`QR generate nahi ho paya: ${error.message}`);
    }
  }

  async function handleGenerateQr() {
    await generateQrForTransfer(selectedTransfer);
  }

  function handleCopyLink() {
    if (!shareState?.shortUrl) return;
    setCopyStatus("Link neeche visible hai. Manual copy use karo.");
    setStatusMessage("Secure link ready hai. Abhi manual copy use karo.");
  }

  function handleCreateAnother() {
    setForm(initialTransferForm);
    setErrors([]);
    setSelectedTransfer(null);
    setShareState(null);
    setCurrentStep(0);
    setCopyStatus("");
    setDraftIdentity({ handoffId: "", transferChainId: "" });
    setRecordsView("list");
    setActivePanel("form");
    setStatusMessage("New doctor transfer form ready hai.");
  }

  function handleInspectTransfer(record) {
    if (!record) return;

    setInspectedTransferId(record.handoffId);
    setRecordsView("details");
    setActivePanel("records");
    setShareState(null);
    setCopyStatus("");
    setStatusMessage(`${record.patientDemographics?.name || "Saved transfer"} details inspect view me open ho gaye.`);
  }

  function renderInspectDetail(label, value) {
    return (
      <View style={styles.inspectDetail}>
        <Text style={styles.inspectLabel}>{label}</Text>
        <Text style={styles.inspectValue}>{value}</Text>
      </View>
    );
  }

  function renderContextStep() {
    return (
      <>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Facility patient ID"
              value={form.facilityPatientId}
              onChangeText={(value) => updateForm((current) => ({ ...current, facilityPatientId: value }))}
              placeholder="PT-101"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Patient name"
              value={form.patientName}
              onChangeText={(value) => updateForm((current) => ({ ...current, patientName: value }))}
              placeholder="Ravi Kumar"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Age"
              value={form.patientAge}
              onChangeText={(value) => updateForm((current) => ({ ...current, patientAge: value }))}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Sex"
              value={form.patientSex}
              onChangeText={(value) => updateForm((current) => ({ ...current, patientSex: value }))}
              placeholder="Male"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Sending facility"
              value={form.sendingFacility}
              onChangeText={(value) => updateForm((current) => ({ ...current, sendingFacility: value }))}
            />
          </View>
          <View style={styles.half}>
            <Field
              label="Receiving facility"
              value={form.receivingFacility}
              onChangeText={(value) => updateForm((current) => ({ ...current, receivingFacility: value }))}
            />
          </View>
        </View>

        <Field
          label="Primary diagnosis"
          value={form.primaryDiagnosis}
          onChangeText={(value) => updateForm((current) => ({ ...current, primaryDiagnosis: value }))}
          placeholder="Sepsis with dehydration"
        />
        <Field
          label="Reason for transfer"
          value={form.reasonForTransfer}
          onChangeText={(value) => updateForm((current) => ({ ...current, reasonForTransfer: value }))}
          multiline
          placeholder="Needs ICU support and urgent monitoring"
        />
      </>
    );
  }

  function renderMedicationStep() {
    return (
      <>
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
            updateForm((current) => ({
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
            updateForm((current) => ({
              ...current,
              allergies: [...current.allergies, { name: "", reaction: "" }]
            }))
          }
        />
      </>
    );
  }

  function renderClinicalStep() {
    return (
      <>
        <Text style={styles.sectionLabel}>Vitals</Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label="Blood pressure"
              value={form.vitals.bloodPressure}
              onChangeText={(value) => updateVitals("bloodPressure", value)}
            />
          </View>
          <View style={styles.half}>
            <Field label="Pulse" value={form.vitals.pulse} onChangeText={(value) => updateVitals("pulse", value)} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field label="SpO2" value={form.vitals.spo2} onChangeText={(value) => updateVitals("spo2", value)} />
          </View>
          <View style={styles.half}>
            <Field
              label="Temperature"
              value={form.vitals.temperature}
              onChangeText={(value) => updateVitals("temperature", value)}
            />
          </View>
        </View>
        <Field
          label="Pending investigations"
          value={form.pendingInvestigationsText}
          onChangeText={(value) => updateForm((current) => ({ ...current, pendingInvestigationsText: value }))}
          multiline
          placeholder="One investigation per line"
        />
        <Field
          label="Clinical summary"
          value={form.clinicalSummary}
          onChangeText={(value) => updateForm((current) => ({ ...current, clinicalSummary: value }))}
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
                ? "Whisper.cpp audio transcribe kar raha hai."
                : "Short summary bolo, phir transcript ko review karke next karo.")}
          </Text>
        </View>
      </>
    );
  }

  function renderReviewStep() {
    const draftStatus = selectedTransfer
      ? selectedTransfer.syncStatus === "synced"
        ? "Locked + synced"
        : "Locked, sync pending"
      : "Save & Lock pending";

    return (
      <>
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
          <Badge label={draftStatus} tone={selectedTransfer ? (selectedTransfer.syncStatus === "synced" ? "success" : "caution") : "default"} />
          <Badge label={session ? "Doctor signed in" : "Sign-in required"} tone={session ? "success" : "danger"} />
          <Badge label="Generate QR last step" tone="default" />
        </View>

        {warnings.length ? (
          <SectionCard
            title="Safety gate"
            subtitle="Medication risk resolve ya document karo before QR generation."
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
                onChangeText={(value) => updateForm((current) => ({ ...current, overrideReason: value }))}
                multiline
                placeholder="Document why transfer proceeds despite the interaction warning"
              />
            ) : null}
          </SectionCard>
        ) : null}

        <InsetCard tone="soft">
          <Text style={styles.transferTitle}>{form.patientName || "Unnamed patient"}</Text>
          <Text style={styles.transferMeta}>{form.primaryDiagnosis || "Primary diagnosis pending"}</Text>
          <Text style={styles.helperText}>
            Reason: {form.reasonForTransfer || "Reason pending"}{"\n"}
            Receiving facility: {form.receivingFacility || "Not set"}
          </Text>
        </InsetCard>

        <View style={styles.row}>
          <View style={styles.half}>
            <ActionButton label="Save & Lock" onPress={handleSave} />
          </View>
          <View style={styles.half}>
            <ActionButton label="Sync Queue" variant="secondary" onPress={handleSync} />
          </View>
        </View>

        <ActionButton
          label="Generate QR"
          variant={selectedTransfer?.syncStatus === "synced" ? "primary" : "ghost"}
          disabled={!selectedTransfer || selectedTransfer.syncStatus !== "synced"}
          onPress={handleGenerateQr}
        />
        <Text style={styles.helperText}>
          Flow: pehle `Save & Lock`, phir `Sync Queue`, aur sync complete hote hi `Generate QR`.
        </Text>
      </>
    );
  }

  function renderRecordsPanel() {
    if (recordsView === "details" && inspectedTransfer) {
      return (
        <SectionCard
          title="Saved transfer details"
          subtitle="Yeh page read-only hai. Jo fields save hui thi, woh yahan exactly visible hain."
        >
          <View style={styles.row}>
            <View style={styles.half}>
              <ActionButton
                label="Back to records"
                variant="ghost"
                onPress={() => {
                  setRecordsView("list");
                  setStatusMessage("Past transfer records list opened.");
                }}
              />
            </View>
          </View>

          <InsetCard tone="strong">
            <View style={styles.inspectHeader}>
              <Text style={styles.sectionLabel}>Inspect saved details</Text>
              <Text style={styles.helperText}>
                Jo fields doctor ne Save & Lock ke time fill ki thi, woh yahan full detail me visible hain.
              </Text>
            </View>

            <View style={styles.badgeRow}>
              <Badge
                label={inspectedTransfer.syncStatus === "synced" ? "Synced record" : "Queued locally"}
                tone={inspectedTransfer.syncStatus === "synced" ? "success" : "caution"}
              />
              <Badge label={`Handoff: ${inspectedTransfer.handoffId}`} tone="default" />
            </View>

            <View style={styles.badgeRow}>
              <Badge label={`Chain: ${inspectedTransfer.transferChainId}`} tone="default" />
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <InsetCard>
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionLabel}>Patient and transfer context</Text>
                    {renderInspectDetail("Patient name", inspectedTransfer.patientDemographics?.name || "Not saved")}
                    {renderInspectDetail(
                      "Age / sex",
                      `${inspectedTransfer.patientDemographics?.age || "NA"} / ${inspectedTransfer.patientDemographics?.sex || "NA"}`
                    )}
                    {renderInspectDetail("Facility patient ID", inspectedTransfer.facilityPatientId || "Not saved")}
                    {renderInspectDetail("Sending facility", inspectedTransfer.sendingFacility || "Not saved")}
                    {renderInspectDetail("Receiving facility", inspectedTransfer.receivingFacility || "Not saved")}
                    {renderInspectDetail("Primary diagnosis", inspectedTransfer.primaryDiagnosis || "Not saved")}
                    {renderInspectDetail("Reason for transfer", inspectedTransfer.reasonForTransfer || "Not saved")}
                    {renderInspectDetail(
                      "Created at",
                      new Date(inspectedTransfer.createdAt || Date.now()).toLocaleString()
                    )}
                  </View>
                </InsetCard>
              </View>

              <View style={styles.half}>
                <InsetCard>
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionLabel}>Clinical picture</Text>
                    {renderInspectDetail("Blood pressure", inspectedTransfer.vitals?.bloodPressure || "Not saved")}
                    {renderInspectDetail("Pulse", inspectedTransfer.vitals?.pulse || "Not saved")}
                    {renderInspectDetail("SpO2", inspectedTransfer.vitals?.spo2 || "Not saved")}
                    {renderInspectDetail("Temperature", inspectedTransfer.vitals?.temperature || "Not saved")}
                    {renderInspectDetail("Clinical summary", inspectedTransfer.clinicalSummary || "Not saved")}
                    {renderInspectDetail("Override reason", inspectedTransfer.overrideReason || "Not added")}
                  </View>
                </InsetCard>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <InsetCard>
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionLabel}>Medications</Text>
                    <View style={styles.inspectList}>
                      {inspectedTransfer.medications?.length ? (
                        inspectedTransfer.medications.map((item, index) => (
                          <Text key={`${inspectedTransfer.handoffId}-med-${index}`} style={styles.inspectListItem}>
                            {item.name || "Unnamed medication"} | Dose: {item.dose || "NA"} | Route: {item.route || "NA"} |
                            Must continue: {item.mustContinue ? " Yes" : " No"}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.helperText}>No medications saved.</Text>
                      )}
                    </View>
                  </View>
                </InsetCard>
              </View>

              <View style={styles.half}>
                <InsetCard>
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionLabel}>Allergies</Text>
                    <View style={styles.inspectList}>
                      {inspectedTransfer.allergies?.length ? (
                        inspectedTransfer.allergies.map((item, index) => (
                          <Text key={`${inspectedTransfer.handoffId}-allergy-${index}`} style={styles.inspectListItem}>
                            {item.name || "Unnamed allergy"} | Reaction: {item.reaction || "NA"}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.helperText}>No allergies saved.</Text>
                      )}
                    </View>
                  </View>
                </InsetCard>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <InsetCard>
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionLabel}>Pending investigations</Text>
                    <View style={styles.inspectList}>
                      {inspectedTransfer.pendingInvestigations?.length ? (
                        inspectedTransfer.pendingInvestigations.map((item, index) => (
                          <Text key={`${inspectedTransfer.handoffId}-investigation-${index}`} style={styles.inspectListItem}>
                            {item}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.helperText}>No pending investigations saved.</Text>
                      )}
                    </View>
                  </View>
                </InsetCard>
              </View>

              <View style={styles.half}>
                <InsetCard>
                  <View style={styles.inspectSection}>
                    <Text style={styles.sectionLabel}>Critical snapshot and warnings</Text>
                    {renderInspectDetail(
                      "Critical allergies",
                      inspectedTransfer.criticalSnapshot?.allergies?.join(", ") || "None"
                    )}
                    {renderInspectDetail(
                      "Do-not-stop meds",
                      inspectedTransfer.criticalSnapshot?.doNotStopMedications?.join(", ") || "None"
                    )}
                    {renderInspectDetail(
                      "Snapshot reason",
                      inspectedTransfer.criticalSnapshot?.reasonForTransfer || "Not saved"
                    )}
                    <View style={styles.inspectList}>
                      {inspectedTransfer.localWarnings?.length ? (
                        inspectedTransfer.localWarnings.map((warning) => (
                          <Text key={warning.id} style={styles.inspectListItem}>
                            {warning.severity?.toUpperCase() || "INFO"}: {warning.message}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.helperText}>No saved safety warnings.</Text>
                      )}
                    </View>
                  </View>
                </InsetCard>
              </View>
            </View>
          </InsetCard>
        </SectionCard>
      );
    }

    return (
      <SectionCard
        title="Past transfer records"
        subtitle="Yeh section read-only hai. Kisi bhi saved transfer ko kholo aur sirf filled details dekho."
      >
        {transfers.length ? (
          transfers.map((item) => (
            <InsetCard key={item.handoffId} tone={inspectedTransfer?.handoffId === item.handoffId ? "strong" : "soft"}>
              <View style={styles.transferRow}>
                <View style={styles.transferInfo}>
                  <Text style={styles.transferTitle}>{item.patientDemographics?.name || "Unknown patient"}</Text>
                  <Text style={styles.transferMeta}>{item.primaryDiagnosis || "Primary diagnosis pending"}</Text>
                  <Text style={styles.transferTime}>
                    Updated {new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.inspectCardBadges}>
                  {inspectedTransfer?.handoffId === item.handoffId ? <Badge label="Inspecting" tone="default" /> : null}
                  <Badge
                    label={item.syncStatus === "synced" ? "Synced" : "Queued"}
                    tone={item.syncStatus === "synced" ? "success" : "caution"}
                  />
                </View>
              </View>

              <Text style={styles.helperText}>
                {item.receivingFacility || "Receiving facility pending"} | {item.reasonForTransfer || "Reason pending"}
              </Text>

              <View style={styles.row}>
                <View style={styles.half}>
                  <ActionButton label="View details" variant="secondary" onPress={() => handleInspectTransfer(item)} />
                </View>
              </View>
            </InsetCard>
          ))
        ) : (
          <InsetCard tone="soft">
            <Text style={styles.sectionLabel}>No past transfer records</Text>
            <Text style={styles.helperText}>Jab Save & Lock karoge, transfer yahin list me aa jayega.</Text>
          </InsetCard>
        )}
      </SectionCard>
    );
  }

  function renderStepContent() {
    if (currentStep === 0) return renderContextStep();
    if (currentStep === 1) return renderMedicationStep();
    if (currentStep === 2) return renderClinicalStep();
    return renderReviewStep();
  }

  if (shareState) {
    return (
      <SectionCard
        title="QR and secure link ready"
        subtitle="Ab sirf QR ya secure link receiving side ko bhejna hai."
        tone="neutral"
      >
        <InsetCard tone="strong">
          <Text style={styles.shareLabel}>Secure link</Text>
          <Text style={styles.shareValue}>{shareState.shortUrl}</Text>
        </InsetCard>

        <View style={styles.row}>
          <View style={styles.half}>
            <ActionButton label="Copy link" onPress={handleCopyLink} />
          </View>
          <View style={styles.half}>
            <ActionButton
              label="Back to records"
              variant="ghost"
              onPress={() => {
                setShareState(null);
                setActivePanel("records");
                setRecordsView("list");
                setStatusMessage("Past transfer records opened.");
              }}
            />
          </View>
          <View style={styles.half}>
            <ActionButton label="Create another" variant="secondary" onPress={handleCreateAnother} />
          </View>
        </View>

        {copyStatus ? <Text style={styles.copyStatus}>{copyStatus}</Text> : null}

        <View style={styles.qrShell}>
          <QRCode value={shareState.qrPayload} size={184} />
        </View>

        <View style={styles.badgeRow}>
          <Badge label={`QR mode: ${shareState.qrMode}`} tone="default" />
          <Badge label={`Chunks: ${shareState.qrChunks.length}`} tone="default" />
        </View>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard
        title="Sender command deck"
        subtitle="Form aur past transfer records ke beech toggle karo, phir selected flow par kaam karo."
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
          <Badge label={`Step ${currentStep + 1} of ${FORM_STEPS.length}`} tone="success" />
          <Badge label={session ? "Secure sync enabled" : "Offline until sign-in"} tone={session ? "success" : "caution"} />
          <Badge label={activePanel === "form" ? "Form open" : "Past records open"} tone="default" />
        </View>
      </SectionCard>

      <View style={styles.dockWrap}>
        <View style={styles.dockBar}>
          {SENDER_PANELS.map((panel) => {
            const isActive = activePanel === panel.key;
            return (
              <Pressable
                key={panel.key}
                accessibilityRole="button"
                accessibilityLabel={`Open ${panel.label}`}
                onPress={() => {
                  setActivePanel(panel.key);
                  if (panel.key === "records") {
                    setRecordsView("list");
                  }
                }}
                style={[
                  styles.dockItem,
                  isActive && styles.dockItemActive
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

      <InsetCard tone="soft">
        <Text style={styles.sectionLabel}>
          {activePanel === "form" ? "Doctor form wizard" : "Past transfer records"}
        </Text>
        <Text style={styles.helperText}>
          {activePanel === "form"
            ? "Previous/Next se form complete karo. Final step par Save & Lock, Sync Queue, aur Generate QR मिलेगा."
            : "Saved records me se kisi transfer ko form me wapas lao ya synced record se direct QR banao."}
        </Text>
      </InsetCard>

      {activePanel === "form" ? (
        <SectionCard title="Doctor form wizard" subtitle={FORM_STEPS[currentStep].subtitle}>
          <View style={styles.stepRail}>
            {FORM_STEPS.map((step, index) => {
              const isActive = index === currentStep;
              const isDone = index < currentStep;

              return (
                <Pressable
                  key={step.key}
                  onPress={() => {
                    if (index <= currentStep) {
                      setErrors([]);
                      setCurrentStep(index);
                    }
                  }}
                  style={[
                    styles.stepChip,
                    isActive && styles.stepChipActive,
                    isDone && styles.stepChipDone
                  ]}
                >
                  <Text style={[styles.stepChipCount, isActive && styles.stepChipTextActive]}>{index + 1}</Text>
                  <View style={styles.stepChipCopy}>
                    <Text style={[styles.stepChipTitle, isActive && styles.stepChipTextActive]}>{step.title}</Text>
                    <Text style={[styles.stepChipSubtitle, isActive && styles.stepChipTextActive]}>{step.key}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {renderStepContent()}

          {errors.length ? (
            <SectionCard
              title="Step issues"
              subtitle="Next ya final action se pehle in points ko complete karo."
              tone="danger"
            >
              {errors.map((item) => (
                <Text key={item} style={styles.errorText}>
                  {item}
                </Text>
              ))}
            </SectionCard>
          ) : null}

          <View style={styles.navigationRow}>
            <View style={styles.half}>
              <ActionButton
                label="Previous"
                variant="ghost"
                disabled={currentStep === 0}
                onPress={handlePreviousStep}
              />
            </View>
            <View style={styles.half}>
              {!isLastStep ? <ActionButton label="Next" onPress={handleNextStep} /> : <View style={styles.navSpacer} />}
            </View>
          </View>
        </SectionCard>
      ) : (
        renderRecordsPanel()
      )}
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
  transferTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 18
  },
  transferMeta: {
    color: palette.textSoft
  },
  transferRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  inspectCardBadges: {
    gap: 8,
    alignItems: "flex-end"
  },
  transferInfo: {
    flex: 1,
    gap: 4
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
  },
  inspectHeader: {
    gap: 8,
    marginBottom: 12
  },
  inspectSection: {
    gap: 10
  },
  inspectDetail: {
    gap: 4
  },
  inspectLabel: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  inspectValue: {
    color: palette.text,
    lineHeight: 20
  },
  inspectList: {
    gap: 8
  },
  inspectListItem: {
    color: palette.text,
    lineHeight: 20
  },
  stepRail: {
    gap: 10
  },
  stepChip: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.panelSoft,
    alignItems: "center"
  },
  stepChipActive: {
    backgroundColor: palette.teal,
    borderColor: palette.teal
  },
  stepChipDone: {
    borderColor: palette.mint,
    backgroundColor: palette.surfaceNeutral
  },
  stepChipCount: {
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: "center",
    textAlignVertical: "center",
    color: palette.text,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    fontWeight: "800",
    paddingTop: 6
  },
  stepChipCopy: {
    flex: 1,
    gap: 2
  },
  stepChipTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 15
  },
  stepChipSubtitle: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  stepChipTextActive: {
    color: "#ffffff"
  },
  navigationRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  navSpacer: {
    minHeight: 52
  },
  copyStatus: {
    color: palette.mint,
    fontWeight: "700"
  }
});
