import mongoose from "mongoose";

const acknowledgementSchema = new mongoose.Schema(
  {
    handoffId: { type: String, index: true },
    receiverName: String,
    receiverRole: String,
    receiverFacility: String,
    arrivalNote: String,
    discrepancies: [String],
    reviewedAt: String
  },
  { timestamps: true }
);

export const AcknowledgementModel =
  mongoose.models.Acknowledgement || mongoose.model("Acknowledgement", acknowledgementSchema);

