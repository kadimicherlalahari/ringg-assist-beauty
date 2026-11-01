// Read-only catalog helpers shared by server components and the agent.

import type { Product, ProductCard } from "./types";
import { seed } from "./db";

export function getProducts(): Product[] {
  return seed.products;
}

export function getProduct(idOrSlug: string): Product | undefined {
  const id = idOrSlug.toUpperCase();
  return getProducts().find((p) => p.product_id === id);
}

export function slugOf(p: Pick<Product, "product_id">): string {
  return p.product_id.toLowerCase();
}

export function toCard(p: Product, reason?: string): ProductCard {
  return {
    product_id: p.product_id,
    name: p.name,
    price_inr: p.price_inr,
    mrp_inr: p.mrp_inr,
    category: p.category,
    in_stock: p.in_stock,
    product_url: p.product_url,
    reason,
  };
}

/** Serums and treatments always get a patch-test reminder (policies.md). */
export function needsPatchTest(p: Product): boolean {
  return ["Serum", "Treatment", "Kit"].includes(p.category);
}

/** Products the FAQ says to avoid during pregnancy / breastfeeding. */
export const PREGNANCY_AVOID = ["VB-009", "VB-010"];

/** Precautions shown on PDPs: data from avoid_if plus the policy safety rules. */
export function precautionsFor(p: Product): string[] {
  const list: string[] = [];
  if (p.avoid_if) list.push(p.avoid_if);
  if (needsPatchTest(p)) list.push("Do a 24-hour patch test behind the ear or on the inner arm before first use.");
  if (PREGNANCY_AVOID.includes(p.product_id) && !/pregnan/i.test(p.avoid_if))
    list.push("Pregnant or breastfeeding: avoid, and check with your doctor.");
  if (p.area === "face" && ["Serum", "Treatment"].includes(p.category))
    list.push("Under 16: please consult a dermatologist before using actives.");
  list.push("Stop use and rinse if you feel burning, rash or swelling. See a doctor if severe.");
  return list;
}

/** Keyword aliases customers use for specific products. Order matters: most specific first. */
const ALIASES: [RegExp, string][] = [
  [/acne (control )?kit/i, "VB-017"],
  [/glow (routine )?kit/i, "VB-018"],
  [/tinted/i, "VB-008"],
  [/vit(amin)?\s*-?c|kumkumadi/i, "VB-004"],
  [/niacinamide/i, "VB-003"],
  [/retinol/i, "VB-010"],
  [/spot gel|salicylic/i, "VB-009"],
  [/ceramide|barrier/i, "VB-005"],
  [/gel moisturi[sz]er|aloe|green tea/i, "VB-006"],
  [/sunscreen|spf|sun ?screen/i, "VB-007"],
  [/rice water|cleanser/i, "VB-001"],
  [/face ?wash|neem|tea tree/i, "VB-002"],
  [/lip/i, "VB-011"],
  [/under.?eye|eye cream|caffeine/i, "VB-012"],
  [/hair oil|onion|bhringraj/i, "VB-013"],
  [/shampoo|rosemary/i, "VB-014"],
  [/conditioner|argan/i, "VB-015"],
  [/body lotion|ubtan/i, "VB-016"],
];

export function findProductsMentioned(text: string): Product[] {
  const found: string[] = [];
  for (const [re, id] of ALIASES) if (re.test(text) && !found.includes(id)) found.push(id);
  return found.map((id) => getProduct(id)!).filter(Boolean);
}

export interface SearchParams {
  query?: string;
  skin_type?: string;
  concerns?: string[];
  area?: string;
  category?: string;
  max_price_inr?: number;
  pregnancy_safe?: boolean;
  include_out_of_stock?: boolean;
}

/** Simple scored search over products.json used by the search_products tool. */
export function searchProducts(params: SearchParams): (Product & { score: number })[] {
  const q = (params.query || "").toLowerCase();
  const concerns = (params.concerns || []).map((c) => c.toLowerCase());
  const skin = (params.skin_type || "").toLowerCase();

  return getProducts()
    .map((p) => {
      let score = 0;
      const hay = [p.name, p.category, p.notes, ...p.concerns, ...p.key_ingredients, ...p.skin_types].join(" ").toLowerCase();
      if (params.area && p.area !== params.area.toLowerCase()) score -= 100;
      if (params.category && p.category.toLowerCase() !== params.category.toLowerCase()) score -= 50;
      if (skin) {
        if (p.skin_types.some((s) => s.toLowerCase() === skin || s.toLowerCase().includes(skin))) score += 4;
        else if (p.skin_types.some((s) => s === "all" || s === "all hair")) score += 2;
        else score -= 5;
      }
      for (const c of concerns) {
        if (p.concerns.some((pc) => pc.toLowerCase() === c)) score += 6;
        else if (p.concerns.some((pc) => pc.toLowerCase().includes(c) || c.includes(pc.toLowerCase()))) score += 4;
        else if (hay.includes(c)) score += 1;
      }
      if (q) for (const word of q.split(/\s+/).filter((w) => w.length > 2)) if (hay.includes(word)) score += 1;
      if (params.max_price_inr && p.price_inr > params.max_price_inr) score -= 3;
      if (params.pregnancy_safe && PREGNANCY_AVOID.includes(p.product_id)) score -= 100;
      if (!p.in_stock && !params.include_out_of_stock) score -= 8;
      return { ...p, score };
    })
    .filter((p) => p.score > 0 || (!skin && !concerns.length && !q))
    .sort((a, b) => b.score - a.score || a.price_inr - b.price_inr);
}
