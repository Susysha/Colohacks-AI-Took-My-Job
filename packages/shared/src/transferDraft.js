export const initialTransferForm = {
  facilityPatientId: "",
  patientName: "",
  patientAge: "",
  patientSex: "",
  sendingFacility: "PHC Sadar",
  receivingFacility: "City Tertiary Hospital",
  primaryDiagnosis: "",
  medications: [{ name: "", dose: "", route: "", mustContinue: true }],
  allergies: [{ name: "", reaction: "" }],
  reasonForTransfer: "",
  vitals: {
    bloodPressure: "",
    pulse: "",
    spo2: "",
    temperature: ""
  },
  pendingInvestigationsText: "",
  clinicalSummary: "",
  overrideReason: ""
};

export function makeTransferId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanMedications(items = []) {
  return items.filter((item) => item.name?.trim());
}

export function cleanAllergies(items = []) {
  return items.filter((item) => item.name?.trim());
}

export function buildTransferPayload(form, createCriticalSnapshot, existingIds = {}) {
  const medications = cleanMedications(form.medications);
  const allergies = cleanAllergies(form.allergies);

  return {
    handoffId: existingIds.handoffId || makeTransferId("handoff"),
    transferChainId: existingIds.transferChainId || makeTransferId("chain"),
    facilityPatientId: form.facilityPatientId,
    patientDemographics: {
      name: form.patientName,
      age: form.patientAge,
      sex: form.patientSex
    },
    sendingFacility: form.sendingFacility,
    receivingFacility: form.receivingFacility,
    primaryDiagnosis: form.primaryDiagnosis,
    medications,
    allergies,
    reasonForTransfer: form.reasonForTransfer,
    vitals: form.vitals,
    pendingInvestigations: (form.pendingInvestigationsText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    clinicalSummary: form.clinicalSummary,
    criticalSnapshot: createCriticalSnapshot({
      allergies,
      medications,
      reasonForTransfer: form.reasonForTransfer
    })
  };
}

