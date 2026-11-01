"use client";

import Link from "next/link";
import { useState } from "react";
import type { Offer } from "@/lib/types";
import { applyCoupon, shippingFor, type PaymentMode } from "@/lib/pricing";
import { RULES } from "@/lib/business-rules";
import { useCart } from "./CartProvider";
import { ProductImage } from "./ProductImage";

export function CartView({ offers }: { offers: Offer[] }) {
  const { items, subtotal, setQty, remove, clear } = useCart();
  const [payment, setPayment] = useState<PaymentMode>("Prepaid");
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ id: string; total: number } | null>(null);

  const hasKit = items.some((i) => i.category === "Kit");
  const coupon = applied ? applyCoupon(applied, subtotal, offers, payment, hasKit) : null;
  const discount = coupon?.ok ? coupon.discount : 0;
  const shipping = shippingFor(subtotal);
  const codFee = payment === "COD" && subtotal > 0 ? RULES.codFeeInr : 0;
  const total = Math.max(0, subtotal - discount + shipping + codFee);
  const codBlocked = payment === "COD" && total > RULES.codMaxOrderInr;
  const savings = items.reduce((s, i) => s + (i.mrp_inr - i.price_inr) * i.qty, 0) + discount;

  const onApply = () => {
    if (!code.trim()) return;
    const r = applyCoupon(code, subtotal, offers, payment, hasKit);
    setCouponMsg({ ok: r.ok, text: r.message });
    setApplied(r.ok ? code.trim().toUpperCase() : null);
  };

  const checkout = async () => {
    setPlacing(true);
    // Demo checkout: no payment gateway is called.
    // FUTURE INTEGRATION: create the order + payment session here (Razorpay / Shopify checkout).
    await new Promise((r) => setTimeout(r, 900));
    setPlaced({ id: `VB${Math.floor(2000 + Math.random() * 7000)}`, total });
    clear();
    setPlacing(false);
  };

  if (placed)
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sage/15 text-3xl text-sage">✓</div>
        <h1 className="font-display mt-5 text-3xl text-ink">Demo order placed</h1>
        <p className="mt-2 text-muted">
          Order <b className="text-ink">{placed.id}</b> for ₹{placed.total.toLocaleString("en-IN")} was simulated. No payment was taken.
          {payment === "COD" && " COD orders get a quick confirmation call from the Ringg voice agent before dispatch."}
        </p>
        <Link href="/products" className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm text-white hover:bg-clay-dark">Continue shopping</Link>
      </div>
    );

  if (!items.length)
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-3xl text-ink">Your cart is empty</h1>
        <p className="mt-2 text-muted">Browse the shop or ask Vee to recommend something for your skin.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/products" className="rounded-full bg-ink px-6 py-3 text-sm text-white hover:bg-clay-dark">Shop products</Link>
          <button onClick={() => window.dispatchEvent(new CustomEvent("vee:open", { detail: { message: "Find products for my skin" } }))} className="rounded-full border border-clay px-6 py-3 text-sm text-clay-dark">Ask Vee</button>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-4xl text-ink">Your cart</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="divide-y divide-line rounded-3xl border border-line">
          {items.map((i) => (
            <li key={i.product_id} className="flex gap-4 p-4">
              <Link href={`/products/${i.product_id.toLowerCase()}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl">
                <ProductImage id={i.product_id} category={i.category} name={i.name} />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/products/${i.product_id.toLowerCase()}`} className="font-display leading-snug text-ink hover:text-clay-dark">{i.name}</Link>
                <p className="text-sm text-muted">₹{i.price_inr} <span className="line-through">₹{i.mrp_inr}</span></p>
                <div className="mt-auto flex items-center gap-3 pt-2">
                  <div className="flex items-center rounded-full border border-line">
                    <button aria-label="Decrease quantity" onClick={() => setQty(i.product_id, i.qty - 1)} className="h-8 w-8 text-lg text-muted hover:text-ink">−</button>
                    <span className="w-6 text-center text-sm">{i.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => setQty(i.product_id, i.qty + 1)} className="h-8 w-8 text-lg text-muted hover:text-ink">+</button>
                  </div>
                  <button onClick={() => remove(i.product_id)} className="text-xs text-muted underline hover:text-clay-dark">Remove</button>
                </div>
              </div>
              <p className="font-medium text-ink">₹{(i.qty * i.price_inr).toLocaleString("en-IN")}</p>
            </li>
          ))}
        </ul>

        <aside className="h-fit space-y-5 rounded-3xl bg-cream p-6">
          <div>
            <p className="text-sm font-medium text-ink">Payment</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["Prepaid", "COD"] as PaymentMode[]).map((m) => (
                <button key={m} onClick={() => setPayment(m)} className={`rounded-2xl border px-3 py-2.5 text-sm ${payment === m ? "border-clay bg-white text-ink" : "border-line text-muted"}`}>
                  {m === "Prepaid" ? "UPI / Card" : "Cash on delivery"}
                </button>
              ))}
            </div>
            {payment === "COD" && <p className="mt-2 text-xs text-muted">₹49 COD fee. Pay online to save it and get 5% off with PREPAID5.</p>}
          </div>

          <div>
            <p className="text-sm font-medium text-ink">Coupon</p>
            <div className="mt-2 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onApply()} placeholder="WELCOME10" className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm uppercase outline-none focus:border-clay" />
              <button onClick={onApply} className="rounded-full bg-ink px-4 text-sm text-white">Apply</button>
            </div>
            {couponMsg && <p className={`mt-2 text-xs ${couponMsg.ok && coupon?.ok !== false ? "text-sage" : "text-clay-dark"}`}>{coupon && !coupon.ok ? coupon.message : couponMsg.text}</p>}
          </div>

          <dl className="space-y-2 border-t border-line pt-4 text-sm">
            <Line label="Subtotal" value={subtotal} />
            {discount > 0 && <Line label={`Coupon ${applied}`} value={-discount} />}
            <Line label="Shipping" value={shipping} free={shipping === 0} />
            {codFee > 0 && <Line label="COD fee" value={codFee} />}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-ink"><dt>Total</dt><dd>₹{total.toLocaleString("en-IN")}</dd></div>
            {savings > 0 && <p className="text-xs text-sage">You save ₹{savings.toLocaleString("en-IN")} on MRP</p>}
          </dl>
          {codBlocked && <p className="text-xs text-clay-dark">COD is available on orders up to ₹3,000. Please pay online.</p>}
          <button disabled={placing || codBlocked} onClick={checkout} className="w-full rounded-full bg-clay py-3.5 font-medium text-white hover:bg-clay-dark disabled:opacity-50">
            {placing ? "Placing demo order…" : "Checkout (demo)"}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value, free }: { label: string; value: number; free?: boolean }) {
  return (
    <div className="flex justify-between text-muted">
      <dt>{label}</dt>
      <dd className={value < 0 ? "text-sage" : "text-ink"}>{free ? "Free" : `${value < 0 ? "−" : ""}₹${Math.abs(value).toLocaleString("en-IN")}`}</dd>
    </div>
  );
}
