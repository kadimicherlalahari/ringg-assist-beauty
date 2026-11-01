import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, getProducts, precautionsFor } from "@/lib/catalog";
import { ProductImage } from "@/components/ProductImage";
import { Price, ProductTile } from "@/components/ProductTile";
import { AddToCartButton, AskVeeButton } from "@/components/StoreUI";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getProduct(slug);
  if (!p) notFound();
  const related = getProducts()
    .filter((x) => x.product_id !== p.product_id && x.area === p.area && x.skin_types.some((s) => p.skin_types.includes(s)))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-muted"><Link href="/products" className="hover:text-ink">Shop</Link> / {p.category}</nav>
      <div className="mt-4 grid gap-10 md:grid-cols-2">
        <div className="overflow-hidden rounded-[2rem] border border-line">
          <ProductImage id={p.product_id} category={p.category} name={p.name} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-clay">{p.category} · {p.size}</p>
          <h1 className="font-display mt-2 text-3xl leading-tight text-ink sm:text-4xl">{p.name}</h1>
          <div className="mt-4"><Price price={p.price_inr} mrp={p.mrp_inr} large /></div>
          <p className="mt-1 text-xs text-muted">Inclusive of all taxes · {p.cod_available ? "COD available" : "Prepaid only"}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AddToCartButton product={p} size="lg" disabled={!p.in_stock} />
            <AskVeeButton message={`Is the ${p.name} right for my skin?`} className="rounded-full border border-line px-5 py-3 text-sm hover:border-clay">
              Ask Vee about this
            </AskVeeButton>
          </div>
          {!p.in_stock && <p className="mt-3 text-sm text-clay-dark">Currently out of stock. Ask Vee for an in-stock alternative.</p>}

          <dl className="mt-8 divide-y divide-line rounded-3xl border border-line">
            <Row label="Skin type">{p.skin_types.map((s) => <Tag key={s}>{s}</Tag>)}</Row>
            <Row label="Concerns">{p.concerns.map((s) => <Tag key={s}>{s}</Tag>)}</Row>
            <Row label="Key ingredients"><span className="text-sm text-ink">{p.key_ingredients.join(" · ")}</span></Row>
            {p.notes && <Row label="Good to know"><span className="text-sm capitalize text-ink">{p.notes}</span></Row>}
            <Row label="How to use"><span className="text-sm text-ink">{p.how_to_use}</span></Row>
          </dl>

          <div className="mt-5 rounded-3xl bg-blush/60 p-5">
            <p className="font-medium text-ink">Precautions</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80">
              {precautionsFor(p).map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl text-ink">Pairs well with</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r) => <ProductTile key={r.product_id} p={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 p-4 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">{children}</dd>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-cream px-2.5 py-1 text-xs capitalize text-ink">{children}</span>;
}
