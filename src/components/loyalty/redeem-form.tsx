"use client";

import { useState } from "react";
import { Ticket } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select } from "@/components/ui";
import { redeemPoints } from "@/actions/loyalty";

/** « Utiliser des points » : crée un bon de réduction à déduire en caisse */
export function RedeemForm({
  contactId,
  balance,
  pointValue,
  entities,
  defaultEntity,
}: {
  contactId: string;
  balance: number;
  pointValue: number;
  entities: { id: string; short: string }[];
  defaultEntity: string;
}) {
  const [points, setPoints] = useState("");
  const n = Math.max(0, Math.round(Number(points.replace(",", ".")) || 0));
  const value = Math.round(n * pointValue * 100) / 100;
  const quick = [100, 200, 500, 1000].filter((q) => q <= balance);
  const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

  return (
    <ActionForm action={redeemPoints} className="space-y-4">
      <input type="hidden" name="contact_id" value={contactId} />
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Points à utiliser" hint={n > balance ? `Maximum ${fmt.format(balance)} points` : n ? `Bon de ${fmt.format(value)} MAD` : `1 point = ${fmt.format(pointValue)} MAD`}>
          <Input name="points" inputMode="numeric" required value={points} onChange={(e) => setPoints(e.target.value)} placeholder="200" className="tabular-nums" />
        </Field>
        <Field label="Utilisé chez">
          <Select name="entity_id" defaultValue={defaultEntity}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.short}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {quick.map((q) => (
          <button key={q} type="button" onClick={() => setPoints(String(q))} className="rounded-md border border-line px-2 py-1 text-xs font-medium tabular-nums text-slate-600 hover:border-slate-300 hover:text-ink">
            {fmt.format(q)}
          </button>
        ))}
        {balance > 0 && (
          <button type="button" onClick={() => setPoints(String(balance))} className="rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-ink">
            Tout
          </button>
        )}
        <span className="flex-1" />
        <SubmitButton variant="brand" pendingText="Création…">
          <Ticket className="size-4" /> Créer le bon
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
