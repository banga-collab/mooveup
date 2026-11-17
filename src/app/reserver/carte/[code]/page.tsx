import { notFound } from "next/navigation";
import { publicDb, qrSvg } from "@/lib/access";
import type { Contact } from "@/lib/types";
import type { MemberCard } from "@/lib/types-access";
import { parseCode } from "@/components/access/code";
import { entity } from "@/lib/entities";

const entityNames = (ids: string[]) =>
  ids
    .map((e) => entity(e)?.short)
    .filter(Boolean)
    .join(" · ");

export const metadata = { title: "Ma carte d'accès", robots: { index: false } };

/** Carte du membre à présenter sur son téléphone (lien envoyé par WhatsApp) */
export default async function PublicCardPage({ params }: { params: Promise<{ code: string }> }) {
  const code = parseCode(decodeURIComponent((await params).code));
  if (!code) notFound();
  const db = publicDb();
  const { data: card } = await db.from("member_cards").select("*").eq("code", code).maybeSingle();
  if (!card) notFound();
  const { data } = await db.from("contacts").select("id, full_name, entity_ids").eq("id", (card as MemberCard).contact_id).maybeSingle();
  const contact = data as Pick<Contact, "id" | "full_name" | "entity_ids"> | null;
  if (!contact) notFound();
  // Prénom + initiale du nom seulement (lien partageable)
  const [first, ...rest] = contact.full_name.split(" ");
  const name = rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : first!;
  const svg = await qrSvg(code);

  return (
    <div className="flex flex-col items-center">
      <h1 className="text-xl font-semibold text-ink">Ma carte d&apos;accès</h1>
      <p className="mt-1 text-center text-[13px] text-muted">Présentez ce QR code à l&apos;accueil. Montez la luminosité de l&apos;écran.</p>
      <div className="mt-6 w-full max-w-xs rounded-xl border border-line bg-white p-6">
        <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 text-center font-mono text-lg font-semibold tracking-wider text-ink">{code}</p>
        <p className="mt-1 text-center text-sm text-muted">{name}</p>
      </div>
      <p className="mt-6 text-center text-xs text-muted">{entityNames(contact.entity_ids)}</p>
    </div>
  );
}
