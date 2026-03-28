import { useEffect, useState } from "react";
import { createHospital, fetchSuperAdminDashboard, login } from "../lib/api.js";

const initialCredentials = {
  identifier: "SUPER-ADMIN-001",
  password: "medirelay123"
};

const initialHospitalForm = {
  name: "",
  code: "",
  address: "",
  adminName: "",
  adminEmail: "",
  adminLoginId: "",
  temporaryPassword: ""
};

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveHospitalAdminDetails(hospital, dashboard, latestProvisioned) {
  const directAdmin = hospital?.primaryAdmin;

  if (directAdmin?.name || directAdmin?.loginId || directAdmin?.email) {
    return directAdmin;
  }

  const matchedRecentAdmin = (dashboard?.recentHospitalAdmins || []).find((admin) => {
    if (hospital?.hospitalId && admin.hospitalId === hospital.hospitalId) {
      return true;
    }

    return normalizeName(admin.facility) === normalizeName(hospital?.name);
  });

  if (matchedRecentAdmin) {
    return matchedRecentAdmin;
  }

  if (latestProvisioned?.hospital?.hospitalId === hospital?.hospitalId) {
    return latestProvisioned.admin;
  }

  return null;
}

export default function SuperAdminPage() {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [session, setSession] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("Network super admin portal ready.");
  const [hospitalForm, setHospitalForm] = useState(initialHospitalForm);
  const [latestProvisioned, setLatestProvisioned] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);

  async function loadDashboard(accessToken = session?.accessToken) {
    if (!accessToken) return;
    const data = await fetchSuperAdminDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    if (session?.accessToken) {
      loadDashboard().catch((error) => setStatus(error.message));
    }
  }, [session]);

  async function handleLogin() {
    try {
      const result = await login(credentials.identifier, credentials.password);
      if (result.user.role !== "system_admin") {
        throw new Error("Only super admin accounts can open this dashboard.");
      }
      setSession(result);
      setStatus(`Signed in as ${result.user.name}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleCreateHospital() {
    try {
      const result = await createHospital(session.accessToken, hospitalForm);
      setLatestProvisioned(result);
      setHospitalForm(initialHospitalForm);
      await loadDashboard();
      setStatus(`Created ${result.hospital.name} and provisioned ${result.admin.name}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function handleOpenHospital(hospital) {
    setSelectedHospital(hospital);
    setStatus(`${hospital.name} details opened.`);
  }

  return (
    <main className="page sender-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">System-wide onboarding</p>
          <h2>Super admin creates hospitals and provisions their first admin accounts.</h2>
          <p>{status}</p>
        </div>
        <div className="hero-panel">
          <h3>Demo super admin credentials</h3>
          <p>SUPER-ADMIN-001 / medirelay123</p>
          <p>Hospitals are created here. Hospital admins then manage their own doctors and nurses.</p>
        </div>
      </section>

      {!session ? (
        <section className="detail-grid sender-grid">
          <article className="content-panel sender-form-panel">
            <div className="section-heading">
              <h3>Super Admin Login</h3>
              <p>Only the network-level super admin can create hospitals.</p>
            </div>
            <div className="form-grid">
              <input
                value={credentials.identifier}
                onChange={(event) => setCredentials((current) => ({ ...current, identifier: event.target.value }))}
                placeholder="Login ID"
              />
              <input
                value={credentials.password}
                onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                placeholder="Password"
                type="password"
              />
              <button className="primary-button" onClick={handleLogin} type="button">
                Sign in
              </button>
            </div>
          </article>
        </section>
      ) : (
        selectedHospital ? (
          (() => {
            const resolvedAdmin = resolveHospitalAdminDetails(selectedHospital, dashboard, latestProvisioned);

            return (
              <section className="detail-grid sender-grid">
            <article className="content-panel sender-form-panel">
              <div className="ack-summary">
                <h4>Hospital details</h4>
                <p>Yahan wahi saved onboarding info hai jo create karte waqt fill ki gayi thi.</p>
                <div className="hero-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setSelectedHospital(null);
                      setStatus("Hospital list reopened.");
                    }}
                    type="button"
                  >
                    Back
                  </button>
                </div>
              </div>

              <div className="ack-summary">
                <h4>Hospital info</h4>
                <div className="detail-rows">
                  <p><span>Hospital name</span>{selectedHospital.name}</p>
                  <p><span>Hospital code</span>{selectedHospital.code || "Not added"}</p>
                  <p><span>Address</span>{selectedHospital.address || "Not added"}</p>
                  <p><span>Created at</span>{selectedHospital.createdAt ? new Date(selectedHospital.createdAt).toLocaleString() : "Unknown"}</p>
                </div>
              </div>

              <div className="ack-summary">
                <h4>First hospital admin</h4>
                <div className="detail-rows">
                  <p><span>Name</span>{resolvedAdmin?.name || "Not available"}</p>
                  <p><span>Login ID</span>{resolvedAdmin?.loginId || "Not available"}</p>
                  <p><span>Email</span>{resolvedAdmin?.email || "Not added"}</p>
                </div>
              </div>
            </article>

            <aside className="side-panel sender-side-panel">
              <div className="ack-summary">
                <h4>Current staffing snapshot</h4>
                <p>Hospital admins: {selectedHospital.hospitalAdmins}</p>
                <p>Doctors: {selectedHospital.doctors}</p>
                <p>Nurses: {selectedHospital.nurses}</p>
              </div>
            </aside>
              </section>
            );
          })()
        ) : (
          <section className="detail-grid sender-grid">
            <article className="content-panel sender-form-panel">
              <div className="section-heading">
                <h3>Create Hospital</h3>
                <p>Create the hospital record and its first hospital admin in one step.</p>
              </div>
              <div className="sender-columns">
                <input
                  value={hospitalForm.name}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Hospital name"
                />
                <input
                  value={hospitalForm.code}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="Hospital code (optional)"
                />
                <input
                  value={hospitalForm.address}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Address (optional)"
                />
                <input
                  value={hospitalForm.adminName}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, adminName: event.target.value }))}
                  placeholder="First hospital admin name"
                />
                <input
                  value={hospitalForm.adminLoginId}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, adminLoginId: event.target.value }))}
                  placeholder="Admin login ID (optional)"
                />
                <input
                  value={hospitalForm.adminEmail}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, adminEmail: event.target.value }))}
                  placeholder="Admin email (optional)"
                />
                <input
                  value={hospitalForm.temporaryPassword}
                  onChange={(event) => setHospitalForm((current) => ({ ...current, temporaryPassword: event.target.value }))}
                  placeholder="Temporary password (optional)"
                  type="password"
                />
              </div>
              <p style={{ color: "var(--text-soft)" }}>
                The first hospital admin will still be required to change this temporary password on first login.
              </p>
              <div className="hero-actions">
                <button className="primary-button" onClick={handleCreateHospital} type="button">
                  Create Hospital
                </button>
              </div>
              {latestProvisioned ? (
                <div className="ack-summary">
                  <h4>Latest provisioning</h4>
                  <p>Hospital: {latestProvisioned.hospital.name}</p>
                  <p>Code: {latestProvisioned.hospital.code}</p>
                  <p>Admin login ID: {latestProvisioned.credentials.loginId}</p>
                  <p>Temporary password: {latestProvisioned.credentials.temporaryPassword}</p>
                </div>
              ) : null}
            </article>

            <aside className="side-panel sender-side-panel">
              <div className="ack-summary">
                <h4>Network summary</h4>
                <p>Total hospitals: {dashboard?.summary?.totalHospitals || 0}</p>
                <p>Hospital admins: {dashboard?.summary?.totalHospitalAdmins || 0}</p>
                <p>Doctors: {dashboard?.summary?.totalDoctors || 0}</p>
                <p>Nurses: {dashboard?.summary?.totalNurses || 0}</p>
              </div>

              <div className="ack-summary">
                <h4>Hospitals</h4>
                {(dashboard?.hospitals || []).map((hospital) => (
                  <button
                    className="timeline-card selector-card"
                    key={hospital.hospitalId}
                    onClick={() => handleOpenHospital(hospital)}
                    type="button"
                  >
                    <span className="timeline-date">Open details</span>
                    <strong>{hospital.name}</strong>
                    <p>{hospital.code || "No code"} | {hospital.address || "Address not added"}</p>
                    <p>{hospital.hospitalAdmins} admins / {hospital.doctors} doctors / {hospital.nurses} nurses</p>
                  </button>
                ))}
              </div>

              <div className="ack-summary">
                <h4>Recent hospital admins</h4>
                {(dashboard?.recentHospitalAdmins || []).map((admin) => (
                  <p key={admin.userId}>
                    {admin.name} - {admin.facility} ({admin.loginId})
                  </p>
                ))}
              </div>
            </aside>
          </section>
        )
      )}
    </main>
  );
}
