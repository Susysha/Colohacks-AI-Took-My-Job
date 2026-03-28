import crypto from "node:crypto";
import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../services/passwordService.js";
import { store } from "../services/store.js";
import { randomId } from "../services/tokenService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireRole("hospital_admin"));

function sanitizeStaff(user) {
  return {
    userId: user.userId || user.id,
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

function buildDashboard(staff, logs, facility) {
  const activeStaff = staff.filter((item) => item.isActive !== false);
  const doctors = activeStaff.filter((item) => item.role === "doctor");
  const nurses = activeStaff.filter((item) => item.role === "nurse");

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
  const patientSummaryMap = new Map();
  const doctorSummaryMap = new Map();

  for (const log of accessLogs.filter((item) => item.eventType === "qr.accessed")) {
    const patientKey = log.patientId || "Unknown";
    const patientBucket = patientSummaryMap.get(patientKey) || {
      patientId: log.patientId || "Unknown",
      patientName: log.patientName || "Unknown patient",
      accessCount: 0,
      doctorIds: new Set()
    };
    patientBucket.accessCount += 1;
    if (log.actorUserId) {
      patientBucket.doctorIds.add(log.actorUserId);
    }
    patientSummaryMap.set(patientKey, patientBucket);

    const doctorKey = log.actorUserId || log.actor || "Unknown";
    const doctorBucket = doctorSummaryMap.get(doctorKey) || {
      doctorId: log.actorUserId || "",
      doctorName: log.actor || "Unknown doctor",
      department: log.department || "",
      accessCount: 0
    };
    doctorBucket.accessCount += 1;
    doctorSummaryMap.set(doctorKey, doctorBucket);
  }

  return {
    facility,
    summary: {
      totalStaff: activeStaff.length,
      totalDoctors: doctors.length,
      totalNurses: nurses.length
    },
    staff: staff.map(sanitizeStaff),
    departmentBreakdown: [...departmentMap.values()].sort((left, right) => left.department.localeCompare(right.department)),
    qrActivityLogs: accessLogs.slice(0, 50),
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
  const staff = await store.listUsers({ facility: request.user.facility });
  const logs = await store.listAuditEvents({ facility: request.user.facility });
  return response.json(buildDashboard(staff, logs, request.user.facility));
}));

adminRouter.get("/staff", asyncHandler(async (request, response) => {
  const staff = await store.listUsers({ facility: request.user.facility });
  return response.json({ staff: staff.map(sanitizeStaff) });
}));

adminRouter.post("/staff", asyncHandler(async (request, response) => {
  const {
    name = "",
    role = "doctor",
    department = "",
    facility = request.user.facility,
    email = "",
    loginId = ""
  } = request.body || {};

  if (!name.trim() || !["doctor", "nurse"].includes(role)) {
    return response.status(422).json({ error: "Name and a valid staff role are required." });
  }

  const resolvedLoginId = (loginId || generateLoginId(role)).trim().toUpperCase();
  const temporaryPassword = generateTemporaryPassword();

  const existingByIdentifier = await store.findUserByIdentifier(resolvedLoginId);
  const existingByEmail = email ? await store.findUserByEmail(email) : null;

  if (existingByIdentifier || existingByEmail) {
    return response.status(409).json({ error: "A staff member with this login ID or email already exists." });
  }

  const user = await store.createUser({
    userId: randomId("user"),
    loginId: resolvedLoginId,
    email,
    passwordHash: await hashPassword(temporaryPassword),
    name: name.trim(),
    role,
    department: department.trim(),
    facility: (facility || request.user.facility).trim(),
    isActive: true,
    forcePasswordChange: true,
    createdByUserId: request.user.sub,
    createdAt: new Date().toISOString()
  });

  return response.status(201).json({
    staff: sanitizeStaff(user),
    credentials: {
      loginId: user.loginId,
      temporaryPassword
    }
  });
}));

adminRouter.patch("/staff/:userId", asyncHandler(async (request, response) => {
  if (request.params.userId === request.user.sub) {
    return response.status(422).json({ error: "Use the profile password flow for your own admin account." });
  }

  const current = await store.findUserById(request.params.userId);

  if (!current || current.facility !== request.user.facility) {
    return response.status(404).json({ error: "Staff member not found." });
  }

  const updates = {};
  const { name, role, department, facility, isActive, resetPassword } = request.body || {};

  if (typeof name === "string") updates.name = name.trim();
  if (typeof department === "string") updates.department = department.trim();
  if (typeof facility === "string") updates.facility = facility.trim() || request.user.facility;
  if (typeof isActive === "boolean") updates.isActive = isActive;
  if (role && ["doctor", "nurse"].includes(role)) updates.role = role;

  let credentials = null;
  if (resetPassword) {
    const temporaryPassword = generateTemporaryPassword();
    updates.passwordHash = await hashPassword(temporaryPassword);
    updates.forcePasswordChange = true;
    credentials = {
      loginId: current.loginId,
      temporaryPassword
    };
  }

  const updated = await store.updateUser(request.params.userId, updates);
  return response.json({
    staff: sanitizeStaff(updated),
    credentials
  });
}));

adminRouter.delete("/staff/:userId", asyncHandler(async (request, response) => {
  if (request.params.userId === request.user.sub) {
    return response.status(422).json({ error: "Hospital admin access cannot be removed from this dashboard." });
  }

  const current = await store.findUserById(request.params.userId);

  if (!current || current.facility !== request.user.facility) {
    return response.status(404).json({ error: "Staff member not found." });
  }

  const updated = await store.updateUser(request.params.userId, { isActive: false });
  return response.json({ staff: sanitizeStaff(updated) });
}));

adminRouter.get("/logs", asyncHandler(async (request, response) => {
  const logs = await store.listAuditEvents({ facility: request.user.facility });
  return response.json({ logs });
}));
