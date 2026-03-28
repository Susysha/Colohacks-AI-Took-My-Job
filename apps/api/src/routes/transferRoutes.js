import express from "express";
import { requireAuth, requirePasswordChangeResolved, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  acknowledgeTransfer,
  createTransfer,
  getTimeline,
  getTransferById,
  resolveShare,
  shareTransfer,
  syncBatch
} from "../services/transferService.js";

export const transferRouter = express.Router();

transferRouter.use(requireAuth);

const requireDoctorQrAccess = [requireRole("doctor"), requirePasswordChangeResolved];

transferRouter.post(
  "/",
  ...requireDoctorQrAccess,
  asyncHandler(async (request, response) => {
    const transfer = await createTransfer(request.body, request.user);
    return response.status(201).json(transfer);
  })
);

transferRouter.post(
  "/:handoffId/share",
  ...requireDoctorQrAccess,
  asyncHandler(async (request, response) => {
    const share = await shareTransfer(request.params.handoffId, request.user);
    return response.json(share);
  })
);

transferRouter.get(
  "/shared/:shortCode",
  ...requireDoctorQrAccess,
  asyncHandler(async (request, response) => {
    const result = await resolveShare(request.params.shortCode, request.query.t, request.user);
    return response.json(result);
  })
);

transferRouter.post(
  "/:handoffId/acknowledge",
  ...requireDoctorQrAccess,
  asyncHandler(async (request, response) => {
    const result = await acknowledgeTransfer(request.params.handoffId, request.user, request.body);
    return response.status(201).json(result);
  })
);

export const handleTimeline = asyncHandler(async (request, response) => {
  const timeline = await getTimeline(request.params.transferChainId);
  return response.json({ timeline });
});

export const handleSync = [
  ...requireDoctorQrAccess,
  asyncHandler(async (request, response) => {
    const result = await syncBatch(request.body.mutations || [], request.user);
    return response.json(result);
  })
];

transferRouter.get("/chains/:transferChainId", ...requireDoctorQrAccess, handleTimeline);

transferRouter.get(
  "/:handoffId",
  ...requireDoctorQrAccess,
  asyncHandler(async (request, response) => {
    const record = await getTransferById(request.params.handoffId);
    return response.json(record);
  })
);

transferRouter.post("/sync/batch", ...handleSync);
