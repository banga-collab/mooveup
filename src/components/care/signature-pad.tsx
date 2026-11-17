"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

/**
 * Cadre de signature au doigt ou à la souris.
 * Envoie l'image (PNG en data URL) dans le champ caché `name`.
 */
export function SignaturePad({ name = "signature" }: { name?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = c.getBoundingClientRect();
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#111827";
      setValue("");
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = "#111827";
      ctx.fill();
    }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = point(e);
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (canvas.current) setValue(canvas.current.toDataURL("image/png"));
  };

  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setValue("");
  };

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div className="relative rounded-lg border border-line bg-white">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          className="block h-40 w-full cursor-crosshair touch-none"
          aria-label="Zone de signature"
        />
        {!value && <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-slate-400">Signez ici avec le doigt ou la souris</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-slate-200" />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span>{value ? "Signature enregistrée" : "Signature obligatoire"}</span>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-slate-100 hover:text-ink">
          <Eraser className="size-3.5" /> Effacer
        </button>
      </div>
    </div>
  );
}
