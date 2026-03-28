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

const STORAGE_KEY = "medirelay-web-drafts-v1";

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

export default function SenderPage() {
  const recognitionRef = useRef(null);
  const [credentials, setCredentials] = useState({
    identifier: "DOC-1001",
    password: "medirelay123"
  });
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("Browser sender workspace ready.");
  const [form, setForm] = useState(initialTransferForm);
  const [errors, setErrors] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [shareState, setShareState] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDrafts(parsed);
        if (parsed[0]?.handoffId) {
          setSelectedId(parsed[0].handoffId);
        }
      } catch (_error) {}
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  const payloadPreview = useMemo(
    () => buildTransferPayload(form, createCriticalSnapshot),
    [form]
  );
  const warnings = useMemo(
    () =>
      evaluateDrugInteractions({
        allergies: cleanAllergies(form.allergies),
        medications: cleanMedications(form.medications)
      }),
    [form]
  );
  const selectedDraft = drafts.find((item) => item.handoffId === selectedId) || null;
  const severeWarning = warnings.some((warning) => warning.severity === "high");
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function updateMedication(index, key, value) {
    setForm((current) => {
      const next = [...current.medications];
      next[index] = { ...next[index], [key]: value };
      return { ...current, medications: next };
    });
  }

  function updateAllergy(index, key, value) {
    setForm((current) => {
      const next = [...current.allergies];
      next[index] = { ...next[index], [key]: value };
      return { ...current, allergies: next };
    });
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
      setStatus(
        result.user.forcePasswordChange
          ? "Password change is required before QR and transfer actions are available."
          : `Signed in as ${result.user.name}.`
      );
    } catch (error) {
      setStatus(error.message);
    }
  }

  function persistDraft(record) {
    setDrafts((current) => {
      const next = [record, ...current.filter((item) => item.handoffId !== record.handoffId)];
      return next;
    });
    setSelectedId(record.handoffId);
  }

  function handleSaveDraft() {
    const payload = buildTransferPayload(form, createCriticalSnapshot);
    const validation = validateTransferPayload(payload);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (severeWarning && !form.overrideReason.trim()) {
      setErrors(["High-severity interaction flagged. Add an override reason before saving."]);
      return;
    }

    const draft = {
      ...payload,
      createdAt: new Date().toISOString(),
      syncStatus: "queued",
      overrideReason: form.overrideReason,
      localWarnings: warnings
    };

    persistDraft(draft);
    setErrors([]);
    setStatus("Draft saved in the browser workspace and queued for sync.");
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
    setStatus(`Synced ${accepted.size} browser draft(s).`);
    return [...accepted];
  }

  async function handleSyncAll() {
    try {
      await syncDrafts();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleShareDraft(draft) {
    if (!draft) return;

    try {
      if (draft.syncStatus !== "synced") {
        await syncDrafts([draft]);
      }

      const result = await shareTransfer(session.accessToken, draft.handoffId);
      setShareState(result);
      setSelectedId(draft.handoffId);
      setStatus("Secure link and QR package generated from the web sender workspace.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  function handleLoadDraft(draft) {
    setSelectedId(draft.handoffId);
    setForm({
      ...initialTransferForm,
      facilityPatientId: draft.facilityPatientId,
      patientName: draft.patientDemographics.name,
      patientAge: draft.patientDemographics.age,
      patientSex: draft.patientDemographics.sex,
      sendingFacility: draft.sendingFacility,
      receivingFacility: draft.receivingFacility,
      primaryDiagnosis: draft.primaryDiagnosis,
      medications: draft.medications,
      allergies: draft.allergies,
      reasonForTransfer: draft.reasonForTransfer,
      vitals: draft.vitals,
      pendingInvestigationsText: draft.pendingInvestigations.join("\n"),
      clinicalSummary: draft.clinicalSummary,
      overrideReason: draft.overrideReason || ""
    });
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
      setForm((current) => ({ ...current, clinicalSummary: transcript }));
      setStatus("Browser dictation captured. Review before saving.");
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

  return (
    <main className="page sender-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Doctor workspace on the web too</p>
          <h2>Create, queue, sync, and generate a doctor-only QR flow from the browser.</h2>
          <p>
            This workspace mirrors the doctor mobile flow with local drafts, safety checks, browser
            dictation, sync, QR generation, and tracked patient access.
          </p>
        </div>
        <div className="hero-panel">
          <h3>Workspace status</h3>
          <p>{status}</p>
          <p>Draft storage uses browser local storage for parity with the offline mobile flow.</p>
        </div>
      </section>

      <section className="detail-grid sender-grid">
        <article className="content-panel sender-form-panel">
          <div className="section-heading">
            <h3>Doctor Login</h3>
            <p>Use the hospital-issued login ID. Self-registration is disabled.</p>
          </div>
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

          <div className="section-heading">
            <h3>Structured Transfer Form</h3>
            <p>Same data contract and validation as the mobile app.</p>
          </div>

          <div className="sender-columns">
            <SenderField
              label="Facility patient ID"
              value={form.facilityPatientId}
              onChange={(value) => setForm((current) => ({ ...current, facilityPatientId: value }))}
            />
            <SenderField
              label="Patient name"
              value={form.patientName}
              onChange={(value) => setForm((current) => ({ ...current, patientName: value }))}
            />
            <SenderField
              label="Age"
              value={form.patientAge}
              onChange={(value) => setForm((current) => ({ ...current, patientAge: value }))}
            />
            <SenderField
              label="Sex"
              value={form.patientSex}
              onChange={(value) => setForm((current) => ({ ...current, patientSex: value }))}
            />
            <SenderField
              label="Sending facility"
              value={form.sendingFacility}
              onChange={(value) => setForm((current) => ({ ...current, sendingFacility: value }))}
            />
            <SenderField
              label="Receiving facility"
              value={form.receivingFacility}
              onChange={(value) => setForm((current) => ({ ...current, receivingFacility: value }))}
            />
          </div>

          <SenderField
            label="Primary diagnosis"
            value={form.primaryDiagnosis}
            onChange={(value) => setForm((current) => ({ ...current, primaryDiagnosis: value }))}
          />
          <SenderField
            label="Reason for transfer"
            value={form.reasonForTransfer}
            onChange={(value) => setForm((current) => ({ ...current, reasonForTransfer: value }))}
            multiline
          />

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
                      onChange={(value) =>
                        updateMedication(index, "mustContinue", value.toLowerCase() !== "no")
                      }
                    />
                  </div>
                </div>
              ))}
              <button
                className="secondary-button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    medications: [
                      ...current.medications,
                      { name: "", dose: "", route: "", mustContinue: false }
                    ]
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
                  setForm((current) => ({
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

          <div className="sender-columns">
            <SenderField
              label="Blood pressure"
              value={form.vitals.bloodPressure}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  vitals: { ...current.vitals, bloodPressure: value }
                }))
              }
            />
            <SenderField
              label="Pulse"
              value={form.vitals.pulse}
              onChange={(value) =>
                setForm((current) => ({ ...current, vitals: { ...current.vitals, pulse: value } }))
              }
            />
            <SenderField
              label="SpO2"
              value={form.vitals.spo2}
              onChange={(value) =>
                setForm((current) => ({ ...current, vitals: { ...current.vitals, spo2: value } }))
              }
            />
            <SenderField
              label="Temperature"
              value={form.vitals.temperature}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  vitals: { ...current.vitals, temperature: value }
                }))
              }
            />
          </div>

          <SenderField
            label="Pending investigations (one per line)"
            value={form.pendingInvestigationsText}
            onChange={(value) =>
              setForm((current) => ({ ...current, pendingInvestigationsText: value }))
            }
            multiline
          />
          <SenderField
            label="Clinical summary"
            value={form.clinicalSummary}
            onChange={(value) => setForm((current) => ({ ...current, clinicalSummary: value }))}
            multiline
          />

          <div className="sender-toolbar">
            <button className="secondary-button" onClick={handleDictation} type="button">
              {isListening ? "Stop dictation" : "Dictate summary"}
            </button>
            <p>{speechSupported ? "Browser speech recognition available." : "Browser dictation not supported."}</p>
          </div>

          {warnings.length ? (
            <div className="warning-panel">
              <h4>Safety check</h4>
              {warnings.map((warning) => (
                <p key={warning.id}>
                  {warning.severity.toUpperCase()}: {warning.message}
                </p>
              ))}
              {severeWarning ? (
                <SenderField
                  label="Override reason"
                  value={form.overrideReason}
                  onChange={(value) => setForm((current) => ({ ...current, overrideReason: value }))}
                  multiline
                />
              ) : null}
            </div>
          ) : null}

          {errors.length ? (
            <div className="error-panel">
              {errors.map((error) => (
                <p className="error-text" key={error}>
                  {error}
                </p>
              ))}
            </div>
          ) : null}

          <div className="hero-actions">
            <button className="primary-button" onClick={handleSaveDraft} type="button">
              Save local draft
            </button>
            <button className="secondary-button" onClick={handleSyncAll} type="button">
              Sync queued drafts
            </button>
          </div>
        </article>

        <aside className="side-panel sender-side-panel">
          <div className="section-heading">
            <h3>Browser queue</h3>
            <p>Same sender workflow is now available on the web.</p>
          </div>
          <div className="timeline-list">
            {drafts.map((draft) => (
              <button
                className={`timeline-card selector-card ${selectedId === draft.handoffId ? "selected-card" : ""}`}
                key={draft.handoffId}
                onClick={() => handleLoadDraft(draft)}
                type="button"
              >
                <span className="timeline-date">{new Date(draft.createdAt).toLocaleString()}</span>
                <strong>{draft.patientDemographics.name || "Unnamed patient"}</strong>
                <p>{draft.primaryDiagnosis || "No diagnosis yet"}</p>
                <p>{draft.syncStatus}</p>
              </button>
            ))}
          </div>

          {selectedDraft ? (
            <div className="ack-summary">
              <h4>Selected draft</h4>
              <p>{selectedDraft.patientDemographics.name}</p>
              <p>{selectedDraft.reasonForTransfer}</p>
              <button className="primary-button" onClick={() => handleShareDraft(selectedDraft)} type="button">
                Sync + Share
              </button>
            </div>
          ) : null}

          {shareState ? (
            <div className="share-panel">
              <h4>Share package</h4>
              <p>{shareState.shortUrl}</p>
              <div className="qr-shell">
                <QRCodeSVG size={170} value={shareState.qrPayload} />
              </div>
              <p>QR mode: {shareState.qrMode}</p>
              <p>Patient reference: {shareState.patientReference?.patientId || "N/A"}</p>
            </div>
          ) : null}

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
      </section>
    </main>
  );
}
