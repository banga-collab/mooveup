import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { publicDb } from "@/lib/access";
import { entity } from "@/lib/entities";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import { fmtDate, fmtTime, mad } from "@/lib/utils";
import type { OnlineBooking } from "@/lib/types-access";
import { Card, DescList, buttonClass } from "@/components/ui";

export const metadata = { title: "Réservation enregistrée", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ConfirmationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paiement?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const db = publicDb();
  const [{ data }, { data: settingsRow }] = await Promise.all([db.from("online_bookings").select("*").eq("id", id).maybeSingle(), db.from("settings").select("*").eq("id", 1).maybeSingle()]);
  const b = data as OnlineBooking | null;
  if (!b) notFound();
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((settingsRow as Partial<Settings> | null) ?? {}) };
  const e = entity(b.entity_id);
  const duration = b.duration_min >= 60 ? `${Math.floor(b.duration_min / 60)} h${b.duration_min % 60 ? ` ${b.duration_min % 60}` : ""}` : `${b.duration_min} min`;

  const depositLine: [string, string] | null =
    b.deposit_mad > 0
      ? [
          "Acompte",
          b.deposit_status === "paye"
            ? `${mad(b.deposit_mad)} · payé`
            : b.deposit_status === "accueil"
              ? `${mad(b.deposit_mad)} · à régler à l'accueil`
              : sp.paiement === "ok"
                ? `${mad(b.deposit_mad)} · paiement en cours de vérification`
                : `${mad(b.deposit_mad)} · non payé`,
        ]
      : null;

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="size-10 text-emerald-600" strokeWidth={1.75} />
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">{b.status === "annulee" ? "Réservation annulée" : "Réservation enregistrée"}</h1>
        <p className="mt-1 max-w-sm text-[13px] text-muted">
          Merci {b.full_name.split(" ")[0]} ! Notre équipe vous confirme le rendez-vous par téléphone ou WhatsApp au {b.phone}.
        </p>
      </div>

      {sp.paiement === "echec" && b.deposit_status === "a_payer" && (
        <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          Le paiement de l&apos;acompte n&apos;a pas abouti. Votre créneau est réservé : vous pourrez{" "}
          <Link href={`/reserver/paiement/${b.id}`} className="font-medium underline">
            réessayer
          </Link>{" "}
          ou régler à l&apos;accueil.
        </p>
      )}

      <Card className="mt-6 px-5 py-2">
        <DescList
          items={[
            ["Établissement", e?.name ?? b.entity_id],
            ["Prestation", b.service],
            ["Date", <span key="d" className="inline-block first-letter:uppercase">{fmtDate(b.starts_at, { weekday: "long", day: "numeric", month: "long" })}</span>],
            ["Heure", `${fmtTime(b.starts_at)} · ${duration}`],
            ["Prix", mad(b.price_mad)],
            ...(depositLine ? [depositLine] : []),
            ["Référence", <span key="r" className="font-mono">{b.ref}</span>],
            ["Adresse", settings.address],
          ]}
        />
      </Card>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <a href={`/reserver/ics/${b.id}`} className={buttonClass("brand", "h-11")}>
          <CalendarPlus /> Ajouter à mon agenda
        </a>
        <Link href={`/reserver?e=${b.entity_id}`} className={buttonClass("secondary", "h-11")}>
          Nouvelle réservation
        </Link>
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Un empêchement ? Prévenez-nous au{" "}
        <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="font-medium text-ink">
          {settings.phone}
        </a>
        .
      </p>
    </div>
  );
}
