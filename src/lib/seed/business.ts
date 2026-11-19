/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";
import { ENTITIES } from "../entities";
import { DEFAULT_ZONES } from "../types-business";
import { addDaysKey } from "../utils";

type Row = Record<string, any>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Image de démonstration légère (SVG) : fond uni, pictogramme simple, légende */
function demoImage(label: string, color: string, kind: "photo" | "doc" = "photo") {
  const body =
    kind === "doc"
      ? `<rect width="600" height="800" fill="#f8fafc"/><rect x="60" y="60" width="480" height="680" rx="12" fill="#fff" stroke="#e2e8f0"/><rect x="100" y="110" width="200" height="22" rx="4" fill="${color}"/>${[190, 230, 270, 310, 350, 390, 430].map((y, i) => `<rect x="100" y="${y}" width="${i % 3 === 2 ? 260 : 400}" height="12" rx="4" fill="#e2e8f0"/>`).join("")}<rect x="340" y="560" width="160" height="40" rx="6" fill="#f1f5f9"/><text x="300" y="690" font-family="Arial" font-size="28" fill="#64748b" text-anchor="middle">${label}</text>`
      : `<rect width="800" height="600" fill="${color}"/><circle cx="640" cy="140" r="70" fill="#ffffff" opacity=".18"/><path d="M0 470 L220 300 L380 430 L520 330 L800 520 L800 600 L0 600Z" fill="#ffffff" opacity=".22"/><text x="40" y="560" font-family="Arial" font-size="40" font-weight="bold" fill="#fff">${label}</text>`;
  const [w, h] = kind === "doc" ? [600, 800] : [800, 600];
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
}

