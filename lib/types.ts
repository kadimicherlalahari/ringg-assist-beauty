// Shared domain types. Shapes for products / customers / orders / offers / faqs
// mirror the sample-data files in data/seed exactly.

export interface Product {
  product_id: string;
  name: string;
  category: string;
  area: string;
  price_inr: number;
  mrp_inr: number;
  size: string;
  skin_types: string[];
  concerns: string[];
  key_ingredients: string[];
  notes: string;
  how_to_use: string;
  avoid_if: string;
  in_stock: boolean;
  cod_available: boolean;
  image_url: string;
  product_url: string;
}

export interface Customer {
  customer_id: string;
  name: string;
  phone: string;
  city: string;
  city_tier: string;
  preferred_language: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  qty: number;
  price_inr: number;
}

export interface Order {
  order_id: string;
  customer_id: string;
  order_date: string;
  payment_mode: "Prepaid" | "COD";
  status: string;
  items: OrderItem[];
  subtotal_inr: number;
  shipping_inr: number;
  cod_fee_inr: number;
  total_inr: number;
  courier: string | null;
  awb: string | null;
  expected_delivery: string | null;
  status_note: string;
  delivered_on: string | null;
  /** Set when an agent triggers a Ringg voice call from the dashboard. */
  call_status?: string;
  call_queued_at?: string;
}

export interface Offer {
  code: string;
  description: string;
  min_order_inr: number;
  max_discount_inr: number;
  valid_till: string;
  prepaid_only: boolean;
}

export interface Faq {
  question: string;
  answer: string;
}

export type Language = "en" | "hi" | "hinglish";
export type Priority = "URGENT" | "High" | "Normal";

export interface ProductCard {
  product_id: string;
  name: string;
  price_inr: number;
  mrp_inr: number;
  category: string;
  in_stock: boolean;
  product_url: string;
  reason?: string;
}

/** Structured UI blocks the chat widget renders under an assistant message. */
export type ChatAction =
  | { type: "callback_form" }
  | { type: "ticket"; ticket_id: string; priority: Priority; eta: string }
  | { type: "callback_confirmed"; callback_id: string; phone: string }
  | { type: "order"; order_id: string; status: string; expected_delivery: string | null; note: string }
  | { type: "quick_replies"; options: string[] };

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  cards?: ProductCard[];
  actions?: ChatAction[];
  tools_used?: string[];
  reply_ms?: number;
  intent?: string;
  engine?: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  channel: "web" | "test";
  language: Language;
  intents: string[];
  customer_id?: string;
  phone?: string;
  verified_orders: string[];
  current_product_id?: string;
  handed_over: boolean;
  /** Offline engine scratch state: pending verifications, complaint counters. */
  state: Record<string, unknown>;
  /** Raw Gemini contents history (append-only) when the Gemini engine is used. */
  llm_history?: unknown[];
}

export interface Ticket {
  id: string;
  conversation_id: string;
  created_at: string;
  status: "Open" | "Resolved";
  resolved_at?: string;
  priority: Priority;
  reason: string;
  summary: string;
  order_id?: string;
  customer_id?: string;
  customer_name?: string;
  phone?: string;
  eta: string;
}

export interface Callback {
  id: string;
  conversation_id: string;
  created_at: string;
  phone: string;
  summary: string;
  status: string;
  customer_name?: string;
  provider_ref?: string;
}

export interface ReturnRequest {
  id: string;
  order_id: string;
  conversation_id: string;
  created_at: string;
  reason: string;
  type: "Return" | "Exchange";
  refund_inr: number;
  pickup_window: string;
  needs_approval: boolean;
}

export interface AnalyticsEvent {
  id: string;
  type: "add_to_cart" | "product_recommended";
  conversation_id?: string;
  product_id: string;
  source: "chat" | "store";
  created_at: string;
}
