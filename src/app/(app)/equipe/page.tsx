import Link from "next/link";
import { BadgeCheck, ConciergeBell, Crown, Info, Mail, Phone, ShieldCheck, UserPlus, Users } from "lucide-react";
import { allowedEntities, getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ENTITIES } from "@/lib/entities";
import type { Profile, Role } from "@/lib/types";
import { ROLE_LABEL, cn } from "@/lib/utils";
import { updateMember } from "@/actions/team";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { MemberEditor } from "@/components/team/member-editor";

export const metadata = { title: "Équipe" };

const ROLE_ORDER: Role[] = ["direction", "manager", "reception", "staff"];
const ROLE_META: Record<Role, { title: string; hint: string; color: string }> = {
  direction: { title: "Direction", hint: "Accès à tout le groupe", color: "#1a6d8e" },
  manager: { title: "Managers", hint: "Pilotent leurs établissements", color: "#e8782a" },
  reception: { title: "Réception", hint: "Accueil, caisse et rendez-vous", color: "#7c4dcc" },
  staff: { title: "Équipe", hint: "Coachs, praticiens, esthéticiennes…", color: "#059669" },
};

export default async function TeamPage() {
  const me = await requireManager();
  const scope = await getScope();
  const isDirection = me.role === "direction";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  const mine = allowedEntities(me);
  const members = ((data ?? []) as Profile[]).filter((p) => isDirection || !p.entity_ids.length || p.entity_ids.some((e) => mine.includes(e)));
  const active = members.filter((p) => p.active);
  const entities = ENTITIES.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }));

  const count = (r: Role) => active.filter((p) => p.role === r).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Équipe" subtitle={isDirection ? "Rôles et établissements de chaque membre" : `Les membres de vos établissements · ${scope.allowed.map((e) => e.short).join(", ")}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" label="Membres actifs" value={active.length} sub={`${members.length - active.length} compte(s) désactivé(s)`} icon={<Users />} watermark={<Users />} />
        <SolidTile tone="accent" label="Managers" value={count("manager")} sub={`${count("direction")} à la direction`} icon={<Crown />} watermark={<Crown />} />
        <SolidTile tone="violet" label="Réception" value={count("reception")} sub="Accueil et caisse" icon={<ConciergeBell />} watermark={<ConciergeBell />} />
        <SolidTile tone="green" label="Équipe terrain" value={count("staff")} sub="Coachs et praticiens" icon={<BadgeCheck />} watermark={<BadgeCheck />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="space-y-6">
          {ROLE_ORDER.map((r) => {
            const list = members.filter((p) => p.role === r);
            if (!list.length) return null;
            const meta = ROLE_META[r];
            return (
              <section key={r} className="animate-fade-up">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: meta.color }}>
                    <ShieldCheck className="size-4" />
                  </span>
                  <h2 className="font-display text-lg font-extrabold">{meta.title}</h2>
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${meta.color}18`, color: meta.color }}>
                    {list.length}
                  </span>
                  <span className="hidden text-xs text-muted sm:inline">· {meta.hint}</span>
                </div>
                <Card className="divide-y divide-line overflow-hidden">
                  {list.map((p) => {
                    const self = p.id === me.id;
                    return (
                      <div key={p.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5", !p.active && "bg-canvas/60")}>
                        <span className={cn("relative", !p.active && "opacity-50 grayscale")}>
                          <Avatar name={p.full_name || p.email} size={44} />
                          <span className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-white", p.active ? "bg-emerald-500" : "bg-slate-300")} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold text-ink">{p.full_name || p.email}</span>
                            {self && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600">Vous</span>}
                            {!p.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Désactivé</span>}
                          </p>
                          <p className="truncate text-sm text-slate-600">{p.job_title ?? ROLE_LABEL[p.role]}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            {p.phone && (
                              <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                                <Phone className="size-3.5" /> {p.phone}
                              </a>
                            )}
                            <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-brand-600">
                              <Mail className="size-3.5 shrink-0" /> <span className="truncate">{p.email}</span>
                            </a>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {p.entity_ids.length ? <EntityDots ids={p.entity_ids} /> : <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-600">Tous les établissements</span>}
                        </div>
                        {isDirection && (
                          <div className="flex w-full flex-wrap justify-end sm:w-auto [&:has(form)]:w-full">
                            <MemberEditor
                              action={updateMember.bind(null, p.id)}
                              entities={entities}
                              member={{ role: p.role, entity_ids: p.entity_ids, job_title: p.job_title, phone: p.phone, active: p.active }}
                              self={self}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent-600 via-accent-500 to-accent-400 p-5 text-white shadow-xl shadow-accent-600/25 xl:sticky xl:top-6">
            <UserPlus className="pointer-events-none absolute -bottom-6 -right-6 size-32 text-white/15" />
            <span className="grid size-11 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30">
              <UserPlus className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-lg font-extrabold">Ajouter un membre</h2>
            <ol className="relative mt-3 space-y-2.5 text-sm text-white/95">
              {[
                <>
                  Le nouveau membre crée son compte sur la page{" "}
                  <Link href="/signup" className="font-bold underline underline-offset-2">
                    Inscription
                  </Link>{" "}
                  avec son adresse e-mail.
                </>,
                <>Il apparaît ici dans « Équipe », sans accès particulier.</>,
                <>La direction clique sur « Modifier » pour lui donner un rôle et ses établissements.</>,
              ].map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/25 font-display text-xs font-extrabold">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <Card className="p-4">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-500" />
              {isDirection
                ? "Un compte désactivé ne peut plus se connecter mais son historique (ventes, rendez-vous, notes) est conservé."
                : "Seule la direction peut modifier les rôles et les établissements attribués."}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
