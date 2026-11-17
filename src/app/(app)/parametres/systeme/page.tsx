import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, CheckCircle2, CircleDashed, Database, HardDrive, KeyRound, ServerCog, XCircle } from "lucide-react";
import { requireDirection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtTime, relative } from "@/lib/utils";
import { BACKUP_BUCKET, KNOWN_TABLES, countTables, listStoredBackups, serviceDb } from "@/lib/backup";
import { Badge, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "État du système" };
export const dynamic = "force-dynamic";

/** ok : vert · ko : rouge · na : sans objet (démo) */
type Status = "ok" | "ko" | "na";
type Check = { label: string; status: Status; detail: ReactNode; fix?: ReactNode; optional?: boolean };
type Group = { title: string; subtitle: string; icon: ReactNode; checks: Check[] };

const env = (k: string) => (process.env[k] ?? "").trim();
const has = (k: string) => env(k).length > 0;
const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-ink">{children}</code>;
const VERCEL_ENV = (
  <>
    Vercel → votre projet → <b>Settings → Environment Variables</b>, puis <b>Redeploy</b>
  </>
);
const H = 3600_000;

function envCheck(key: string, label: string, opts: { optional?: boolean; why: string; where: ReactNode; valid?: (v: string) => string | null }): Check {
  const v = env(key);
  if (!v)
    return {
      label,
      status: "ko",
      optional: opts.optional,
      detail: (
        <>
          <Code>{key}</Code> absente · {opts.why}
        </>
      ),
      fix: (
        <>
          Récupérez la valeur ({opts.where}) et ajoutez-la : {VERCEL_ENV}.
        </>
      ),
    };
  const problem = opts.valid?.(v) ?? null;
  return {
    label,
    status: problem ? "ko" : "ok",
    optional: opts.optional,
    detail: problem ? (
      <>
        <Code>{key}</Code> présente mais {problem}
      </>
    ) : (
      <>
        <Code>{key}</Code> présente
      </>
    ),
    fix: problem ? <>Corrigez la valeur : {VERCEL_ENV}.</> : undefined,
  };
}

const httpsUrl = (v: string) => (/^https:\/\/[^\s/]+/.test(v) ? null : "elle doit commencer par https://");

