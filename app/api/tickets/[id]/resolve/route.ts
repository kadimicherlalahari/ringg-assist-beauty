import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await db.get("tickets", id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  const updated = { ...ticket, status: "Resolved" as const, resolved_at: new Date().toISOString() };
  await db.put("tickets", updated);
  return NextResponse.json({ ticket: updated });
}
