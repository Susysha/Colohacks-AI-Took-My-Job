import { createCriticalSnapshot, createSecureSharePayload, validateTransferPayload } from "@medirelay/shared";
import { env } from "../config/env.js";
import { store } from "./store.js";
import { createViewToken, randomId, verifyScopedToken } from "./tokenService.js";

function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function withCriticalSnapshot(payload) {
  const validation = validateTransferPayload(payload);

  if (!validation.isValid) {
    throw createError(validation.errors.join(" "), 422);
  }

  return {
    ...payload,
    criticalSnapshot: validation.criticalSnapshot,
    warnings: validation.warnings
  };
}

function auditEnvelope(eventType, actor, record, metadata = {}) {
  return {
    eventType,
    handoffId: record?.handoffId || metadata.handoffId || "",
    actor: actor?.name || actor?.email || actor?.loginId || "system",
    actorUserId: actor?.userId || actor?.sub || "",
    actorRole: actor?.role || "",
    department: actor?.department || "",
    facility: record?.sendingFacility || actor?.facility || metadata.facility || "",
    patientId: record?.facilityPatientId || metadata.patientId || "",
    patientName: record?.patientDemographics?.name || metadata.patientName || "",
    tokenScope: metadata.tokenScope || "app",
    timestamp: new Date().toISOString(),
    metadata
  };
}

export async function createTransfer(payload, actor) {
  const enriched = withCriticalSnapshot(payload);
  const handoffId = payload.handoffId || randomId("handoff");
  const transferChainId = payload.transferChainId || randomId("chain");
  const createdAt = payload.createdAt || new Date().toISOString();

  const record = {
    ...enriched,
    handoffId,
    transferChainId,
    createdAt,
    status: "draft",
    createdByUserId: actor?.userId || actor?.sub || "",
    createdByName: actor?.name || actor?.email || "",
    createdByDepartment: actor?.department || "",
    createdBy: actor?.email || actor?.loginId || "device"
  };

  await store.saveTransfer(record);
  await store.addAuditEvent(
    auditEnvelope("transfer.created", actor, record, {
      transferChainId,
      tokenScope: "app"
    })
  );

  return record;
}

export async function shareTransfer(handoffId, actor) {
  const record = await store.getTransfer(handoffId);

  if (!record) {
    throw createError("Transfer not found.", 404);
  }

  const shortCode = randomId("link").replace("link-", "").slice(0, 8);
  const viewToken = createViewToken({ handoffId, shortCode, transferChainId: record.transferChainId });
  const shortUrl = `${env.publicWebUrl}/r/${shortCode}?t=${viewToken}`;
  const qrPayload = createSecureSharePayload({
    shortUrl,
    patientId: record.facilityPatientId,
    patientName: record.patientDemographics?.name || ""
  });

  await store.setShareLink(shortCode, {
    handoffId,
    transferChainId: record.transferChainId,
    viewToken,
    patientId: record.facilityPatientId,
    patientName: record.patientDemographics?.name || "",
    createdByUserId: actor?.userId || actor?.sub || ""
  });

  await store.saveTransfer({
    ...record,
    status: "shared",
    shareMeta: {
      shortCode,
      shortUrl,
      qrMode: "secure-link",
      qrReference: {
        patientId: record.facilityPatientId,
        patientName: record.patientDemographics?.name || ""
      },
      expiresInHours: 24
    }
  });

  await store.addAuditEvent(
    auditEnvelope("qr.generated", actor, record, {
      tokenScope: "app",
      shortCode
    })
  );

  return {
    handoffId,
    transferChainId: record.transferChainId,
    shortUrl,
    shortCode,
    qrMode: "secure-link",
    qrPayload,
    qrChunks: [qrPayload],
    patientReference: {
      patientId: record.facilityPatientId,
      patientName: record.patientDemographics?.name || ""
    },
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}

export async function resolveShare(shortCode, token, actor) {
  const shareLink = await store.getShareLink(shortCode);

  if (!shareLink) {
    throw createError("Transfer link not found.", 404);
  }

  let decoded;

  try {
    decoded = verifyScopedToken(token, "view");
  } catch (_error) {
    throw createError("Transfer link validation failed.", 401);
  }

  if (decoded.shortCode !== shortCode || decoded.handoffId !== shareLink.handoffId) {
    throw createError("Transfer link validation failed.", 401);
  }

  const record = await store.getTransfer(shareLink.handoffId);

  if (!record) {
    throw createError("Transfer not found.", 404);
  }

  await store.addAuditEvent(
    auditEnvelope("qr.accessed", actor, record, {
      tokenScope: "view",
      shortCode
    })
  );

  return {
    record,
    acknowledgement: await store.getAcknowledgement(record.handoffId),
    timeline: await store.listTransfersByChain(record.transferChainId)
  };
}

export async function acknowledgeTransfer(handoffId, actor, payload) {
  const record = await store.getTransfer(handoffId);

  if (!record) {
    throw createError("Transfer not found.", 404);
  }

  const acknowledgement = {
    handoffId,
    receiverName: actor?.name || payload.receiverName || "",
    receiverRole: actor?.role || payload.receiverRole || "doctor",
    receiverFacility: actor?.facility || payload.receiverFacility || "",
    arrivalNote: payload.arrivalNote || "",
    discrepancies: payload.discrepancies || [],
    reviewedAt: new Date().toISOString(),
    reviewedByUserId: actor?.userId || actor?.sub || ""
  };

  await store.saveAcknowledgement(acknowledgement);
  await store.addAuditEvent(
    auditEnvelope("transfer.acknowledged", actor, record, {
      tokenScope: "app",
      discrepancies: acknowledgement.discrepancies.length
    })
  );

  return acknowledgement;
}

export async function syncBatch(mutations, actor) {
  const results = mutations.map((mutation) => {
    if (mutation.entityType !== "transfer" || mutation.operation !== "upsert") {
      return {
        mutationId: mutation.mutationId,
        status: "ignored"
      };
    }

    return createTransfer(mutation.payload, actor).then((record) => ({
      mutationId: mutation.mutationId,
      status: "accepted",
      handoffId: record.handoffId,
      transferChainId: record.transferChainId
    }));
  });

  return { results: await Promise.all(results) };
}

export async function getTimeline(transferChainId) {
  return await store.listTransfersByChain(transferChainId);
}

export async function getTransferById(handoffId) {
  const record = await store.getTransfer(handoffId);

  if (!record) {
    throw createError("Transfer not found.", 404);
  }

  return record;
}
