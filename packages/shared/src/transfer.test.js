import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQrPayload,
  createSecureSharePayload,
  decodeQrPayload,
  evaluateDrugInteractions,
  parseSecureShareInput,
  validateTransferPayload
} from "./index.js";

test("validateTransferPayload reports interaction warnings", () => {
  const payload = {
    facilityPatientId: "P-1",
    patientDemographics: { name: "A", age: "24", sex: "F" },
    sendingFacility: "PHC",
    receivingFacility: "District",
    primaryDiagnosis: "Asthma",
    medications: [{ name: "Ceftriaxone", route: "IV", dose: "1 g", mustContinue: true }],
    allergies: [{ name: "Penicillin", reaction: "Rash" }],
    reasonForTransfer: "Respiratory distress",
    vitals: { spo2: "88%" },
    clinicalSummary: "Short summary"
  };

  const result = validateTransferPayload(payload);

  assert.equal(result.isValid, true);
  assert.equal(result.warnings.length, 1);
});

test("QR payload round trips a transfer", () => {
  const record = {
    handoffId: "h1",
    transferChainId: "c1",
    facilityPatientId: "f1",
    patientDemographics: { name: "Patient", age: "60", sex: "M" },
    sendingFacility: "A",
    receivingFacility: "B",
    primaryDiagnosis: "Dx",
    medications: [{ name: "Drug", dose: "1", route: "IV", mustContinue: true }],
    allergies: [{ name: "None", reaction: "" }],
    reasonForTransfer: "Reason",
    vitals: { bp: "100/70" },
    pendingInvestigations: ["ECG"],
    clinicalSummary: "Summary",
    criticalSnapshot: {
      allergies: ["None"],
      doNotStopMedications: ["Drug IV"],
      reasonForTransfer: "Reason"
    }
  };

  const payload = buildQrPayload(record);
  const decoded = decodeQrPayload(payload.primaryPayload);

  assert.equal(decoded.handoffId, record.handoffId);
  assert.equal(decoded.patientDemographics.name, "Patient");
  assert.equal(decoded.criticalSnapshot.reasonForTransfer, "Reason");
});

test("evaluateDrugInteractions identifies med-med risk", () => {
  const warnings = evaluateDrugInteractions({
    allergies: [],
    medications: [{ name: "Warfarin" }, { name: "Ibuprofen" }]
  });

  assert.equal(warnings[0].severity, "high");
});

test("secure share payload preserves link and patient reference", () => {
  const payload = createSecureSharePayload({
    shortUrl: "http://localhost:5173/r/demo123?t=abc123",
    patientId: "PT-777",
    patientName: "Tracked Patient"
  });

  const parsed = parseSecureShareInput(payload);

  assert.equal(parsed.mode, "link");
  assert.equal(parsed.shortCode, "demo123");
  assert.equal(parsed.token, "abc123");
  assert.equal(parsed.patientReference.patientId, "PT-777");
  assert.equal(parsed.patientReference.patientName, "Tracked Patient");
});
