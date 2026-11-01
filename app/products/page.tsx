import Link from "next/link";
import { getProducts } from "@/lib/catalog";
import { ProductTile } from "@/components/ProductTile";

export const dynamic = "force-dynamic";

const AREAS = ["face", "hair", "body", "lips", "eyes"];
const SKIN = ["oily", "dry", "combination", "normal", "sensitive", "acne-prone"];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const all = getProducts();
  const categories = [...new Set(all.map((p) => p.category))];
  const list = all.filter((p) =>
    (!sp.area || p.area === sp.area) &&
    (!sp.category || p.category === sp.category) &&
    (!sp.skin || p.skin_types.includes(sp.skin) || p.skin_types.includes("all")) &&
    (!sp.concern || p.concerns.some((c) => c.includes(sp.concern!.toLowerCase()))),
  );
  const link = (key: string, val?: string) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    if (!val || sp[key] === val) next.delete(key); else next.set(key, val);
    const s = next.toString();
    return `/products${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs capitalize transition ${active ? "border-clay bg-clay text-white" : "border-line bg-white text-ink hover:border-clay"}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-4xl text-ink">Shop</h1>
      <p className="mt-1 text-muted">{list.length} of {all.length} products{sp.concern ? ` for “${sp.concern}”` : ""}</p>

      <div className="mt-6 space-y-3 rounded-3xl bg-cream p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-muted">Area</span>
          {AREAS.map((a) => <Link key={a} href={link("area", a)} className={chip(sp.area === a)}>{a}</Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-muted">Skin type</span>
          {SKIN.map((s) => <Link key={s} href={link("skin", s)} className={chip(sp.skin === s)}>{s}</Link>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs text-muted">Category</span>
          {categories.map((c) => <Link key={c} href={link("category", c)} className={chip(sp.category === c)}>{c}</Link>)}
        </div>
        {Object.values(sp).some(Boolean) && <Link href="/products" className="inline-block text-xs text-clay-dark underline">Clear filters</Link>}
      </div>

      {list.length ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => <ProductTile key={p.product_id} p={p} />)}
        </div>
      ) : (
        <div className="mt-10 rounded-3xl border border-dashed border-line p-10 text-center text-muted">
          No products match these filters. <Link href="/products" className="text-clay-dark underline">Clear filters</Link>
        </div>
      )}
    </div>
  );
}
