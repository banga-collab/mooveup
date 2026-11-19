import { CalendarCheck, CreditCard, Gift, LogIn, NotebookPen, ReceiptText, Target } from "lucide-react";
import type { ReactNode } from "react";
import { APPT_STATUS_LABEL, CONTACT_STATUS_LABEL, SALE_STATUS_LABEL, STAGE_LABEL, SUB_STATUS_LABEL, age, cn, fmtDate, fmtTime, mad } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ContactLink } from "@/components/quick-view/contact-link";
import type { ClientReport } from "./load";
import { sessionsLeft } from "./doc";

const SHOW = 8;
const d2 = (iso: string) => fmtDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" }) {
  return (
    <div className="min-w-0 rounded-lg border border-line p-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone === "bad" ? "text-red-600" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Block({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="flex items-center gap-2 text-[13px] font-semibold text-ink [&_svg]:size-4 [&_svg]:text-slate-400">
        {icon}
        {title}
        {sub && <span className="font-normal text-muted">· {sub}</span>}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const none = (t: string) => <p className="text-[13px] text-muted">{t}</p>;
const more = (n: number) => (n > SHOW ? <p className="mt-1.5 text-xs text-muted">+ {n - SHOW} autre{n - SHOW > 1 ? "s" : ""} dans l&apos;export PDF / Excel</p> : null);

const SALE_TONE = { payee: "green", partielle: "amber", impayee: "red", remboursee: "gray" } as const;
const APPT_TONE = { prevu: "gray", confirme: "brand", arrive: "green", termine: "green", absent: "red", annule: "gray" } as const;
const SUB_TONE = { actif: "green", suspendu: "amber", expire: "gray", resilie: "gray" } as const;

/** Rapport d'un client (affichage écran) */
export function ClientCard({ r, open, href }: { r: ClientReport; open: boolean; href: string }) {
  const c = r.contact;
  const a = age(c.birth_date);
  const left = sessionsLeft(r);
  const purchases = r.purchases.filter((x) => x.status !== "remboursee").length;
  const notes = [...(c.notes ? [{ date: null as string | null, body: c.notes }] : []), ...r.notes];
  return (
    <details open={open} id={`client-${c.id}`} className="group scroll-mt-20 rounded-xl border border-line bg-white [&[open]>summary]:border-b [&[open]>summary]:border-line">
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ContactLink id={c.id} name={c.full_name} className="font-semibold" />
            <Badge tone={c.status === "client" ? "green" : "gray"}>{CONTACT_STATUS_LABEL[c.status]}</Badge>
            {(c.entity_ids ?? []).slice(0, 3).map((e) => (
              <EntityBadge key={e} id={e} />
            ))}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[c.phone, c.email, a !== null ? `${a} ans` : null, `client depuis ${fmtDate(c.created_at, { month: "short", year: "numeric" })}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums text-ink">{mad(r.revenue)}</p>
            <p className="text-xs text-muted">
              {r.visits} entrée{r.visits > 1 ? "s" : ""} · {purchases} achat{purchases > 1 ? "s" : ""}
            </p>
          </div>
          <a href={href} className="hidden rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 sm:inline" title="Ouvrir le rapport de ce client seul">
            Rapport seul
          </a>
        </div>
      </summary>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 [&>*]:min-w-0">
          <Stat label="Dépensé sur la période" value={mad(r.revenue)} sub={`${purchases} achat${purchases > 1 ? "s" : ""}`} />
          <Stat label="Entrées" value={r.visits} sub={r.lastVisit ? `dernière le ${d2(r.lastVisit)}` : "aucune sur la période"} />
          <Stat label="RDV honorés" value={r.appts.honored} sub={`${r.appts.absent} absence${r.appts.absent > 1 ? "s" : ""}${r.appts.upcoming ? ` · ${r.appts.upcoming} à venir` : ""}`} />
          <Stat label="Reste dû" value={mad(r.due)} tone={r.due > 0 ? "bad" : undefined} sub={`${r.loyalty.balance} points fidélité`} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <Block icon={<CreditCard />} title="Abonnements et séances" sub={left ? `${left} séance${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}` : undefined}>
            {r.subs.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {r.subs.slice(0, SHOW).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{s.name}</p>
                      <p className="text-xs text-muted">
                        <EntityBadge id={s.entity_id} /> · {d2(`${s.start_date}T12:00:00Z`)} → {d2(`${s.end_date}T12:00:00Z`)}
                        {s.sessions_left !== null ? ` · ${s.sessions_left} séance${s.sessions_left > 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    <Badge tone={SUB_TONE[s.status]}>{SUB_STATUS_LABEL[s.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              none("Aucun abonnement sur la période")
            )}
            {more(r.subs.length)}
          </Block>

          <Block icon={<CalendarCheck />} title="Rendez-vous" sub={r.appts.total ? `${r.appts.total} au total` : undefined}>
            {r.appts.total ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {r.appts.list
                  .slice(-SHOW)
                  .reverse()
                  .map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{x.service}</p>
                        <p className="text-xs text-muted">
                          {d2(x.starts_at)} à {fmtTime(x.starts_at)} · <EntityBadge id={x.entity_id} />
                        </p>
                      </div>
                      <Badge tone={APPT_TONE[x.status]}>{APPT_STATUS_LABEL[x.status]}</Badge>
                    </li>
                  ))}
              </ul>
            ) : (
              none("Aucun rendez-vous sur la période")
            )}
            {more(r.appts.total)}
          </Block>

          <Block icon={<ReceiptText />} title="Achats" sub={r.purchases.length ? mad(r.revenue) : undefined}>
            {r.purchases.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {r.purchases.slice(0, SHOW).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{x.items || x.number}</p>
                      <p className="text-xs text-muted">
                        {d2(x.date)} · {x.number} · <EntityBadge id={x.entity} />
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-ink">{mad(x.total)}</p>
                      {x.status !== "payee" && <Badge tone={SALE_TONE[x.status]}>{SALE_STATUS_LABEL[x.status]}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              none("Aucun achat sur la période")
            )}
            {more(r.purchases.length)}
          </Block>

          <div className="space-y-5">
            <Block icon={<LogIn />} title="Entrées par établissement">
              {r.visitsByEntity.length ? (
                <p className="text-[13px] text-slate-700">{r.visitsByEntity.map((v) => `${v.entity} : ${v.count}`).join(" · ")}</p>
              ) : (
                none("Aucune entrée enregistrée sur la période")
              )}
            </Block>
            <Block icon={<Gift />} title="Fidélité">
              <p className="text-[13px] text-slate-700">
                Solde <span className="font-semibold tabular-nums text-ink">{r.loyalty.balance} points</span>
                {r.loyalty.earned ? ` · +${r.loyalty.earned} gagnés sur la période` : ""}
              </p>
            </Block>
            {r.leads.length > 0 && (
              <Block icon={<Target />} title="Prospects">
                <ul className="space-y-1 text-[13px]">
                  {r.leads.slice(0, SHOW).map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{l.interest}</span>
                      <Badge tone={l.stage === "gagne" ? "green" : l.stage === "perdu" ? "gray" : "brand"}>{STAGE_LABEL[l.stage]}</Badge>
                      <EntityBadge id={l.entity_id} />
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            {notes.length > 0 && (
              <Block icon={<NotebookPen />} title="Notes clés">
                <ul className="space-y-1.5 text-[13px] text-slate-700">
                  {notes.slice(0, 5).map((n, i) => (
                    <li key={i}>
                      {n.date && <span className="text-xs text-muted">{d2(n.date)} · </span>}
                      {n.body}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
