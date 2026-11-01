import Link from "next/link";
import { getProduct, getProducts } from "@/lib/catalog";
import { ProductTile } from "@/components/ProductTile";
import { ProductImage } from "@/components/ProductImage";
import { AskVeeButton } from "@/components/StoreUI";

export const dynamic = "force-dynamic";

const FEATURED = ["VB-004", "VB-003", "VB-007", "VB-005", "VB-017", "VB-013"];
const CONCERNS = [
  { label: "Acne & marks", q: "concern=acne" },
  { label: "Dullness", q: "concern=dullness" },
  { label: "Pigmentation", q: "concern=pigmentation" },
  { label: "Dryness", q: "concern=dryness" },
  { label: "Sun protection", q: "concern=sun protection" },
  { label: "Hair fall", q: "concern=hair fall" },
];

export default function Home() {
  const featured = FEATURED.map((id) => getProduct(id)!).filter(Boolean);
  const hero = getProduct("VB-004")!;
  const count = getProducts().length;
  return (
    <div>
      <section className="bg-gradient-to-b from-blush via-cream to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-clay">Rooted in Indian botanicals</p>
            <h1 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-5xl">
              Skincare that knows <em className="text-clay">your</em> skin.
            </h1>
            <p className="mt-4 max-w-md text-muted">
              Kumkumadi, neem, rice water and ceramides, made gentle and effective. Not sure where to start? Vee, our
              assistant, will build your routine in a minute.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/products" className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-white hover:bg-clay-dark">
                Shop all {count} products
              </Link>
              <AskVeeButton message="Find products for my skin" className="rounded-full border border-clay px-6 py-3 text-sm font-medium text-clay-dark hover:bg-white">
                Find my routine with Vee
              </AskVeeButton>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="overflow-hidden rounded-[2.5rem] border border-line shadow-[0_30px_60px_-30px_rgba(160,80,40,0.45)]">
              <ProductImage id={hero.product_id} category={hero.category} name={hero.name} />
            </div>
            <Link href={hero.product_url} className="absolute -bottom-5 left-6 right-6 rounded-2xl border border-line bg-white px-4 py-3 shadow-md hover:border-clay">
              <p className="text-xs text-muted">Bestseller</p>
              <p className="font-display text-ink">{hero.name} · ₹{hero.price_inr}</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="flex flex-wrap gap-2">
          {CONCERNS.map((c) => (
            <Link key={c.label} href={`/products?${c.q}`} className="rounded-full border border-line bg-white px-4 py-2 text-sm text-ink hover:border-clay hover:text-clay-dark">
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-10">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl text-ink">Featured</h2>
          <Link href="/products" className="text-sm text-clay-dark hover:underline">View all →</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {featured.map((p) => <ProductTile key={p.product_id} p={p} />)}
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl gap-4 px-4 sm:grid-cols-4">
        {[
          ["Cruelty-free", "Every product. Vegan except our honey lip balm."],
          ["Free shipping", "On orders of ₹499 and above."],
          ["Cash on delivery", "Across India, up to ₹3,000."],
          ["7-day returns", "Unused products with seal intact."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-3xl bg-cream p-5">
            <p className="font-display text-lg text-ink">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
