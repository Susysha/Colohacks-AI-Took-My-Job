const QR_VERSION = "MR1";
const MAX_SINGLE_QR_LENGTH = 1400;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const shortMedication = (item) => [
  item.name || "",
  item.dose || "",
  item.route || "",
  item.mustContinue ? 1 : 0
];

const longMedication = ([name, dose, route, mustContinue]) => ({
  name,
  dose,
  route,
  mustContinue: Boolean(mustContinue)
});

const shortAllergy = (item) => [item.name || "", item.reaction || ""];
const longAllergy = ([name, reaction]) => ({ name, reaction });

function compactTransfer(record) {
  return {
    h: record.handoffId,
    c: record.transferChainId,
    f: record.facilityPatientId,
    p: [
      record.patientDemographics?.name || "",
      record.patientDemographics?.age || "",
      record.patientDemographics?.sex || ""
    ],
    sf: record.sendingFacility || "",
    rf: record.receivingFacility || "",
    d: record.primaryDiagnosis || "",
    m: (record.medications || []).map(shortMedication),
    a: (record.allergies || []).map(shortAllergy),
    r: record.reasonForTransfer || "",
    v: record.vitals || {},
    pi: record.pendingInvestigations || [],
    s: record.clinicalSummary || "",
    cs: {
      a: record.criticalSnapshot?.allergies || [],
      m: record.criticalSnapshot?.doNotStopMedications || [],
      r: record.criticalSnapshot?.reasonForTransfer || record.reasonForTransfer || ""
    }
  };
}

function expandTransfer(compact) {
  return {
    handoffId: compact.h,
    transferChainId: compact.c,
    facilityPatientId: compact.f,
    patientDemographics: {
      name: compact.p?.[0] || "",
      age: compact.p?.[1] || "",
      sex: compact.p?.[2] || ""
    },
    sendingFacility: compact.sf,
    receivingFacility: compact.rf,
    primaryDiagnosis: compact.d,
    medications: (compact.m || []).map(longMedication),
    allergies: (compact.a || []).map(longAllergy),
    reasonForTransfer: compact.r,
    vitals: compact.v || {},
    pendingInvestigations: compact.pi || [],
    clinicalSummary: compact.s || "",
    criticalSnapshot: {
      allergies: compact.cs?.a || [],
      doNotStopMedications: compact.cs?.m || [],
      reasonForTransfer: compact.cs?.r || ""
    }
  };
}

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
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk = (first << 16) | ((second || 0) << 8) | (third || 0);

    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += typeof second === "number" ? BASE64_ALPHABET[(chunk >> 6) & 63] : "=";
    output += typeof third === "number" ? BASE64_ALPHABET[chunk & 63] : "=";
  }

  return output;
}

function base64ToBytes(input) {
  const sanitized = input.replace(/\s/g, "");

  if (sanitized.length % 4 !== 0) {
    throw new Error("Invalid base64 payload.");
  }

  const bytes = [];

  for (let index = 0; index < sanitized.length; index += 4) {
    const chars = sanitized.slice(index, index + 4).split("");
    const values = chars.map((char) => (char === "=" ? 0 : BASE64_ALPHABET.indexOf(char)));

    if (values.some((value, valueIndex) => chars[valueIndex] !== "=" && value === -1)) {
      throw new Error("Invalid base64 payload.");
    }

    const chunk = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    bytes.push((chunk >> 16) & 255);

    if (chars[2] !== "=") {
      bytes.push((chunk >> 8) & 255);
    }

    if (chars[3] !== "=") {
      bytes.push(chunk & 255);
    }
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

export function buildQrPayload(record) {
  const compact = compactTransfer(record);
  const encoded = `${QR_VERSION}.${encodeBase64Url(compact)}`;

  if (encoded.length <= MAX_SINGLE_QR_LENGTH) {
    return {
      mode: "single",
      primaryPayload: encoded,
      chunks: [encoded]
    };
  }

  const chunkSize = 900;
  const chunks = [];

  for (let index = 0; index < encoded.length; index += chunkSize) {
    const chunkNumber = chunks.length + 1;
    chunks.push(`${QR_VERSION}.CHUNK.${chunkNumber}.${encoded.slice(index, index + chunkSize)}`);
  }

  return {
    mode: "bundle",
    primaryPayload: chunks[0],
    chunks
  };
}

export function decodeQrPayload(payload) {
  if (!payload) {
    throw new Error("Missing QR payload.");
  }

  if (payload.startsWith(`${QR_VERSION}.CHUNK.`)) {
    throw new Error("Chunked payload requires bundle assembly before decoding.");
  }

  const [version, encoded] = payload.split(".");

  if (version !== QR_VERSION || !encoded) {
    throw new Error("Unsupported QR payload format.");
  }

  return expandTransfer(decodeBase64Url(encoded));
}

export function assembleChunkedPayload(chunks) {
  const body = [...chunks]
    .sort((left, right) => {
      const leftNumber = Number(left.split(".")[2]);
      const rightNumber = Number(right.split(".")[2]);
      return leftNumber - rightNumber;
    })
    .map((chunk) => chunk.split(".").slice(3).join("."))
    .join("");

  return `${QR_VERSION}.${body}`;
}
