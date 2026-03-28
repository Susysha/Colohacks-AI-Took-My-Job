import crypto from "node:crypto";
import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../services/passwordService.js";
import { store } from "../services/store.js";
import { randomId } from "../services/tokenService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const superAdminRouter = express.Router();

superAdminRouter.use(requireAuth, requireRole("system_admin"));

function sanitizeHospital(hospital) {
  return {
    hospitalId: hospital.hospitalId,
    name: hospital.name,
    code: hospital.code,
    address: hospital.address || "",
    isActive: hospital.isActive !== false,
    createdAt: hospital.createdAt
  };
}

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

function generateHospitalCode(name) {
  const initials = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0])
    .join("");

  return initials || `H${crypto.randomInt(100, 999)}`;
}

function generateHospitalAdminLoginId() {
  return `HOSP-ADMIN-${crypto.randomInt(1000, 9999)}`;
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

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function belongsToHospital(user, hospital) {
  if (user.hospitalId) {
    return user.hospitalId === hospital.hospitalId;
  }

  return normalizeName(user.facility) === normalizeName(hospital.name);
}

function buildDashboard(hospitals, users) {
  const activeHospitals = hospitals.filter((item) => item.isActive !== false);
  const activeUsers = users.filter((item) => item.isActive !== false);
  const hospitalRows = activeHospitals.map((hospital) => {
    const scopedUsers = activeUsers.filter((user) => belongsToHospital(user, hospital));
    const scopedAdmins = scopedUsers
      .filter((user) => user.role === "hospital_admin")
      .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
    const primaryAdmin = scopedAdmins[0] || null;

    return {
      ...sanitizeHospital(hospital),
      hospitalAdmins: scopedAdmins.length,
      doctors: scopedUsers.filter((user) => user.role === "doctor").length,
      nurses: scopedUsers.filter((user) => user.role === "nurse").length,
      primaryAdmin: primaryAdmin
        ? {
            userId: primaryAdmin.userId || primaryAdmin.id || "",
            name: primaryAdmin.name || "",
            email: primaryAdmin.email || "",
            loginId: primaryAdmin.loginId || "",
            createdAt: primaryAdmin.createdAt || ""
          }
        : null
    };
  });

  return {
    summary: {
      totalHospitals: activeHospitals.length,
      totalHospitalAdmins: activeUsers.filter((user) => user.role === "hospital_admin").length,
      totalDoctors: activeUsers.filter((user) => user.role === "doctor").length,
      totalNurses: activeUsers.filter((user) => user.role === "nurse").length
    },
    hospitals: hospitalRows,
    recentHospitalAdmins: activeUsers
      .filter((user) => user.role === "hospital_admin")
      .slice(0, 20)
      .map(sanitizeStaff)
  };
}

async function resolveUniqueHospitalAdminLoginId(candidate = "") {
  let loginId = String(candidate || generateHospitalAdminLoginId()).trim().toUpperCase();

  for (let attempts = 0; attempts < 6; attempts += 1) {
    const existing = await store.findUserByIdentifier(loginId);
    if (!existing) {
      return loginId;
    }

    if (candidate) {
      return "";
    }

    loginId = generateHospitalAdminLoginId();
  }

  return "";
}

superAdminRouter.get("/dashboard", asyncHandler(async (_request, response) => {
  const hospitals = await store.listHospitals();
  const users = await store.listUsers();
  return response.json(buildDashboard(hospitals, users));
}));

superAdminRouter.post("/hospitals", asyncHandler(async (request, response) => {
  const {
    name = "",
    code = "",
    address = "",
    adminName = "",
    adminEmail = "",
    adminLoginId = "",
    temporaryPassword = ""
  } = request.body || {};

  if (!name.trim() || !adminName.trim()) {
    return response.status(422).json({ error: "Hospital name and first admin name are required." });
  }

  const resolvedCode = String(code || generateHospitalCode(name)).trim().toUpperCase();
  const existingByCode = await store.findHospitalByCode(resolvedCode);
  const existingByName = await store.findHospitalByName(name);

  if (existingByCode || existingByName) {
    return response.status(409).json({ error: "A hospital with this name or code already exists." });
  }

  const resolvedAdminLoginId = await resolveUniqueHospitalAdminLoginId(adminLoginId);
  if (!resolvedAdminLoginId) {
    return response.status(409).json({ error: "This hospital admin login ID is already in use." });
  }

  const existingByEmail = adminEmail ? await store.findUserByEmail(adminEmail) : null;
  if (existingByEmail) {
    return response.status(409).json({ error: "A user with this admin email already exists." });
  }

  const normalizedPassword = normalizeOptionalPassword(temporaryPassword);
  if (normalizedPassword && normalizedPassword.length < 8) {
    return response.status(422).json({ error: "Temporary password must be at least 8 characters long." });
  }

  const resolvedTemporaryPassword = normalizedPassword || generateTemporaryPassword();
  const passwordSource = normalizedPassword ? "manual" : "generated";

  const hospital = await store.createHospital({
    hospitalId: randomId("hospital"),
    name: name.trim(),
    code: resolvedCode,
    address: String(address || "").trim(),
    isActive: true,
    createdByUserId: request.user.sub,
    createdAt: new Date().toISOString()
  });

  const adminUser = await store.createUser({
    userId: randomId("user"),
    hospitalId: hospital.hospitalId,
    loginId: resolvedAdminLoginId,
    email: adminEmail,
    passwordHash: await hashPassword(resolvedTemporaryPassword),
    name: adminName.trim(),
    role: "hospital_admin",
    department: "Administration",
    facility: hospital.name,
    isActive: true,
    forcePasswordChange: true,
    createdByUserId: request.user.sub,
    createdAt: new Date().toISOString()
  });

  return response.status(201).json({
    hospital: sanitizeHospital(hospital),
    admin: sanitizeStaff(adminUser),
    credentials: {
      loginId: adminUser.loginId,
      temporaryPassword: resolvedTemporaryPassword,
      passwordSource
    }
  });
}));
