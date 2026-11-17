/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import { CONSENT_TEMPLATES, consentFor, guessKind, isoDay, type ConsentTemplate, type TreatmentKind } from "../types-care";
import { addDaysKey, dayKey } from "../utils";

type Row = Record<string, any>;

/** Signature manuscrite factice (SVG en data URL) */
function signatureSvg(seed: number) {
  const pts: string[] = [];
  let x = 20;
  for (let i = 0; i < 9; i++) {
    const y = 60 + Math.sin(seed + i * 1.7) * 28;
    pts.push(i ? `Q${x},${y.toFixed(0)} ${x + 14},${(60 + 30 * Math.cos(seed * i)).toFixed(0)}` : `M${x},${y.toFixed(0)}`);
    x += 30;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><path d="${pts.join(" ")}" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 98 L${180 + (seed % 60)} 92" stroke="#111827" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Photo de démonstration sobre (visage stylisé, taches plus nombreuses « avant ») */
function photoSvg(kind: "avant" | "apres", zone: string, date: string, seed: number) {
  const spots = kind === "avant" ? 16 : 4;
  let s = seed;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const dots = Array.from({ length: spots }, () => {
    const x = 240 + r() * 120;
    const y = 160 + r() * 150;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2 + r() * 4).toFixed(1)}" fill="#b07a5a" opacity="${kind === "avant" ? 0.55 : 0.3}"/>`;
  }).join("");
  const skin = kind === "avant" ? "#e9c3a6" : "#efcfb6";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><rect width="600" height="450" fill="#f1f5f9"/><ellipse cx="300" cy="230" rx="110" ry="145" fill="${skin}"/><ellipse cx="300" cy="105" rx="120" ry="55" fill="#5b4636"/>${dots}<ellipse cx="262" cy="210" rx="12" ry="6" fill="#3f3f46"/><ellipse cx="338" cy="210" rx="12" ry="6" fill="#3f3f46"/><path d="M272 300 Q300 318 328 300" stroke="#a0574a" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="0" y="404" width="600" height="46" fill="#ffffff" opacity="0.9"/><text x="20" y="433" font-family="Inter,Arial" font-size="18" fill="#111827" font-weight="600">${kind === "avant" ? "AVANT" : "APRÈS"} · ${zone}</text><text x="580" y="433" font-family="Inter,Arial" font-size="16" fill="#6b7280" text-anchor="end">${date}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CONTRA = ["Isotrétinoïne (Roaccutane) jusqu'en février", "Herpès labial récidivant", "Anticoagulants (Kardégic)", "Maladie auto-immune (lupus)", "Exposition solaire récente : attendre 3 semaines"];
const ALLERGIES = ["Lidocaïne", "Latex", "Huiles essentielles", "Pénicilline", "Nickel"];
const TREATMENTS = ["Pilule contraceptive", "Lévothyrox 50 µg", "Vitamine D", "Crème rétinol le soir"];
const HISTORY = ["Acné à l'adolescence", "Taches pigmentaires (mélasma) sur les pommettes", "Cicatrice de césarienne", "Rosacée légère", "Aucun antécédent notable"];
const OBS = ["Bonne tolérance, cliente détendue.", "Peau légèrement déshydratée, conseil crème apaisante.", "Résultat satisfaisant, à revoir au contrôle.", "Séance réalisée sans difficulté."];
const OBS_LASER = ["Zone bien préparée, rasage fait la veille.", "Poils plus fins qu'à la séance précédente.", "Bonne tolérance, refroidissement suffisant."];
const EFFECTS = ["Légère rougeur, disparue en 1 h", "Petit hématome sur la lèvre supérieure", "Sensation de chaleur 30 min", "Œdème léger le soir même"];
const FEMALE = new Set(["Salma", "Nadia", "Imane", "Leila", "Khadija", "Fatima", "Sara", "Hajar", "Meryem", "Asmae", "Ghita", "Nour", "Houda", "Zineb", "Yasmine", "Loubna", "Wiam", "Kawtar", "Rim", "Amal"]);
const KID_HEALTH = ["Asthme : ventoline dans le sac", "Allergie aux arachides", "Porte des lunettes"];

function detailFor(service: string, kind: TreatmentKind, h: SeedHelpers): Row {
  const { pick, int } = h;
  const s = service.toLowerCase();
  if (kind === "laser")
    return {
      zone: pick(["Aisselles", "Jambes", "Maillot", "Visage", "Bras"]),
      product: pick(["Laser diode Soprano Ice", "Laser alexandrite GentleLase"]),
      lot: null,
      settings: { fluence: `${int(10, 22)} J/cm²`, wavelength: pick(["808 nm", "755 nm"]), spot: pick(["12 mm", "15 mm", "18 mm"]) },
      next: 35,
    };
  if (s.includes("toxine")) return { zone: pick(["Front", "Pattes d'oie", "Front"]), product: "Toxine botulique Botox", lot: `C${int(4000, 9999)}C3`, settings: { quantity: `${pick([12, 16, 20, 24])} U` }, next: 15 };
  if (s.includes("méso")) return { zone: "Visage", product: "NCTF 135 HA", lot: `N${int(10000, 99999)}`, settings: { quantity: "3 ml" }, next: 21 };
  if (kind === "injection")
    return { zone: pick(["Lèvres", "Sillons", "Lèvres"]), product: pick(["Juvéderm Volift", "Restylane Kysse"]), lot: `${pick(["JV", "RK"])}${int(100000, 999999)}`, settings: { quantity: pick(["0,5 ml", "1 ml"]) }, next: 14 };
  if (kind === "peeling") return { zone: "Visage", product: pick(["Peeling TCA 15 %", "Acide glycolique 50 %", "Peeling Jessner"]), lot: `P${int(1000, 9999)}`, settings: {}, next: 21 };
  if (kind === "epilation") return { zone: pick(["Jambes", "Aisselles", "Maillot"]), product: "Cire tiède sans colophane", lot: null, settings: {}, next: null };
  if (s.includes("visage")) return { zone: "Visage", product: pick(["Sérum hydratant Anais", "Masque à l'argile blanche"]), lot: null, settings: {}, next: null };
  return { zone: null, product: null, lot: null, settings: {}, next: null };
}

/** Données de démo : dossiers de soins (clinique, institut) et Moov'Up Kids */
export function seedCare(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, rnd, pick, int, day, at } = h;
  const contacts = (db.contacts ?? []) as Row[];
  const profiles = (db.profiles ?? []) as Row[];
  const appointments = (db.appointments ?? []) as Row[];
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const nowIso = new Date().toISOString();
  const today = dayKey();

  /* ---------- Fiches techniques (liées aux RDV terminés) ---------- */
  const treatment_records: Row[] = [];
  const done = appointments
    .filter((a) => a.status === "termine" && (a.entity_id === "clinic" || a.entity_id === "institut") && a.starts_at < nowIso)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  for (const a of done) {
    const s = String(a.service).toLowerCase();
    if (a.entity_id === "institut" && (!(s.includes("visage") || s.includes("épilation")) || rnd() < 0.5)) continue;
    // Quelques RDV récents restent sans fiche (à compléter)
    if (a.starts_at > at(-2, "00:00") && rnd() < 0.5) continue;
    const kind = guessKind(a.service);
    const d = detailFor(a.service, kind, h);
    treatment_records.push({
      id: uid(),
      entity_id: a.entity_id,
      contact_id: a.contact_id,
      appointment_id: a.id,
      performed_at: a.starts_at,
      kind,
      service: a.service,
      practitioner_id: a.staff_id,
      zone: d.zone,
      product: d.product,
      lot: d.lot,
      settings: d.settings,
      observations: kind === "laser" ? pick(OBS_LASER) : s.includes("consultation") ? pick(["Bilan : souhaite une cure laser jambes, devis remis.", "Demande des injections lèvres, délai de réflexion conseillé."]) : pick(OBS),
      side_effects: rnd() < 0.18 ? pick(EFFECTS) : null,
      next_on: d.next ? addDaysKey(a.starts_at.slice(0, 10), d.next) : null,
      created_by: a.staff_id,
      created_at: a.starts_at,
    });
  }

  /* ---------- Fiches santé ---------- */
  const care_profiles: Row[] = [];
  const careContacts = contacts.filter((c) => c.status !== "prospect" && (c.entity_ids.includes("clinic") || (c.entity_ids.includes("institut") && rnd() < 0.3)));
  let alerts = 0;
  for (const c of careContacts) {
    const clinic = c.entity_ids.includes("clinic");
    const flagged = clinic && alerts < 7 && rnd() < 0.35;
    if (flagged) alerts++;
    care_profiles.push({
      id: uid(),
      contact_id: c.id,
      skin_type: pick(["normale", "seche", "grasse", "mixte", "sensible"]),
      phototype: int(2, 5),
      pregnancy: flagged && c.sex === "F" && rnd() < 0.25 ? "allaitement" : "non",
      contraindications: flagged && rnd() < 0.7 ? pick(CONTRA) : null,
      allergies: flagged ? pick(ALLERGIES) : rnd() < 0.08 ? pick(ALLERGIES) : null,
      treatments: rnd() < 0.3 ? pick(TREATMENTS) : null,
      history: rnd() < 0.6 ? pick(HISTORY) : null,
      notes: rnd() < 0.15 ? "Préfère les rendez-vous en fin de journée." : null,
      updated_by: null,
      updated_at: at(-int(5, 120), "11:00"),
      created_at: at(-int(120, 300), "11:00"),
    });
  }

  /* ---------- Consentements : un par client et par type, à la 1re séance (quelques-uns manquent) ---------- */
  const consents: Row[] = [];
  const seen = new Set<string>();
  for (const t of treatment_records) {
    const tpl = consentFor(t.kind) as ConsentTemplate | null;
    if (!tpl) continue;
    const key = `${t.contact_id}:${tpl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (rnd() < 0.15) continue;
    const c = cById.get(t.contact_id);
    consents.push({
      id: uid(),
      entity_id: t.entity_id,
      contact_id: t.contact_id,
      template: tpl,
      title: CONSENT_TEMPLATES[tpl].title,
      body: CONSENT_TEMPLATES[tpl].body,
      signature: signatureSvg(int(1, 999)),
      signed_by: c?.full_name ?? "Client",
      signed_at: new Date(new Date(t.performed_at).getTime() - 10 * 60000).toISOString(),
      collected_by: t.practitioner_id,
      created_at: t.performed_at,
    });
  }

  /* ---------- Photos avant / après ---------- */
  const care_photos: Row[] = [];
  const photoClients = [...new Set(treatment_records.filter((t) => t.entity_id === "clinic" && (t.kind === "laser" || t.kind === "injection" || t.kind === "peeling")).map((t) => t.contact_id))].slice(0, 9);
  for (const cid of photoClients) {
    const recs = treatment_records.filter((t) => t.contact_id === cid && t.zone);
    const first = recs[0];
    if (!first) continue;
    const zone = first.kind === "laser" ? first.zone : "Visage";
    const d1 = first.performed_at.slice(0, 10);
    const later = addDaysKey(d1, 14);
    const d2 = recs.length > 1 ? recs[recs.length - 1]!.performed_at.slice(0, 10) : later <= today ? later : today;
    const seed = int(1, 9999);
    care_photos.push(
      { id: uid(), entity_id: first.entity_id, contact_id: cid, kind: "avant", zone, taken_on: d1, url: photoSvg("avant", zone, d1, seed), note: "Avant la 1re séance", created_by: first.practitioner_id, created_at: first.performed_at },
      { id: uid(), entity_id: first.entity_id, contact_id: cid, kind: "apres", zone, taken_on: d2, url: photoSvg("apres", zone, d2, seed), note: "Contrôle", created_by: first.practitioner_id, created_at: at(-1, "12:00") },
    );
  }

  /* ---------- Moov'Up Kids ---------- */
  const kids = contacts.filter((c) => c.entity_ids.includes("kids"));
  const kidAge = (c: Row) => (c.birth_date ? new Date().getFullYear() - Number(String(c.birth_date).slice(0, 4)) : 8);
  const coachOf = (job: string) => profiles.find((p) => p.job_title === job)?.id ?? null;

  const GROUPS: [name: string, activity: string, min: number, max: number, days: number[], start: string, end: string, coach: string, cap: number, loc: string][] = [
    ["Bébés nageurs 5-7 ans", "Natation enfants", 5, 7, [3, 6], "10:00", "10:45", "Maître-nageur", 8, "Petit bassin"],
    ["Natation 8-13 ans", "Natation enfants", 8, 13, [3, 6], "11:00", "12:00", "Maître-nageur", 12, "Grand bassin"],
    ["École de foot U9", "Football école", 5, 9, [3, 7], "15:00", "16:30", "Coach musculation", 14, "Terrain A"],
    ["École de foot U13", "Football école", 10, 13, [2, 4, 6], "17:30", "19:00", "Coach musculation", 16, "Terrain A"],
    ["Gym enfants", "Gym enfants", 5, 10, [1, 3, 5], "17:00", "18:00", "Coach fitness", 10, "Salle polyvalente"],
    ["Arts martiaux", "Arts martiaux", 7, 13, [2, 5], "18:00", "19:00", "Coach fitness", 12, "Dojo"],
  ];
  const kids_groups: Row[] = GROUPS.map(([name, activity, age_min, age_max, days, start_time, end_time, coach, capacity, location]) => ({
    id: uid(),
    entity_id: "kids",
    name,
    activity,
    age_min,
    age_max,
    days,
    start_time,
    end_time,
    coach_id: coachOf(coach),
    capacity,
    location,
    active: true,
    created_at: day(-int(120, 300)),
  }));

  const kids_members: Row[] = [];
  for (const c of kids.filter((x) => x.status === "client")) {
    const age = kidAge(c);
    const fits = kids_groups.filter((g) => age >= g.age_min && age <= g.age_max);
    if (!fits.length) continue;
    const chosen = [pick(fits)];
    if (fits.length > 1 && rnd() < 0.55) chosen.push(fits.find((g) => g !== chosen[0])!);
    for (const g of chosen) {
      const count = kids_members.filter((m) => m.group_id === g.id && m.status === "inscrit").length;
      const joined = day(-int(35, 200));
      kids_members.push({ id: uid(), entity_id: "kids", group_id: g.id, contact_id: c.id, status: count >= g.capacity ? "attente" : "inscrit", joined_on: joined, created_at: joined });
    }
  }
  // Liste d'attente : quelques prospects Kids
  for (const c of kids.filter((x) => x.status === "prospect").slice(0, 4)) {
    const age = kidAge(c);
    const g = kids_groups.find((x) => age >= x.age_min && age <= x.age_max) ?? kids_groups[0]!;
    const joined = day(-int(1, 20));
    kids_members.push({ id: uid(), entity_id: "kids", group_id: g.id, contact_id: c.id, status: "attente", joined_on: joined, created_at: joined });
  }

  // Fiches enfants : parents (frères et sœurs partagent les mêmes parents)
  const kids_children: Row[] = [];
  const familyByLast = new Map<string, Row>();
  for (const c of kids) {
    const last = String(c.full_name).split(" ").slice(1).join(" ");
    const sibling = familyByLast.get(last);
    const health = rnd() < 0.15 ? pick(KID_HEALTH) : null;
    let row: Row;
    if (sibling && rnd() < 0.6) {
      row = { ...sibling, id: uid(), contact_id: c.id, allow_leave_alone: kidAge(c) >= 11 && sibling.allow_leave_alone, health_notes: health, updated_at: c.created_at, created_at: c.created_at };
    } else {
      const p1 = c.guardian_name ?? `Parent ${last}`;
      const rel1 = FEMALE.has(String(p1).split(" ")[0]) ? "Mère" : "Père";
      const hasP2 = rnd() < 0.6;
      row = {
        id: uid(),
        entity_id: "kids",
        contact_id: c.id,
        parent1_name: p1,
        parent1_phone: c.phone,
        parent1_relation: rel1,
        parent2_name: hasP2 ? `${rel1 === "Mère" ? pick(["Karim", "Youssef", "Omar", "Mehdi", "Rachid"]) : pick(["Salma", "Nadia", "Imane", "Khadija", "Sara"])} ${last}` : null,
        parent2_phone: hasP2 ? `06 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}` : null,
        parent2_relation: hasP2 ? (rel1 === "Mère" ? "Père" : "Mère") : null,
        allow_leave_alone: kidAge(c) >= 11 && rnd() < 0.5,
        allow_photos: rnd() < 0.8,
        allow_medical: rnd() < 0.95,
        pickup_names: rnd() < 0.4 ? pick(["Grand-mère (Fatima)", "Oncle Hassan", "Nounou : Aicha"]) : null,
        health_notes: health,
        updated_at: c.created_at,
        created_at: c.created_at,
      };
      if (!sibling) familyByLast.set(last, row);
    }
    kids_children.push(row);
  }

  // Présences des 4 dernières semaines
  const kids_attendance: Row[] = [];
  for (let d = -28; d <= -1; d++) {
    const date = day(d);
    const dow = isoDay(date);
    for (const g of kids_groups) {
      if (!g.days.includes(dow)) continue;
      for (const m of kids_members.filter((x) => x.group_id === g.id && x.status === "inscrit")) {
        const r = rnd();
        kids_attendance.push({
          id: uid(),
          entity_id: "kids",
          group_id: g.id,
          contact_id: m.contact_id,
          date,
          status: r < 0.84 ? "present" : r < 0.94 ? "absent" : "excuse",
          marked_by: g.coach_id,
          created_at: at(d, g.end_time),
        });
      }
    }
  }

  return { care_profiles, treatment_records, consents, care_photos, kids_groups, kids_members, kids_children, kids_attendance };
}
