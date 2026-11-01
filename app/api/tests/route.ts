import { NextResponse } from "next/server";
import { readTestQuestionsCsv, seed } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Minimal CSV parser (handles quoted fields with commas). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); if (row.some((c) => c.trim())) rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || "").trim()])));
}

export async function GET() {
  const tests = parseCsv(readTestQuestionsCsv()).map((t, i) => {
    // Registered phone for order questions, so the runner can answer the verification step.
    const orderId = t.shopper_message.toUpperCase().match(/VB\d{4}/)?.[0];
    const order = orderId ? seed.orders.find((o) => o.order_id === orderId) : undefined;
    const phone = order ? seed.customers.find((c) => c.customer_id === order.customer_id)?.phone : undefined;
    return { id: i + 1, ...t, verification_phone: phone };
  });
  return NextResponse.json({ tests });
}
