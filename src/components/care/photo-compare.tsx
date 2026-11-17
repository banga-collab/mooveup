"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export type ComparePhoto = { id: string; kind: "avant" | "apres"; zone: string; taken_on: string; src: string };

const label = (p: ComparePhoto) => `${p.kind === "avant" ? "Avant" : "Après"} · ${fmtDate(p.taken_on)}`;

/** Comparateur côte à côte : une zone, deux photos à choisir */
export function PhotoCompare({ photos }: { photos: ComparePhoto[] }) {
  const zones = useMemo(() => [...new Set(photos.map((p) => p.zone))], [photos]);
  const bestZone = zones.find((z) => photos.some((p) => p.zone === z && p.kind === "avant") && photos.some((p) => p.zone === z && p.kind === "apres")) ?? zones[0] ?? "";
  const [zone, setZone] = useState(bestZone);
  const list = photos.filter((p) => p.zone === zone).sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  const firstBefore = list.find((p) => p.kind === "avant") ?? list[0];
  const lastAfter = [...list].reverse().find((p) => p.kind === "apres") ?? list[list.length - 1];
  const [leftId, setLeftId] = useState<string | undefined>(firstBefore?.id);
  const [rightId, setRightId] = useState<string | undefined>(lastAfter?.id);
  const left = list.find((p) => p.id === leftId) ?? firstBefore;
  const right = list.find((p) => p.id === rightId) ?? lastAfter;

  const changeZone = (z: string) => {
    setZone(z);
    setLeftId(undefined);
    setRightId(undefined);
  };

  const side = (p: ComparePhoto | undefined, value: string | undefined, set: (id: string) => void) => (
    <div className="min-w-0 space-y-2">
      <Select value={value ?? p?.id ?? ""} onChange={(e) => set(e.target.value)} className="h-9 text-[13px]">
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {label(x)}
          </option>
        ))}
      </Select>
      {p ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.src} alt={label(p)} className="aspect-[4/3] w-full rounded-lg border border-line bg-canvas object-cover" />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line text-[13px] text-muted">Aucune photo</div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {zones.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {zones.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => changeZone(z)}
              className={`h-8 rounded-md px-3 text-[13px] font-medium transition ${z === zone ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-ink"}`}
            >
              {z}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {side(left, left?.id, setLeftId)}
        {side(right, right?.id, setRightId)}
      </div>
    </div>
  );
}
