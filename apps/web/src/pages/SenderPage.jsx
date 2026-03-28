import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  buildTransferPayload,
  cleanAllergies,
  cleanMedications,
  createCriticalSnapshot,
  evaluateDrugInteractions,
  initialTransferForm,
  validateTransferPayload
} from "@medirelay/shared";
import { fetchDoctorActivity, login, shareTransfer, syncQueuedTransfers } from "../lib/api.js";

const STORAGE_KEY = "medirelay-web-drafts-v2";

const FORM_STEPS = [
  {
    key: "context",
    title: "Patient and transfer context",
    subtitle: "Patient identity, facilities, diagnosis, aur transfer ka reason complete karo."
  },
  {
    key: "medication",
    title: "Medication and allergies",
    subtitle: "Medication aur allergy list ko bedside se hi structured format me lock karo."
  },
  {
    key: "clinical",
    title: "Clinical picture",
    subtitle: "Vitals, pending investigations, aur summary fill karke next jao."
  },
  {
    key: "review",
    title: "Safety, save, sync, and generate",
    subtitle: "Final step me Save & Lock, Sync Queue, aur Generate QR rahega."
  }
];

const SENDER_PANELS = [
  { key: "form", label: "Form", shortLabel: "FM" },
  { key: "records", label: "Records", shortLabel: "RC" }
];

