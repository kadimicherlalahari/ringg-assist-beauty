// Business rules derived from data/seed/policies.md. Keep policy numbers here
// (not scattered through the agent code) so they can be changed in one place.

import type { Order, Customer } from "./types";

/** Demo "today" from policies.md. All return windows / ETAs use this date. */
export const TODAY = "2026-11-02";

export const RULES = {
  freeShippingMinInr: 499,
  shippingFeeInr: 59,
  codMaxOrderInr: 3000,
  codFeeInr: 49,
  returnWindowDays: 7,
  damageReportHours: 48,
  refundApprovalThresholdInr: 1500,
  refundDays: "5–7 working days",
  pickupDays: "2–3 working days",
  supportHours: { days: "Monday–Saturday", open: 10, close: 19, label: "Monday–Saturday, 10 AM–7 PM IST" },
  deliveryDaysByTier: {
    Metro: "2–4 days",
    "Tier 1": "4–6 days",
    "Tier 2": "4–6 days",
    "Tier 3": "6–8 days",
    Rural: "6–8 days",
  } as Record<string, string>,
};

/** Statuses at which an order can still be cancelled (policy: "until packed"). */
const CANCELLABLE = ["Placed", "Pending COD confirmation"];

export function parseDate(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function addDays(d: string, days: number): string {
  const dt = parseDate(d);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return parseDate(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Adds working days (Mon–Sat) to a date. */
export function addWorkingDays(d: string, n: number): string {
  let cur = d;
  let added = 0;
  while (added < n) {
    cur = addDays(cur, 1);
    if (parseDate(cur).getUTCDay() !== 0) added++;
  }
  return cur;
}

export function normalizePhone(p: string | undefined | null): string {
  const digits = (p || "").replace(/\D/g, "");
  return digits.slice(-10);
}

export function phoneMatches(customer: Customer | undefined, phone: string | undefined): boolean {
  if (!customer || !phone) return false;
  const n = normalizePhone(phone);
  return n.length === 10 && normalizePhone(customer.phone) === n;
}

export function canCancel(order: Order): { allowed: boolean; reason: string } {
  if (order.status === "Cancelled") return { allowed: false, reason: "This order is already cancelled." };
  if (CANCELLABLE.includes(order.status)) return { allowed: true, reason: "Order has not been packed yet." };
  return {
    allowed: false,
    reason: `Order is already ${order.status.toLowerCase()}. Orders can only be cancelled until they are packed.`,
  };
}

export type ReturnReason = "not_suitable" | "changed_mind" | "damaged" | "wrong_item" | "wrong_shade" | "skin_reaction";

export interface ReturnCheck {
  eligible: boolean;
  window_ends?: string;
  days_since_delivery?: number;
  reason: string;
  requires_human: boolean;
  type: "Return" | "Exchange";
  conditions: string[];
}

export function checkReturn(order: Order, reason: ReturnReason): ReturnCheck {
  const base = { requires_human: false, type: "Return" as const, conditions: [] as string[] };
  if (order.status === "Return requested")
    return { ...base, eligible: false, reason: `A return is already in progress: ${order.status_note}` };
  if (!order.delivered_on || order.status !== "Delivered")
    return { ...base, eligible: false, reason: `Order is not delivered yet (status: ${order.status}). Returns open after delivery.` };

  const windowEnds = addDays(order.delivered_on, RULES.returnWindowDays);
  const since = daysBetween(order.delivered_on, TODAY);
  const inWindow = TODAY <= windowEnds;
  const isKit = order.items.some((i) => i.product_id === "VB-017" || i.product_id === "VB-018");
  const kitNote = isKit ? ["Kits can only be returned as a full kit."] : [];

  if (reason === "skin_reaction") {
    return {
      ...base,
      eligible: inWindow,
      window_ends: windowEnds,
      days_since_delivery: since,
      requires_human: true,
      reason: "Skin reactions are always handled by a human agent (photo needed).",
      conditions: ["Photo of the reaction and product needed", ...kitNote],
    };
  }
  if (reason === "damaged" || reason === "wrong_item") {
    const within48 = since * 24 <= RULES.damageReportHours;
    return {
      ...base,
      eligible: within48,
      window_ends: addDays(order.delivered_on, 2),
      days_since_delivery: since,
      requires_human: true,
      reason: within48
        ? "Damaged / wrong items must be reported within 48 hours with a photo; a human agent will verify."
        : "Damaged / wrong items must be reported within 48 hours of delivery. A human agent will review.",
      conditions: ["Photo needed"],
    };
  }
  if (!inWindow) {
    return {
      ...base,
      eligible: false,
      window_ends: windowEnds,
      days_since_delivery: since,
      reason: `The 7-day return window closed on ${formatDate(windowEnds)}.`,
    };
  }
  if (reason === "wrong_shade") {
    return {
      ...base,
      eligible: true,
      type: "Exchange",
      window_ends: windowEnds,
      days_since_delivery: since,
      reason: "Wrong shade of a tinted product: free exchange within 7 days if unused.",
      conditions: ["Product must be unused"],
    };
  }
  return {
    ...base,
    eligible: true,
    window_ends: windowEnds,
    days_since_delivery: since,
    reason: `Inside the 7-day return window (until ${formatDate(windowEnds)}).`,
    conditions: ["Product must be unused with the seal intact", ...kitNote],
  };
}

export function deliveryEstimate(cityTier: string | undefined): string {
  return RULES.deliveryDaysByTier[cityTier || ""] || "2–8 days depending on your city";
}

/** Current time in IST, but on the demo date (time of day is real). */
export function nowIST(): { day: number; hour: number; minute: number } {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  // Demo date is fixed; weekday comes from TODAY.
  return { day: parseDate(TODAY).getUTCDay(), hour: ist.getUTCHours(), minute: ist.getUTCMinutes() };
}

export function isSupportOpen(): boolean {
  const { day, hour } = nowIST();
  return day !== 0 && hour >= RULES.supportHours.open && hour < RULES.supportHours.close;
}

/** Human-response promise required by the brief. */
export function humanEta(): string {
  if (isSupportOpen()) {
    return "Our support team is online now (Mon–Sat, 10 AM–7 PM IST) and will reply shortly, today before 7 PM.";
  }
  const { day, hour } = nowIST();
  // Before opening on a working day → today by 12 noon; otherwise next working day.
  const sameDay = day !== 0 && hour < RULES.supportHours.open;
  const target = sameDay ? TODAY : addWorkingDays(TODAY, 1);
  return `Our team works Mon–Sat, 10 AM–7 PM IST. You'll hear from a human by 12 noon ${sameDay ? `today (${formatDate(target)})` : `on ${formatDate(target)}`}.`;
}

export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}
