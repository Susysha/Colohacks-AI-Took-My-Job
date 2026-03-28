import mongoose from "mongoose";

const hospitalSchema = new mongoose.Schema(
  {
    hospitalId: { type: String, unique: true, index: true },
    name: { type: String, unique: true, index: true },
    code: { type: String, unique: true, index: true },
    address: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: String, default: "" },
    createdAt: String
  },
  { timestamps: true }
);

export const HospitalModel = mongoose.models.Hospital || mongoose.model("Hospital", hospitalSchema);
