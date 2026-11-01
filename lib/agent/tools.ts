// Vee's tools. The same executors are used by the Gemini engine (via function calling)
// and by the offline demo engine, so business behaviour is identical in both.

import type { ChatAction, Conversation, Order, Priority, ProductCard, Ticket, Callback } from "../types";
import { db, seed, readPolicies, uid } from "../db";
import { getProduct, searchProducts, toCard, PREGNANCY_AVOID } from "../catalog";
import {
  TODAY, RULES, addWorkingDays, canCancel, checkReturn, deliveryEstimate, formatDate, humanEta,
  phoneMatches, type ReturnReason,
} from "../business-rules";
import { requestCallback as ringgRequestCallback } from "../integrations/ringg";

/** Per-turn accumulator: what the UI should render and what happened. */
export interface TurnContext {
  conversation: Conversation;
  cards: ProductCard[];
  actions: ChatAction[];
  toolsUsed: string[];
  handover: boolean;
  /** What the assistant is waiting for from the customer (used by the /test runner). */
  awaiting?: "phone" | "confirmation";
}

export function newTurn(conversation: Conversation): TurnContext {
  return { conversation, cards: [], actions: [], toolsUsed: [], handover: false };
}

// ---------------------------------------------------------------------------
// Tool schemas (JSON Schema; passed to Gemini as parametersJsonSchema)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_products",
    description:
      "Search the Velora Botanicals catalogue. Use for recommendations, product questions (ingredients, suitability, usage), stock checks and routines. Returns full product data including price, MRP, skin types, concerns, key ingredients, how to use, avoid_if and in_stock. Never describe a product without calling this first.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text keywords, e.g. 'vitamin c serum' or 'tinted sunscreen'." },
        product_ids: { type: "array", items: { type: "string" }, description: "Fetch specific products by ID, e.g. ['VB-004']." },
        skin_type: { type: "string", description: "oily, dry, combination, normal, sensitive, acne-prone, or hair types like 'dry hair'." },
        concerns: { type: "array", items: { type: "string" }, description: "e.g. ['acne marks','dullness','hair fall']" },
        area: { type: "string", enum: ["face", "hair", "body", "lips", "eyes"] },
        max_price_inr: { type: "number", description: "Customer's budget per product in rupees." },
        pregnancy_safe: { type: "boolean", description: "True if the customer is pregnant or breastfeeding." },
      },
    },
  },
  {
    name: "show_product_cards",
    description:
      "Display 1–3 recommended products as shoppable cards (with Add to Cart) inside the chat. Call after search_products whenever you recommend specific products.",
    input_schema: {
      type: "object",
      properties: {
        product_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
        reasons: { type: "array", items: { type: "string" }, description: "One short reason per product, same order." },
      },
      required: ["product_ids"],
    },
  },
  {
    name: "faq",
    description: "Look up the brand FAQ: cruelty-free/vegan, pregnancy safety, patch tests, combining actives, results timeline, shelf life, COD, international shipping.",
    input_schema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
  },
  {
    name: "policy",
    description: "Look up store policy: shipping, delivery times by city, COD, failed delivery (NDR), cancellations, returns, refunds, skin safety rules, support hours. Pass the customer's city to get a delivery estimate.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: ["shipping", "delivery_time", "cod", "ndr", "cancellations", "returns", "refunds", "skin_safety", "support_hours"] },
        city: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    name: "offers",
    description: "List coupon codes with validity relative to today, or check a specific code (e.g. why it isn't working).",
    input_schema: { type: "object", properties: { code: { type: "string" } } },
  },
  {
    name: "get_order_status",
    description:
      "Get an order's status, courier, expected delivery, refund/NDR notes. Requires the order ID AND the phone number registered on the order. If the customer has not given their phone number, ask for it first; do not guess.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" }, phone: { type: "string" } },
      required: ["order_id"],
    },
  },
  {
    name: "cancel_order",
    description: "Cancel an order. Only allowed until the order is packed (status Placed / Pending COD confirmation). Requires order ID and registered phone.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string" }, phone: { type: "string" } },
      required: ["order_id"],
    },
  },
  {
    name: "create_return",
    description:
      "Check eligibility and create a return / exchange request. Requires order ID, registered phone and a reason. For not_suitable / changed_mind the product must be unused with seal intact. Skin reactions and damaged/wrong items are handed to a human automatically.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string" },
        phone: { type: "string" },
        reason: { type: "string", enum: ["not_suitable", "changed_mind", "damaged", "wrong_item", "wrong_shade", "skin_reaction"] },
        product_unused: { type: "boolean", description: "Customer confirmed the product is unused and the seal is intact." },
        details: { type: "string" },
      },
      required: ["order_id", "reason"],
    },
  },
  {
    name: "handover_to_human",
    description:
      "Create a support ticket and hand the conversation to a human agent. REQUIRED for: human request, angry/repeated complaints, any skin reaction/allergy/burning (priority URGENT), damaged or incorrect order, payment issues, refunds above ₹1,500, address changes, under-16 safety questions, or when you cannot resolve the issue after two attempts.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["human_request", "angry_customer", "skin_reaction", "damaged_or_wrong_item", "payment_issue", "refund_over_limit", "address_change", "minor_safety", "unresolved", "other"],
        },
        summary: { type: "string", description: "2–3 sentence summary for the human agent." },
        order_id: { type: "string" },
      },
      required: ["reason", "summary"],
    },
  },
  {
    name: "request_callback",
    description:
      "Arrange a phone callback from the Ringg voice agent. If the customer hasn't shared a phone number, call this without phone and the chat will show a phone-number form.",
    input_schema: {
      type: "object",
      properties: { phone: { type: "string" }, summary: { type: "string", description: "Short summary of the conversation so far." } },
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyOrder(ctx: TurnContext, orderIdRaw: string, phone?: string) {
  const order_id = (orderIdRaw || "").toUpperCase().replace(/\s/g, "");
  const order = await db.get("orders", order_id);
  if (!order) return { error: `No order found with ID ${order_id}. Order IDs look like VB1041.` } as const;
  const customer = seed.customers.find((c) => c.customer_id === order.customer_id);
  const conv = ctx.conversation;
  if (conv.verified_orders.includes(order_id)) return { order, customer } as const;
  if (!phone) {
    ctx.awaiting = "phone";
    return { verification_required: true, message: "Ask the customer for the phone number registered on this order." } as const;
  }
  if (!phoneMatches(customer, phone))
    return { verification_failed: true, message: "The phone number does not match this order. Ask the customer to re-check it." } as const;
  conv.verified_orders.push(order_id);
  conv.customer_id = customer!.customer_id;
  conv.phone = customer!.phone;
  return { order, customer } as const;
}

function orderSummary(o: Order) {
  return {
    order_id: o.order_id,
    status: o.status,
    status_note: o.status_note,
    order_date: o.order_date,
    payment_mode: o.payment_mode,
    items: o.items.map((i) => `${i.name} x${i.qty} (₹${i.price_inr})`),
    total_inr: o.total_inr,
    courier: o.courier,
    awb: o.awb,
    expected_delivery: o.expected_delivery,
    delivered_on: o.delivered_on,
  };
}

function policySection(topic: string): string {
  const md = readPolicies();
  const heading: Record<string, string> = {
    shipping: "Shipping", delivery_time: "Shipping", cod: "Cash on delivery", ndr: "Failed delivery",
    cancellations: "Cancellations", returns: "Returns", refunds: "Refunds", skin_safety: "Skin safety", support_hours: "Support hours",
  };
  const h = heading[topic] || topic;
  const parts = md.split(/\n## /);
  const found = parts.find((p) => p.toLowerCase().startsWith(h.toLowerCase()));
  return found ? `## ${found.trim()}` : md;
}

const KNOWN_CITY_TIERS: Record<string, string> = {
  bengaluru: "Metro", bangalore: "Metro", mumbai: "Metro", delhi: "Metro", "new delhi": "Metro", chennai: "Metro",
  hyderabad: "Metro", kolkata: "Metro", pune: "Tier 1", ahmedabad: "Tier 1", jaipur: "Tier 2", lucknow: "Tier 2",
  indore: "Tier 2", kochi: "Tier 2", bhopal: "Tier 2", surat: "Tier 2", gorakhpur: "Tier 3",
};

export function cityTier(city?: string): string | undefined {
  if (!city) return undefined;
  const c = city.toLowerCase().trim();
  const fromCustomers = seed.customers.find((x) => x.city.toLowerCase() === c);
  return fromCustomers?.city_tier || KNOWN_CITY_TIERS[c];
}

export async function createTicket(
  ctx: TurnContext,
  t: { reason: string; summary: string; priority?: Priority; order_id?: string },
): Promise<Ticket> {
  const conv = ctx.conversation;
  const existing = (await db.list("tickets", ["conversation_id", conv.id])).find((x) => x.status === "Open" && x.reason === t.reason);
  const priority: Priority =
    t.priority || (t.reason === "skin_reaction" ? "URGENT" : ["angry_customer", "payment_issue", "damaged_or_wrong_item"].includes(t.reason) ? "High" : "Normal");
  let ticket: Ticket;
  if (existing) {
    ticket = existing;
  } else {
    const order = t.order_id ? await db.get("orders", t.order_id.toUpperCase()) : undefined;
    const customer = seed.customers.find((c) => c.customer_id === (order?.customer_id || conv.customer_id));
    ticket = {
      id: uid("TKT"),
      conversation_id: conv.id,
      created_at: new Date().toISOString(),
      status: "Open",
      priority,
      reason: t.reason,
      summary: t.summary,
      order_id: order?.order_id || t.order_id?.toUpperCase(),
      customer_id: customer?.customer_id,
      customer_name: customer?.name,
      phone: customer?.phone || conv.phone,
      eta: humanEta(),
    };
    await db.put("tickets", ticket);
  }
  conv.handed_over = true;
  ctx.handover = true;
  if (!ctx.actions.some((a) => a.type === "ticket" && a.ticket_id === ticket.id))
    ctx.actions.push({ type: "ticket", ticket_id: ticket.id, priority: ticket.priority, eta: ticket.eta });
  return ticket;
}

export async function summarizeConversation(conv: Conversation): Promise<string> {
  const msgs = await db.list("messages", ["conversation_id", conv.id]);
  const userMsgs = msgs.filter((m) => m.role === "user").map((m) => m.content);
  if (!userMsgs.length) return "Customer requested a callback before starting a chat.";
  const intents = [...new Set(conv?.intents || [])].filter((i) => i !== "greeting").map((i) => i.replace(/_/g, " "));
  const orders = [...new Set(userMsgs.join(" ").toUpperCase().match(/VB\d{4}/g) || [])];
  const recommended = [...new Set(msgs.flatMap((m) => m.cards || []).map((c) => c.name))];
  const parts = [
    intents.length ? `Topics: ${intents.join(", ")}.` : "",
    orders.length ? `Orders: ${orders.join(", ")}.` : "",
    recommended.length ? `Recommended: ${recommended.slice(0, 3).join("; ")}.` : "",
    `Last message: "${userMsgs[userMsgs.length - 1].slice(0, 140)}"`,
  ];
  return parts.filter(Boolean).join(" ");
}

export async function saveCallback(ctx: TurnContext, phone: string, summary?: string): Promise<Callback> {
  const conv = ctx.conversation;
  const finalSummary = summary?.trim() || (await summarizeConversation(conv));
  const customer = seed.customers.find((c) => phoneMatches(c, phone));
  // >>> Ringg voice API integration point (see lib/integrations/ringg.ts) <<<
  const result = await ringgRequestCallback({ phone, summary: finalSummary, language: conv.language, customer_name: customer?.name });
  const cb: Callback = {
    id: uid("CB"),
    conversation_id: conv.id,
    created_at: new Date().toISOString(),
    phone,
    summary: finalSummary,
    status: result.status,
    customer_name: customer?.name,
    provider_ref: result.provider_ref,
  };
  await db.put("callbacks", cb);
  ctx.actions.push({ type: "callback_confirmed", callback_id: cb.id, phone });
  return cb;
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function executeTool(name: string, input: Input, ctx: TurnContext): Promise<unknown> {
  if (!ctx.toolsUsed.includes(name)) ctx.toolsUsed.push(name);

  switch (name) {
    case "search_products": {
      const ids = (input.product_ids as string[] | undefined) || [];
      const results = ids.length
        ? ids.map((id) => getProduct(id)).filter(Boolean).map((p) => ({ ...p!, score: 0 }))
        : searchProducts({
            query: str(input.query),
            skin_type: str(input.skin_type),
            concerns: input.concerns as string[] | undefined,
            area: str(input.area),
            max_price_inr: input.max_price_inr as number | undefined,
            pregnancy_safe: input.pregnancy_safe as boolean | undefined,
            include_out_of_stock: true,
          }).slice(0, 6);
      return {
        results: results.map(({ score: _s, image_url: _i, ...p }) => ({
          ...p,
          pregnancy_caution: PREGNANCY_AVOID.includes(p.product_id) ? "Avoid if pregnant or breastfeeding" : undefined,
        })),
        note: results.length ? undefined : "No matching products. Suggest the closest alternatives or ask a clarifying question.",
      };
    }

    case "show_product_cards": {
      const ids = ((input.product_ids as string[]) || []).slice(0, 3);
      const reasons = (input.reasons as string[]) || [];
      const shown: string[] = [];
      ids.forEach((id, i) => {
        const p = getProduct(id);
        if (p && !ctx.cards.some((c) => c.product_id === p.product_id)) {
          ctx.cards.push(toCard(p, reasons[i]));
          shown.push(p.product_id);
        }
      });
      for (const pid of shown)
        await db.put("events", { id: uid("EV"), type: "product_recommended", product_id: pid, conversation_id: ctx.conversation.id, source: "chat", created_at: new Date().toISOString() });
      return { shown, note: "Cards with Add to Cart buttons are now visible to the customer." };
    }

    case "faq":
      return { faqs: seed.faqs };

    case "policy": {
      const topic = str(input.topic) || "shipping";
      const city = str(input.city);
      const tier = cityTier(city);
      return {
        policy: policySection(topic),
        today: TODAY,
        ...(city ? { city, city_tier: tier || "unknown", delivery_estimate: tier ? deliveryEstimate(tier) : "2–8 days depending on location (Metro 2–4, Tier 1/2 4–6, Tier 3/rural 6–8)" } : {}),
      };
    }

    case "offers": {
      const all = seed.offers.map((o) => ({ ...o, status: o.valid_till < TODAY ? `EXPIRED on ${formatDate(o.valid_till)}` : `valid till ${formatDate(o.valid_till)}` }));
      const code = str(input.code)?.toUpperCase();
      return { today: TODAY, checked: code ? all.find((o) => o.code === code) || { code, status: "not a valid code" } : undefined, offers: all };
    }

    case "get_order_status": {
      const v = await verifyOrder(ctx, str(input.order_id) || "", str(input.phone));
      if (!("order" in v)) return v;
      const o = v.order!;
      ctx.actions.push({ type: "order", order_id: o.order_id, status: o.call_status ? `${o.status} · ${o.call_status}` : o.status, expected_delivery: o.expected_delivery, note: o.status_note });
      return { order: orderSummary(o), customer_city: v.customer?.city, today: TODAY };
    }

    case "cancel_order": {
      const v = await verifyOrder(ctx, str(input.order_id) || "", str(input.phone));
      if (!("order" in v)) return v;
      const o = v.order!;
      const check = canCancel(o);
      if (!check.allowed) return { cancelled: false, status: o.status, reason: check.reason, status_note: o.status_note };
      await db.put("orders", { ...o, status: "Cancelled", status_note: `Cancelled by customer via Vee chat on ${formatDate(TODAY)}` });
      ctx.actions.push({ type: "order", order_id: o.order_id, status: "Cancelled", expected_delivery: null, note: "Cancelled via chat" });
      return {
        cancelled: true,
        order_id: o.order_id,
        refund: o.payment_mode === "Prepaid" ? `₹${o.total_inr} refund to original payment method in ${RULES.refundDays}` : "COD order: nothing was charged, no refund needed",
      };
    }

    case "create_return": {
      const v = await verifyOrder(ctx, str(input.order_id) || "", str(input.phone));
      if (!("order" in v)) return v;
      const o = v.order!;
      const reason = (str(input.reason) || "not_suitable") as ReturnReason;
      const check = checkReturn(o, reason);
      if (check.requires_human) {
        const t = await createTicket(ctx, {
          reason: reason === "skin_reaction" ? "skin_reaction" : "damaged_or_wrong_item",
          summary: `Return request for ${o.order_id} (${reason.replace("_", " ")}). ${str(input.details) || ""}`.trim(),
          order_id: o.order_id,
        });
        return { created: false, handed_to_human: true, ticket_id: t.id, priority: t.priority, eta: t.eta, policy: check.reason, conditions: check.conditions };
      }
      if (!check.eligible) return { created: false, eligible: false, reason: check.reason, offer_human: "If the customer insists, offer to connect them to a human." };
      if (check.type === "Return" && input.product_unused !== true) {
        ctx.awaiting = "confirmation";
        return { created: false, eligible: true, needs_confirmation: "Ask the customer to confirm the product is unused with the seal intact.", window_ends: check.window_ends, conditions: check.conditions };
      }

      const refund = check.type === "Exchange" ? 0 : o.total_inr - o.shipping_inr - o.cod_fee_inr;
      const pickup = `${formatDate(addWorkingDays(TODAY, 2))}–${formatDate(addWorkingDays(TODAY, 3))}`;
      const needsApproval = refund > RULES.refundApprovalThresholdInr;
      const ret = { id: uid("RET"), order_id: o.order_id, conversation_id: ctx.conversation.id, created_at: new Date().toISOString(), reason, type: check.type, refund_inr: refund, pickup_window: pickup, needs_approval: needsApproval };
      await db.put("returns", ret);
      await db.put("orders", { ...o, status: "Return requested", status_note: `${check.type} requested via Vee chat; pickup ${pickup}; reason: ${reason.replace("_", " ")}` });
      let approval: Ticket | undefined;
      if (needsApproval)
        approval = await createTicket(ctx, { reason: "refund_over_limit", summary: `Refund of ₹${refund} for ${o.order_id} exceeds ₹1,500 and needs human approval.`, order_id: o.order_id });
      ctx.actions.push({ type: "order", order_id: o.order_id, status: "Return requested", expected_delivery: null, note: `Pickup ${pickup}` });
      return {
        created: true,
        return_id: ret.id,
        type: check.type,
        pickup_window: pickup,
        refund: check.type === "Exchange" ? "Free exchange, no refund" : `₹${refund} to ${o.payment_mode === "Prepaid" ? "original payment method" : "your UPI/bank account"} within ${RULES.refundDays} after the return reaches our warehouse`,
        needs_human_approval: needsApproval,
        approval_ticket: approval?.id,
      };
    }

    case "handover_to_human": {
      const reason = str(input.reason) || "other";
      const t = await createTicket(ctx, { reason, summary: str(input.summary) || "Customer needs help from a human agent.", order_id: str(input.order_id) });
      return { ticket_id: t.id, priority: t.priority, human_response_eta: t.eta };
    }

    case "request_callback": {
      const phone = str(input.phone);
      if (!phone || phone.replace(/\D/g, "").length < 10) {
        if (!ctx.actions.some((a) => a.type === "callback_form")) ctx.actions.push({ type: "callback_form" });
        return { phone_needed: true, message: "A phone-number form is now shown in the chat. Ask the customer to enter their number there." };
      }
      const cb = await saveCallback(ctx, phone, str(input.summary));
      return { callback_id: cb.id, status: cb.status, message: "Callback saved. The Ringg voice agent will call shortly." };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}
