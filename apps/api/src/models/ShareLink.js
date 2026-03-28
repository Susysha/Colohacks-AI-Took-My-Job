import mongoose from "mongoose";

const shareLinkSchema = new mongoose.Schema(
  {
    shortCode: { type: String, unique: true, index: true },
    handoffId: { type: String, index: true },
    transferChainId: String,
    viewToken: String
  },
  { timestamps: true }
);

export const ShareLinkModel =
  mongoose.models.ShareLink || mongoose.model("ShareLink", shareLinkSchema);