/** Fiches complètes des fournisseurs (complète le module stock et les noms saisis dans les dépenses) */
const DETAILS: Record<string, { legal?: string; ice?: string; contact?: string; phone?: string; wa?: string; email?: string; address?: string; city?: string; terms?: string; rib?: string; notes?: string; ents?: string[] }> = {
  "Atlas Nutrition Distribution": { legal: "ATLAS NUTRITION DISTRIBUTION SARL", ice: "002145879000063", address: "Zone industrielle Aïn Sebaâ", terms: "30 jours", rib: "007780000123456789012345" },
  "Coopérative Tifaout Argan": { legal: "COOPERATIVE TIFAOUT", ice: "001987452000021", address: "Douar Tifaout, route de Taroudant", terms: "À la livraison" },
  "Souss Sport Équipement": { legal: "SOUSS SPORT EQUIPEMENT SARL AU", ice: "002301478000045", address: "Bd Hassan II, Hay Mohammadi", terms: "30 jours", wa: "06 62 15 40 87" },
  "Barber Pro Maroc": { legal: "BARBER PRO MAROC SARL", ice: "002456123000071", address: "Gueliz, rue Ibn Aïcha", terms: "Comptant" },
  "SCI Hay Mohammadi": { legal: "SCI HAY MOHAMMADI IMMOBILIER", ice: "001542369000058", contact: "M. Lahcen Oubella", phone: "05 28 23 41 10", email: "gestion@sci-haymohammadi.ma", address: "Av. Abderrahim Bouabid", terms: "Prélèvement mensuel", rib: "011010000045678912345678", notes: "Bail commercial renouvelé jusqu'en 2028. Révision annuelle de 3 %." },
  ONEE: { legal: "OFFICE NATIONAL DE L'ELECTRICITE ET DE L'EAU POTABLE", ice: "001525812000094", phone: "080 200 90 00", address: "Agence Agadir Talborjt", terms: "Prélèvement mensuel", notes: "Un contrat par établissement. Relevés vers le 5 du mois." },
  RAMSA: { legal: "REGIE AUTONOME MULTI-SERVICES D'AGADIR", ice: "001478523000037", phone: "05 28 22 44 44", address: "Bd Mohammed V, Agadir", terms: "Prélèvement mensuel" },
  "Nutri Sport Maroc": { legal: "NUTRI SPORT MAROC SARL", ice: "002210365000082", contact: "Hamza El Idrissi", phone: "06 61 77 32 18", email: "pro@nutrisport.ma", address: "Route de Casablanca", city: "Marrakech", terms: "30 jours", notes: "Remise de 8 % au-delà de 5 000 MAD." },
  "Hygiène Souss Distribution": { legal: "HYGIENE SOUSS DISTRIBUTION", ice: "002098745000016", contact: "Rachid Boutaleb", phone: "05 28 82 15 63", wa: "06 70 22 18 45", address: "Quartier industriel Anza", terms: "Fin de mois", notes: "Livraison gratuite le mardi. Produits ménagers, papier, savon." },
  "Jouets & Sport Agadir": { legal: "JOUETS ET SPORT AGADIR SARL", ice: "002356874000039", contact: "Nadia Chafik", phone: "06 63 41 25 90", address: "Souk El Had, bloc C", terms: "Comptant" },
  "Pharma Agadir": { legal: "PHARMA AGADIR DISTRIBUTION", ice: "001874563000048", contact: "Dr Amine Sbai", phone: "05 28 84 66 12", email: "commandes@pharma-agadir.ma", address: "Av. Hassan Ier, Dakhla", terms: "30 jours" },
  "Medika Maroc": { legal: "MEDIKA MAROC SA", ice: "001693258000067", contact: "Salma Berrada", phone: "05 22 98 41 00", email: "agadir@medika.ma", address: "Bd Zerktouni", city: "Casablanca", terms: "60 jours", rib: "230780000987654321098765", notes: "Acide hyaluronique et consommables médicaux. Livraison réfrigérée." },
  "Cosmétiques Atlas": { legal: "COSMETIQUES ATLAS SARL", ice: "002147896000053", contact: "Imane Taoufik", phone: "06 68 90 14 27", address: "Talborjt, rue 412", terms: "À la livraison" },
  "Hammam Pro Distribution": { legal: "HAMMAM PRO DISTRIBUTION", ice: "002265431000074", contact: "Mustapha Aglou", phone: "06 61 25 87 40", address: "Inezgane, zone artisanale", city: "Inezgane", terms: "Comptant", notes: "Savon beldi, ghassoul, kessa. Commande par WhatsApp." },
  "Clim Service Agadir": { legal: "CLIM SERVICE SARL", ice: "002014785000026", contact: "Brahim Ouhammou", phone: "06 61 45 78 12", wa: "06 61 45 78 12", address: "Hay Dakhla, lot 118", terms: "À la livraison", notes: "Contrat d'entretien annuel des climatiseurs. Intervention sous 24 h." },
  "Plomberie Talborjt": { contact: "Abdellah Idrissi", phone: "06 70 88 21 54", address: "Talborjt", terms: "Comptant", notes: "Artisan de confiance, disponible le week-end." },
  "Électricité Bensergao": { contact: "Said Amellal", phone: "06 62 30 47 19", address: "Bensergao", terms: "Comptant" },
  "Technofit Maroc": { legal: "TECHNOFIT MAROC SARL", ice: "002378541000011", contact: "Omar Lahlou", phone: "05 22 36 74 10", email: "sav@technofit.ma", city: "Casablanca", terms: "30 jours", notes: "SAV des tapis et vélos. Contrat de maintenance trimestriel.", ents: ["sports", "lady", "power"] },
  "Marjane Agadir": { legal: "MARJANE HOLDING", ice: "000012345000091", phone: "05 28 22 35 00", address: "Route d'Inezgane, Founty", terms: "Comptant" },
  "Bureau Plus Agadir": { contact: "Leila Mansouri", phone: "05 28 84 12 36", address: "Av. du Prince Héritier", terms: "Comptant" },
  "Librairie Al Massira": { phone: "05 28 22 19 84", address: "Hay Al Massira", terms: "Comptant" },
  "Meta Ads": { legal: "META PLATFORMS IRELAND LTD", city: "Dublin", terms: "Prélèvement mensuel", notes: "Publicité Instagram et Facebook, payée par carte." },
  "Imprimerie Founty": { contact: "Khalid Raji", phone: "06 61 98 45 32", email: "imprimerie.founty@gmail.com", address: "Founty, secteur F", terms: "À la livraison" },
  "Radio Plus Agadir": { legal: "RADIO PLUS AGADIR SARL", ice: "002089654000035", contact: "Samira Haddou", phone: "05 28 21 30 30", email: "pub@radioplus.ma", address: "Av. Mohammed V", terms: "30 jours" },
};

