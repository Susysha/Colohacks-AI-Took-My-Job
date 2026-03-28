import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const accessExpiry = "12h";
const viewExpiry = "24h";
const ackExpiry = "2h";

export function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

export function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user.userId || user.id,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      department: user.department,
      facility: user.facility,
      name: user.name,
      forcePasswordChange: Boolean(user.forcePasswordChange),
      isActive: user.isActive !== false
    },
    env.jwtSecret,
    { expiresIn: accessExpiry }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function createViewToken(payload) {
  return jwt.sign({ ...payload, scope: "view" }, env.jwtSecret, { expiresIn: viewExpiry });
}

export function createAckToken(payload) {
  return jwt.sign({ ...payload, scope: "ack" }, env.jwtSecret, { expiresIn: ackExpiry });
}

export function verifyScopedToken(token, scope) {
  const decoded = jwt.verify(token, env.jwtSecret);

  if (decoded.scope !== scope) {
    throw new Error("Token scope mismatch.");
  }

  return decoded;
}
