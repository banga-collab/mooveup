"use client";

import { useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ScanLine, UserPlus, Volume2, VolumeX } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Avatar, Button, ErrorNote, Input, Kbd, LinkButton } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { useDesk } from "./use-desk";
import { useSound } from "./sound";
import { VerdictView } from "./verdict";
import { OfflineBadge } from "./offline-badge";
import { CameraScanner } from "./camera";

export function AccessDesk({ desk, deskLabel }: { desk: string; deskLabel: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { result, pending, lookup, checkin, force, offline } = useDesk(desk);
  const [sound, toggleSound] = useSound();

  const refocus = () => requestAnimationFrame(() => input.current?.focus());
  const go = (value: string, scan = false) => {
    lookup(value, scan);
    setQ("");
    refocus();
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <ScanLine className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <Input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("acces.placeholder")}
            className="h-14 rounded-xl pl-12 pr-24 text-base sm:text-lg"
            aria-label={t("acces.placeholder")}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 sm:block">
            {pending ? <Loader2 className="size-4 animate-spin text-slate-400" /> : <Kbd>{t("acces.enter_key")}</Kbd>}
          </span>
        </div>
        <Button type="button" variant={camera ? "brand" : "secondary"} className="h-14 rounded-xl px-4" onClick={() => setCamera((v) => !v)} aria-label={t("acces.camera")}>
          {camera ? <CameraOff /> : <Camera />}
          <span className="hidden sm:inline">{t("acces.camera")}</span>
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OfflineBadge state={offline} />
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={sound}
          className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-slate-500 transition hover:bg-slate-100 hover:text-ink"
        >
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} {sound ? t("acces.sound_on") : t("acces.sound_off")}
        </button>
      </div>

      {camera && (
        <CameraScanner
          onCode={(code) => {
            setCamera(false);
            go(code, true);
          }}
          onClose={() => setCamera(false)}
        />
      )}

      <div aria-live="polite">
        {!result && <Idle deskLabel={deskLabel} />}
        {result?.kind === "error" && <ErrorNote message={result.message} />}
        {result?.kind === "none" && (
          <div className="rounded-xl border border-line bg-white p-6 text-center">
            <p className="text-base font-semibold text-ink">{t("acces.none")}</p>
            <p className="mt-1 text-[13px] text-muted">{t("acces.none_text", { q: result.query })}</p>
            <LinkButton href="/contacts/nouveau" variant="secondary" className="mt-4">
              <UserPlus /> {t("acces.new_client")}
            </LinkButton>
          </div>
        )}
        {result?.kind === "choices" && (
          <div className="rounded-xl border border-line bg-white">
            <p className="px-5 pb-2 pt-4 text-sm font-semibold text-ink">{t("acces.choices")}</p>
            <ul className="divide-y divide-line">
              {result.hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      checkin(h.id);
                      refocus();
                    }}
                    className="flex w-full items-center gap-3 px-5 py-3 text-start transition hover:bg-slate-50"
                  >
                    <Avatar name={h.full_name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{h.full_name}</span>
                      <span className="block text-xs tabular-nums text-muted">{h.phone ?? t("acces.no_phone")}</span>
                    </span>
                    <EntityDots ids={h.entity_ids} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result?.kind === "result" && <VerdictView key={result.v.at} v={result.v} forcing={pending} onForce={(reason) => force(result.v.contact.id, result.v.entity_id, reason)} />}
      </div>
    </div>
  );
}

function Idle({ deskLabel }: { deskLabel: string }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <ScanLine className="mx-auto size-6 text-slate-300" />
      <p className="mt-3 text-sm font-medium text-ink">{t("acces.ready", { desk: deskLabel })}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{t("acces.ready_text")}</p>
    </div>
  );
}
