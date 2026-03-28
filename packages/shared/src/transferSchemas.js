import { evaluateDrugInteractions } from "./drugRules.js";

const requiredString = (value) => typeof value === "string" && value.trim().length > 0;

function wordCount(value = "") {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function createCriticalSnapshot(record) {
  const medications = record.medications || [];

  return {
    allergies: (record.allergies || []).map((item) => item.name || item).filter(Boolean),
    doNotStopMedications: medications
      .filter((item) => item.mustContinue)
      .map((item) => `${item.name}${item.route ? ` ${item.route}` : ""}`),
    reasonForTransfer: record.reasonForTransfer || ""
  };
}

export function validateTransferPayload(payload) {
  const errors = [];

  if (!requiredString(payload.facilityPatientId)) errors.push("Facility patient ID is required.");
  if (!requiredString(payload.patientDemographics?.name)) errors.push("Patient name is required.");
  if (!requiredString(payload.patientDemographics?.age)) errors.push("Patient age is required.");
  if (!requiredString(payload.patientDemographics?.sex)) errors.push("Patient sex is required.");
  if (!requiredString(payload.sendingFacility)) errors.push("Sending facility is required.");
  if (!requiredString(payload.receivingFacility)) errors.push("Receiving facility is required.");
  if (!requiredString(payload.primaryDiagnosis)) errors.push("Primary diagnosis is required.");
  if (!requiredString(payload.reasonForTransfer)) errors.push("Reason for transfer is required.");
  if (!Array.isArray(payload.medications) || payload.medications.length === 0) {
    errors.push("At least one active medication is required.");
  }
  if (!Array.isArray(payload.allergies) || payload.allergies.length === 0) {
    errors.push("At least one known allergy entry is required.");
  }
  if (!payload.vitals || Object.values(payload.vitals).filter(Boolean).length === 0) {
    errors.push("At least one vital sign is required.");
  }
  if (wordCount(payload.clinicalSummary) > 200) {
    errors.push("Clinical summary must be 200 words or fewer.");
  }

  const warnings = evaluateDrugInteractions(payload);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    criticalSnapshot: createCriticalSnapshot(payload)
  };
}

