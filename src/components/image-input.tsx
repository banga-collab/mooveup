"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { compressImage, fileSize } from "@/lib/image-compress";
import { cn } from "@/lib/utils";

/**
 * Champ photo à utiliser PARTOUT où l'on ajoute une image.
 * Compresse automatiquement (WebP, sans perte visible) avant l'envoi du formulaire :
 * le fichier compressé remplace l'original dans l'input `name`.
 */
export function ImageInput({
  name = "photo",
  label = "Ajouter une photo",
  multiple,
  required,
  className,
  onReady,
}: {
  name?: string;
  label?: string;
  multiple?: boolean;
  required?: boolean;
  className?: string;
  onReady?: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ url: string; name: string; before: number; after: number }[]>([]);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    setBusy(true);
    const results = await Promise.all(files.map((f) => compressImage(f)));
    const dt = new DataTransfer();
    results.forEach((r) => dt.items.add(r.file));
    input.files = dt.files;
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems(results.map((r) => ({ url: URL.createObjectURL(r.file), name: r.file.name, before: r.before, after: r.after })));
    setBusy(false);
    onReady?.(results.map((r) => r.file));
  };

  const clear = () => {
    if (ref.current) ref.current.value = "";
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
  };

  const saved = items.reduce((a, i) => a + i.before - i.after, 0);

  return (
    <div className={cn("space-y-2", className)}>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3.5 py-3 text-[13px] text-slate-600 transition hover:border-brand-400 hover:bg-brand-50/40">
        {busy ? <Loader2 className="size-4 animate-spin text-brand-500" /> : <ImagePlus className="size-4 text-slate-400" />}
        <span className="flex-1">{busy ? "Optimisation de l'image…" : label}</span>
        <span className="text-xs text-slate-400">JPG, PNG, WebP</span>
        <input ref={ref} type="file" name={name} accept="image/*" multiple={multiple} required={required} onChange={onChange} className="sr-only" />
      </label>
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {items.map((i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i.url} src={i.url} alt={i.name} className="size-14 rounded-lg border border-line object-cover" />
          ))}
          <span className="text-xs text-muted">
            {saved > 0 ? `Optimisée : ${fileSize(items.reduce((a, i) => a + i.after, 0))} (−${Math.round((saved / items.reduce((a, i) => a + i.before, 0)) * 100)} %)` : "Déjà optimisée"}
          </span>
          <button type="button" onClick={clear} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Retirer">
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
