import crypto from "node:crypto";
import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../services/passwordService.js";
import { store } from "../services/store.js";
import { randomId } from "../services/tokenService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = express.Router();
const pendingStaffCreations = new Set();

adminRouter.use(requireAuth, requireRole("hospital_admin"));

function sanitizeStaff(user) {
  return {
    userId: user.userId || user.id,
    hospitalId: user.hospitalId || "",
    loginId: user.loginId,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department || "",
    facility: user.facility || "",
    isActive: user.isActive !== false,
    forcePasswordChange: Boolean(user.forcePasswordChange),
    createdAt: user.createdAt
  };
}

function generateLoginId(role) {
  const prefix = role === "nurse" ? "NUR" : "DOC";
  const chunk = crypto.randomInt(1000, 9999);
  return `${prefix}-${chunk}`;
}

function generateTemporaryPassword() {
  return `Medi-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeOptionalPassword(password) {
  if (typeof password !== "string") {
    return "";
  }

  return password.trim();
}

function getAdminHospitalScope(user) {
  if (user.hospitalId) {
    return { hospitalId: user.hospitalId };
  }

  return { facility: user.facility };
}

function isStaffInAdminHospital(staffUser, adminUser) {
  if (adminUser.hospitalId) {
    return staffUser.hospitalId === adminUser.hospitalId;
  }

  return staffUser.facility === adminUser.facility;
}

function buildDashboard(staff, logs, facility) {
  const activeStaff = staff.filter((item) => item.isActive !== false);
  const doctors = activeStaff.filter((item) => item.role === "doctor");
  const nurses = activeStaff.filter((item) => item.role === "nurse");
  const staffById = new Map(staff.map((item) => [item.userId || item.id, item]));

  const departmentMap = new Map();
  for (const item of activeStaff) {
    const key = item.department || "Unassigned";
    const bucket = departmentMap.get(key) || { department: key, staffCount: 0, doctors: 0, nurses: 0 };
    bucket.staffCount += 1;
    if (item.role === "doctor") bucket.doctors += 1;
    if (item.role === "nurse") bucket.nurses += 1;
    departmentMap.set(key, bucket);
  }

  const accessLogs = logs.filter((item) => ["qr.generated", "qr.accessed", "transfer.acknowledged"].includes(item.eventType));
  const qrAccessLogs = accessLogs.filter((item) => item.eventType === "qr.accessed");
  const patientSummaryMap = new Map();
  const doctorSummaryMap = new Map();
  const doctorPatientAccess = [];

  for (const log of qrAccessLogs) {
    const matchedDoctor = (log.actorUserId && staffById.get(log.actorUserId)) || null;
    const doctorName = log.actor || matchedDoctor?.name || "Unknown doctor";
    const doctorUserId = log.actorUserId || matchedDoctor?.userId || matchedDoctor?.id || "";
    const doctorLoginId = log.metadata?.actorLoginId || matchedDoctor?.loginId || doctorUserId || "";
    const doctorIdentity = doctorUserId || doctorLoginId || doctorName;
    const department = log.department || matchedDoctor?.department || "";
    const accessFacility = log.facility || matchedDoctor?.facility || "";
    const accessHospitalId = log.hospitalId || log.metadata?.accessHospitalId || matchedDoctor?.hospitalId || "";

    doctorPatientAccess.push({
      handoffId: log.handoffId || "",
      doctorName,
      doctorId: doctorUserId,
      doctorLoginId,
      department,
      accessFacility,
      accessHospitalId,
      patientName: log.patientName || "Unknown patient",
      patientId: log.patientId || "Unknown",
      timestamp: log.timestamp
    });

    const patientKey = log.patientId || "Unknown";
    const patientBucket = patientSummaryMap.get(patientKey) || {
      patientId: log.patientId || "Unknown",
      patientName: log.patientName || "Unknown patient",
      accessCount: 0,
      doctorIds: new Set()
    };
    patientBucket.accessCount += 1;
    if (doctorIdentity) {
      patientBucket.doctorIds.add(doctorIdentity);
    }
    patientSummaryMap.set(patientKey, patientBucket);

    const doctorKey = doctorIdentity || "Unknown";
    const doctorBucket = doctorSummaryMap.get(doctorKey) || {
      doctorId: doctorUserId,
      doctorLoginId,
      doctorName,
      department,
      accessCount: 0
    };
    doctorBucket.accessCount += 1;
    doctorSummaryMap.set(doctorKey, doctorBucket);
  }

  const qrActivityLogs = accessLogs.slice(0, 50).map((log) => {
    const matchedDoctor = (log.actorUserId && staffById.get(log.actorUserId)) || null;
    return {
      ...log,
      doctorName: log.actor || matchedDoctor?.name || "Unknown doctor",
      doctorId: log.actorUserId || matchedDoctor?.userId || matchedDoctor?.id || "",
      doctorLoginId: log.metadata?.actorLoginId || matchedDoctor?.loginId || "",
      accessFacility: log.facility || matchedDoctor?.facility || "",
      accessHospitalId: log.hospitalId || log.metadata?.accessHospitalId || matchedDoctor?.hospitalId || "",
      patientName: log.patientName || "Unknown patient",
      patientId: log.patientId || "Unknown"
    };
  });

  return {
    facility,
    summary: {
      totalStaff: activeStaff.length,
      totalDoctors: doctors.length,
      totalNurses: nurses.length
    },
    staff: staff.map(sanitizeStaff),
    departmentBreakdown: [...departmentMap.values()].sort((left, right) => left.department.localeCompare(right.department)),
    qrActivityLogs,
    doctorPatientAccess: doctorPatientAccess.slice(0, 50),
    patientAccessSummary: [...patientSummaryMap.values()].map((item) => ({
      patientId: item.patientId,
      patientName: item.patientName,
      accessCount: item.accessCount,
      uniqueDoctors: item.doctorIds.size
    })),
    doctorAccessSummary: [...doctorSummaryMap.values()].sort((left, right) => right.accessCount - left.accessCount)
  };
}

adminRouter.get("/dashboard", asyncHandler(async (request, response) => {
  const staff = await store.listUsers(getAdminHospitalScope(request.user));
  const logs = await store.listAuditEvents(getAdminHospitalScope(request.user));
  return response.json(buildDashboard(staff, logs, request.user.facility));
}));

adminRouter.get("/staff", asyncHandler(async (request, response) => {
  const staff = await store.listUsers(getAdminHospitalScope(request.user));
  return response.json({ staff: staff.map(sanitizeStaff) });
}));

adminRouter.post("/staff", asyncHandler(async (request, response) => {
  const {
    name = "",
    role = "doctor",
    department = "",
    email = "",
    loginId = "",
    password = ""
  } = request.body || {};

  const trimmedName = name.trim();
  const normalizedRole = String(role || "").trim().toLowerCase();
  const trimmedDepartment = String(department || "").trim();
  const trimmedEmail = String(email || "").trim();

  if (!trimmedName || !["doctor", "nurse"].includes(normalizedRole)) {
    return response.status(422).json({ error: "Name and a valid staff role are required." });
  }

  const resolvedLoginId = (loginId || generateLoginId(normalizedRole)).trim().toUpperCase();
  const customPassword = normalizeOptionalPassword(password);
  const staffFingerprint = store.buildStaffFingerprint({
    hospitalId: request.user.hospitalId || "",
    facility: request.user.facility,
    name: trimmedName,
    role: normalizedRole,
    department: trimmedDepartment,
    email: trimmedEmail
  });

  if (customPassword && customPassword.length < 8) {
    return response.status(422).json({ error: "Password must be at least 8 characters long." });
  }

  const assignedPassword = customPassword || generateTemporaryPassword();
  const passwordSource = customPassword ? "manual" : "generated";

  if (staffFingerprint && pendingStaffCreations.has(staffFingerprint)) {
    return response.status(409).json({
      error: "This staff profile is already being created. Please check the roster before trying again."
    });
  }

  if (staffFingerprint) {
    pendingStaffCreations.add(staffFingerprint);
  }

  try {
    const existingByDetails = staffFingerprint
      ? await store.findUserByStaffFingerprint(staffFingerprint)
      : null;

    if (existingByDetails) {
      return response.status(409).json({
        error: existingByDetails.isActive === false
          ? "Same staff details already exist. Use the staff roster to grant access again instead of creating a second account."
          : "Same staff details already exist in this hospital. Duplicate staff was not created."
      });
    }

    const existingByIdentifier = await store.findUserByIdentifier(resolvedLoginId);
    const existingByEmail = trimmedEmail ? await store.findUserByEmail(trimmedEmail) : null;

    if (existingByIdentifier || existingByEmail) {
      return response.status(409).json({ error: "A staff member with this login ID or email already exists." });
    }

    const user = await store.createUser({
      userId: randomId("user"),
      hospitalId: request.user.hospitalId || "",
      loginId: resolvedLoginId,
      email: trimmedEmail,
      staffFingerprint,
      passwordHash: await hashPassword(assignedPassword),
      name: trimmedName,
      role: normalizedRole,
      department: trimmedDepartment,
      facility: request.user.facility,
      isActive: true,
      forcePasswordChange: true,
      createdByUserId: request.user.sub,
      createdAt: new Date().toISOString()
    });

    return response.status(201).json({
      staff: sanitizeStaff(user),
      credentials: {
        loginId: user.loginId,
        temporaryPassword: assignedPassword,
        passwordSource
      }
    });
  } finally {
    if (staffFingerprint) {
      pendingStaffCreations.delete(staffFingerprint);
    }
  }
}));

adminRouter.patch("/staff/:userId", asyncHandler(async (request, response) => {
  if (request.params.userId === request.user.sub) {
    return response.status(422).json({ error: "Use the profile password flow for your own admin account." });
  }

  if (Object.prototype.hasOwnProperty.call(request.body || {}, "resetPassword")) {
    return response.status(403).json({ error: "Password reset is not available for hospital admin staff management." });
  }

  const current = await store.findUserById(request.params.userId);

  if (!current || !isStaffInAdminHospital(current, request.user)) {
    return response.status(404).json({ error: "Staff member not found." });
  }

  const updates = {};
  const { name, role, department, facility, isActive } = request.body || {};

  if (typeof name === "string") updates.name = name.trim();
  if (typeof department === "string") updates.department = department.trim();
  if (typeof facility === "string") updates.facility = request.user.facility;
  if (typeof isActive === "boolean") updates.isActive = isActive;
  if (role && ["doctor", "nurse"].includes(role)) updates.role = role;

  const updated = await store.updateUser(request.params.userId, updates);
  return response.json({ staff: sanitizeStaff(updated) });
}));

adminRouter.delete("/staff/:userId", asyncHandler(async (request, response) => {
  if (request.params.userId === request.user.sub) {
    return response.status(422).json({ error: "Hospital admin access cannot be removed from this dashboard." });
  }

  const current = await store.findUserById(request.params.userId);

  if (!current || !isStaffInAdminHospital(current, request.user)) {
    return response.status(404).json({ error: "Staff member not found." });
  }

  const updated = await store.updateUser(request.params.userId, { isActive: false });
  return response.json({ staff: sanitizeStaff(updated) });
}));

adminRouter.get("/logs", asyncHandler(async (request, response) => {
  const logs = await store.listAuditEvents(getAdminHospitalScope(request.user));
  return response.json({ logs });
}));
