import mongoose from "mongoose";

const usedTokenSchema = new mongoose.Schema(
  {
    tokenId: { type: String, unique: true, index: true },
    scope: String,
    handoffId: String,
    usedAt: String
  },
  { timestamps: true }
);

export const UsedTokenModel =
  mongoose.models.UsedToken || mongoose.model("UsedToken", usedTokenSchema);