const COMPLAINTS: [entity: string, zone: string | null, type: string, text: string, days: number, status: "nouvelle" | "en_cours" | "resolue", contact?: [string, string], photo?: string, resolution?: string][] = [
  ["sports", "Plateau musculation", "panne", "Le tapis de course n° 3 s'arrête tout seul après 5 minutes.", 0, "nouvelle", ["Anas", "06 61 23 45 78"], "Tapis n° 3"],
  ["sports", "Douches", "panne", "Plus d'eau chaude dans les douches hommes depuis ce matin.", 0, "en_cours", undefined, undefined],
  ["sports", "Piscine", "securite", "Une dalle est cassée au bord du grand bassin, côté plongeoir. Quelqu'un peut se blesser.", 1, "en_cours", ["Karima", "06 70 11 52 36"], "Dalle cassée"],
  ["sports", "Vestiaires", "proprete", "Les poubelles du vestiaire hommes débordent.", 3, "resolue", undefined, undefined, "Passage de l'équipe de ménage avancé à 18 h."],
  ["sports", "Accueil", "service", "Attente de 20 minutes à l'accueil ce matin, une seule personne au comptoir.", 6, "resolue", ["Omar", "06 62 98 41 20"], undefined, "Renfort d'une personne à l'accueil de 7 h à 9 h."],
  ["sports", "Terrain de football", "securite", "Le filet du but côté parking est déchiré.", 12, "resolue", undefined, "Filet déchiré", "Filet remplacé par Souss Sport Équipement."],
  ["lady", "Salle de cours", "panne", "La climatisation de la salle de cours ne refroidit plus, on étouffe pendant la zumba.", 0, "nouvelle", ["Salma", "06 66 45 12 98"], undefined],
  ["lady", "Vestiaires", "proprete", "Odeur forte dans le vestiaire, près des casiers 30 à 40.", 2, "en_cours", undefined, undefined],
  ["lady", "Salle de cours", "service", "Le cours de 19 h a commencé avec 15 minutes de retard sans prévenir.", 9, "resolue", undefined, undefined, "Rappel fait aux coachs ; message d'excuse envoyé aux adhérentes."],
  ["lady", "Vestiaires", "panne", "Le sèche-cheveux du vestiaire ne marche plus.", 20, "resolue", undefined, undefined, "Sèche-cheveux remplacé."],
  ["kids", "Aire de jeux", "securite", "Une vis dépasse du toboggan, mon fils s'est éraflé la main.", 1, "nouvelle", ["Nadia (maman de Rayan)", "06 61 87 30 45"], "Vis toboggan"],
  ["kids", "Sanitaires", "proprete", "Plus de savon dans les toilettes des enfants.", 4, "resolue", undefined, undefined, "Distributeurs remplis ; contrôle ajouté à la check-list du midi."],
  ["power", "Plateau musculation", "panne", "La presse à cuisses grince et se bloque en bas du mouvement.", 2, "en_cours", undefined, "Presse à cuisses"],
  ["power", "Plateau cardio", "autre", "Pourriez-vous baisser un peu la musique le matin ?", 7, "resolue", undefined, undefined, "Volume réduit avant 10 h."],
  ["power", "Vestiaires", "panne", "Le casier 42 ne ferme plus.", 15, "resolue", undefined, undefined, "Serrure changée."],
  ["clinic", "Salle d'attente", "service", "Attente de 35 minutes malgré mon rendez-vous de 15 h.", 1, "nouvelle", ["Mme Alaoui", "06 61 55 20 14"], undefined],
  ["clinic", "Sanitaires", "proprete", "Le sol des toilettes était mouillé et glissant.", 10, "resolue", undefined, undefined, "Fuite du lavabo réparée par Plomberie Talborjt."],
  ["institut", "Hammam", "proprete", "Serviettes humides distribuées au hammam.", 0, "nouvelle", undefined, undefined],
  ["institut", "Cabines", "autre", "La cabine 2 est trop froide pendant le massage.", 5, "resolue", undefined, undefined, "Chauffage d'appoint installé dans la cabine 2."],
  ["institut", "Hammam", "panne", "Le robinet d'eau chaude de la salle chaude coule en continu.", 25, "resolue", undefined, "Robinet hammam", "Robinet remplacé."],
  ["evolve", "Accueil", "panne", "Le fauteuil n° 2 ne monte plus.", 3, "en_cours", ["Mehdi", "06 70 64 22 81"], undefined],
  ["evolve", null, "service", "Le wifi ne marche pas dans la salle d'attente.", 18, "resolue", undefined, undefined, "Box redémarrée et mot de passe affiché au comptoir."],
];

