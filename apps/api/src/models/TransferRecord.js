import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    name: String,
    dose: String,
    route: String,
    mustContinue: Boolean
  },
  { _id: false }
);

const allergySchema = new mongoose.Schema(
  {
    name: String,
    reaction: String
  },
  { _id: false }
);

const transferRecordSchema = new mongoose.Schema(
  {
    handoffId: { type: String, index: true, unique: true },
    transferChainId: { type: String, index: true },
    facilityPatientId: String,
    patientDemographics: {
      name: String,
      age: String,
      sex: String
    },
    sendingFacility: String,
    receivingFacility: String,
    primaryDiagnosis: String,
    medications: [medicationSchema],
    allergies: [allergySchema],
    reasonForTransfer: String,
    vitals: mongoose.Schema.Types.Mixed,
    pendingInvestigations: [String],
    clinicalSummary: String,
    createdByUserId: String,
    createdByName: String,
    createdByDepartment: String,
    criticalSnapshot: {
      allergies: [String],
      doNotStopMedications: [String],
      reasonForTransfer: String
    },
    status: String,
    shareMeta: mongoose.Schema.Types.Mixed,
    createdAt: String
  },
  { timestamps: true }
);

export const TransferRecordModel =
  mongoose.models.TransferRecord || mongoose.model("TransferRecord", transferRecordSchema);
