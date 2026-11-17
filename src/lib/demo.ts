/**
 * Mode démo : une fausse base en mémoire qui imite le client Supabase
 * (from/select/eq/order/insert…) pour voir et tester l'interface sans base réelle.
 * Activé avec NEXT_PUBLIC_DEMO=1.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { seed } from "./demo-seed";

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const DEMO_DIRECTION = "00000000-0000-4000-8000-000000000001";
export const DEMO_MANAGER = "00000000-0000-4000-8000-000000000002";
export const DEMO_RECEPTION = "00000000-0000-4000-8000-000000000003";

/** Comptes de démonstration (données fictives, mode démo uniquement) */
export const DEMO_ACCOUNTS = [
  { email: "direction@moovup.ma", password: "direction2026", userId: DEMO_DIRECTION, label: "Direction", name: "Yassine Moov'Up", space: "Direction · tous les établissements" },
  { email: "lady@moovup.ma", password: "manager2026", userId: DEMO_MANAGER, label: "Manager", name: "Houda Bennis", space: "Manager · Lady Moov'Up & Kids" },
  { email: "accueil.anais@moovup.ma", password: "accueil2026", userId: DEMO_RECEPTION, label: "Réception", name: "Meryem Ait Ali", space: "Réception · Anais Clinic & Institut" },
];

type Row = Record<string, any>;
export type DB = Record<string, Row[]>;

const g = globalThis as unknown as { __moovupCrmV2?: DB };
export function demoDb(): DB {
  if (!g.__moovupCrmV2) g.__moovupCrmV2 = seed();
  return g.__moovupCrmV2;
}

/* ---------- Faux constructeur de requêtes ---------- */
type Filter = (r: Row) => boolean;

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private sorts: [string, boolean][] = [];
  private max?: number;
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private one: "single" | "maybe" | null = null;
  private head = false;
  private wantRows = false;

  constructor(private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "select") this.wantRows = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: Row | Row[]) { this.mode = "insert"; this.payload = v; return this; }
  update(v: Row) { this.mode = "update"; this.payload = v; return this; }
  delete() { this.mode = "delete"; return this; }
  upsert(v: Row | Row[]) {
    const db = demoDb();
    const tbl = (db[this.table] ??= []);
    const rows = Array.isArray(v) ? v : [v];
    const fresh = rows.filter((r) => {
      const ex = tbl.find((x) => x.id === r.id);
      if (ex) { Object.assign(ex, r); return false; }
      return true;
    });
    this.mode = "insert"; this.payload = fresh; return this;
  }
  eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
  neq(k: string, v: any) { this.filters.push((r) => r[k] !== v); return this; }
  in(k: string, v: any[]) { this.filters.push((r) => v.includes(r[k])); return this; }
  gte(k: string, v: any) { this.filters.push((r) => r[k] != null && r[k] >= v); return this; }
  gt(k: string, v: any) { this.filters.push((r) => r[k] != null && r[k] > v); return this; }
  lt(k: string, v: any) { this.filters.push((r) => r[k] != null && r[k] < v); return this; }
  lte(k: string, v: any) { this.filters.push((r) => r[k] != null && r[k] <= v); return this; }
  ilike(k: string, pat: string) {
    const n = pat.replace(/%/g, "").toLowerCase();
    this.filters.push((r) => String(r[k] ?? "").toLowerCase().includes(n));
    return this;
  }
  is(k: string, v: null | boolean) { this.filters.push((r) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)); return this; }
  not(k: string, ...rest: [string, null]) { void rest; this.filters.push((r) => r[k] !== null && r[k] !== undefined); return this; }
  /** Tableau qui contient toutes les valeurs */
  contains(k: string, v: any[]) { this.filters.push((r) => Array.isArray(r[k]) && v.every((x) => r[k].includes(x))); return this; }
  /** Tableau qui contient au moins une des valeurs */
  overlaps(k: string, v: any[]) { this.filters.push((r) => Array.isArray(r[k]) && v.some((x) => r[k].includes(x))); return this; }
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [k, , pat] = p.split(".");
      const needle = (pat ?? "").replace(/%/g, "").toLowerCase();
      return (r: Row) => String(r[k!] ?? "").toLowerCase().includes(needle);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(k: string, opts?: { ascending?: boolean }) { this.sorts.push([k, opts?.ascending !== false]); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }

  private run() {
    const db = demoDb();
    const tbl = (db[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));

    if (this.mode === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...(this.table === "contacts" ? { tags: [], entity_ids: [], status: "prospect", whatsapp_optin: true } : {}),
        ...(this.table === "leads" ? { updated_at: new Date().toISOString() } : {}),
        ...r,
      }));
      tbl.push(...rows);
      return this.shape(rows);
    }
    if (this.mode === "update") {
      const rows = tbl.filter(match);
      rows.forEach((r) => Object.assign(r, this.payload));
      return this.shape(rows);
    }
    if (this.mode === "delete") {
      const removedIds = new Set(tbl.filter(match).map((r) => r.id));
      db[this.table] = tbl.filter((r) => !removedIds.has(r.id));
      if (this.table === "contacts") {
        for (const t of ["leads", "subscriptions", "appointments", "activities"]) db[t] = (db[t] ?? []).filter((r) => !removedIds.has(r.contact_id));
      }
      if (this.table === "sales") db.sale_items = (db.sale_items ?? []).filter((r) => !removedIds.has(r.sale_id));
      return { data: null, error: null, count: removedIds.size };
    }
    let rows = tbl.filter(match).map((r) => ({ ...r }));
    for (const [k, asc] of [...this.sorts].reverse()) {
      rows.sort((a, b) => (a[k] === b[k] ? 0 : (a[k] ?? "") > (b[k] ?? "") ? (asc ? 1 : -1) : asc ? -1 : 1));
    }
    if (this.head) return { data: null, error: null, count: rows.length };
    const count = rows.length;
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    return this.shape(rows, count);
  }

  private shape(rows: Row[], count = rows.length) {
    if (this.mode !== "select" && !this.wantRows && !this.one) return { data: null, error: null };
    if (this.one) {
      if (!rows.length) return { data: null, error: this.one === "single" ? { message: "Introuvable", code: "PGRST116" } : null };
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null, count };
  }

  then<A = any, B = never>(ok?: ((v: any) => A | PromiseLike<A>) | null, ko?: ((e: any) => B | PromiseLike<B>) | null) {
    try {
      return Promise.resolve(this.run()).then(ok, ko);
    } catch (e) {
      return Promise.reject(e).then(ok, ko);
    }
  }
}

export function demoClient(userId: string | null) {
  return {
    from: (table: string) => new Query(table),
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId, email: "demo@moovup.ma" } : null }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ data: { session: {} }, error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
    },
  } as any;
}
