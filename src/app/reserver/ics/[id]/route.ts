import { NextResponse } from "next/server";
import { publicDb } from "@/lib/access";
import { entity } from "@/lib/entities";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";
import type { OnlineBooking } from "@/lib/types-access";

/** Date ISO → format iCalendar UTC (20261117T143000Z) */
const ics = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Échappement des textes iCalendar */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fichier .ics du rendez-vous (« Ajouter à mon agenda ») */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  const db = publicDb();
  const [{ data }, { data: s }] = await Promise.all([db.from("online_bookings").select("*").eq("id", id).maybeSingle(), db.from("settings").select("*").eq("id", 1).maybeSingle()]);
  const b = data as OnlineBooking | null;
  if (!b) return new NextResponse("Introuvable", { status: 404 });
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((s as Partial<Settings> | null) ?? {}) };
  const start = new Date(b.starts_at);
  const end = new Date(start.getTime() + b.duration_min * 60_000);
  const place = entity(b.entity_id)?.name ?? "Moov'Up";

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moov'Up//Reservation//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@moovup.ma`,
    `DTSTAMP:${ics(new Date())}`,
    `DTSTART:${ics(start)}`,
    `DTEND:${ics(end)}`,
    `SUMMARY:${esc(`${b.service} · ${place}`)}`,
    `LOCATION:${esc(`${place}, ${settings.address}`)}`,
    `DESCRIPTION:${esc(`Réservation ${b.ref}. En cas d'empêchement, appelez le ${settings.phone}.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rappel de rendez-vous",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="moovup-${b.ref}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
