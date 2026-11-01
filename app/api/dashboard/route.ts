import { NextResponse } from "next/server";
import { db, seed } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const [conversations, tickets, callbacks, orders, metrics] = await Promise.all([
    db.list("conversations"), db.list("tickets"), db.list("callbacks"), db.list("orders"), computeMetrics(),
  ]);
  // Test-runner conversations stay out of the agent views.
  const web = new Set(conversations.filter((c) => c.channel !== "test").map((c) => c.id));
  return NextResponse.json({
    tickets: tickets.filter((t) => web.has(t.conversation_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    callbacks: callbacks.filter((c) => web.has(c.conversation_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    codOrders: orders
      .filter((o) => o.payment_mode === "COD" && (o.status === "Pending COD confirmation" || o.status === "Delivery failed (NDR)"))
      .map((o) => ({ ...o, customer: seed.customers.find((c) => c.customer_id === o.customer_id) })),
    metrics,
  });
}
