import { useEffect, useState } from "react";
import { createStaff, fetchAdminDashboard, login, updateStaff } from "../lib/api.js";

const initialCredentials = {
  identifier: "HOSP-ADMIN-001",
  password: "medirelay123"
};

const initialStaffForm = {
  name: "",
  role: "doctor",
  department: "",
  email: "",
  password: ""
};

export default function AdminPage() {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [session, setSession] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState("Hospital admin portal ready.");
  const [staffForm, setStaffForm] = useState(initialStaffForm);
  const [generatedCredentials, setGeneratedCredentials] = useState(null);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [selectedRoleBreakdown, setSelectedRoleBreakdown] = useState(null);

  const activeDoctors = (dashboard?.staff || [])
    .filter((member) => member.isActive && member.role === "doctor")
    .sort((left, right) => left.name.localeCompare(right.name));
  const activeNurses = (dashboard?.staff || [])
    .filter((member) => member.isActive && member.role === "nurse")
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedRoleMembers = selectedRoleBreakdown === "doctor"
    ? activeDoctors
    : selectedRoleBreakdown === "nurse"
      ? activeNurses
      : [];
  const selectedRoleTitle = selectedRoleBreakdown === "doctor" ? "Active doctors" : "Active nurses";

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
    if (isCreatingStaff) {
      return;
    }

    setIsCreatingStaff(true);
    try {
      const result = await createStaff(session.accessToken, staffForm);
      setGeneratedCredentials(result.credentials);
      setStaffForm(initialStaffForm);
      await loadDashboard();
      setStatus(`Created ${result.staff.name}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsCreatingStaff(false);
    }
  }

  async function handleAccessToggle(member) {
    try {
      await updateStaff(session.accessToken, member.userId, { isActive: !member.isActive });
      await loadDashboard();
      setStatus(member.isActive ? "Staff access removed." : "Staff access granted.");
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
              <p>Hospital admins issue the login ID and temporary password. You can set the temporary password yourself or leave it blank to auto-generate one.</p>
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
                value={session.user.facility}
                disabled
                placeholder="Assigned hospital"
              />
              <input
                value={staffForm.email}
                onChange={(event) => setStaffForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email (optional)"
              />
              <input
                value={staffForm.password}
                onChange={(event) => setStaffForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Temporary password (optional)"
                type="password"
              />
            </div>
            <p style={{ color: "var(--text-soft)" }}>
              Staff members will still be forced to change this temporary password on first login.
            </p>
            <div className="hero-actions">
              <button className="primary-button" disabled={isCreatingStaff} onClick={handleCreateStaff} type="button">
                {isCreatingStaff ? "Creating staff..." : "Create Staff"}
              </button>
            </div>
            {generatedCredentials ? (
              <div className="ack-summary">
                <h4>Latest credentials</h4>
                <p>Login ID: {generatedCredentials.loginId}</p>
                <p>Temporary password: {generatedCredentials.temporaryPassword}</p>
                <p>Source: {generatedCredentials.passwordSource === "manual" ? "Set by hospital admin" : "Auto-generated"}</p>
              </div>
            ) : null}

            <div className="section-heading">
              <h3>Doctor Patient Access</h3>
              <p>Track exactly which doctor opened which patient record, with both IDs.</p>
            </div>
            <div className="timeline-list">
              {dashboard?.doctorPatientAccess?.map((item, index) => (
                <div className="timeline-card" key={`${item.handoffId}-${item.timestamp}-${index}`}>
                  <span className="timeline-date">{new Date(item.timestamp).toLocaleString()}</span>
                  <strong>
                    {item.doctorName} ({item.doctorLoginId || item.doctorId || "Unknown doctor ID"})
                  </strong>
                  <p>{item.department || "No department"} | {item.accessFacility || "Unknown hospital"}</p>
                  <p>
                    {item.patientName} ({item.patientId || "Unknown patient ID"})
                  </p>
                </div>
              ))}
            </div>

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
                    {log.doctorName || log.actor} ({log.doctorLoginId || log.doctorId || "Unknown doctor ID"}) | {log.department || "No department"} | {log.accessFacility || "Unknown hospital"}
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
              <h4>Active staff breakdown</h4>
              <div className="breakdown-grid">
                <button
                  className={`selector-card breakdown-card ${selectedRoleBreakdown === "doctor" ? "selected-card" : ""}`}
                  onClick={() => setSelectedRoleBreakdown((current) => (current === "doctor" ? null : "doctor"))}
                  type="button"
                >
                  <span className="timeline-date">Click to view</span>
                  <strong>Active doctors</strong>
                  <p>{activeDoctors.length} active</p>
                </button>
                <button
                  className={`selector-card breakdown-card ${selectedRoleBreakdown === "nurse" ? "selected-card" : ""}`}
                  onClick={() => setSelectedRoleBreakdown((current) => (current === "nurse" ? null : "nurse"))}
                  type="button"
                >
                  <span className="timeline-date">Click to view</span>
                  <strong>Active nurses</strong>
                  <p>{activeNurses.length} active</p>
                </button>
              </div>

              {selectedRoleBreakdown ? (
                <div className="breakdown-list">
                  <p className="breakdown-list-title">{selectedRoleTitle}</p>
                  {selectedRoleMembers.length ? (
                    selectedRoleMembers.map((member) => (
                      <div className="breakdown-list-item" key={member.userId}>
                        <strong>{member.name}</strong>
                        <p>
                          {member.loginId} | {member.department || "Unassigned"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p>No active {selectedRoleBreakdown === "doctor" ? "doctors" : "nurses"} right now.</p>
                  )}
                </div>
              ) : (
                <p>Active doctors ya active nurses par click karke list dekho.</p>
              )}
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
                  {item.doctorName} ({item.doctorLoginId || item.doctorId || "Unknown doctor ID"}) - {item.accessCount} access
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
                    <button className="secondary-button" onClick={() => handleAccessToggle(member)} type="button">
                      {member.isActive ? "Remove access" : "Grant access"}
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
