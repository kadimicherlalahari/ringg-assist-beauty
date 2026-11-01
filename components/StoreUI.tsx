"use client";

// Small client components shared across store pages.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./CartProvider";
import type { ProductCard } from "@/lib/types";

export function Header() {
  const { count } = useCart();
  const path = usePathname();
  const nav = [
    { href: "/products", label: "Shop all" },
    { href: "/products?area=face", label: "Skincare" },
    { href: "/products?area=hair", label: "Haircare" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="font-display text-xl font-semibold tracking-tight text-ink">Velora</span>
          <span className="text-xs uppercase tracking-[0.2em] text-clay">Botanicals</span>
        </Link>
        <nav className="hidden gap-5 text-sm text-muted sm:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`hover:text-ink ${path === n.href ? "text-ink" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("vee:open"))}
            className="hidden rounded-full border border-line px-3.5 py-1.5 text-sm text-ink hover:border-clay sm:block"
          >
            Ask Vee
          </button>
          <Link href="/cart" className="relative rounded-full bg-ink px-4 py-1.5 text-sm text-white hover:bg-clay-dark" aria-label={`Cart, ${count} items`}>
            Cart
            {count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-saffron px-1 text-[11px] font-semibold text-ink">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function AddToCartButton({
  product, size = "md", source = "store", conversationId, disabled,
}: {
  product: Pick<ProductCard, "product_id" | "name" | "price_inr" | "mrp_inr" | "category">;
  size?: "sm" | "md" | "lg";
  source?: "chat" | "store";
  conversationId?: string;
  disabled?: boolean;
}) {
  const { add } = useCart();
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        add(product, { source, conversationId });
      }}
      className={`rounded-full bg-clay font-medium text-white transition hover:bg-clay-dark disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted ${sizes[size]}`}
    >
      {disabled ? "Out of stock" : "Add to cart"}
    </button>
  );
}

export function AskVeeButton({ message, children, className = "" }: { message?: string; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={() => window.dispatchEvent(new CustomEvent("vee:open", { detail: { message } }))} className={className}>
      {children}
    </button>
  );
}
