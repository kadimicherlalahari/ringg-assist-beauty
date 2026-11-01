import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/reset              → restore sample orders, clear conversations/tickets/callbacks.
 * POST /api/reset?scope=orders → restore only orders (used by /test so cancel/return tests are repeatable).
 */
export async function POST(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") === "orders" ? "orders" : "all";
  await db.reset(scope);
  return NextResponse.json({ ok: true });
}
