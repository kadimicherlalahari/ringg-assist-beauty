// Cart pricing rules (shared by the cart page). Numbers come from policies.md / offers.json.

import type { Offer } from "./types";
import { RULES, TODAY } from "./business-rules";

export type PaymentMode = "Prepaid" | "COD";

export interface CouponResult {
  ok: boolean;
  discount: number;
  message: string;
}

export function applyCoupon(code: string, subtotal: number, offers: Offer[], payment: PaymentMode, hasKit: boolean): CouponResult {
  const offer = offers.find((o) => o.code.toUpperCase() === code.trim().toUpperCase());
  if (!offer) return { ok: false, discount: 0, message: "That code isn't valid." };
  if (offer.valid_till < TODAY) return { ok: false, discount: 0, message: `${offer.code} expired on ${offer.valid_till}.` };
  if (subtotal < offer.min_order_inr) return { ok: false, discount: 0, message: `${offer.code} needs a minimum order of ₹${offer.min_order_inr}.` };
  if (offer.prepaid_only && payment !== "Prepaid") return { ok: false, discount: 0, message: `${offer.code} works only with online payment (UPI / card).` };
  if (offer.code === "GLOWKIT" && !hasKit) return { ok: false, discount: 0, message: "GLOWKIT applies to kits only." };
  const pct = offer.description.match(/(\d+)%/);
  const raw = pct ? Math.round((subtotal * Number(pct[1])) / 100) : offer.max_discount_inr;
  return { ok: true, discount: Math.min(raw, offer.max_discount_inr), message: `${offer.code} applied: ${offer.description}.` };
}

export function shippingFor(subtotal: number): number {
  return subtotal === 0 || subtotal >= RULES.freeShippingMinInr ? 0 : RULES.shippingFeeInr;
}
