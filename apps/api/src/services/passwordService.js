import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, storedHash = "") {
  if (!storedHash) {
    return false;
  }

  if (!storedHash.startsWith("scrypt$")) {
    return storedHash === password;
  }

  const [, salt, expectedHex] = storedHash.split("$");
  const derived = await scryptAsync(password, salt, 64);
  const actual = Buffer.from(derived).toString("hex");

  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHex, "hex"));
}
