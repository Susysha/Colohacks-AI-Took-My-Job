const SECURE_QR_VERSION = "MRL1";

function stringToUtf8Bytes(input) {
  const encoded = encodeURIComponent(input);
  const bytes = [];

  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(encoded.charCodeAt(index));
    }
  }

  return bytes;
}

function utf8BytesToString(bytes) {
  const encoded = bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  return decodeURIComponent(encoded);
}

function bytesToBase64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk = (first << 16) | ((second || 0) << 8) | (third || 0);

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    output += typeof second === "number" ? alphabet[(chunk >> 6) & 63] : "=";
    output += typeof third === "number" ? alphabet[chunk & 63] : "=";
  }

  return output;
}

function base64ToBytes(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const sanitized = input.replace(/\s/g, "");
  const bytes = [];

  for (let index = 0; index < sanitized.length; index += 4) {
    const chars = sanitized.slice(index, index + 4).split("");
    const values = chars.map((char) => (char === "=" ? 0 : alphabet.indexOf(char)));
    const chunk = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];

    bytes.push((chunk >> 16) & 255);
    if (chars[2] !== "=") bytes.push((chunk >> 8) & 255);
    if (chars[3] !== "=") bytes.push(chunk & 255);
  }

  return bytes;
}

function encodeBase64Url(input) {
  return bytesToBase64(stringToUtf8Bytes(JSON.stringify(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return JSON.parse(utf8BytesToString(base64ToBytes(normalized + padding)));
}

export function createSecureSharePayload({ shortUrl, patientId = "", patientName = "" }) {
  return `${SECURE_QR_VERSION}.${encodeBase64Url({
    shortUrl,
    patientId,
    patientName
  })}`;
}

export function parseSecureShareInput(value = "") {
  const trimmed = value.trim();

  if (!trimmed) {
    return { mode: "empty" };
  }

  if (trimmed.startsWith("MR1.")) {
    return { mode: "payload", payload: trimmed };
  }

  if (trimmed.startsWith(`${SECURE_QR_VERSION}.`)) {
    try {
      const payload = decodeBase64Url(trimmed.slice(`${SECURE_QR_VERSION}.`.length));
      const url = new URL(payload.shortUrl);
      const match = url.pathname.match(/\/r\/([^/]+)/);
      const token = url.searchParams.get("t");

      if (!match?.[1] || !token) {
        throw new Error("Invalid secure link format.");
      }

      return {
        mode: "link",
        shortCode: match[1],
        token,
        patientReference: {
          patientId: payload.patientId || "",
          patientName: payload.patientName || ""
        }
      };
    } catch (_error) {
      return {
        mode: "error",
        error: "Paste a valid MediRelay secure QR payload or a full secure link."
      };
    }
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/r\/([^/]+)/);
    const token = url.searchParams.get("t");

    if (!match?.[1] || !token) {
      throw new Error("Invalid secure link format.");
    }

    return {
      mode: "link",
      shortCode: match[1],
      token
    };
  } catch (_error) {
    return {
      mode: "error",
      error: "Paste a full secure link, a secure QR payload, or an MR1 QR payload."
    };
  }
}
