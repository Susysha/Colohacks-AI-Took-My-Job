export default function CriticalHeader({ snapshot }) {
  return (
    <section className="critical-panel">
      <article className="critical-card danger">
        <span className="critical-label">Known Allergies</span>
        <strong>{snapshot?.allergies?.join(", ") || "None reported"}</strong>
      </article>
      <article className="critical-card caution">
        <span className="critical-label">Do-Not-Stop Medications</span>
        <strong>{snapshot?.doNotStopMedications?.join(", ") || "No locked meds"}</strong>
      </article>
      <article className="critical-card neutral">
        <span className="critical-label">Reason For Transfer</span>
        <strong>{snapshot?.reasonForTransfer || "Not provided"}</strong>
      </article>
    </section>
  );
}

