import { useState } from "react";

const defaultState = {
  arrivalNote: "",
  discrepancies: []
};

const discrepancyOptions = [
  "Missing medication details",
  "Vitals mismatch on arrival",
  "Diagnosis clarification needed"
];

export default function AcknowledgementForm({ handoffId, reviewer, onSubmit }) {
  const [form, setForm] = useState(defaultState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onSubmit(handoffId, form);
      setForm(defaultState);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDiscrepancy(item) {
    setForm((current) => ({
      ...current,
      discrepancies: current.discrepancies.includes(item)
        ? current.discrepancies.filter((value) => value !== item)
        : [...current.discrepancies, item]
    }));
  }

  return (
    <form className="ack-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <h3>Doctor Acknowledgement</h3>
        <p>Identity comes from the signed-in doctor account. Only arrival review is entered here.</p>
      </div>
      <div className="ack-summary">
        <p>{reviewer?.name || "Doctor not signed in"}</p>
        <p>
          {reviewer?.department || "No department"} | {reviewer?.facility || "No facility"}
        </p>
      </div>
      <textarea
        rows="4"
        placeholder="Arrival note"
        value={form.arrivalNote}
        onChange={(event) => setForm({ ...form, arrivalNote: event.target.value })}
      />
      <div className="checkbox-grid">
        {discrepancyOptions.map((item) => (
          <label key={item}>
            <input
              type="checkbox"
              checked={form.discrepancies.includes(item)}
              onChange={() => toggleDiscrepancy(item)}
            />
            {item}
          </label>
        ))}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? "Saving..." : "Mark As Reviewed"}
      </button>
    </form>
  );
}
