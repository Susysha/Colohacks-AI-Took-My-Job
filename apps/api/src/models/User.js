import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, unique: true, index: true },
    hospitalId: { type: String, index: true, default: "" },
    loginId: { type: String, unique: true, index: true },
    email: { type: String, unique: true, sparse: true, index: true },
    staffFingerprint: { type: String, sparse: true, index: true, default: undefined },
    passwordHash: String,
    name: String,
    role: { type: String, enum: ["system_admin", "hospital_admin", "doctor", "nurse"], default: "doctor" },
    department: String,
    facility: String,
    isActive: { type: Boolean, default: true },
    forcePasswordChange: { type: Boolean, default: false },
    createdByUserId: String,
    createdAt: String
  },
  { timestamps: true }
);

export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
