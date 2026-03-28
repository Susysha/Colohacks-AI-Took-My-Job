const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function handleResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function withAuth(accessToken, extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${accessToken}`
  };
}

export function login(identifier, password) {
  return fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ identifier, password })
  }).then(handleResponse);
}

export function fetchMe(accessToken) {
  return fetch(`${API_URL}/auth/me`, {
    headers: withAuth(accessToken)
  }).then(handleResponse);
}

export function changePassword(accessToken, currentPassword, newPassword) {
  return fetch(`${API_URL}/auth/change-password`, {
    method: "POST",
    headers: withAuth(accessToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ currentPassword, newPassword })
  }).then(handleResponse);
}

export function fetchDoctorActivity(accessToken) {
  return fetch(`${API_URL}/auth/activity`, {
    headers: withAuth(accessToken)
  }).then(handleResponse);
}

export function fetchSharedTransfer(accessToken, shortCode, token) {
  return fetch(`${API_URL}/transfers/shared/${shortCode}?t=${encodeURIComponent(token)}`, {
    headers: withAuth(accessToken)
  }).then(handleResponse);
}

export function syncQueuedTransfers(accessToken, mutations) {
  return fetch(`${API_URL}/sync/batch`, {
    method: "POST",
    headers: withAuth(accessToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ mutations })
  }).then(handleResponse);
}

export function shareTransfer(accessToken, handoffId) {
  return fetch(`${API_URL}/transfers/${handoffId}/share`, {
    method: "POST",
    headers: withAuth(accessToken)
  }).then(handleResponse);
}

export function submitAcknowledgement(accessToken, handoffId, payload) {
  return fetch(`${API_URL}/transfers/${handoffId}/acknowledge`, {
    method: "POST",
    headers: withAuth(accessToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  }).then(handleResponse);
}

export function fetchAdminDashboard(accessToken) {
  return fetch(`${API_URL}/admin/dashboard`, {
    headers: withAuth(accessToken)
  }).then(handleResponse);
}

export function createStaff(accessToken, payload) {
  return fetch(`${API_URL}/admin/staff`, {
    method: "POST",
    headers: withAuth(accessToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  }).then(handleResponse);
}

export function updateStaff(accessToken, userId, payload) {
  return fetch(`${API_URL}/admin/staff/${userId}`, {
    method: "PATCH",
    headers: withAuth(accessToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  }).then(handleResponse);
}

export function deactivateStaff(accessToken, userId) {
  return fetch(`${API_URL}/admin/staff/${userId}`, {
    method: "DELETE",
    headers: withAuth(accessToken)
  }).then(handleResponse);
}
