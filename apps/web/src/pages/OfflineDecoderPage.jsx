import { useMemo, useState } from "react";
import { assembleChunkedPayload, decodeQrPayload } from "@medirelay/shared";
import CriticalHeader from "../components/CriticalHeader.jsx";
import ScannerPanel from "../components/ScannerPanel.jsx";

export default function OfflineDecoderPage() {
  const [payload, setPayload] = useState("");
  const [bundle, setBundle] = useState([]);

  const result = useMemo(() => {
    try {
      if (!payload) return { decoded: null, error: "" };
      const rawPayload =
        bundle.length > 1 ? assembleChunkedPayload(bundle) : payload.trim();
      return { decoded: decodeQrPayload(rawPayload), error: "" };
    } catch (decodeError) {
      return { decoded: null, error: decodeError.message };
    }
  }, [bundle, payload]);

  function handleDecode(value) {
    if (value.startsWith("MR1.CHUNK.")) {
      setBundle((current) => [...current, value]);
      setPayload(value);
      return;
    }

    setBundle([]);
    setPayload(value);
  }

  return (
    <main className="page decoder-page">
      <section className="decoder-layout">
        <article className="content-panel">
          <div className="section-heading">
            <h3>Offline Payload Decoder</h3>
            <p>Use a cached PWA session to decode QR payload text even if the API is unreachable.</p>
          </div>
          <textarea
            rows="6"
            placeholder="Paste QR payload or scan with the browser camera"
            value={payload}
            onChange={(event) => handleDecode(event.target.value)}
          />
          <ScannerPanel onDecode={handleDecode} />
          {bundle.length > 1 ? <p>{bundle.length} QR chunks captured.</p> : null}
          {result.error ? <p className="error-text">{result.error}</p> : null}
        </article>
        {result.decoded ? (
          <article className="content-panel">
            <CriticalHeader snapshot={result.decoded.criticalSnapshot} />
            <div className="detail-rows">
              <p><span>Patient</span>{result.decoded.patientDemographics.name}</p>
              <p><span>Diagnosis</span>{result.decoded.primaryDiagnosis}</p>
              <p><span>Summary</span>{result.decoded.clinicalSummary}</p>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
