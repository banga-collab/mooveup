"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Kbd } from "@/components/ui";
import { SHORTCUTS, isTyping, keyOf, type Shortcut } from "./shortcuts";
import { setFlag } from "./prefs";
import { startNavProgress } from "./nav-progress";

/** Écouteur global des raccourcis clavier + fenêtre d'aide (« ? ») */
export function ShortcutsListener() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    const run = (s: Shortcut) => {
      if (s.event) window.dispatchEvent(new Event(s.event));
      else if (s.href) {
        if (s.href.split("#")[0] !== window.location.pathname) startNavProgress();
        router.push(s.href);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const k = keyOf(e);
      const prev = pending.current && Date.now() - pending.current.at < 1200 ? pending.current.key : null;
      pending.current = null;
      if (prev) {
        const seq = SHORTCUTS.find((s) => s.keys.length === 2 && s.keys[0] === prev && s.keys[1] === k);
        if (seq) {
          e.preventDefault();
          run(seq);
          return;
        }
      }
      if (SHORTCUTS.some((s) => s.keys.length === 2 && s.keys[0] === k)) {
        pending.current = { key: k, at: Date.now() };
        return;
      }
      const one = SHORTCUTS.find((s) => s.keys.length === 1 && s.keys[0] === k);
      if (one) {
        e.preventDefault();
        run(one);
      }
    };
    const open = () => {
      setHelp(true);
      setFlag("raccourcis");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-shortcuts", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-shortcuts", open);
    };
  }, [router]);

  return help ? <ShortcutsDialog onClose={() => setHelp(false)} /> : null;
}

/** Liste des raccourcis (fenêtre « ? » et page /aide) */
export function ShortcutsList() {
  const t = useT();
  const groups: Shortcut["group"][] = ["general", "actions", "navigation"];
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-1.5 text-xs font-medium text-muted">{t(`sc.group.${g}`)}</h3>
          <ul className="divide-y divide-line">
            {SHORTCUTS.filter((s) => s.group === g).map((s) => (
              <li key={s.id} className="flex min-h-10 items-center justify-between gap-3 py-1.5 text-[13px] text-ink">
                <span>{t(s.labelKey)}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted" dir="ltr">
                  {(s.display ?? s.keys).map((k, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span>{s.display ? "+" : t("sc.then")}</span>}
                      <Kbd>{k.length === 1 ? k.toUpperCase() : k}</Kbd>
                    </Fragment>
                  ))}
                  {s.id === "search" && (
                    <>
                      <span className="px-0.5">{t("sc.or")}</span>
                      <Kbd>/</Kbd>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted">{t("sc.note")}</p>
    </div>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const path = usePathname();
  const first = useRef(path);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => {
    if (path !== first.current) onClose();
  }, [path, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/20 px-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-title"
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-white p-5 shadow-pop animate-fade-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="size-4 text-slate-400" aria-hidden />
          <h2 id="sc-title" className="flex-1 text-sm font-semibold text-ink">
            {t("sc.title")}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="grid size-9 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label={t("common.close")}>
            <X className="size-4" />
          </button>
        </div>
        <ShortcutsList />
      </div>
    </div>
  );
}
