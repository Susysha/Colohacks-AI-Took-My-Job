import mongoose from "mongoose";
import { seededTransfers, demoHospitals, demoUsers } from "@medirelay/shared";
import { AcknowledgementModel } from "../models/Acknowledgement.js";
import { AuditEventModel } from "../models/AuditEvent.js";
import { HospitalModel } from "../models/Hospital.js";
import { ShareLinkModel } from "../models/ShareLink.js";
import { TransferRecordModel } from "../models/TransferRecord.js";
import { UsedTokenModel } from "../models/UsedToken.js";
import { UserModel } from "../models/User.js";
import { hashPassword } from "./passwordService.js";

const transfers = new Map(seededTransfers.map((transfer) => [transfer.handoffId, { ...transfer }]));
const links = new Map();
const acknowledgements = new Map();
const auditEvents = [];
const usedTokens = new Set();
const hospitalsById = new Map();
const usersById = new Map();
const usersByIdentifier = new Map();
const usersByStaffFingerprint = new Map();
let inMemoryUsersSeeded = false;

seededTransfers.forEach((transfer) => {
  const shortCode = "demo123";
  links.set(shortCode, {
    handoffId: transfer.handoffId,
    transferChainId: transfer.transferChainId,
    patientId: transfer.facilityPatientId,
    patientName: transfer.patientDemographics?.name || ""
  });
});

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

function normalizeEmail(email) {
  const trimmed = String(email || "").trim().toLowerCase();
  return trimmed || undefined;
}

