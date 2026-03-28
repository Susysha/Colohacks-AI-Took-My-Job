import mongoose from "mongoose";
import { seededTransfers, demoUsers } from "@medirelay/shared";
import { AcknowledgementModel } from "../models/Acknowledgement.js";
import { AuditEventModel } from "../models/AuditEvent.js";
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
const usersById = new Map();
const usersByIdentifier = new Map();
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

function memoryUserShape(user) {
  return {
    userId: user.userId || user.id,
    loginId: user.loginId,
    email: normalizeEmail(user.email),
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

function rememberUser(user) {
  const shaped = memoryUserShape(user);
  usersById.set(shaped.userId, shaped);
  usersByIdentifier.set(normalizeIdentifier(shaped.loginId), shaped.userId);
  if (shaped.email) {
    usersByIdentifier.set(normalizeIdentifier(shaped.email), shaped.userId);
  }
  return shaped;
}

async function ensureInMemoryUsers() {
  if (inMemoryUsersSeeded) {
    return;
  }

  for (const user of demoUsers) {
    rememberUser({
      userId: user.id,
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
      loginId: user.loginId,
      email: normalizeEmail(user.email),
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

  async findUserByIdentifier(identifier) {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      return UserModel.findOne({
        $or: [{ loginId: normalized.toUpperCase() }, { email: normalized }]
      }).lean();
    }

    const userId = usersByIdentifier.get(normalized);
    return userId ? usersById.get(userId) || null : null;
  },

  async findUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      return UserModel.findOne({ email: normalizedEmail }).lean();
    }

    const userId = usersByIdentifier.get(normalizeIdentifier(normalizedEmail));
    return userId ? usersById.get(userId) || null : null;
  },

  async findUserById(userId) {
    if (!userId) return null;

    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      return UserModel.findOne({ userId }).lean();
    }

    return usersById.get(userId) || null;
  },

  async createUser(user) {
    const createdRecord = {
      userId: user.userId,
      loginId: String(user.loginId || "").trim().toUpperCase(),
      email: normalizeEmail(user.email),
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

    if (isMongoReady()) {
      return UserModel.findOneAndUpdate({ userId }, sanitizedUpdates, { new: true, lean: true });
    }

    await ensureInMemoryUsers();
    const current = usersById.get(userId);
    if (!current) {
      return null;
    }

    const merged = rememberUser({ ...current, ...sanitizedUpdates });
    return merged;
  },

  async listUsers(filters = {}) {
    await this.ensureUsersSeeded();

    if (isMongoReady()) {
      const query = {};
      if (filters.facility) query.facility = filters.facility;
      if (filters.role) query.role = filters.role;
      if (typeof filters.isActive === "boolean") query.isActive = filters.isActive;
      return UserModel.find(query).sort({ createdAt: -1 }).lean();
    }

    return [...usersById.values()]
      .filter((user) => {
        if (filters.facility && user.facility !== filters.facility) return false;
        if (filters.role && user.role !== filters.role) return false;
        if (typeof filters.isActive === "boolean" && user.isActive !== filters.isActive) return false;
        return true;
      })
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
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
    if (isMongoReady()) {
      const query = {};
      if (filters.handoffId) query.handoffId = filters.handoffId;
      if (filters.actorUserId) query.actorUserId = filters.actorUserId;
      if (filters.facility) query.facility = filters.facility;
      if (filters.eventType) query.eventType = filters.eventType;
      return AuditEventModel.find(query).sort({ timestamp: -1 }).lean();
    }

    return auditEvents
      .filter((event) => {
        if (filters.handoffId && event.handoffId !== filters.handoffId) return false;
        if (filters.actorUserId && event.actorUserId !== filters.actorUserId) return false;
        if (filters.facility && event.facility !== filters.facility) return false;
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
