import { useEffect, useState } from "react";
import { createStaff, deactivateStaff, fetchAdminDashboard, login, updateStaff } from "../lib/api.js";

const initialCredentials = {
  identifier: "HOSP-ADMIN-001",
  password: "medirelay123"
};

const initialStaffForm = {
  name: "",
  role: "doctor",
  department: "",
  facility: "",
  email: ""
};

export default function AdminPage() {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [session, setSession] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("Hospital admin portal ready.");
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [generatedCredentials, setGeneratedCredentials] = useState(null);

  async function loadDashboard(accessToken = session?.accessToken) {
    if (!accessToken) return;
    const data = await fetchAdminDashboard(accessToken);
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
      if (result.user.role !== "hospital_admin") {
        throw new Error("Only hospital admin accounts can open this dashboard.");
      }
      setSession(result);
      setStatus(`Signed in as ${result.user.name}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleCreateStaff() {
    try {
      const result = await createStaff(session.accessToken, {
        ...staffForm,
        facility: staffForm.facility || session.user.facility
      });
      setGeneratedCredentials(result.credentials);
      setStaffForm(initialStaffForm);
      await loadDashboard();
      setStatus(`Created ${result.staff.name}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleDeactivate(userId) {
    try {
      await deactivateStaff(session.accessToken, userId);
      await loadDashboard();
      setStatus("Staff access removed.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleReset(userId) {
    try {
      const result = await updateStaff(session.accessToken, userId, { resetPassword: true });
      setGeneratedCredentials(result.credentials);
      await loadDashboard();
      setStatus("Temporary password reset.");
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <main className="page sender-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hospital-controlled authentication</p>
          <h2>Admin dashboard for staff access and QR tracking.</h2>
          <p>{status}</p>
        </div>
        <div className="hero-panel">
          <h3>Demo admin credentials</h3>
          <p>HOSP-ADMIN-001 / medirelay123</p>
          <p>Hospitals create all doctor and nurse accounts. Self-registration is disabled.</p>
        </div>
      </section>

      {!session ? (
        <section className="detail-grid sender-grid">
          <article className="content-panel sender-form-panel">
            <div className="section-heading">
              <h3>Hospital Admin Login</h3>
              <p>Only admin accounts can create or remove staff.</p>
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
              />
              <button className="primary-button" onClick={handleLogin} type="button">
                Sign in
              </button>
            </div>
          </article>
        </section>
      ) : (
        <section className="detail-grid sender-grid">
          <article className="content-panel sender-form-panel">
            <div className="section-heading">
              <h3>Create Staff Credentials</h3>
              <p>Hospital admins issue the login ID and temporary password.</p>
            </div>
            <div className="sender-columns">
              <input
                value={staffForm.name}
                onChange={(event) => setStaffForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Staff name"
              />
              <input
                value={staffForm.role}
                onChange={(event) => setStaffForm((current) => ({ ...current, role: event.target.value }))}
                placeholder="doctor"
              />
              <input
                value={staffForm.department}
                onChange={(event) => setStaffForm((current) => ({ ...current, department: event.target.value }))}
                placeholder="Department"
              />
              <input
                value={staffForm.facility}
                onChange={(event) => setStaffForm((current) => ({ ...current, facility: event.target.value }))}
                placeholder={session.user.facility}
              />
              <input
                value={staffForm.email}
                onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email (optional)"
              />
            </div>
            <div className="hero-actions">
              <button className="primary-button" onClick={handleCreateStaff} type="button">
                Create Staff
              </button>
            </div>
            {generatedCredentials ? (
              <div className="ack-summary">
                <h4>Latest credentials</h4>
                <p>Login ID: {generatedCredentials.loginId}</p>
                <p>Temporary password: {generatedCredentials.temporaryPassword}</p>
              </div>
            ) : null}

            <div className="section-heading">
              <h3>Recent QR Logs</h3>
              <p>See which doctor accessed which patient record.</p>
            </div>
            <div className="timeline-list">
              {dashboard?.qrActivityLogs?.map((log, index) => (
                <div className="timeline-card" key={`${log.handoffId}-${log.timestamp}-${index}`}>
                  <span className="timeline-date">{new Date(log.timestamp).toLocaleString()}</span>
                  <strong>{log.eventType}</strong>
                  <p>
                    {log.actor} | {log.department || "No department"}
                  </p>
                  <p>
                    {log.patientName || "Unknown patient"} ({log.patientId || "Unknown ID"})
                  </p>
                </div>
              ))}
            </div>
          </article>

          <aside className="side-panel sender-side-panel">
            <div className="ack-summary">
              <h4>Hospital summary</h4>
              <p>Total staff: {dashboard?.summary?.totalStaff || 0}</p>
              <p>Doctors: {dashboard?.summary?.totalDoctors || 0}</p>
              <p>Nurses: {dashboard?.summary?.totalNurses || 0}</p>
            </div>

            <div className="ack-summary">
              <h4>Department breakdown</h4>
              {(dashboard?.departmentBreakdown || []).map((item) => (
                <p key={item.department}>
                  {item.department}: {item.staffCount}
                </p>
              ))}
            </div>

            <div className="ack-summary">
              <h4>Patient access summary</h4>
              {(dashboard?.patientAccessSummary || []).map((item) => (
                <p key={item.patientId}>
                  {item.patientName} ({item.patientId}) - {item.accessCount} access / {item.uniqueDoctors} doctors
                </p>
              ))}
            </div>

            <div className="ack-summary">
              <h4>Doctor access summary</h4>
              {(dashboard?.doctorAccessSummary || []).map((item) => (
                <p key={item.doctorId || item.doctorName}>
                  {item.doctorName} - {item.accessCount} access
                </p>
              ))}
            </div>

            <div className="ack-summary">
              <h4>Staff roster</h4>
              {(dashboard?.staff || []).map((member) => (
                <div key={member.userId} style={{ marginBottom: 16 }}>
                  <p>
                    <strong>{member.name}</strong>
                  </p>
                  <p>
                    {member.role} | {member.department || "Unassigned"} | {member.loginId}
                  </p>
                  <p>{member.isActive ? "Active" : "Inactive"}</p>
                  <div className="hero-actions">
                    <button className="secondary-button" onClick={() => handleReset(member.userId)} type="button">
                      Reset password
                    </button>
                    <button className="secondary-button" onClick={() => handleDeactivate(member.userId)} type="button">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}
