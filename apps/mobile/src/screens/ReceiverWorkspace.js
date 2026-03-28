import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { assembleChunkedPayload, decodeQrPayload, parseSecureShareInput } from "@medirelay/shared";
import { fetchSharedTransfer, submitAcknowledgement } from "../lib/api";
import { ActionButton, Badge, Field, InsetCard, SectionCard, StatPill } from "../ui/primitives";
import { palette } from "../ui/theme";

const discrepancyChoices = [
  "Missing medication details",
  "Vitals mismatch on arrival",
  "Diagnosis clarification needed"
];

export default function ReceiverWorkspace({ session, setStatusMessage, onActivityChanged = async () => {} }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [receiverInput, setReceiverInput] = useState("");
  const [receiverState, setReceiverState] = useState({
    mode: "idle",
    error: "",
    data: null,
    payloadRecord: null
  });
  const [ackForm, setAckForm] = useState({
    arrivalNote: "",
    discrepancies: []
  });

  const activeReceiverRecord = receiverState.data?.record || receiverState.payloadRecord;
  const activeReceiverSnapshot = useMemo(() => activeReceiverRecord?.criticalSnapshot, [activeReceiverRecord]);

  async function handleOpenReceiverRecord() {
    if (!session?.accessToken || session.user.role !== "doctor") {
      setReceiverState({
        mode: "idle",
        error: "Only authenticated doctor accounts can scan or open QR records.",
        data: null,
        payloadRecord: null
      });
      return;
    }

    const parsed = parseSecureShareInput(receiverInput);

    if (parsed.mode === "empty") {
      setReceiverState({
        mode: "idle",
        error: "Paste a secure link or QR payload first.",
        data: null,
        payloadRecord: null
      });
      return;
    }

    if (parsed.mode === "error") {
      setReceiverState({ mode: "idle", error: parsed.error, data: null, payloadRecord: null });
      return;
    }

    if (parsed.mode === "link") {
      try {
        const data = await fetchSharedTransfer(session.accessToken, parsed.shortCode, parsed.token);
        setReceiverState({ mode: "link", error: "", data, payloadRecord: null });
        await onActivityChanged(session.accessToken);
        setStatusMessage("Doctor access logged and receiver record opened.");
      } catch (error) {
        setReceiverState({ mode: "link", error: error.message, data: null, payloadRecord: null });
      }
      return;
    }

    try {
      const lines = receiverInput
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      const payloadToDecode =
        lines.length > 1 && lines.every((item) => item.startsWith("MR1.CHUNK."))
          ? assembleChunkedPayload(lines)
          : parsed.payload;
      const payloadRecord = decodeQrPayload(payloadToDecode);
      setReceiverState({ mode: "payload", error: "", data: null, payloadRecord });
      setStatusMessage("Offline QR payload decoded inside the mobile app.");
    } catch (error) {
      setReceiverState({ mode: "payload", error: error.message, data: null, payloadRecord: null });
    }
  }

  async function handleOpenScanner() {
    if (session?.user?.role !== "doctor") {
      setStatusMessage("Only doctor accounts can open the QR scanner.");
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setStatusMessage("Camera permission is required to scan QR codes.");
        return;
      }
    }

    setScannerLocked(false);
    setScannerOpen(true);
    setStatusMessage("Camera scanner ready. Point it at a MediRelay QR code.");
  }

  function handleBarcodeScanned(event) {
    if (scannerLocked) return;
    setScannerLocked(true);
    setScannerOpen(false);
    setReceiverInput(event.data || "");
    setStatusMessage("QR scanned. Review the secure link and open the record.");
  }

  function toggleDiscrepancy(label) {
    setAckForm((current) => ({
      ...current,
      discrepancies: current.discrepancies.includes(label)
        ? current.discrepancies.filter((item) => item !== label)
        : [...current.discrepancies, label]
    }));
  }

  async function handleAcknowledgement() {
    if (!session?.accessToken || !receiverState.data?.record) {
      return;
    }

    try {
      const acknowledgement = await submitAcknowledgement(
        session.accessToken,
        receiverState.data.record.handoffId,
        ackForm
      );
      setReceiverState((current) => ({
        ...current,
        data: {
          ...current.data,
          acknowledgement
        }
      }));
      await onActivityChanged(session.accessToken);
      setStatusMessage("Arrival acknowledgement saved and tracked for this doctor.");
    } catch (error) {
      setStatusMessage(`Acknowledgement failed: ${error.message}`);
    }
  }

  return (
    <>
      <SectionCard
        title="Doctor receiver tools"
        subtitle="QR scan and patient access are restricted to authenticated doctor accounts only."
        tone="raised"
      >
        <View style={styles.metricRow}>
          <StatPill
            value={session?.user?.role === "doctor" ? "Doctor" : "Locked"}
            label="Access level"
            tone={session?.user?.role === "doctor" ? "success" : "danger"}
          />
          <StatPill
            value={receiverState.data ? "Live" : receiverState.payloadRecord ? "QR" : "Idle"}
            label="Record source"
            tone={receiverState.data ? "success" : receiverState.payloadRecord ? "caution" : "default"}
          />
          <StatPill
            value={activeReceiverSnapshot?.allergies?.length ? String(activeReceiverSnapshot.allergies.length) : "0"}
            label="Allergy flags"
            tone={activeReceiverSnapshot?.allergies?.length ? "danger" : "default"}
          />
        </View>
        <View style={styles.badgeRow}>
          <Badge label={`Doctor: ${session?.user?.name || "Not signed in"}`} tone="default" />
          <Badge label={`Dept: ${session?.user?.department || "N/A"}`} tone="default" />
        </View>
      </SectionCard>

      <SectionCard
        title="Open a QR record"
        subtitle="Paste the secure link from the sender or scan the QR to log doctor access and open the patient handoff."
      >
        <Field
          label="Secure link or QR payload"
          value={receiverInput}
          onChangeText={setReceiverInput}
          multiline
          placeholder="Paste the secure link or QR payload here"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <ActionButton label="Open record" onPress={handleOpenReceiverRecord} />
          </View>
          <View style={styles.half}>
            <ActionButton label="Scan QR with camera" variant="secondary" onPress={handleOpenScanner} />
          </View>
        </View>
        {receiverState.error ? <Text style={styles.errorText}>{receiverState.error}</Text> : null}
        {scannerOpen ? (
          <InsetCard tone="strong">
            <CameraView
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"]
              }}
              onBarcodeScanned={handleBarcodeScanned}
              style={styles.scannerView}
            />
            <Text style={styles.helperText}>Scan the secure doctor-access QR.</Text>
            <ActionButton label="Close scanner" variant="ghost" onPress={() => setScannerOpen(false)} />
          </InsetCard>
        ) : null}
      </SectionCard>

      {activeReceiverRecord ? (
        <>
          <SectionCard
            title="Critical information surface"
            subtitle="This remains the first thing the doctor sees after scanning the QR."
            tone="raised"
          >
            <View style={styles.criticalStack}>
              <View style={[styles.criticalCard, styles.criticalDanger]}>
                <Text style={styles.criticalLabel}>Known allergies</Text>
                <Text style={styles.criticalValue}>
                  {activeReceiverSnapshot?.allergies?.join(", ") || "None reported"}
                </Text>
              </View>
              <View style={[styles.criticalCard, styles.criticalCaution]}>
                <Text style={styles.criticalLabel}>Do-not-stop medications</Text>
                <Text style={styles.criticalValue}>
                  {activeReceiverSnapshot?.doNotStopMedications?.join(", ") || "No locked medications"}
                </Text>
              </View>
              <View style={[styles.criticalCard, styles.criticalNeutral]}>
                <Text style={styles.criticalLabel}>Reason for transfer</Text>
                <Text style={styles.criticalValue}>
                  {activeReceiverSnapshot?.reasonForTransfer || "Not provided"}
                </Text>
              </View>
            </View>
          </SectionCard>

          <SectionCard title="Transfer record" subtitle="Full patient context after doctor-authenticated access.">
            <InsetCard>
              <Text style={styles.patientLine}>
                {activeReceiverRecord.patientDemographics.name}, {activeReceiverRecord.patientDemographics.age} years,{" "}
                {activeReceiverRecord.patientDemographics.sex}
              </Text>
              <Text style={styles.factText}>Patient ID: {activeReceiverRecord.facilityPatientId}</Text>
              <Text style={styles.factText}>Primary diagnosis: {activeReceiverRecord.primaryDiagnosis}</Text>
              <Text style={styles.factText}>Sending facility: {activeReceiverRecord.sendingFacility}</Text>
              <Text style={styles.factText}>Receiving facility: {activeReceiverRecord.receivingFacility}</Text>
              <Text style={styles.factText}>Summary: {activeReceiverRecord.clinicalSummary}</Text>
            </InsetCard>
          </SectionCard>

          {receiverState.data ? (
            <SectionCard
              title="Arrival acknowledgement"
              subtitle="The signed-in doctor closes the loop here. Identity is taken from the logged-in account."
              tone="neutral"
            >
              <InsetCard tone="strong">
                <Text style={styles.helperText}>Reviewer: {session.user.name}</Text>
                <Text style={styles.helperText}>
                  {session.user.department || "No department"} | {session.user.facility}
                </Text>
              </InsetCard>
              <Field
                label="Arrival note"
                value={ackForm.arrivalNote}
                onChangeText={(value) => setAckForm((current) => ({ ...current, arrivalNote: value }))}
                multiline
              />
              <Text style={styles.sectionLabel}>Discrepancies</Text>
              <View style={styles.chipWrap}>
                {discrepancyChoices.map((label) => (
                  <Pressable
                    key={label}
                    style={[styles.chip, ackForm.discrepancies.includes(label) && styles.chipActive]}
                    onPress={() => toggleDiscrepancy(label)}
                  >
                    <Text style={[styles.chipText, ackForm.discrepancies.includes(label) && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton label="Mark reviewed" onPress={handleAcknowledgement} />
            </SectionCard>
          ) : null}

          {receiverState.data?.timeline?.length ? (
            <SectionCard title="Transfer timeline" subtitle="Chronological chain for this patient handoff.">
              {receiverState.data.timeline.map((item) => (
                <InsetCard key={item.handoffId} tone="strong">
                  <Text style={styles.timelineDate}>{new Date(item.createdAt).toLocaleString()}</Text>
                  <Text style={styles.timelineTitle}>{item.primaryDiagnosis}</Text>
                  <Text style={styles.helperText}>
                    {item.sendingFacility} to {item.receivingFacility}
                  </Text>
                </InsetCard>
              ))}
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
    flexWrap: "wrap"
  },
  half: {
    flex: 1,
    minWidth: 132
  },
  helperText: {
    color: palette.textSoft,
    lineHeight: 20
  },
  errorText: {
    color: palette.coral,
    lineHeight: 20
  },
  scannerView: {
    height: 280,
    borderRadius: 22,
    overflow: "hidden"
  },
  criticalStack: {
    gap: 12
  },
  criticalCard: {
    borderRadius: 24,
    padding: 18,
    gap: 8
  },
  criticalDanger: {
    backgroundColor: palette.surfaceDangerSoft
  },
  criticalCaution: {
    backgroundColor: palette.surfaceCaution
  },
  criticalNeutral: {
    backgroundColor: palette.surfaceNeutral
  },
  criticalLabel: {
    color: palette.textSoft,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  criticalValue: {
    color: palette.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800"
  },
  patientLine: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 19,
    lineHeight: 24
  },
  factText: {
    color: palette.textSoft,
    lineHeight: 20
  },
  sectionLabel: {
    color: palette.mint,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: "#f8fbfa",
    borderWidth: 1,
    borderColor: palette.line
  },
  chipActive: {
    backgroundColor: palette.teal,
    borderColor: palette.mint
  },
  chipText: {
    color: palette.text,
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#ffffff"
  },
  timelineDate: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  timelineTitle: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 18
  }
});
