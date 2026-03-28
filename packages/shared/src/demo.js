export const demoUsers = [
  {
    id: "admin-1",
    loginId: "HOSP-ADMIN-001",
    email: "admin@medirelay.demo",
    password: "medirelay123",
    name: "Sadar General Hospital Admin",
    role: "hospital_admin",
    department: "Administration",
    facility: "Sadar General Hospital",
    isActive: true,
    forcePasswordChange: false
  },
  {
    id: "doctor-1",
    loginId: "DOC-1001",
    email: "doctor@medirelay.demo",
    password: "medirelay123",
    name: "Dr. Asha Rao",
    role: "doctor",
    department: "Emergency",
    facility: "Sadar General Hospital",
    isActive: true,
    forcePasswordChange: false
  },
  {
    id: "doctor-2",
    loginId: "DOC-2001",
    email: "receiver@medirelay.demo",
    password: "medirelay123",
    name: "Dr. Karan Menon",
    role: "doctor",
    department: "Cardiology",
    facility: "City Tertiary Hospital",
    isActive: true,
    forcePasswordChange: false
  },
  {
    id: "nurse-1",
    loginId: "NUR-1001",
    email: "nurse@medirelay.demo",
    password: "medirelay123",
    name: "Nurse Priya Sen",
    role: "nurse",
    department: "Emergency",
    facility: "Sadar General Hospital",
    isActive: true,
    forcePasswordChange: false
  }
];

export const seededTransfers = [
  {
    handoffId: "handoff-demo-1",
    transferChainId: "chain-demo-1",
    facilityPatientId: "PHC-001",
    patientDemographics: {
      name: "Rohan Singh",
      age: "45",
      sex: "Male"
    },
    sendingFacility: "PHC Sadar",
    receivingFacility: "City Tertiary Hospital",
    primaryDiagnosis: "Septic shock with suspected pneumonia",
    medications: [
      { name: "Ceftriaxone", dose: "1 g", route: "IV", mustContinue: true },
      { name: "Insulin", dose: "6 units", route: "SC", mustContinue: false }
    ],
    allergies: [{ name: "Penicillin", reaction: "rash" }],
    reasonForTransfer: "Persistent hypotension and ICU escalation",
    vitals: {
      bloodPressure: "86/54",
      pulse: "118",
      spo2: "91%",
      temperature: "102 F"
    },
    pendingInvestigations: ["Blood culture", "ABG"],
    clinicalSummary:
      "Patient deteriorated despite fluids and antibiotics. Needs ICU admission, vasopressor support, and urgent review for sepsis bundle escalation.",
    criticalSnapshot: {
      allergies: ["Penicillin"],
      doNotStopMedications: ["Ceftriaxone IV"],
      reasonForTransfer: "Persistent hypotension and ICU escalation"
    },
    status: "shared",
    createdAt: new Date().toISOString()
  }
];
