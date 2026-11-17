import { LogIn, MessageCircle, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import type { ContactTabProps } from "./types";
import { createClient } from "@/lib/supabase/server";
import { ensureCard, evaluateAccess, loadAccessData, qrSvg, siteOrigin } from "@/lib/access";
import { fmtDate, fmtTime, waLink } from "@/lib/utils";
import type { Checkin, CheckinMethod } from "@/lib/types-access";
import { Badge, Card, CardHeader, Empty, LinkButton, buttonClass, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ConfirmButton } from "@/components/confirm-button";
import { MemberCardView } from "@/components/access/member-card";
import { regenerateCard } from "@/actions/access";

const METHOD_LABEL: Record<CheckinMethod, string> = { qr: "QR code", recherche: "Recherche", rdv: "Rendez-vous", manuel: "Manuel" };

/** Onglet « Carte d'accès » de la fiche client */
export async function ContactAccess({ contact, scope, me }: ContactTabProps) {
  const supabase = await createClient();
  const allowed = scope.allowed.map((e) => e.id);
  const ents = contact.entity_ids.filter((e) => allowed.includes(e));
  const [card, data, { data: rows }, origin] = await Promise.all([
    ensureCard(supabase, contact.id),
    loadAccessData(supabase, contact.id, ents.length ? ents : allowed),
    supabase.from("checkins").select("*").eq("contact_id", contact.id).in("entity_id", allowed).order("created_at", { ascending: false }).limit(20),
    siteOrigin(),
  ]);
  const verdicts = ents.map((e) => evaluateAccess(e, data));
  const checkins = (rows ?? []) as Checkin[];

  if (!card) {
    return (
      <Card>
        <Empty icon={<ShieldCheck />} title="Carte indisponible" text="La carte d'accès n'a pas pu être créée. Réessayez dans un instant." />
      </Card>
    );
  }

  const svg = await qrSvg(card.code);
  const first = contact.full_name.split(" ")[0];
  const publicUrl = `${origin}/reserver/carte/${card.code}`;
  const wa = waLink(contact.phone, `Bonjour ${first}, voici votre carte d'accès Moov'Up : ${publicUrl}\nCode : ${card.code}\nPrésentez ce QR code à l'accueil à chaque visite.`);
  const canRegen = me.role !== "staff";

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] [&>*]:min-w-0">
      <Card className="p-5">
        <MemberCardView name={contact.full_name} code={card.code} svg={svg} entityIds={contact.entity_ids} />
        <p className="mt-3 text-[13px] text-muted">
          À scanner à l&apos;accueil, ou à dicter : <span className="font-mono font-medium text-ink">{card.code}</span>
          {card.regenerated_at && <> · nouveau code du {fmtDate(card.regenerated_at)}</>}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href={`/acces/carte/${contact.id}`} target="_blank" variant="secondary">
            <Printer /> Imprimer la carte
          </LinkButton>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <MessageCircle /> Envoyer par WhatsApp
            </a>
          ) : (
            <span className={buttonClass("secondary", "pointer-events-none opacity-50")} title="Aucun téléphone sur la fiche">
              <MessageCircle /> Envoyer par WhatsApp
            </span>
          )}
        </div>
        {canRegen && (
          <form action={regenerateCard.bind(null, contact.id)} className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs text-muted">Carte perdue ou prêtée ? Un nouveau code désactive immédiatement l&apos;ancien QR.</p>
            <ConfirmButton message="Générer un nouveau code ? L'ancienne carte ne fonctionnera plus.">
              <RefreshCw /> Régénérer le code
            </ConfirmButton>
          </form>
        )}
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Statut d'accès" subtitle="Aujourd'hui, par établissement fréquenté" icon={<ShieldCheck />} />
          {verdicts.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {verdicts.map((v) => (
                <li key={v.entity_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                  <span className="w-32 shrink-0">
                    <EntityBadge id={v.entity_id} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{v.plan ?? "—"}</span>
                  {v.ok ? (
                    <Badge tone="green" dot>
                      {v.code === "ok_rdv"
                        ? "RDV aujourd'hui"
                        : v.code === "ok_pack" && v.sessionsLeft !== null
                          ? `${v.sessionsLeft} séance${v.sessionsLeft > 1 ? "s" : ""}`
                          : v.daysLeft !== null
                            ? `Actif · ${v.daysLeft} j`
                            : "Autorisé"}
                    </Badge>
                  ) : (
                    <Badge tone={v.code === "pas_rdv" || v.code === "aucun" ? "gray" : "red"} dot>
                      {v.reason}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-[13px] text-muted">Ce client n&apos;est rattaché à aucun de vos établissements.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Dernières entrées" subtitle={checkins.length ? `${checkins.length} plus récentes` : undefined} icon={<LogIn />} />
          {checkins.length ? (
            <div className="overflow-x-auto border-t border-line">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Établissement</th>
                    <th>Mode</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {checkins.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap">{fmtDate(c.created_at, { weekday: "short", day: "numeric", month: "short" })}</td>
                      <td className="tabular-nums">{fmtTime(c.created_at)}</td>
                      <td>
                        <EntityBadge id={c.entity_id} />
                      </td>
                      <td className="text-muted">{METHOD_LABEL[c.method] ?? c.method}</td>
                      <td className="whitespace-nowrap text-right">
                        {c.forced && (
                          <span title={c.force_reason ?? undefined}>
                            <Badge tone="amber">Forcée</Badge>
                          </span>
                        )}
                        {c.session_used && <Badge tone="brand">Séance</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line">
              <Empty
                icon={<LogIn />}
                title="Aucune entrée enregistrée"
                text="Les passages scannés à l'accueil s'afficheront ici."
                action={
                  <LinkButton href="/acces" variant="secondary">
                    Ouvrir l&apos;accueil
                  </LinkButton>
                }
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
