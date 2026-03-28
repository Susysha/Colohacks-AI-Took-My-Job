import { useEffect, useRef } from "react";

export default function ScannerPanel({ onDecode }) {
  const mountRef = useRef(null);

  useEffect(() => {
    let html5QrCode;

    async function startScanner() {
      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");

        html5QrCode = new Html5QrcodeScanner(
          mountRef.current.id,
          { fps: 8, qrbox: { width: 220, height: 220 } },
          false
        );

        html5QrCode.render(
          (decodedText) => {
            onDecode(decodedText);
            html5QrCode.clear().catch(() => {});
          },
          () => {}
        );
      } catch (_error) {}
    }

    if (mountRef.current) {
      startScanner();
    }

    return () => {
      if (html5QrCode) {
        html5QrCode.clear().catch(() => {});
      }
    };
  }, [onDecode]);

  return <div className="scanner-frame" id="qr-reader" ref={mountRef} />;
}

