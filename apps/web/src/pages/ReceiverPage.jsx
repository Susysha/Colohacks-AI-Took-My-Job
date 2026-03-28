import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import AcknowledgementForm from "../components/AcknowledgementForm.jsx";
import CriticalHeader from "../components/CriticalHeader.jsx";
import Timeline from "../components/Timeline.jsx";
import { fetchSharedTransfer, login, submitAcknowledgement } from "../lib/api.js";

export default function ReceiverPage() {
  const { shortCode } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const [credentials, setCredentials] = useState({
    identifier: "DOC-1001",
    password: "medirelay123"
  });
  const [session, setSession] = useState(null);
  const [state, setState] = useState({ loading: false, error: "", data: null });

  useEffect(() => {
    if (!shortCode || !token || !session?.accessToken) {
      return;
    }

    setState({ loading: true, error: "", data: null });
    fetchSharedTransfer(session.accessToken, shortCode, token)
      .then((data) => setState({ loading: false, error: "", data }))
      .catch((error) => setState({ loading: false, error: error.message, data: null }));
  }, [shortCode, token, session]);

  const record = state.data?.record;
  const snapshot = useMemo(() => record?.criticalSnapshot || {}, [record]);

  async function handleLogin() {
    try {
      const result = await login(credentials.identifier, credentials.password);
      if (result.user.role !== "doctor") {
        throw new Error("Only doctor accounts can access QR records.");
      }
      if (result.user.forcePasswordChange) {
        throw new Error("This doctor account must change its password in the mobile app before QR access is allowed.");
      }
      setSession(result);
    } catch (error) {
      setState({ loading: false, error: error.message, data: null });
    }
  }

  async function handleAcknowledgement(handoffId, payload) {
    const acknowledgement = await submitAcknowledgement(session.accessToken, handoffId, payload);
    setState((current) => ({
      ...current,
      data: {
        ...current.data,
        acknowledgement
      }
    }));
  }

  if (!shortCode || !token) {
    return (
      <main className="page">
        <p className="error-text">Missing secure link token.</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Doctor-only QR access</p>
            <h2>Sign in with a doctor account to open this patient handoff.</h2>
            <p>Hospital admins can create accounts and see logs, but they cannot scan or open QR records.</p>
          </div>
          <div className="hero-panel">
            <h3>Doctor Login</h3>
            <input
              value={credentials.identifier}
              onChange={(event) => setCredentials((current) => ({ ...current, identifier: event.target.value }))}
              placeholder="DOC-1001"
            />
            <input
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
            />
            <button className="primary-button" onClick={handleLogin} type="button">
              Open patient record
            </button>
            {state.error ? <p className="error-text">{state.error}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  if (state.loading) {
    return <main className="page"><p>Loading transfer...</p></main>;
  }

  if (state.error) {
    return <main className="page"><p className="error-text">{state.error}</p></main>;
  }

  if (!record) {
    return <main className="page"><p>Opening secure transfer...</p></main>;
  }

  return (
    <main className="page receiver-page">
      <CriticalHeader snapshot={snapshot} />
      <section className="detail-grid">
        <article className="content-panel">
          <div className="section-heading">
            <h3>Transfer Record</h3>
            <p>
              {record.patientDemographics.name}, {record.patientDemographics.age} years,{" "}
              {record.patientDemographics.sex}
            </p>
          </div>
          <div className="detail-rows">
            <p><span>Patient ID</span>{record.facilityPatientId}</p>
            <p><span>Primary diagnosis</span>{record.primaryDiagnosis}</p>
            <p><span>Sending facility</span>{record.sendingFacility}</p>
            <p><span>Receiving facility</span>{record.receivingFacility}</p>
            <p><span>Reason</span>{record.reasonForTransfer}</p>
            <p><span>Summary</span>{record.clinicalSummary}</p>
          </div>
          <div className="list-grid">
            <div>
              <h4>Medications</h4>
              <ul>
                {record.medications.map((item) => (
                  <li key={`${item.name}-${item.route}`}>
                    {item.name} {item.dose} {item.route} {item.mustContinue ? "(continue)" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Allergies</h4>
              <ul>
                {record.allergies.map((item) => (
                  <li key={item.name}>
                    {item.name} {item.reaction ? `- ${item.reaction}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
        <aside className="side-panel">
          <AcknowledgementForm
            handoffId={record.handoffId}
            reviewer={session.user}
            onSubmit={handleAcknowledgement}
          />
          {state.data.acknowledgement ? (
            <div className="ack-summary">
              <h4>Latest acknowledgement</h4>
              <p>{state.data.acknowledgement.receiverName}</p>
              <p>{state.data.acknowledgement.arrivalNote || "No arrival note."}</p>
            </div>
          ) : null}
        </aside>
      </section>
      <Timeline items={state.data.timeline || []} />
    </main>
  );
}