function SenderField({ label, value, onChange, multiline = false, placeholder = "" }) {
  const Comp = multiline ? "textarea" : "input";

  return (
    <label className="sender-field">
      <span>{label}</span>
      <Comp value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function createMutation(record) {
  return {
    mutationId: `web-${record.handoffId}`,
    entityType: "transfer",
    entityId: record.handoffId,
    operation: "upsert",
    payload: record,
    deviceTimestamp: record.createdAt
  };
}

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

export default function SenderPage() {
  const recognitionRef = useRef(null);
  const [credentials, setCredentials] = useState({
    identifier: "DOC-1001",
    password: "medirelay123"
  });
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("Browser sender wizard ready.");
  const [form, setForm] = useState(initialTransferForm);
  const [errors, setErrors] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [shareState, setShareState] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [activity, setActivity] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [draftIdentity, setDraftIdentity] = useState({ handoffId: "", transferChainId: "" });
  const [activePanel, setActivePanel] = useState("form");
  const [inspectedDraftId, setInspectedDraftId] = useState("");
  const [recordsView, setRecordsView] = useState("list");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDrafts(parsed);
        if (parsed[0]?.handoffId) {
          setSelectedId(parsed[0].handoffId);
          setInspectedDraftId(parsed[0].handoffId);
        }
      } catch (_error) {}
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  const payloadPreview = useMemo(() => buildTransferPayload(form, createCriticalSnapshot, draftIdentity), [draftIdentity, form]);
  const warnings = useMemo(
    () =>
      evaluateDrugInteractions({
        allergies: cleanAllergies(form.allergies),
        medications: cleanMedications(form.medications)
      }),
    [form]
  );
  const severeWarnings = warnings.filter((warning) => warning.severity === "high");
  const selectedDraft = drafts.find((item) => item.handoffId === selectedId) || null;
  const inspectedDraft = drafts.find((item) => item.handoffId === inspectedDraftId) || drafts[0] || null;
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const queuedCount = drafts.filter((item) => item.syncStatus !== "synced").length;
  const syncedCount = drafts.filter((item) => item.syncStatus === "synced").length;
  const currentStepIssues = useMemo(
    () => buildStepIssues(form, currentStep, severeWarnings),
    [currentStep, form, severeWarnings]
  );
  const isLastStep = currentStep === FORM_STEPS.length - 1;
  const isRecordDetailsOpen = activePanel === "records" && recordsView === "details" && inspectedDraft;

  function updateForm(updater) {
    setForm((current) => (typeof updater === "function" ? updater(current) : updater));
    setErrors([]);
    setShareState(null);
    setCopyStatus("");
    setSelectedId("");
  }

  function updateMedication(index, key, value) {
    updateForm((current) => {
      const next = [...current.medications];
      next[index] = { ...next[index], [key]: value };
      return { ...current, medications: next };
    });
  }

  function updateAllergy(index, key, value) {
    updateForm((current) => {
      const next = [...current.allergies];
      next[index] = { ...next[index], [key]: value };
      return { ...current, allergies: next };
    });
  }

  function updateVitals(key, value) {
    updateForm((current) => ({
      ...current,
      vitals: { ...current.vitals, [key]: value }
    }));
  }

  async function handleLogin() {
    try {
      const result = await login(credentials.identifier, credentials.password);
      if (result.user.role !== "doctor") {
        throw new Error("Only doctor accounts can use the sender QR workspace.");
      }
      if (result.user.forcePasswordChange) {
        throw new Error("This doctor account must change its password before QR actions are available.");
      }
      setSession(result);
      const activityResult = result.user.role === "doctor" ? await fetchDoctorActivity(result.accessToken) : { activity: [] };
      setActivity(activityResult.activity || []);
      setStatus(`Signed in as ${result.user.name}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function persistDraft(record) {
    setDrafts((current) => [record, ...current.filter((item) => item.handoffId !== record.handoffId)]);
    setSelectedId(record.handoffId);
    setInspectedDraftId(record.handoffId);
  }

  function handleNextStep() {
    if (currentStepIssues.length) {
      setErrors(currentStepIssues);
      setStatus(currentStepIssues[0]);
      return;
    }

    setErrors([]);
    setCurrentStep((step) => Math.min(step + 1, FORM_STEPS.length - 1));
  }

  function handlePreviousStep() {
    setErrors([]);
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  function handleSaveDraft() {
    const payload = buildTransferPayload(form, createCriticalSnapshot, draftIdentity);
    const validation = validateTransferPayload(payload);

    if (!validation.isValid) {
      setErrors(validation.errors);
      setStatus(validation.errors[0]);
      return;
    }

    if (severeWarnings.length && !form.overrideReason.trim()) {
      const nextErrors = ["High-severity interaction flagged. Save & Lock se pehle override reason add karo."];
      setErrors(nextErrors);
      setStatus(nextErrors[0]);
      return;
    }

    const draft = {
      ...payload,
      createdAt: selectedDraft?.createdAt || new Date().toISOString(),
      syncStatus: "queued",
      overrideReason: form.overrideReason,
      localWarnings: warnings
    };

    persistDraft(draft);
    setDraftIdentity({
      handoffId: draft.handoffId,
      transferChainId: draft.transferChainId
    });
    setErrors([]);
    setStatus("Draft save ho gaya aur lock bhi ho gaya. Ab Sync Queue karke Generate QR karo.");
  }

  async function syncDrafts(records = drafts.filter((item) => item.syncStatus !== "synced")) {
    if (!session?.accessToken) {
      throw new Error("Sign in before syncing drafts.");
    }

    if (records.length === 0) {
      setStatus("No queued drafts pending sync.");
      return [];
    }

    const mutations = records.map(createMutation);
    const result = await syncQueuedTransfers(session.accessToken, mutations);
    const accepted = new Set(
      result.results.filter((item) => item.status === "accepted").map((item) => item.handoffId)
    );

    setDrafts((current) =>
      current.map((item) =>
        accepted.has(item.handoffId) ? { ...item, syncStatus: "synced" } : item
      )
    );
    setStatus(`Sync complete. ${accepted.size} browser draft(s) server par chale gaye.`);
    return [...accepted];
  }

  async function handleSyncAll() {
    try {
      await syncDrafts();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function generateQrForDraft(draft) {
    if (!session?.accessToken) {
      setStatus("Sign in before generating QR.");
      return;
    }

    if (!draft) {
      setStatus("Pehle Save & Lock karo.");
      return;
    }

    if (draft.syncStatus !== "synced") {
      setStatus("Generate QR se pehle Sync Queue complete karo.");
      return;
    }

    try {
      const result = await shareTransfer(session.accessToken, draft.handoffId);
      setSelectedId(draft.handoffId);
      setShareState(result);
      setStatus("QR aur secure link ready hain.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleGenerateQr() {
    await generateQrForDraft(selectedDraft);
  }

  function handleInspectDraft(draft) {
    if (!draft) return;

    setInspectedDraftId(draft.handoffId);
    setRecordsView("details");
    setActivePanel("records");
    setShareState(null);
    setCopyStatus("");
    setStatus(`${draft.patientDemographics?.name || "Saved transfer"} details inspect view me open ho gaye.`);
  }

  function handleDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatus("Browser speech recognition is unavailable.");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus("Listening for clinical summary dictation...");
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      updateForm((current) => ({ ...current, clinicalSummary: transcript }));
      setStatus("Browser dictation capture ho gayi. Review karke next jao.");
    };

    recognition.onerror = () => {
      setStatus("Speech recognition failed. Type the summary manually.");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }

  async function handleCopyLink() {
    if (!shareState?.shortUrl) return;

    try {
      await navigator.clipboard.writeText(shareState.shortUrl);
      setCopyStatus("Link copy ho gaya.");
      setStatus("Secure link clipboard me copy ho gaya.");
    } catch (_error) {
      setCopyStatus("Copy failed. Manually select karke copy karo.");
      setStatus("Clipboard access fail hua.");
    }
  }

  function handleCreateAnother() {
    setForm(initialTransferForm);
    setErrors([]);
    setSelectedId("");
    setShareState(null);
    setCurrentStep(0);
    setCopyStatus("");
    setDraftIdentity({ handoffId: "", transferChainId: "" });
    setRecordsView("list");
    setActivePanel("form");
    setStatus("New browser sender form ready.");
  }

  function renderContextStep() {
    return (
      <>
        <div className="sender-columns">
          <SenderField
            label="Facility patient ID"
            value={form.facilityPatientId}
            onChange={(value) => updateForm((current) => ({ ...current, facilityPatientId: value }))}
          />
          <SenderField
            label="Patient name"
            value={form.patientName}
            onChange={(value) => updateForm((current) => ({ ...current, patientName: value }))}
          />
          <SenderField
            label="Age"
            value={form.patientAge}
            onChange={(value) => updateForm((current) => ({ ...current, patientAge: value }))}
          />
          <SenderField
            label="Sex"
            value={form.patientSex}
            onChange={(value) => updateForm((current) => ({ ...current, patientSex: value }))}
          />
          <SenderField
            label="Sending facility"
            value={form.sendingFacility}
            onChange={(value) => updateForm((current) => ({ ...current, sendingFacility: value }))}
          />
          <SenderField
            label="Receiving facility"
            value={form.receivingFacility}
            onChange={(value) => updateForm((current) => ({ ...current, receivingFacility: value }))}
          />
        </div>

        <SenderField
          label="Primary diagnosis"
          value={form.primaryDiagnosis}
          onChange={(value) => updateForm((current) => ({ ...current, primaryDiagnosis: value }))}
        />
        <SenderField
          label="Reason for transfer"
          value={form.reasonForTransfer}
          onChange={(value) => updateForm((current) => ({ ...current, reasonForTransfer: value }))}
          multiline
        />
      </>
    );
  }

  function renderMedicationStep() {
    return (
      <div className="sender-list-grid">
        <div>
          <h4>Medications</h4>
          {form.medications.map((item, index) => (
            <div className="mini-card" key={`web-med-${index}`}>
              <SenderField
                label="Medication"
                value={item.name}
                onChange={(value) => updateMedication(index, "name", value)}
              />
              <div className="sender-columns">
                <SenderField
                  label="Dose"
                  value={item.dose}
                  onChange={(value) => updateMedication(index, "dose", value)}
                />
                <SenderField
                  label="Route"
                  value={item.route}
                  onChange={(value) => updateMedication(index, "route", value)}
                />
                <SenderField
                  label="Must continue"
                  value={item.mustContinue ? "Yes" : "No"}
                  onChange={(value) => updateMedication(index, "mustContinue", value.toLowerCase() !== "no")}
                />
              </div>
            </div>
          ))}
          <button
            className="secondary-button"
            onClick={() =>
              updateForm((current) => ({
                ...current,
                medications: [...current.medications, { name: "", dose: "", route: "", mustContinue: false }]
              }))
            }
            type="button"
          >
            Add medication
          </button>
        </div>

        <div>
          <h4>Allergies</h4>
          {form.allergies.map((item, index) => (
            <div className="mini-card" key={`web-allergy-${index}`}>
              <SenderField
                label="Allergy"
                value={item.name}
                onChange={(value) => updateAllergy(index, "name", value)}
              />
              <SenderField
                label="Reaction"
                value={item.reaction}
                onChange={(value) => updateAllergy(index, "reaction", value)}
              />
            </div>
          ))}
          <button
            className="secondary-button"
            onClick={() =>
              updateForm((current) => ({
                ...current,
                allergies: [...current.allergies, { name: "", reaction: "" }]
              }))
            }
            type="button"
          >
            Add allergy
          </button>
        </div>
      </div>
    );
  }

  function renderClinicalStep() {
    return (
      <>
        <div className="sender-columns">
          <SenderField
            label="Blood pressure"
            value={form.vitals.bloodPressure}
            onChange={(value) => updateVitals("bloodPressure", value)}
          />
          <SenderField
            label="Pulse"
            value={form.vitals.pulse}
            onChange={(value) => updateVitals("pulse", value)}
          />
          <SenderField
            label="SpO2"
            value={form.vitals.spo2}
            onChange={(value) => updateVitals("spo2", value)}
          />
          <SenderField
            label="Temperature"
            value={form.vitals.temperature}
            onChange={(value) => updateVitals("temperature", value)}
          />
        </div>

        <SenderField
          label="Pending investigations (one per line)"
          value={form.pendingInvestigationsText}
          onChange={(value) => updateForm((current) => ({ ...current, pendingInvestigationsText: value }))}
          multiline
        />
        <SenderField
          label="Clinical summary"
          value={form.clinicalSummary}
          onChange={(value) => updateForm((current) => ({ ...current, clinicalSummary: value }))}
          multiline
        />

        <div className="sender-toolbar">
          <button className="secondary-button" onClick={handleDictation} type="button">
            {isListening ? "Stop dictation" : "Dictate summary"}
          </button>
          <p>{speechSupported ? "Browser speech recognition available." : "Browser dictation not supported."}</p>
        </div>
      </>
    );
  }

  function renderReviewStep() {
    const draftStatus = selectedDraft
      ? selectedDraft.syncStatus === "synced"
        ? "Locked + synced"
        : "Locked, sync pending"
      : "Save & Lock pending";

    return (
      <>
        <div className="sender-metrics">
          <div className="metric-box">
            <strong>{queuedCount}</strong>
            <span>Queued locally</span>
          </div>
          <div className="metric-box">
            <strong>{syncedCount}</strong>
            <span>Synced to server</span>
          </div>
          <div className="metric-box">
            <strong>{severeWarnings.length}</strong>
            <span>Severe alerts</span>
          </div>
        </div>

        <div className="sender-badges">
          <span className="status-pill">{draftStatus}</span>
          <span className="status-pill">{session ? "Doctor signed in" : "Sign-in required"}</span>
          <span className="status-pill">Generate QR last step</span>
        </div>

        {warnings.length ? (
          <div className="warning-panel">
            <h4>Safety check</h4>
            {warnings.map((warning) => (
              <p key={warning.id}>
                {warning.severity.toUpperCase()}: {warning.message}
              </p>
            ))}
            {severeWarnings.length ? (
              <SenderField
                label="Override reason"
                value={form.overrideReason}
                onChange={(value) => updateForm((current) => ({ ...current, overrideReason: value }))}
                multiline
              />
            ) : null}
          </div>
        ) : null}

        <div className="mini-card">
          <h4>{form.patientName || "Unnamed patient"}</h4>
          <p>{form.primaryDiagnosis || "Primary diagnosis pending"}</p>
          <p>Reason: {form.reasonForTransfer || "Reason pending"}</p>
          <p>Receiving facility: {form.receivingFacility || "Not set"}</p>
        </div>

        <div className="hero-actions">
          <button className="primary-button" onClick={handleSaveDraft} type="button">
            Save & Lock
          </button>
          <button className="secondary-button" onClick={handleSyncAll} type="button">
            Sync Queue
          </button>
          <button
            className="primary-button"
            disabled={!selectedDraft || selectedDraft.syncStatus !== "synced"}
            onClick={handleGenerateQr}
            type="button"
          >
            Generate QR
          </button>
        </div>
        <p className="review-helper">Flow: pehle Save & Lock, phir Sync Queue, aur sync ke baad Generate QR.</p>
      </>
    );
  }

  function renderStepContent() {
    if (currentStep === 0) return renderContextStep();
    if (currentStep === 1) return renderMedicationStep();
    if (currentStep === 2) return renderClinicalStep();
    return renderReviewStep();
  }

  function renderDraftInspection(draft) {
    if (!draft) return null;

    const warningsToShow = draft.localWarnings || [];

    return (
      <div className="warning-panel">
        <div className="section-heading">
          <h3>Saved transfer details</h3>
          <p>Jo fields doctor ne Save & Lock ke time fill ki thi, woh yahan full detail me visible hain.</p>
        </div>

        <div className="hero-actions">
          <button
            className="secondary-button"
            onClick={() => {
              setRecordsView("list");
              setStatus("Past transfer records list opened.");
            }}
            type="button"
          >
            Back to records
          </button>
        </div>

        <div className="sender-badges">
          <span className="status-pill">{draft.syncStatus === "synced" ? "Synced record" : "Queued locally"}</span>
          <span className="status-pill">Handoff ID: {draft.handoffId}</span>
          <span className="status-pill">Chain ID: {draft.transferChainId}</span>
        </div>

        <div className="sender-list-grid">
          <div className="mini-card">
            <h4>Patient and transfer context</h4>
            <div className="detail-rows">
              <p><span>Patient name</span>{draft.patientDemographics?.name || "Not saved"}</p>
              <p><span>Age / sex</span>{draft.patientDemographics?.age || "NA"} / {draft.patientDemographics?.sex || "NA"}</p>
              <p><span>Facility patient ID</span>{draft.facilityPatientId || "Not saved"}</p>
              <p><span>Sending facility</span>{draft.sendingFacility || "Not saved"}</p>
              <p><span>Receiving facility</span>{draft.receivingFacility || "Not saved"}</p>
              <p><span>Primary diagnosis</span>{draft.primaryDiagnosis || "Not saved"}</p>
              <p><span>Reason for transfer</span>{draft.reasonForTransfer || "Not saved"}</p>
              <p><span>Created at</span>{new Date(draft.createdAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="mini-card">
            <h4>Clinical picture</h4>
            <div className="detail-rows">
              <p><span>Blood pressure</span>{draft.vitals?.bloodPressure || "Not saved"}</p>
              <p><span>Pulse</span>{draft.vitals?.pulse || "Not saved"}</p>
              <p><span>SpO2</span>{draft.vitals?.spo2 || "Not saved"}</p>
              <p><span>Temperature</span>{draft.vitals?.temperature || "Not saved"}</p>
              <p><span>Clinical summary</span>{draft.clinicalSummary || "Not saved"}</p>
              <p><span>Override reason</span>{draft.overrideReason || "Not added"}</p>
            </div>
          </div>

          <div className="mini-card">
            <h4>Medications</h4>
            {draft.medications?.length ? (
              <ul>
                {draft.medications.map((item, index) => (
                  <li key={`${draft.handoffId}-med-${index}`}>
                    {item.name || "Unnamed medication"} | Dose: {item.dose || "NA"} | Route: {item.route || "NA"} | Must continue:{" "}
                    {item.mustContinue ? "Yes" : "No"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No medications saved.</p>
            )}
          </div>

          <div className="mini-card">
            <h4>Allergies</h4>
            {draft.allergies?.length ? (
              <ul>
                {draft.allergies.map((item, index) => (
                  <li key={`${draft.handoffId}-allergy-${index}`}>
                    {item.name || "Unnamed allergy"} | Reaction: {item.reaction || "NA"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No allergies saved.</p>
            )}
          </div>

          <div className="mini-card">
            <h4>Pending investigations</h4>
            {draft.pendingInvestigations?.length ? (
              <ul>
                {draft.pendingInvestigations.map((item, index) => (
                  <li key={`${draft.handoffId}-investigation-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No pending investigations saved.</p>
            )}
          </div>

          <div className="mini-card">
            <h4>Critical snapshot and saved warnings</h4>
            <div className="detail-rows">
              <p>
                <span>Critical allergies</span>
                {draft.criticalSnapshot?.allergies?.join(", ") || "None"}
              </p>
              <p>
                <span>Do-not-stop meds</span>
                {draft.criticalSnapshot?.doNotStopMedications?.join(", ") || "None"}
              </p>
              <p>
                <span>Snapshot reason</span>
                {draft.criticalSnapshot?.reasonForTransfer || "Not saved"}
              </p>
            </div>

            {warningsToShow.length ? (
              <ul>
                {warningsToShow.map((warning) => (
                  <li key={warning.id}>
                    {warning.severity?.toUpperCase() || "INFO"}: {warning.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No saved safety warnings.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderRecordsPanel() {
    if (recordsView === "details" && inspectedDraft) {
      return renderDraftInspection(inspectedDraft);
    }

    return (
      <>
        <div className="section-heading">
          <h3>Past transfer records</h3>
          <p>Yeh section read-only hai. Kisi bhi saved transfer ko kholo aur sirf filled details dekho.</p>
        </div>

        <div className="timeline-list">
          {drafts.length ? (
            drafts.map((draft) => (
              <div
                className={`timeline-card ${inspectedDraft?.handoffId === draft.handoffId ? "selected-card" : ""}`}
                key={draft.handoffId}
              >
                <span className="timeline-date">{new Date(draft.createdAt).toLocaleString()}</span>
                <strong>{draft.patientDemographics.name || "Unnamed patient"}</strong>
                <p>{draft.primaryDiagnosis || "No diagnosis yet"}</p>
                <p>{draft.receivingFacility || "Receiving facility pending"}</p>
                <p>{draft.syncStatus}</p>
                <div className="hero-actions compact-actions">
                  <button className="primary-button" onClick={() => handleInspectDraft(draft)} type="button">
                    View details
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="ack-summary">
              <h4>No past transfer records</h4>
              <p>Save & Lock ke baad drafts yahin dikhne lagenge.</p>
            </div>
          )}
        </div>
      </>
    );
  }

  if (shareState) {
    return (
      <main className="page sender-page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">QR generated</p>
            <h2>Doctor share package ready.</h2>
            <p>Ab yahan se sirf QR aur secure link share karna hai.</p>
          </div>
          <div className="hero-panel">
            <h3>Workspace status</h3>
            <p>{status}</p>
            <p>Link ko copy karke seedha receiving team ko bhej sakte ho.</p>
          </div>
        </section>

        <section className="detail-grid sender-grid">
          <article className="content-panel sender-form-panel">
            <div className="section-heading">
              <h3>Secure link</h3>
              <p>Link aur QR dono same doctor share package ko open karte hain.</p>
            </div>

            <div className="share-link-card">
              <p>{shareState.shortUrl}</p>
            </div>

            <div className="hero-actions">
              <button className="primary-button" onClick={handleCopyLink} type="button">
                Copy link
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setShareState(null);
                  setActivePanel("records");
                  setRecordsView("list");
                  setStatus("Past transfer records opened.");
                }}
                type="button"
              >
                Back to records
              </button>
              <button className="secondary-button" onClick={handleCreateAnother} type="button">
                Create another
              </button>
            </div>

            {copyStatus ? <p className="copy-note">{copyStatus}</p> : null}

            <div className="qr-shell large-qr-shell">
              <QRCodeSVG size={220} value={shareState.qrPayload} />
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="page sender-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Doctor workspace on the web too</p>
          <h2>Step-by-step doctor form, then Save, Sync, and Generate QR.</h2>
          <p>
            Full doctor handoff form ab parts me divide hai. Previous/Next se complete karo,
            aur final step par Save & Lock, Sync Queue, aur Generate QR use karo.
          </p>
        </div>
        <div className="hero-panel">
          <h3>Workspace status</h3>
          <p>{status}</p>
          <div className="form-grid">
            <input
              value={credentials.identifier}
              onChange={(event) =>
                setCredentials((current) => ({ ...current, identifier: event.target.value }))
              }
              placeholder="DOC-1001"
            />
            <input
              value={credentials.password}
              onChange={(event) =>
                setCredentials((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="Password"
            />
            <button className="primary-button" onClick={handleLogin} type="button">
              {session ? "Re-authenticate" : "Sign in"}
            </button>
          </div>
        </div>
      </section>

      <section className="detail-grid sender-grid">
        <article className="content-panel sender-form-panel">
          {!isRecordDetailsOpen ? (
            <div className="sender-panel-switch">
              {SENDER_PANELS.map((panel) => (
                <button
                  className={`sender-toggle-card ${activePanel === panel.key ? "active" : ""}`}
                  key={panel.key}
                  onClick={() => {
                    setActivePanel(panel.key);
                    if (panel.key === "records") {
                      setRecordsView("list");
                    }
                  }}
                  type="button"
                >
                  <span className="sender-toggle-count">{panel.shortLabel}</span>
                  <span className="sender-toggle-copy">
                    <strong>{panel.label}</strong>
                    <small>{panel.key === "form" ? "Structured wizard" : "Past transfer records"}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {activePanel === "form" ? (
            <>
              <div className="section-heading">
                <h3>Structured Transfer Wizard</h3>
                <p>{FORM_STEPS[currentStep].subtitle}</p>
              </div>

              <div className="wizard-steps">
                {FORM_STEPS.map((step, index) => (
                  <button
                    className={`wizard-step ${index === currentStep ? "active" : ""} ${index < currentStep ? "done" : ""}`}
                    key={step.key}
                    onClick={() => {
                      if (index <= currentStep) {
                        setErrors([]);
                        setCurrentStep(index);
                      }
                    }}
                    type="button"
                  >
                    <span className="wizard-step-count">{index + 1}</span>
                    <span className="wizard-step-copy">
                      <strong>{step.title}</strong>
                      <small>{step.key}</small>
                    </span>
                  </button>
                ))}
              </div>

              {renderStepContent()}

              {errors.length ? (
                <div className="error-panel">
                  {errors.map((error) => (
                    <p className="error-text" key={error}>
                      {error}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="wizard-nav">
                <button
                  className="secondary-button"
                  disabled={currentStep === 0}
                  onClick={handlePreviousStep}
                  type="button"
                >
                  Previous
                </button>
                {!isLastStep ? (
                  <button className="primary-button" onClick={handleNextStep} type="button">
                    Next
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </>
          ) : (
            renderRecordsPanel()
          )}
        </article>

        {!isRecordDetailsOpen ? (
          <aside className="side-panel sender-side-panel">
          <div className="ack-summary">
            <h4>Critical snapshot preview</h4>
            <p>Allergies: {payloadPreview.criticalSnapshot.allergies.join(", ") || "None"}</p>
            <p>
              Do-not-stop meds:{" "}
              {payloadPreview.criticalSnapshot.doNotStopMedications.join(", ") || "None"}
            </p>
            <p>Reason: {payloadPreview.criticalSnapshot.reasonForTransfer || "Not set"}</p>
          </div>

          <div className="ack-summary">
            <h4>Saved browser drafts</h4>
            {drafts.length ? (
              drafts.map((draft) => (
                <button
                  className={`timeline-card selector-card ${inspectedDraftId === draft.handoffId ? "selected-card" : ""}`}
                  key={draft.handoffId}
                  onClick={() => handleInspectDraft(draft)}
                  type="button"
                >
                  <span className="timeline-date">{new Date(draft.createdAt).toLocaleString()}</span>
                  <strong>{draft.patientDemographics.name || "Unnamed patient"}</strong>
                  <p>{draft.primaryDiagnosis || "No diagnosis yet"}</p>
                  <p>{draft.syncStatus}</p>
                </button>
              ))
            ) : (
              <p>No drafts saved yet.</p>
            )}
          </div>

          <div className="ack-summary">
            <h4>Doctor interaction history</h4>
            {activity.length ? (
              activity.slice(0, 6).map((item, index) => (
                <p key={`${item.handoffId}-${item.timestamp}-${index}`}>
                  {item.eventType} | {item.patientName || item.patientId || "Unknown patient"}
                </p>
              ))
            ) : (
              <p>No tracked QR activity yet.</p>
            )}
          </div>
          </aside>
        ) : null}
      </section>
    </main>
  );
}
