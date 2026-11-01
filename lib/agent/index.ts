// Chat orchestrator: conversation persistence, engine selection, escalation
// guardrails and analytics. API routes call handleChat().

import type { ChatMessage, Conversation } from "../types";
import { db, uid } from "../db";
import { getProduct } from "../catalog";
import { newTurn, createTicket, type TurnContext } from "./tools";
import { classifyIntent, detectLanguage, HANDOVER_INTENTS } from "./nlu";
import { geminiEnabled, runGemini } from "./gemini";
import { runOffline } from "./offline";

export interface ChatRequest {
  conversationId?: string;
  message: string;
  productId?: string;
  page?: string;
  channel?: "web" | "test";
}

export interface ChatResponse {
  conversationId: string;
  message: ChatMessage;
  handover: boolean;
  awaiting?: "phone" | "confirmation";
  engine: string;
}

export async function getOrCreateConversation(id: string | undefined, channel: "web" | "test" = "web"): Promise<Conversation> {
  const existing = id ? await db.get("conversations", id) : undefined;
  if (existing) return existing;
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: uid("CONV"), created_at: now, updated_at: now, channel, language: "en", intents: [],
    verified_orders: [], handed_over: false, state: {},
  };
  await db.put("conversations", conv);
  return conv;
}

export async function saveConversation(conv: Conversation) {
  conv.updated_at = new Date().toISOString();
  await db.put("conversations", conv);
}

export async function addMessage(m: Omit<ChatMessage, "id" | "created_at">): Promise<ChatMessage> {
  const msg: ChatMessage = { ...m, id: uid("MSG"), created_at: new Date().toISOString() };
  await db.put("messages", msg);
  return msg;
}

export async function handleChat(req: ChatRequest): Promise<ChatResponse> {
  const started = Date.now();
  const text = req.message.trim().slice(0, 2000);
  const conv = await getOrCreateConversation(req.conversationId, req.channel);
  const intent = classifyIntent(text);
  conv.intents.push(intent);
  conv.language = detectLanguage(text) || conv.language;
  if (req.productId) conv.current_product_id = req.productId.toUpperCase();
  await addMessage({ conversation_id: conv.id, role: "user", content: text, intent });

  const ctx = newTurn(conv);
  let reply: string;
  let engine = "offline";

  if (geminiEnabled()) {
    try {
      reply = await runGemini(ctx, text, contextLine(req));
      engine = "gemini";
    } catch (err) {
      console.error("[vee] Gemini call failed, using offline engine:", (err as Error).message);
      Object.assign(ctx, newTurn(conv));
      reply = await runOffline(ctx, text, conv.current_product_id);
      engine = "offline-fallback";
    }
  } else {
    reply = await runOffline(ctx, text, conv.current_product_id);
  }

  await applyGuardrails(ctx, text, intent);

  const message = await addMessage({
    conversation_id: conv.id,
    role: "assistant",
    content: reply,
    cards: ctx.cards.length ? ctx.cards : undefined,
    actions: ctx.actions.length ? ctx.actions : undefined,
    tools_used: ctx.toolsUsed,
    reply_ms: Date.now() - started,
    intent,
    engine,
  });
  await saveConversation(conv);

  return { conversationId: conv.id, message, handover: ctx.handover, awaiting: ctx.awaiting, engine };
}

/** Product/page context prepended to the user turn for Gemini. */
function contextLine(req: ChatRequest): string {
  const p = req.productId ? getProduct(req.productId) : undefined;
  const bits = [];
  if (p) bits.push(`customer is viewing product ${p.product_id} "${p.name}" (${p.category}, ₹${p.price_inr})`);
  if (req.page) bits.push(`page: ${req.page}`);
  return bits.length ? `[Context: ${bits.join("; ")}]` : "";
}

/**
 * Server-side safety net: the brief's mandatory escalations must create a ticket
 * even if the model forgets to call handover_to_human.
 */
async function applyGuardrails(ctx: TurnContext, text: string, intent: string) {
  const rule = HANDOVER_INTENTS[intent];
  if (rule && !ctx.handover) {
    if (!ctx.toolsUsed.includes("handover_to_human")) ctx.toolsUsed.push("handover_to_human");
    await createTicket(ctx, {
      reason: rule.reason,
      summary: `${rule.label} (auto-escalated). Customer said: "${text.slice(0, 200)}"`,
      order_id: text.toUpperCase().match(/VB\d{4}/)?.[0],
    });
  }
}
