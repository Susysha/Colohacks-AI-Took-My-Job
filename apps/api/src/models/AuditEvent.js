import mongoose from "mongoose";

const auditEventSchema = new mongoose.Schema(
  {
    eventType: String,
    handoffId: String,
    actor: String,
    actorUserId: String,
    actorRole: String,
    department: String,
    facility: String,
    patientId: String,
    patientName: String,
    tokenScope: String,
    timestamp: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

export const AuditEventModel =
  mongoose.models.AuditEvent || mongoose.model("AuditEvent", auditEventSchema);
