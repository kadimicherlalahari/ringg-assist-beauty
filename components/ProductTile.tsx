import Link from "next/link";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { AddToCartButton } from "./StoreUI";

export function Price({ price, mrp, large }: { price: number; mrp: number; large?: boolean }) {
  const off = Math.round(((mrp - price) / mrp) * 100);
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-semibold text-ink ${large ? "text-2xl" : "text-base"}`}>₹{price.toLocaleString("en-IN")}</span>
      {mrp > price && (
        <>
          <span className="text-sm text-muted line-through">MRP ₹{mrp.toLocaleString("en-IN")}</span>
          <span className="text-xs font-medium text-sage">{off}% off</span>
        </>
      )}
    </div>
  );
}

export function ProductTile({ p }: { p: Product }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(120,70,40,0.25)]">
      <Link href={p.product_url} className="relative aspect-square overflow-hidden">
        <ProductImage id={p.product_id} category={p.category} name={p.name} className="transition duration-500 group-hover:scale-[1.03]" />
        {!p.in_stock && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs text-muted">Out of stock</span>}
        {p.category === "Kit" && <span className="absolute left-3 top-3 rounded-full bg-saffron px-2.5 py-1 text-xs font-medium text-ink">{p.notes}</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs uppercase tracking-wider text-muted">{p.category} · {p.size}</p>
        <Link href={p.product_url} className="font-display text-[17px] leading-snug text-ink hover:text-clay-dark">{p.name}</Link>
        <p className="line-clamp-1 text-xs text-muted">For {p.skin_types.join(", ")} · {p.concerns.join(", ")}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price price={p.price_inr} mrp={p.mrp_inr} />
          <AddToCartButton product={p} size="sm" disabled={!p.in_stock} />
        </div>
      </div>
    </div>
  );
}
