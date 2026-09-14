"use client";

import { useEffect, useRef, useState } from "react";

type Detector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

/**
 * Optional camera barcode — uses BarcodeDetector when the browser supports it.
 * Falls back to a short message if unsupported (USB scanner still works).
 */
export default function PosBarcodeCamera({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef("");

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    (async () => {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
        .BarcodeDetector;
      if (!BD) {
        setErr("Camera barcode not supported on this browser. Use USB scanner or type the code.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new BD({
          formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a", "upc_e"],
        });
        const tick = async () => {
          if (!alive || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            if (raw && raw !== lastRef.current) {
              lastRef.current = raw;
              onCode(raw);
              onClose();
              return;
            }
          } catch {
            /* keep scanning */
          }
          timer = window.setTimeout(() => void tick(), 350);
        };
        void tick();
      } catch {
        setErr("Camera permission denied or unavailable.");
      }
    })();

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose, onCode]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-zinc-950 p-4 text-white sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">Scan barcode</h3>
          <button type="button" onClick={onClose} className="text-xs font-semibold text-zinc-300">
            Close
          </button>
        </div>
        {err ? (
          <p className="py-8 text-center text-sm text-zinc-400">{err}</p>
        ) : (
          <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />
        )}
      </div>
    </div>
  );
}