export default async function SystemePage() {
  await requireDirection();
  const supabase = await createClient();
  const svc = await serviceDb();
  const db = svc ?? supabase;
  const settings = await getSettings();

  /* ---------- Base de données ---------- */
  const conn = await db.from("profiles").select("*", { count: "exact", head: true });
  const connected = !conn.error;
  const counts = connected ? await countTables(db, KNOWN_TABLES) : [];
  const missing = counts.filter((c) => c.missing).map((c) => c.table);
  const unreadable = counts.filter((c) => !c.missing && c.error);
  const { count: directionCount } = connected ? await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "direction") : { count: 0 };

  /* ---------- Stockage ---------- */
  const wantedBuckets: { id: string; public: boolean; why: string }[] = [
    { id: BACKUP_BUCKET, public: false, why: "sauvegardes automatiques" },
    { id: "care-photos", public: false, why: "photos avant/après (clinique, institut)" },
    { id: "justificatifs", public: true, why: "justificatifs de dépenses" },
  ];
  let buckets: { id: string; public: boolean }[] | null = null;
  let bucketError: string | null = null;
  if (!DEMO && svc) {
    const { data, error } = await svc.storage.listBuckets();
    if (error) bucketError = error.message;
    else buckets = (data ?? []).map((b) => ({ id: b.id, public: b.public }));
  }

  /* ---------- Dernière sauvegarde ---------- */
  let lastBackup: string | null = null;
  let lastBackupNote: string | null = null;
  if (!DEMO && svc) {
    try {
      const files = await listStoredBackups(svc);
      lastBackup = files[0]?.created_at ?? null;
      lastBackupNote = files.length ? `${files.length} fichier(s) conservé(s)` : null;
    } catch (e) {
      lastBackupNote = e instanceof Error ? e.message : "Stockage inaccessible";
    }
  }
  if (!lastBackup && connected) {
    const { data } = await db.from("audit_log").select("*").in("action", ["sauvegarde.auto", "sauvegarde.manuelle"]).order("created_at", { ascending: false }).limit(10);
    const ok = ((data ?? []) as { created_at: string; meta: { failed?: boolean; mode?: string } | null }[]).find((r) => !r.meta?.failed && (DEMO || r.meta?.mode === "storage"));
    lastBackup = ok?.created_at ?? null;
  }

  /* ---------- Dernier passage des rappels automatiques ---------- */
  let lastReminder: string | null = null;
  if (connected) {
    const { data } = await db.from("message_log").select("*").not("rule_key", "is", null).order("created_at", { ascending: false }).limit(50);
    const auto = ((data ?? []) as { created_at: string; author_id: string | null; rule_key: string | null }[]).find((m) => m.rule_key && !m.author_id);
    lastReminder = auto?.created_at ?? null;
  }
  const { count: activeRules } = connected ? await db.from("automation_rules").select("*", { count: "exact", head: true }).eq("enabled", true) : { count: null };

  /* ---------- Vérifications ---------- */
  const leaked = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SERVICE|SECRET|TOKEN|STORE_KEY|PASSWORD/i.test(k));
  const age = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
  const when = (iso: string) => `${relative(iso)} (${fmtDate(iso)} à ${fmtTime(iso)})`;

  const groups: Group[] = [
    {
      title: "Variables d'environnement",
      subtitle: "Seule leur présence est vérifiée : les valeurs ne sont jamais affichées",
      icon: <KeyRound />,
      checks: [
        {
          label: "Mode démo désactivé",
          status: DEMO ? "ko" : "ok",
          detail: DEMO ? (
            <>
              <Code>NEXT_PUBLIC_DEMO=1</Code> : l&apos;application tourne sur des données fictives en mémoire
            </>
          ) : (
            "L'application utilise la vraie base Supabase"
          ),
          fix: DEMO ? <>En production, supprimez la variable <Code>NEXT_PUBLIC_DEMO</Code> : {VERCEL_ENV}.</> : undefined,
        },
        envCheck("NEXT_PUBLIC_SUPABASE_URL", "Adresse Supabase", {
          why: "connexion à la base",
          where: "Supabase → Project Settings → API → Project URL",
          valid: (v) => httpsUrl(v) ?? (/supabase\.(co|in)/.test(v) ? null : "elle ne ressemble pas à une adresse Supabase (…supabase.co)"),
        }),
        envCheck("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Clé publique Supabase (anon)", { why: "connexion des utilisateurs", where: "Supabase → Project Settings → API → anon public" }),
        envCheck("SUPABASE_SERVICE_ROLE_KEY", "Clé service Supabase", {
          why: "réservation en ligne, avis, rappels et sauvegardes automatiques",
          where: "Supabase → Project Settings → API → service_role (secrète)",
        }),
        envCheck("CRON_SECRET", "Secret des tâches planifiées", {
          why: "protège /api/cron et /api/backup",
          where: "inventez une longue phrase aléatoire d'au moins 32 caractères",
          valid: (v) => (v.length >= 16 ? null : "elle est trop courte (16 caractères minimum, 32 conseillés)"),
        }),
        envCheck("NEXT_PUBLIC_SITE_URL", "Adresse publique du site", { why: "liens d'avis, de réservation et retour CMI", where: "ex. https://crm.moovup.ma", valid: httpsUrl }),
        {
          label: "Aucune clé secrète exposée au navigateur",
          status: leaked.length ? "ko" : "ok",
          detail: leaked.length ? (
            <>
              Variable(s) publique(s) suspecte(s) : {leaked.map((k) => <Code key={k}>{k}</Code>)}
            </>
          ) : (
            "Les variables NEXT_PUBLIC_ ne contiennent pas de clé secrète"
          ),
          fix: leaked.length ? <>Renommez-les sans le préfixe NEXT_PUBLIC_ (sinon elles sont visibles par tous), puis changez la clé concernée chez le fournisseur.</> : undefined,
        },
      ],
    },
    {
      title: "WhatsApp & paiement en ligne",
      subtitle: "Facultatif : sans eux, les messages partent par liens wa.me et l'acompte en ligne est désactivé",
      icon: <ServerCog />,
      checks: [
        envCheck("WHATSAPP_TOKEN", "WhatsApp : token permanent", { optional: true, why: "envoi automatique des messages", where: "Meta Business → Utilisateurs système → Générer un token" }),
        {
          label: "WhatsApp : identifiant du numéro",
          optional: true,
          status: settings.whatsapp_phone_id ? (settings.whatsapp_enabled ? "ok" : "ko") : "ko",
          detail: settings.whatsapp_phone_id ? (settings.whatsapp_enabled ? "Renseigné et activé" : "Renseigné mais l'envoi automatique est désactivé") : "Phone number ID non renseigné",
          fix: (
            <>
              <Link href="/parametres#whatsapp" className="font-medium text-brand-600 hover:underline">
                Paramètres → WhatsApp
              </Link>{" "}
              : collez le « Phone number ID » (Meta → WhatsApp → API Setup) et cochez l&apos;activation.
            </>
          ),
        },
        {
          label: "CMI : identifiant marchand",
          optional: true,
          status: has("CMI_CLIENT_ID") || settings.cmi_client_id ? "ok" : "ko",
          detail: has("CMI_CLIENT_ID") ? (
            <>
              <Code>CMI_CLIENT_ID</Code> présente
            </>
          ) : settings.cmi_client_id ? (
            "Renseigné dans les Paramètres"
          ) : (
            "Client ID absent"
          ),
          fix: <>Client ID fourni par le CMI à la signature du contrat : ajoutez <Code>CMI_CLIENT_ID</Code> ({VERCEL_ENV}) ou saisissez-le dans Paramètres → Paiement CMI.</>,
        },
        envCheck("CMI_STORE_KEY", "CMI : clé du magasin (Store Key)", { optional: true, why: "signature des paiements", where: "espace marchand CMI" }),
        envCheck("CMI_GATEWAY_URL", "CMI : adresse de la passerelle", { optional: true, why: "page de paiement", where: "fournie par le CMI (test puis production)", valid: httpsUrl }),
      ],
    },
    {
      title: "Base de données",
      subtitle: DEMO ? "Base de démonstration en mémoire" : "Supabase (PostgreSQL)",
      icon: <Database />,
      checks: [
        {
          label: "Connexion à la base",
          status: connected ? "ok" : "ko",
          detail: connected ? (DEMO ? "Base de démonstration disponible" : `Connecté${svc ? " avec la clé service" : " (sans clé service)"}`) : `Erreur : ${conn.error?.message ?? "inconnue"}`,
          fix: connected ? undefined : <>Vérifiez l&apos;adresse et les clés Supabase, et que le projet n&apos;est pas en pause (Supabase → Project → Restore).</>,
        },
        {
          label: "Tables présentes",
          status: !connected ? "ko" : missing.length || unreadable.length ? "ko" : "ok",
          detail: !connected
            ? "Non vérifiable sans connexion"
            : missing.length
              ? `${missing.length} table(s) absente(s) sur ${KNOWN_TABLES.length} : ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`
              : unreadable.length
                ? `${unreadable.length} table(s) illisible(s) : ${unreadable.map((c) => c.table).slice(0, 6).join(", ")}`
                : `${KNOWN_TABLES.length} tables sur ${KNOWN_TABLES.length}`,
          fix:
            missing.length || unreadable.length || !connected ? (
              <>
                Supabase → <b>SQL Editor</b> → collez tout <Code>supabase/000_tout.sql</Code> → <b>Run</b> (sans risque : il peut être relancé).
                {!svc && " Ajoutez aussi la clé service pour une vérification complète."}
              </>
            ) : undefined,
        },
        {
          label: "Compte Direction",
          status: (directionCount ?? 0) > 0 ? "ok" : "ko",
          detail: (directionCount ?? 0) > 0 ? `${directionCount} compte(s) Direction` : "Aucun compte Direction",
          fix: <>Créez le premier compte sur /signup : il devient automatiquement Direction.</>,
        },
      ],
    },
    {
      title: "Stockage des fichiers",
      subtitle: "Buckets Supabase Storage",
      icon: <HardDrive />,
      checks: wantedBuckets.map((w): Check => {
        if (DEMO) return { label: `Bucket « ${w.id} »`, status: "na", detail: `Non utilisé en démo · ${w.why}` };
        if (!svc) return { label: `Bucket « ${w.id} »`, status: "ko", detail: "Non vérifiable sans clé service", fix: <>Ajoutez <Code>SUPABASE_SERVICE_ROLE_KEY</Code>.</> };
        if (bucketError) return { label: `Bucket « ${w.id} »`, status: "ko", detail: `Stockage inaccessible : ${bucketError}` };
        const b = buckets?.find((x) => x.id === w.id);
        if (!b)
          return {
            label: `Bucket « ${w.id} »`,
            status: "ko",
            detail: `Absent · ${w.why}`,
            fix:
              w.id === BACKUP_BUCKET ? (
                <>Ré-exécutez <Code>000_tout.sql</Code> (ou il sera créé à la première sauvegarde).</>
              ) : (
                <>Ré-exécutez <Code>000_tout.sql</Code>, ou Supabase → Storage → New bucket « {w.id} » ({w.public ? "public" : "privé"}).</>
              ),
          };
        const wrong = b.public !== w.public;
        return {
          label: `Bucket « ${w.id} »`,
          status: wrong ? "ko" : "ok",
          detail: wrong ? `Présent mais ${b.public ? "PUBLIC" : "privé"} (attendu : ${w.public ? "public" : "privé"})` : `Présent, ${w.public ? "public" : "privé"} · ${w.why}`,
          fix: wrong ? <>Supabase → Storage → « {w.id} » → Edit bucket → {w.public ? "cochez" : "décochez"} « Public bucket ».</> : undefined,
        };
      }),
    },
    {
      title: "Tâches automatiques",
      subtitle: "Planifiées par Vercel Cron (vercel.json)",
      icon: <Activity />,
      checks: [
        {
          label: "Dernière sauvegarde",
          status: age(lastBackup) < 36 * H ? "ok" : "ko",
          detail: lastBackup ? `${when(lastBackup)}${lastBackupNote ? ` · ${lastBackupNote}` : ""}` : lastBackupNote ? `Aucune · ${lastBackupNote}` : "Aucune sauvegarde automatique pour l'instant",
          fix: (
            <>
              Vérifiez <Code>CRON_SECRET</Code> et la clé service, puis Vercel → <b>Settings → Cron Jobs</b> (<Code>/api/backup</Code> chaque nuit). Test immédiat :{" "}
              <Link href="/parametres/sauvegarde" className="font-medium text-brand-600 hover:underline">
                Sauvegarde → Sauvegarder dans le stockage
              </Link>
              .
            </>
          ),
        },
        {
          label: "Rappels WhatsApp automatiques",
          status: activeRules === 0 ? "na" : age(lastReminder) < 48 * H ? "ok" : "ko",
          detail:
            activeRules === 0
              ? "Aucune règle de rappel activée"
              : lastReminder
                ? `Dernier rappel automatique ${when(lastReminder)}`
                : "Aucun rappel automatique enregistré",
          fix: (
            <>
              <Code>/api/cron</Code> doit être appelé toutes les heures (Vercel Cron, offre Pro ; sinon un planificateur gratuit comme cron-job.org avec{" "}
              <Code>?secret=…</Code>). Sans client à relancer, aucun message ne part : c&apos;est normal.
            </>
          ),
        },
      ],
    },
  ];

  const all = groups.flatMap((g) => g.checks);
  const required = all.filter((c) => !c.optional && c.status !== "na");
  const requiredOk = required.filter((c) => c.status === "ok").length;
  const optional = all.filter((c) => c.optional);
  const optionalOk = optional.filter((c) => c.status === "ok").length;
  const ready = requiredOk === required.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="État du système"
        subtitle="Ce qu'il faut pour la mise en ligne, vérifié en direct"
        actions={
          <Link href="/parametres/systeme" className={buttonClass("secondary")} prefetch={false}>
            Revérifier
          </Link>
        }
      />

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className={ready ? "text-emerald-600" : "text-red-600"}>{ready ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{ready ? "Prêt pour la mise en ligne" : `${required.length - requiredOk} point(s) indispensable(s) à régler`}</p>
          <p className="text-[13px] text-muted">
            Indispensables : <span className="font-semibold tabular-nums text-ink">{requiredOk} / {required.length}</span> · Facultatifs (WhatsApp, CMI) :{" "}
            <span className="font-semibold tabular-nums text-ink">
              {optionalOk} / {optional.length}
            </span>{" "}
            · Guide pas à pas : <Code>docs/MISE-EN-LIGNE.md</Code>
          </p>
        </div>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} subtitle={g.subtitle} icon={g.icon} />
            <ul className="divide-y divide-line border-t border-line">
              {g.checks.map((c) => (
                <li key={c.label} className="flex gap-3 px-5 py-3">
                  <span className="mt-0.5 shrink-0">
                    {c.status === "ok" ? (
                      <CheckCircle2 className="size-4 text-emerald-600" aria-label="OK" />
                    ) : c.status === "na" ? (
                      <CircleDashed className="size-4 text-slate-400" aria-label="Sans objet" />
                    ) : (
                      <XCircle className="size-4 text-red-600" aria-label="À régler" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-ink">{c.label}</p>
                      {c.optional && <Badge tone="gray">Facultatif</Badge>}
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted">{c.detail}</p>
                    {c.status === "ko" && c.fix && <p className="mt-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">À faire : {c.fix}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
