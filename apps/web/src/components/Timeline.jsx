export default function Timeline({ items }) {
  return (
    <section className="timeline-panel">
      <div className="section-heading">
        <h3>Transfer Timeline</h3>
        <p>Chronological journey for the current transfer chain.</p>
      </div>
      <div className="timeline-list">
        {items.map((item) => (
          <article className="timeline-card" key={item.handoffId}>
            <span className="timeline-date">{new Date(item.createdAt).toLocaleString()}</span>
            <strong>{item.primaryDiagnosis}</strong>
            <p>
              {item.sendingFacility} to {item.receivingFacility}
            </p>
            <p>{item.reasonForTransfer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

