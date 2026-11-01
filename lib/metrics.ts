// Dashboard metrics, computed from stored conversations, messages, tickets and events.
// Test-runner conversations (channel "test") are excluded so demos aren't skewed.

import { db } from "./db";
import { INTENT_LABELS } from "./agent/nlu";

export async function computeMetrics() {
  const [conversations, messages, allTickets, events, callbacks] = await Promise.all([
    db.list("conversations"), db.list("messages"), db.list("tickets"), db.list("events"), db.list("callbacks"),
  ]);
  const convs = conversations.filter((c) => c.channel !== "test");
  const ids = new Set(convs.map((c) => c.id));
  const tickets = allTickets.filter((t) => ids.has(t.conversation_id));
  const handedOver = new Set(tickets.map((t) => t.conversation_id));
  const assistantMsgs = messages.filter((m) => m.role === "assistant" && ids.has(m.conversation_id) && m.reply_ms !== undefined);

  const byIntent: Record<string, number> = {};
  for (const c of convs) {
    // A conversation's intent = its first meaningful intent.
    const primary = c.intents.find((i) => !["greeting", "unknown"].includes(i)) || c.intents[0] || "unknown";
    const label = INTENT_LABELS[primary] || primary;
    byIntent[label] = (byIntent[label] || 0) + 1;
  }

  const total = convs.length;
  return {
    totalConversations: total,
    resolvedWithoutHumanPct: total ? Math.round(((total - handedOver.size) / total) * 100) : 0,
    humanHandovers: tickets.length,
    productsRecommended: events.filter((e) => e.type === "product_recommended" && e.conversation_id && ids.has(e.conversation_id)).length,
    addToCartsFromChat: events.filter((e) => e.type === "add_to_cart" && e.source === "chat").length,
    avgReplyMs: assistantMsgs.length ? Math.round(assistantMsgs.reduce((s, m) => s + (m.reply_ms || 0), 0) / assistantMsgs.length) : 0,
    callbacks: callbacks.filter((c) => ids.has(c.conversation_id)).length,
    byIntent: Object.entries(byIntent).sort((a, b) => b[1] - a[1]).map(([intent, count]) => ({ intent, count })),
  };
}

export type Metrics = Awaited<ReturnType<typeof computeMetrics>>;
