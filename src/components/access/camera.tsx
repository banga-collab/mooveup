"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

/* API BarcodeDetector (Chrome / Edge / Android) : non typée dans lib.dom */
type Detected = { rawValue: string };
type Detector = { detect: (src: HTMLVideoElement) => Promise<Detected[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Lecture du QR code à la caméra (BarcodeDetector), sinon message d'aide */
export function CameraScanner({ onCode, onClose, tall }: { onCode: (code: string) => void; onClose: () => void; tall?: boolean }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(() => (typeof window !== "undefined" && !("BarcodeDetector" in window) ? "acces.camera.unsupported" : null));
  const done = useRef(onCode);
  useEffect(() => {
    done.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (error) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue && !stopped) {
              stopped = true;
              done.current(found[0].rawValue);
            }
          } catch {
            /* image illisible : on réessaie */
          }
        }, 250);
      } catch {
        setError("acces.camera.denied");
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [error]);

  return (
    <div className="rounded-xl border border-line bg-white p-3">
      {error ? (
        <div className="flex items-start justify-between gap-3 px-2 py-1">
          <p className="text-[13px] text-muted">{t(error)}</p>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("acces.close")}
          </Button>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-slate-900">
          <video ref={video} playsInline muted className={tall ? "mx-auto aspect-video max-h-[45vh] w-full object-cover" : "mx-auto aspect-video max-h-72 w-full object-cover"} />
          <span className="pointer-events-none absolute inset-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/70" />
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">{t("acces.camera.frame")}</p>
        </div>
      )}
    </div>
  );
}
