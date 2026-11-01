import { NextResponse } from "next/server";
import { db, seed } from "@/lib/db";
import { triggerOrderCall } from "@/lib/integrations/ringg";

export const dynamic = "force-dynamic";

/** Dashboard "Trigger Ringg Call" for COD confirmations and failed deliveries (NDR). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.get("orders", id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const customer = seed.customers.find((c) => c.customer_id === order.customer_id);
  // >>> Ringg voice API integration point (see lib/integrations/ringg.ts) <<<
  const result = await triggerOrderCall({
    order_id: order.order_id,
    phone: customer?.phone || "",
    purpose: order.status.includes("NDR") ? "ndr" : "cod_confirmation",
    language: customer?.preferred_language || "English",
    context: order.status_note,
  });
  const updated = { ...order, call_status: result.status, call_queued_at: new Date().toISOString() };
  await db.put("orders", updated);
  return NextResponse.json({ order: updated, result });
}
