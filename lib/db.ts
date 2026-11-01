// Data layer.
//
// Reference data (products, customers, offers, FAQs) comes straight from the
// sample-data files in data/seed and is read-only. Everything that changes
// (orders, conversations, messages, tickets, callbacks, returns, events) goes
// through the async store below, which uses:
//   - Supabase when SUPABASE_URL + a key are set (production / Vercel), or
//   - a local JSON file otherwise (data/runtime/db.json; /tmp on Vercel).
// Supabase has one table per collection (id, data jsonb); see supabase/schema.sql.

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsEvent, Callback, ChatMessage, Conversation, Customer, Faq, Offer, Order, Product, ReturnRequest, Ticket } from "./types";
import productsJson from "../data/seed/products.json";
import customersJson from "../data/seed/customers.json";
import offersJson from "../data/seed/offers.json";
import faqsJson from "../data/seed/faqs.json";
import ordersJson from "../data/seed/orders.json";

export const seed = {
  products: productsJson as Product[],
  customers: customersJson as Customer[],
  offers: offersJson as Offer[],
  faqs: faqsJson as Faq[],
  orders: ordersJson as Order[],
};

export interface Collections {
  orders: Order;
  conversations: Conversation;
  messages: ChatMessage;
  tickets: Ticket;
  callbacks: Callback;
  returns: ReturnRequest;
  events: AnalyticsEvent;
}
export type Collection = keyof Collections;
const COLLECTIONS: Collection[] = ["orders", "conversations", "messages", "tickets", "callbacks", "returns", "events"];

const idOf = <C extends Collection>(c: C, row: Collections[C]): string =>
  c === "orders" ? (row as Order).order_id : (row as { id: string }).id;

interface Backend {
  list<C extends Collection>(c: C, where?: [string, string]): Promise<Collections[C][]>;
  get<C extends Collection>(c: C, id: string): Promise<Collections[C] | undefined>;
  put<C extends Collection>(c: C, row: Collections[C]): Promise<void>;
  reset(scope: "all" | "orders"): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------

class SupabaseBackend implements Backend {
  private seeded = false;
  constructor(private sb: SupabaseClient) {}

  private async ensureSeeded() {
    if (this.seeded) return;
    const { count, error } = await this.sb.from("orders").select("id", { count: "exact", head: true });
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!count) await this.seedAll();
    this.seeded = true;
  }

  private async seedAll() {
    const rows = <T,>(items: T[], id: (x: T, i: number) => string) => items.map((x, i) => ({ id: id(x, i), data: x }));
    const writes: [string, { id: string; data: unknown }[]][] = [
      ["orders", rows(seed.orders, (o) => o.order_id)],
      ["products", rows(seed.products, (p) => p.product_id)],
      ["customers", rows(seed.customers, (c) => c.customer_id)],
      ["offers", rows(seed.offers, (o) => o.code)],
      ["faqs", rows(seed.faqs, (_f, i) => `FAQ-${i + 1}`)],
    ];
    for (const [table, data] of writes) {
      const { error } = await this.sb.from(table).upsert(data);
      if (error) throw new Error(`Supabase seed ${table}: ${error.message}`);
    }
  }

  async list<C extends Collection>(c: C, where?: [string, string]) {
    await this.ensureSeeded();
    let q = this.sb.from(c).select("data").order("created_at", { ascending: true }).limit(5000);
    if (where) q = q.eq(`data->>${where[0]}`, where[1]);
    const { data, error } = await q;
    if (error) throw new Error(`Supabase list ${c}: ${error.message}`);
    return (data || []).map((r) => r.data as Collections[C]);
  }

  async get<C extends Collection>(c: C, id: string) {
    await this.ensureSeeded();
    const { data, error } = await this.sb.from(c).select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase get ${c}: ${error.message}`);
    return (data?.data as Collections[C]) || undefined;
  }

  async put<C extends Collection>(c: C, row: Collections[C]) {
    const { error } = await this.sb.from(c).upsert({ id: idOf(c, row), data: row, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase put ${c}: ${error.message}`);
  }

  async reset(scope: "all" | "orders") {
    const tables = scope === "orders" ? ["orders", "returns"] : COLLECTIONS;
    for (const t of tables) {
      const { error } = await this.sb.from(t).delete().neq("id", "");
      if (error) throw new Error(`Supabase reset ${t}: ${error.message}`);
    }
    await this.seedAll();
    this.seeded = true;
  }
}

// ---------------------------------------------------------------------------
// Local JSON file backend (local development without Supabase)
// ---------------------------------------------------------------------------

type LocalDb = { [C in Collection]: Collections[C][] };

class FileBackend implements Backend {
  private file = process.env.VERCEL ? "/tmp/vee-db.json" : path.join(process.cwd(), "data", "runtime", "db.json");
  private cache: LocalDb | null = null;

  private load(): LocalDb {
    if (this.cache) return this.cache;
    const fresh = (): LocalDb => ({ orders: structuredClone(seed.orders), conversations: [], messages: [], tickets: [], callbacks: [], returns: [], events: [] });
    try {
      this.cache = fs.existsSync(this.file) ? { ...fresh(), ...JSON.parse(fs.readFileSync(this.file, "utf8")) } : fresh();
    } catch {
      this.cache = fresh();
    }
    return this.cache!;
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.cache, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
  }

  async list<C extends Collection>(c: C, where?: [string, string]) {
    const rows = this.load()[c] as Collections[C][];
    return where ? rows.filter((r) => String((r as unknown as Record<string, unknown>)[where[0]]) === where[1]) : [...rows];
  }

  async get<C extends Collection>(c: C, id: string) {
    return (this.load()[c] as Collections[C][]).find((r) => idOf(c, r) === id);
  }

  async put<C extends Collection>(c: C, row: Collections[C]) {
    const rows = this.load()[c] as Collections[C][];
    const i = rows.findIndex((r) => idOf(c, r) === idOf(c, row));
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    this.save();
  }

  async reset(scope: "all" | "orders") {
    const db = this.load();
    if (scope === "all") for (const c of COLLECTIONS) db[c] = [];
    db.orders = structuredClone(seed.orders);
    db.returns = scope === "orders" ? [] : db.returns;
    this.save();
  }
}

// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __veeStore?: Backend };

function backend(): Backend {
  if (g.__veeStore) return g.__veeStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  g.__veeStore = url && key
    ? new SupabaseBackend(createClient(url, key, { auth: { persistSession: false } }))
    : new FileBackend();
  return g.__veeStore;
}

export function storageKind(): "supabase" | "local-file" {
  return backend() instanceof SupabaseBackend ? "supabase" : "local-file";
}

export const db = {
  list: <C extends Collection>(c: C, where?: [string, string]) => backend().list(c, where),
  get: <C extends Collection>(c: C, id: string) => backend().get(c, id),
  put: <C extends Collection>(c: C, row: Collections[C]) => backend().put(c, row),
  reset: (scope: "all" | "orders" = "all") => backend().reset(scope),
};

export function readPolicies(): string {
  return fs.readFileSync(path.join(process.cwd(), "data", "seed", "policies.md"), "utf8");
}

export function readTestQuestionsCsv(): string {
  return fs.readFileSync(path.join(process.cwd(), "data", "seed", "test_questions.csv"), "utf8");
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}