/** Fournisseurs, dépenses rattachées, collaborations et réclamations de démonstration */
export function seedBusiness(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, int, at, day } = h;
  const profiles = db.profiles ?? [];
  const direction = profiles.find((p) => p.role === "direction");
  const managerOf = (e: string) => (profiles.find((p) => p.role === "manager" && (p.entity_ids ?? []).includes(e)) ?? direction)?.id ?? null;
  const expenses0 = db.expenses ?? [];

  /* ---------- Répertoire fournisseurs ---------- */
  const suppliers: Row[] = (db.suppliers ?? []).map((s) => ({ ...s }));
  const byName = new Map(suppliers.map((s) => [norm(s.name), s]));
  // Noms saisis dans les dépenses → fiches (sauf quelques-uns laissés « sans fiche » pour la démo)
  const LEFT_OUT = new Set(["librairie al massira"]);
  for (const x of expenses0) {
    if (!x.supplier || byName.has(norm(x.supplier)) || LEFT_OUT.has(norm(x.supplier))) continue;
    const ents = [...new Set(expenses0.filter((y) => y.supplier === x.supplier).map((y) => y.entity_id))];
    const row: Row = { id: uid(), name: x.supplier, contact_name: null, phone: null, email: null, city: "Agadir", entity_ids: ents.length >= 5 ? [] : ents, product_ids: [], notes: null, created_at: at(-int(200, 400), "10:00") };
    suppliers.push(row);
    byName.set(norm(x.supplier), row);
  }
  for (const s of suppliers) {
    const d = DETAILS[s.name] ?? {};
    const cats = [...new Set(expenses0.filter((x) => x.supplier && norm(x.supplier) === norm(s.name)).map((x) => x.category))];
    if (!cats.length && (s.product_ids ?? []).length) cats.push("produits");
    Object.assign(s, {
      legal_name: d.legal ?? null,
      ice: d.ice ?? null,
      contact_name: s.contact_name ?? d.contact ?? null,
      phone: s.phone ?? d.phone ?? null,
      whatsapp: d.wa ?? null,
      email: s.email ?? d.email ?? null,
      address: d.address ?? null,
      city: d.city ?? s.city ?? "Agadir",
      categories: cats,
      entity_ids: d.ents ?? s.entity_ids ?? [],
      payment_terms: d.terms ?? null,
      rib: d.rib ?? null,
      notes: s.notes ?? d.notes ?? null,
      documents: [] as Row[],
      active: true,
    });
  }
  const docFor = (name: string, label: string, color: string, offset: number) => {
    const s = byName.get(norm(name));
    if (s) s.documents.push({ url: demoImage(label, color, "doc"), label, added_at: at(offset, "11:00") });
  };
  docFor("Clim Service Agadir", "Contrat d'entretien 2026", "#1a6d8e", -90);
  docFor("Clim Service Agadir", "Facture n° 2026-118", "#1a6d8e", -12);
  docFor("SCI Hay Mohammadi", "Bail commercial", "#334155", -300);
  docFor("Medika Maroc", "Devis consommables", "#0f766e", -40);
  docFor("Technofit Maroc", "Contrat de maintenance", "#b45309", -120);
  docFor("Hygiène Souss Distribution", "Tarifs 2026", "#4d7c0f", -60);
  // Un fournisseur archivé
  suppliers.push({
    id: uid(), name: "Sport Line Import", contact_name: "Rachid Karimi", phone: "05 22 44 10 87", email: null, city: "Casablanca", entity_ids: ["sports"], product_ids: [],
    notes: "Ancien fournisseur de petit matériel, remplacé par Souss Sport Équipement.", created_at: at(-500, "10:00"),
    legal_name: "SPORT LINE IMPORT SARL", ice: "001758963000042", whatsapp: null, address: null, categories: ["fournitures"], payment_terms: "30 jours", rib: null, documents: [], active: false,
  });

  const expenses = expenses0.map((x) => ({ ...x, supplier_id: x.supplier ? (byName.get(norm(x.supplier))?.id ?? null) : null }));

  /* ---------- Collaborations ---------- */
  const tasks: Row[] = [...(db.tasks ?? [])];
  const P: Row[] = [
    {
      title: "Tournoi de padel Decathlon × Moov'Up", partner_name: "Decathlon Agadir", partner_kind: "marque", nature: "cobranding", status: "active", start_date: day(-45), end_date: day(12),
      entity_ids: ["sports", "power"], our_part: "Logo Decathlon sur les affiches du tournoi et sur nos réseaux, stand à l'entrée le jour J.", their_part: "Raquettes et balles pour 32 joueurs, 3 bons d'achat de 1 000 MAD pour les gagnants.",
      value_mad: 15000, contact_name: "Yassir Benali", contact_phone: "06 61 42 87 30", contact_email: "yassir.benali@decathlon.ma", social: "@decathlonmaroc",
      photos: [["Remise des raquettes", "#0082c3"], ["Affiche du tournoi", "#1a6d8e"], ["Stand Decathlon", "#0f766e"]], results: "48 inscrits, 11 essais transformés en abonnement.", notes: null,
    },
    {
      title: "Ambassadrice Lady Moov'Up", partner_name: "@sara.fit.agadir", partner_kind: "influenceur", nature: "influence", status: "active", start_date: day(-70), end_date: day(110),
      entity_ids: ["lady"], our_part: "Abonnement annuel + 4 séances de coaching par mois.", their_part: "4 reels et 8 stories par mois, code promo SARA10.",
      value_mad: 9600, contact_name: "Sara El Amrani", contact_phone: "06 70 31 25 64", contact_email: null, social: "@sara.fit.agadir",
      photos: [["Reel cours de pilates", "#d9467a"], ["Story séance coaching", "#be185d"]], results: "126 utilisations du code SARA10, +2 300 abonnés Instagram en 2 mois.", notes: "Renouvellement à discuter avant l'été.",
    },
    {
      title: "Natation solidaire Amal Souss", partner_name: "Association Amal Souss", partner_kind: "association", nature: "mecenat", status: "active", start_date: day(-120), end_date: day(-2),
      entity_ids: ["sports", "kids"], our_part: "20 enfants accueillis gratuitement chaque samedi matin à la piscine, maître-nageur compris.", their_part: "Mention dans leur rapport annuel et sur leurs réseaux, reçu fiscal.",
      value_mad: 24000, contact_name: "Khadija Ouaziz", contact_phone: "06 62 77 14 09", contact_email: "contact@amalsouss.org", social: null,
      photos: [["Samedi piscine", "#3fa34d"]], results: "17 enfants savent désormais nager 25 m.", notes: "Convention arrivée à échéance : à renouveler pour l'année prochaine.",
    },
    {
      title: "Échange hammam pour les clients de l'hôtel", partner_name: "Hôtel Atlas Amadil Beach", partner_kind: "entreprise", nature: "echange", status: "discussion", start_date: day(15), end_date: null,
      entity_ids: ["institut", "clinic"], our_part: "Tarif préférentiel de 20 % sur le hammam et les soins pour les clients de l'hôtel.", their_part: "Flyers en chambre, mise en avant à la conciergerie, 2 nuitées offertes par trimestre pour nos jeux concours.",
      value_mad: 8000, contact_name: "Laila Benjelloun", contact_phone: "05 28 84 20 20", contact_email: "events@atlasamadil.ma", social: null,
      photos: [], results: null, notes: "Rendez-vous avec la direction de l'hôtel prévu la semaine prochaine.",
    },
    {
      title: "Spots radio contre abonnements", partner_name: "Radio Plus Agadir", partner_kind: "media", nature: "echange", status: "terminee", start_date: day(-200), end_date: day(-140),
      entity_ids: ["sports"], our_part: "10 abonnements annuels pour l'équipe de la radio.", their_part: "60 spots de 30 s sur 2 mois et une émission en direct depuis le complexe.",
      value_mad: 18000, contact_name: "Samira Haddou", contact_phone: "05 28 21 30 30", contact_email: "pub@radioplus.ma", social: null,
      photos: [["Émission en direct", "#7c3aed"]], results: "Pic de 64 prospects le mois de la campagne (+40 %).", notes: null,
    },
    {
      title: "Stand au semi-marathon d'Agadir", partner_name: "Semi-marathon International d'Agadir", partner_kind: "sportif", nature: "evenement", status: "terminee", start_date: day(-35), end_date: day(-35),
      entity_ids: ["sports", "power", "lady"], our_part: "Stand d'échauffement et d'étirements, 3 coachs, 2 000 MAD de participation.", their_part: "Emplacement sur la ligne d'arrivée, logo sur le dossard des 1 500 coureurs.",
      value_mad: 12000, contact_name: "Comité d'organisation", contact_phone: "06 61 00 45 87", contact_email: null, social: "https://semimarathonagadir.ma",
      photos: [["Ligne d'arrivée", "#ea580c"], ["Stand étirements", "#1a6d8e"], ["Équipe de coachs", "#334155"]], results: "212 contacts collectés, 37 séances d'essai réservées.", notes: null,
    },
    {
      title: "Barbier officiel des vidéos", partner_name: "@yassine.cuts", partner_kind: "influenceur", nature: "influence", status: "discussion", start_date: null, end_date: null,
      entity_ids: ["evolve"], our_part: "Coupes offertes pour lui et ses invités.", their_part: "Tournage de 2 vidéos par mois au salon, tag Evolve.",
      value_mad: 3000, contact_name: "Yassine Tazi", contact_phone: "06 63 12 85 47", contact_email: null, social: "@yassine.cuts",
      photos: [], results: null, notes: "Il demande aussi une commission sur les nouveaux clients : à arbitrer.",
    },
    {
      title: "Sponsoring de l'équipe régionale de natation", partner_name: "Ligue Souss-Massa de natation", partner_kind: "sportif", nature: "sponsoring", status: "active", start_date: day(-250), end_date: day(9),
      entity_ids: ["sports"], our_part: "Accès au bassin 3 soirs par semaine pour l'équipe.", their_part: "Logo Moov'Up sur les bonnets et les maillots, visibilité aux championnats.",
      value_mad: 30000, contact_name: "Hassan Lamrani", contact_phone: "06 61 74 30 92", contact_email: "ligue.natation.sm@gmail.com", social: null,
      photos: [["Championnat régional", "#1a6d8e"]], results: "2 médailles d'or aux championnats régionaux avec notre logo.", notes: null,
    },
  ];
  const partnerships: Row[] = P.map((p, i) => {
    const id = uid();
    const reminder = p.end_date && p.status !== "terminee" ? addDaysKey(p.end_date, -15) : null;
    let reminder_task_id: string | null = null;
    if (reminder) {
      reminder_task_id = uid();
      tasks.push({ id: reminder_task_id, title: `Collaboration ${p.partner_name} : fin le ${p.end_date} (renouveler ou clôturer)`, contact_id: null, lead_id: null, entity_id: p.entity_ids[0], assigned_to: direction?.id ?? null, due_date: reminder, priority: "normale", done: false, created_by: direction?.id ?? null, created_at: at(-20, "09:00") });
    }
    const created = at(-Math.max(5, 260 - i * 30), "10:30");
    return {
      ...p,
      id,
      photos: (p.photos as [string, string][]).map(([label, color], k) => ({ url: demoImage(label, color), label, added_at: at(-int(1, 30), `1${k}:00`) })),
      reminder_date: reminder,
      reminder_task_id,
      created_by: i % 3 === 1 ? (managerOf(p.entity_ids[0]) ?? direction?.id) : direction?.id,
      created_at: created,
      updated_at: created,
    };
  });

  /* ---------- Zones et réclamations ---------- */
  const EXTRA: Record<string, string[]> = { sports: ["Piscine", "Terrain de football"], power: ["Plateau cardio"], kids: ["Aire de jeux"], lady: [], clinic: [], institut: [], evolve: [] };
  const complaint_zones: Row[] = [];
  for (const e of ENTITIES) for (const label of [...DEFAULT_ZONES[e.kind], ...(EXTRA[e.id] ?? [])]) complaint_zones.push({ id: uid(), entity_id: e.id, label, created_at: at(-60, "09:00") });

  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const complaints: Row[] = COMPLAINTS.map(([entityId, zoneLabel, type, text, days, status, contact, photo, resolution], i) => {
    const zone = zoneLabel ? complaint_zones.find((z) => z.entity_id === entityId && z.label === zoneLabel) : null;
    const hh = days === 0 ? `0${8 + (i % 2)}:${String(10 + i).padStart(2, "0")}` : `${10 + (i % 9)}:${String((i * 7) % 60).padStart(2, "0")}`;
    const created = at(-days, hh);
    const priority = type === "panne" || type === "securite" ? "haute" : type === "autre" ? "basse" : "normale";
    const assigned = managerOf(entityId);
    const taken = status !== "nouvelle" ? new Date(Date.parse(created) + (20 + i * 9) * 60000).toISOString() : null;
    const resolved = status === "resolue" ? new Date(Date.parse(created) + (2 + (i % 5) * 7) * 3600000).toISOString() : null;
    let n = 1_000_003 * (i + 1) + 7919;
    let ref = "";
    for (let k = 0; k < 5; k++, n = Math.floor(n / 32)) ref = ALPHA[n % 32] + ref;
    ref = `R-${ref}`;
    const taskId = uid();
    tasks.push({
      id: taskId, title: `Réclamation ${ref} · ${({ panne: "Panne", proprete: "Propreté", securite: "Sécurité", service: "Service", autre: "Autre" } as Record<string, string>)[type]}${zoneLabel ? ` · ${zoneLabel}` : ""} : ${text.slice(0, 70)}${text.length > 70 ? "…" : ""}`,
      contact_id: null, lead_id: null, entity_id: entityId, assigned_to: assigned, due_date: day(-days + (priority === "haute" ? 0 : 1)), priority, done: status === "resolue", created_by: null, created_at: created,
    });
    return {
      id: uid(), ref, entity_id: entityId, zone_id: zone?.id ?? null, zone_label: zone?.label ?? null, type, description: text,
      photo_url: photo ? demoImage(photo, ENTITIES.find((e) => e.id === entityId)!.color) : null,
      contact_name: contact?.[0] ?? null, contact_phone: contact?.[1] ?? null, status, priority, assigned_to: assigned, task_id: taskId, source: "qr",
      resolution: resolution ?? null, taken_at: taken, resolved_at: resolved, created_at: created,
    };
  });

  return { suppliers, expenses, partnerships, complaint_zones, complaints, tasks };
}
