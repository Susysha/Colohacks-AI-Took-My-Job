import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <main className="page home-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hospital-controlled authentication + QR tracking</p>
          <h2>Doctors scan the QR. Hospitals control every account.</h2>
          <p>
            Hospitals create doctor and nurse accounts, doctors generate and scan QR records, and
            every patient access stays visible to the admin dashboard.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" to="/sender">
              Open doctor workspace
            </Link>
            <Link className="secondary-button" to="/admin">
              Open hospital admin
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <h3>Demo credentials</h3>
          <p>Admin: HOSP-ADMIN-001 / medirelay123</p>
          <p>Doctor: DOC-1001 / medirelay123</p>
          <p>Nurse: NUR-1001 / medirelay123</p>
        </div>
      </section>
    </main>
  );
}