function normalizeIdentifier(identifier) {
  return String(identifier || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function createStaffFingerprint(user) {
  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  if (!["doctor", "nurse"].includes(normalizedRole)) {
    return "";
  }

  const normalizedName = normalizeName(user?.name);
  if (!normalizedName) {
    return "";
  }

  const normalizedDepartment = normalizeName(user?.department) || "_";
  const normalizedEmail = normalizeEmail(user?.email) || "_";
  const normalizedHospitalId = String(user?.hospitalId || "").trim();
  const normalizedFacility = normalizeName(user?.facility);
  const scope = normalizedHospitalId
    ? `hospital:${normalizedHospitalId}`
    : normalizedFacility
      ? `facility:${normalizedFacility}`
      : "facility:_";

  return [scope, normalizedName, normalizedRole, normalizedDepartment, normalizedEmail].join("|");
}

function shouldRefreshStaffFingerprint(updates) {
  return ["hospitalId", "facility", "name", "role", "department", "email"]
    .some((key) => Object.prototype.hasOwnProperty.call(updates, key));
}

function escapeRegex(value) {
  return String(value || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveHospitalIdFromFacilitySync(facility) {
  const normalizedFacility = normalizeName(facility);
  if (!normalizedFacility) {
    return "";
  }

  for (const hospital of hospitalsById.values()) {
    if (normalizeName(hospital.name) === normalizedFacility) {
      return hospital.hospitalId;
    }
  }

  return "";
}

async function resolveHospitalIdFromFacility(facility) {
  const facilityName = String(facility || "").trim();
  if (!facilityName) {
    return "";
  }

  if (isMongoReady()) {
    const hospital = await HospitalModel.findOne({
      name: new RegExp(`^${escapeRegex(facilityName)}$`, "i")
    }).lean();
    return hospital?.hospitalId || "";
  }

  return resolveHospitalIdFromFacilitySync(facilityName);
}

async function normalizeStoredUser(user) {
  if (!user) {
    return null;
  }

  if (user.hospitalId) {
    return user;
  }

  const derivedHospitalId = await resolveHospitalIdFromFacility(user.facility);
  if (!derivedHospitalId) {
    return user;
  }

  return {
    ...user,
    hospitalId: derivedHospitalId
  };
}

function memoryHospitalShape(hospital) {
  return {
    hospitalId: hospital.hospitalId,
    name: hospital.name,
    code: String(hospital.code || "").trim().toUpperCase(),
    address: hospital.address || "",
    isActive: hospital.isActive !== false,
    createdByUserId: hospital.createdByUserId || "",
    createdAt: hospital.createdAt || new Date().toISOString()
  };
}

function memoryUserShape(user) {
  return {
    userId: user.userId || user.id,
    hospitalId: user.hospitalId || "",
    loginId: user.loginId,
    email: normalizeEmail(user.email),
    staffFingerprint: user.staffFingerprint || createStaffFingerprint(user),
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    department: user.department || "",
    facility: user.facility || "",
    isActive: user.isActive !== false,
    forcePasswordChange: Boolean(user.forcePasswordChange),
    createdByUserId: user.createdByUserId || "",
    createdAt: user.createdAt || new Date().toISOString()
  };
}

function rememberHospital(hospital) {
  const shaped = memoryHospitalShape(hospital);
  hospitalsById.set(shaped.hospitalId, shaped);
  return shaped;
}

function rememberUser(user) {
  const shaped = memoryUserShape(user);
  const previous = usersById.get(shaped.userId);

  if (previous?.loginId) {
    const previousLoginKey = normalizeIdentifier(previous.loginId);
    if (usersByIdentifier.get(previousLoginKey) === shaped.userId) {
      usersByIdentifier.delete(previousLoginKey);
    }
  }

  if (previous?.email) {
    const previousEmailKey = normalizeIdentifier(previous.email);
    if (usersByIdentifier.get(previousEmailKey) === shaped.userId) {
      usersByIdentifier.delete(previousEmailKey);
    }
  }

  if (previous?.staffFingerprint && usersByStaffFingerprint.get(previous.staffFingerprint) === shaped.userId) {
    usersByStaffFingerprint.delete(previous.staffFingerprint);
  }

  usersById.set(shaped.userId, shaped);
  usersByIdentifier.set(normalizeIdentifier(shaped.loginId), shaped.userId);
  if (shaped.email) {
    usersByIdentifier.set(normalizeIdentifier(shaped.email), shaped.userId);
  }
  if (shaped.staffFingerprint) {
    usersByStaffFingerprint.set(shaped.staffFingerprint, shaped.userId);
  }
  return shaped;
}

async function ensureInMemoryUsers() {
  if (inMemoryUsersSeeded) {
    return;
  }

  for (const hospital of demoHospitals) {
    rememberHospital(hospital);
  }

  for (const user of demoUsers) {
    rememberUser({
      userId: user.id,
      hospitalId: user.hospitalId || "",
      loginId: user.loginId,
      email: user.email,
      passwordHash: await hashPassword(user.password),
      name: user.name,
      role: user.role,
      department: user.department,
      facility: user.facility,
      isActive: user.isActive !== false,
      forcePasswordChange: Boolean(user.forcePasswordChange),
      createdAt: new Date().toISOString()
    });
  }

  inMemoryUsersSeeded = true;
}

async function ensureMongoUsers() {
  for (const hospital of demoHospitals) {
    const existingHospital = await HospitalModel.findOne({
      $or: [{ hospitalId: hospital.hospitalId }, { code: hospital.code }, { name: hospital.name }]
    }).lean();

    const desiredHospital = {
      hospitalId: hospital.hospitalId,
      name: hospital.name,
      code: String(hospital.code || "").trim().toUpperCase(),
      address: hospital.address || "",
      isActive: hospital.isActive !== false,
      createdAt: new Date().toISOString()
    };

    if (existingHospital) {
      await HospitalModel.findOneAndUpdate({ _id: existingHospital._id }, desiredHospital, { new: true });
    } else {
      await HospitalModel.create(desiredHospital);
    }
  }

  for (const user of demoUsers) {
    const existing = await UserModel.findOne({
      $or: [
        { userId: user.id },
        { loginId: user.loginId },
        { email: normalizeEmail(user.email) }
      ]
    }).lean();

    const desiredRecord = {
      userId: user.id,
      hospitalId: user.hospitalId || "",
      loginId: user.loginId,
      email: normalizeEmail(user.email),
      staffFingerprint: createStaffFingerprint(user) || undefined,
      passwordHash: existing?.passwordHash || (await hashPassword(user.password)),
      name: user.name,
      role: user.role,
      department: user.department,
      facility: user.facility,
      isActive: user.isActive !== false,
      forcePasswordChange: Boolean(user.forcePasswordChange),
      createdAt: new Date().toISOString()
    };

    if (existing) {
      await UserModel.findOneAndUpdate(
        { _id: existing._id },
        desiredRecord,
        { new: true }
      );
      continue;
    }

    await UserModel.create(desiredRecord);
  }
}

export const store = {
  async ensureUsersSeeded() {
    if (isMongoReady()) {
      await ensureMongoUsers();
      return;
    }

    await ensureInMemoryUsers();
  },

  async listHospitals(filters = {}) {
    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const query = {};
      if (filters.hospitalId) query.hospitalId = filters.hospitalId;
      if (filters.code) query.code = String(filters.code).trim().toUpperCase();
      if (typeof filters.isActive === "boolean") query.isActive = filters.isActive;
      return HospitalModel.find(query).sort({ createdAt: -1 }).lean();
    }

    return [...hospitalsById.values()]
      .filter((hospital) => {
        if (filters.hospitalId && hospital.hospitalId !== filters.hospitalId) return false;
        if (filters.code && hospital.code !== String(filters.code).trim().toUpperCase()) return false;
        if (typeof filters.isActive === "boolean" && hospital.isActive !== filters.isActive) return false;
        return true;
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  },

  async findHospitalById(hospitalId) {
    if (!hospitalId) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      return HospitalModel.findOne({ hospitalId }).lean();
    }

    return hospitalsById.get(hospitalId) || null;
  },

  async findHospitalByCode(code) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      return HospitalModel.findOne({ code: normalizedCode }).lean();
    }

    return [...hospitalsById.values()].find((hospital) => hospital.code === normalizedCode) || null;
  },

  async findHospitalByName(name) {
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      return HospitalModel.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") }).lean();
    }

    return [...hospitalsById.values()].find((hospital) => normalizeName(hospital.name) === normalizedName) || null;
  },

  async createHospital(hospital) {
    const createdRecord = {
      hospitalId: hospital.hospitalId,
      name: String(hospital.name || "").trim(),
      code: String(hospital.code || "").trim().toUpperCase(),
      address: String(hospital.address || "").trim(),
      isActive: hospital.isActive !== false,
      createdByUserId: hospital.createdByUserId || "",
      createdAt: hospital.createdAt || new Date().toISOString()
    };

    if (isMongoReady()) {
      const created = await HospitalModel.create(createdRecord);
      return created.toObject();
    }

    return rememberHospital(createdRecord);
  },

  async findUserByIdentifier(identifier) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const user = await UserModel.findOne({
        $or: [{ loginId: normalized.toUpperCase() }, { email: normalized }]
      }).lean();
      return normalizeStoredUser(user);
    }

    const userId = usersByIdentifier.get(normalized);
    return normalizeStoredUser(userId ? usersById.get(userId) || null : null);
  },

  async findUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const user = await UserModel.findOne({ email: normalizedEmail }).lean();
      return normalizeStoredUser(user);
    }

    const userId = usersByIdentifier.get(normalizeIdentifier(normalizedEmail));
    return normalizeStoredUser(userId ? usersById.get(userId) || null : null);
  },

  async findUserById(userId) {
    if (!userId) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const user = await UserModel.findOne({ userId }).lean();
      return normalizeStoredUser(user);
    }

    return normalizeStoredUser(usersById.get(userId) || null);
  },

  async findUserByStaffFingerprint(fingerprint) {
    const normalizedFingerprint = String(fingerprint || "").trim();
    if (!normalizedFingerprint) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const user = await UserModel.findOne({ staffFingerprint: normalizedFingerprint }).lean();
      if (user) {
        return normalizeStoredUser(user);
      }

      const legacyUsers = await UserModel.find({ role: { $in: ["doctor", "nurse"] } }).lean();
      const legacyMatch = legacyUsers.find((candidate) => createStaffFingerprint(candidate) === normalizedFingerprint) || null;
      return normalizeStoredUser(legacyMatch);
    }

    const userId = usersByStaffFingerprint.get(normalizedFingerprint);
    return normalizeStoredUser(userId ? usersById.get(userId) || null : null);
  },

  async createUser(user) {
    const createdRecord = {
      userId: user.userId,
      hospitalId: user.hospitalId || "",
      loginId: String(user.loginId || "").trim().toUpperCase(),
      email: normalizeEmail(user.email),
      staffFingerprint: user.staffFingerprint || createStaffFingerprint(user) || undefined,
      passwordHash: user.passwordHash,
      name: user.name,
      role: user.role,
      department: user.department || "",
      facility: user.facility || "",
      isActive: user.isActive !== false,
      forcePasswordChange: Boolean(user.forcePasswordChange),
      createdByUserId: user.createdByUserId || "",
      createdAt: user.createdAt || new Date().toISOString()
    };

    if (isMongoReady()) {
      const created = await UserModel.create(createdRecord);
      return created.toObject();
    }

    return rememberUser(createdRecord);
  },

  async updateUser(userId, updates) {
    const sanitizedUpdates = {
      ...updates
    };

    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, "email")) {
      sanitizedUpdates.email = normalizeEmail(sanitizedUpdates.email);
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, "loginId")) {
      sanitizedUpdates.loginId = String(sanitizedUpdates.loginId || "").trim().toUpperCase();
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, "hospitalId")) {
      sanitizedUpdates.hospitalId = String(sanitizedUpdates.hospitalId || "").trim();
    }

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const current = await UserModel.findOne({ userId }).lean();
      if (!current) {
        return null;
      }

      if (shouldRefreshStaffFingerprint(sanitizedUpdates)) {
        sanitizedUpdates.staffFingerprint = createStaffFingerprint({ ...current, ...sanitizedUpdates }) || undefined;
      }

      const updated = await UserModel.findOneAndUpdate({ userId }, sanitizedUpdates, { new: true, lean: true });
      return normalizeStoredUser(updated);
    }

    const current = usersById.get(userId);
    if (!current) {
      return null;
    }

    if (shouldRefreshStaffFingerprint(sanitizedUpdates)) {
      sanitizedUpdates.staffFingerprint = createStaffFingerprint({ ...current, ...sanitizedUpdates });
    }

    const merged = rememberUser({ ...current, ...sanitizedUpdates });
    return merged;
  },

  buildStaffFingerprint(user) {
    return createStaffFingerprint(user);
  },

  async listUsers(filters = {}) {
    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const query = {};
      if (filters.hospitalId) {
        const scopedHospital = await this.findHospitalById(filters.hospitalId);
        if (scopedHospital?.name) {
          const facilityMatcher = new RegExp(`^${escapeRegex(scopedHospital.name)}$`, "i");
          query.$or = [
            { hospitalId: filters.hospitalId },
            { hospitalId: { $in: ["", null] }, facility: facilityMatcher },
            { hospitalId: { $exists: false }, facility: facilityMatcher }
          ];
        } else {
          query.hospitalId = filters.hospitalId;
        }
      }
      if (filters.facility) query.facility = filters.facility;
      if (filters.role) query.role = filters.role;
      if (typeof filters.isActive === "boolean") query.isActive = filters.isActive;
      const users = await UserModel.find(query).sort({ createdAt: -1 }).lean();
      return Promise.all(users.map((user) => normalizeStoredUser(user)));
    }

    const users = [...usersById.values()]
      .filter((user) => {
        const resolvedHospitalId = user.hospitalId || resolveHospitalIdFromFacilitySync(user.facility);
        if (filters.hospitalId && resolvedHospitalId !== filters.hospitalId) return false;
        if (filters.facility && user.facility !== filters.facility) return false;
        if (filters.role && user.role !== filters.role) return false;
        if (typeof filters.isActive === "boolean" && user.isActive !== filters.isActive) return false;
        return true;
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

    return Promise.all(users.map((user) => normalizeStoredUser(user)));
  },

  async saveTransfer(record) {
    if (isMongoReady()) {
      return TransferRecordModel.findOneAndUpdate(
        { handoffId: record.handoffId },
        record,
        { upsert: true, new: true, setDefaultsOnInsert: true, lean: true }
      );
    }

    transfers.set(record.handoffId, { ...record });
    return record;
  },

  async listTransfersByChain(transferChainId) {
    if (isMongoReady()) {
      return TransferRecordModel.find({ transferChainId }).sort({ createdAt: 1 }).lean();
    }

    return [...transfers.values()]
      .filter((record) => record.transferChainId === transferChainId)
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  },

  async getTransfer(handoffId) {
    if (isMongoReady()) {
      return TransferRecordModel.findOne({ handoffId }).lean();
    }

    return transfers.get(handoffId);
  },

  async setShareLink(shortCode, data) {
    if (isMongoReady()) {
      return ShareLinkModel.findOneAndUpdate(
        { shortCode },
        { shortCode, ...data },
        { upsert: true, new: true, lean: true }
      );
    }

    links.set(shortCode, data);
    return data;
  },

  async getShareLink(shortCode) {
    if (isMongoReady()) {
      return ShareLinkModel.findOne({ shortCode }).lean();
    }

    return links.get(shortCode);
  },

  async saveAcknowledgement(payload) {
    if (isMongoReady()) {
      return AcknowledgementModel.findOneAndUpdate(
        { handoffId: payload.handoffId },
        payload,
        { upsert: true, new: true, lean: true }
      );
    }

    acknowledgements.set(payload.handoffId, payload);
    return payload;
  },

  async getAcknowledgement(handoffId) {
    if (isMongoReady()) {
      return AcknowledgementModel.findOne({ handoffId }).lean();
    }

    return acknowledgements.get(handoffId);
  },

  async addAuditEvent(event) {
    if (isMongoReady()) {
      return AuditEventModel.create(event);
    }

    auditEvents.push(event);
    return event;
  },

  async listAuditEvents(filters = {}) {
    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const query = {};
      if (filters.handoffId) query.handoffId = filters.handoffId;
      if (filters.actorUserId) query.actorUserId = filters.actorUserId;
      if (filters.hospitalId) {
        const scopedHospital = await this.findHospitalById(filters.hospitalId);
        if (scopedHospital?.name) {
          const facilityMatcher = new RegExp(`^${escapeRegex(scopedHospital.name)}$`, "i");
          query.$or = [
            { hospitalId: filters.hospitalId },
            { hospitalId: { $in: ["", null] }, facility: facilityMatcher },
            { hospitalId: { $exists: false }, facility: facilityMatcher },
            { "metadata.actorHospitalId": filters.hospitalId },
            { "metadata.accessHospitalId": filters.hospitalId }
          ];
        } else {
          query.hospitalId = filters.hospitalId;
        }
      } else if (filters.facility) {
        query.facility = filters.facility;
      }
      if (filters.eventType) query.eventType = filters.eventType;
      return AuditEventModel.find(query).sort({ timestamp: -1 }).lean();
    }

    return auditEvents
      .filter((event) => {
        const resolvedEventHospitalId =
          event.hospitalId ||
          event.metadata?.accessHospitalId ||
          event.metadata?.actorHospitalId ||
          resolveHospitalIdFromFacilitySync(event.facility);
        if (filters.handoffId && event.handoffId !== filters.handoffId) return false;
        if (filters.actorUserId && event.actorUserId !== filters.actorUserId) return false;
        if (filters.hospitalId && resolvedEventHospitalId !== filters.hospitalId) return false;
        if (!filters.hospitalId && filters.facility && event.facility !== filters.facility) return false;
        if (filters.eventType && event.eventType !== filters.eventType) return false;
        return true;
      })
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  },

  async isTokenUsed(tokenId) {
    if (isMongoReady()) {
      const token = await UsedTokenModel.findOne({ tokenId }).lean();
      return Boolean(token);
    }

    return usedTokens.has(tokenId);
  },

  async markTokenUsed(tokenId, scope, handoffId) {
    if (isMongoReady()) {
      return UsedTokenModel.findOneAndUpdate(
        { tokenId },
        { tokenId, scope, handoffId, usedAt: new Date().toISOString() },
        { upsert: true, new: true, lean: true }
      );
    }

    usedTokens.add(tokenId);
    return { tokenId, scope, handoffId };
  }
};
