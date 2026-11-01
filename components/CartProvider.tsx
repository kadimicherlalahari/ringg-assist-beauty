"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ProductCard } from "@/lib/types";

export interface CartItem {
  product_id: string;
  name: string;
  price_inr: number;
  mrp_inr: number;
  category: string;
  qty: number;
}

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (p: Pick<ProductCard, "product_id" | "name" | "price_inr" | "mrp_inr" | "category">, opts?: { source?: "chat" | "store"; conversationId?: string }) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  toast: string | null;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "velora-cart-v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  const save = useCallback((next: CartItem[]) => {
    setItems(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const add: CartCtx["add"] = useCallback((p, opts) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.product_id);
      const next = existing
        ? prev.map((i) => (i.product_id === p.product_id ? { ...i, qty: i.qty + 1 } : i))
        : [...prev, { product_id: p.product_id, name: p.name, price_inr: p.price_inr, mrp_inr: p.mrp_inr, category: p.category, qty: 1 }];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setToast(`Added to cart: ${p.name}`);
    setTimeout(() => setToast(null), 2200);
    // Analytics: chat add-to-carts feed the dashboard metric.
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "add_to_cart", productId: p.product_id, source: opts?.source || "store", conversationId: opts?.conversationId }),
    }).catch(() => {});
  }, []);

  const value = useMemo<CartCtx>(() => ({
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    subtotal: items.reduce((s, i) => s + i.qty * i.price_inr, 0),
    add,
    setQty: (id, qty) => save(qty <= 0 ? items.filter((i) => i.product_id !== id) : items.map((i) => (i.product_id === id ? { ...i, qty } : i))),
    remove: (id) => save(items.filter((i) => i.product_id !== id)),
    clear: () => save([]),
    toast,
  }), [items, add, save, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && (
        <div role="status" className="pointer-events-none fixed top-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-white shadow-lg animate-pop">
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
