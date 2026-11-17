"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui";
import { saveRuleMessage } from "@/actions/automations";
import { SAMPLE_VARS, VAR_LABEL, renderTemplate } from "./defs";
import { WhatsAppBubble } from "./bubble";

/** Éditeur du texte d'une règle, avec variables et aperçu WhatsApp */
export function RuleEditor({ ruleKey, message, defaultMessage, vars }: { ruleKey: string; message: string; defaultMessage: string; vars: string[] }) {
  const [text, setText] = useState(message);
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (v: string) => {
    const el = ref.current;
    const token = `{${v}}`;
    if (!el) return setText((t) => t + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <ActionForm action={saveRuleMessage} className="grid gap-5 md:grid-cols-[1fr_300px] [&>*]:min-w-0">
      <input type="hidden" name="key" value={ruleKey} />
      <div className="space-y-3">
        <Textarea ref={ref} name="message" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={900} required />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Insérer :</span>
          {vars.map((v) => (
            <button key={v} type="button" onClick={() => insert(v)} className="rounded-md border border-line bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-ink">
              {VAR_LABEL[v] ?? v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton variant="brand">Enregistrer le message</SubmitButton>
          {text !== defaultMessage && (
            <button type="button" onClick={() => setText(defaultMessage)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-100 hover:text-ink">
              <RotateCcw className="size-4" /> Texte d&apos;origine
            </button>
          )}
          <span className="ml-auto text-xs tabular-nums text-muted">{text.length} / 900</span>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-muted">Aperçu</p>
        <WhatsAppBubble text={renderTemplate(text, SAMPLE_VARS)} />
      </div>
    </ActionForm>
  );
}
