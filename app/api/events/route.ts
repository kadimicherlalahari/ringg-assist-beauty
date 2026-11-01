import { NextResponse } from "next/server";
import { db, uid } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Records add-to-cart events (source "chat" counts toward the dashboard metric). */
export async function POST(req: Request) {
  const { type, productId, source, conversationId } = await req.json();
  if (type !== "add_to_cart" || !productId) return NextResponse.json({ error: "invalid event" }, { status: 400 });
  await db.put("events", { id: uid("EV"), type, product_id: productId, source: source === "chat" ? "chat" : "store", conversation_id: conversationId, created_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
