// Lightweight language + intent detection. Used for analytics (conversations by
// intent), for server-side escalation guardrails, and by the offline engine.

import type { Language } from "../types";

const HINGLISH_WORDS = [
  "mujhe", "mera", "meri", "mere", "hai", "hain", "kya", "nahi", "nahin", "abhi", "tak", "aap", "aapke", "ke", "ki", "ka",
  "lu", "loon", "karo", "karna", "chahiye", "bahut", "kab", "kaise", "kyu", "kyun", "hoga", "wala", "aaya", "bola", "tha",
  "tareekh", "bhi", "acha", "accha", "theek", "yaar", "batao", "lagta", "skin hai", "kar", "do", "dena", "sakte", "milega",
];

export function detectLanguage(text: string): Language | null {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const hits = words.filter((w) => HINGLISH_WORDS.includes(w)).length;
  if (hits >= 2 || (hits >= 1 && words.length <= 4)) return "hinglish";
  return words.length ? "en" : null;
}

export const INTENT_LABELS: Record<string, string> = {
  product_recommendation: "Product recommendation",
  product_question: "Product question",
  routine: "Routine",
  stock_check: "Stock check",
  safety_question: "Safety question",
  minor_safety: "Under-16 safety",
  faq: "FAQ",
  delivery_question: "Delivery / COD",
  offer_question: "Offers",
  order_status: "Order status",
  refund_status: "Refund status",
  ndr: "Failed delivery",
  cancel: "Cancel order",
  return: "Return",
  adverse_reaction: "Skin reaction",
  angry: "Angry / complaint",
  human_request: "Human request",
  damaged: "Damaged / wrong item",
  payment_dispute: "Payment issue",
  address_change: "Address change",
  voice_request: "Callback request",
  greeting: "Greeting",
  unknown: "Other",
};

export const RX = {
  reaction: /\b(burn(ing|t|s)?|rash(es)?|itch(y|ing)?|swell(ing|ed)?|swollen|allerg(y|ic|ies)|reaction|hives|stinging|jalan|khujli|daane|lal ho)\b|जलन|खुजली|एलर्जी/i,
  human: /\b(human|real person|a person|agent|representative|customer care|talk to (someone|somebody)|speak to (someone|somebody)|insaan|executive)\b/i,
  angry: /!{2,}|\b(useless|worst|pathetic|third time|3rd time|fed up|ridiculous|bakwas|bekaar|frustrat\w*|terrible|scam|fraud|cheat\w*|horrible|disgusting|never again|kitni baar)\b/i,
  payment: /\b(charged twice|double charged?|charged 2|deducted|debited|payment (failed|issue|problem|declined)|paid twice|money (cut|gone)|paise kat)\b/i,
  damaged: /\b(damaged?|broken|leak(ing|ed|y)?|tampered|crack(ed)?|wrong (item|product|order)|missing item|toota|toot gaya)\b/i,
  callback: /\b(call me|callback|call back|phone call|give me a call|ring me|don'?t like typing|call kar|call karo|phone kar)\b/i,
  address: /\b(change|update|modify|edit)\b.*\baddress\b|\baddress\b.*\b(change|badal)/i,
  pregnancy: /\b(pregnan\w*|breastfeed\w*|nursing|expecting)\b/i,
  minorAge: /\b(\d{1,2})\s*(-|\s)?(year|yr|yrs|years|saal)s?\s*(-|\s)?old\b|\b(teen(ager)?|my (son|daughter|kid|child))\b/i,
  cancel: /\b(cancel\w*)\b|radd/i,
  return: /\b(return|exchange|wapas|send (it )?back)\b/i,
  refund: /\b(refund|money back|paisa wapas)\b/i,
  order: /\b(order|track|tracking|parcel|package|shipment|where is my|kab aayega|nahi aaya|not (yet )?(arrived|received|delivered)|delivery (failed|guy|boy)|didn'?t come|failed)\b|\bVB\d{4}\b/i,
  offer: /\b(coupon|code|offer|discount|sale|deal)\b|\b(DIWALI25|WELCOME10|PREPAID5|GLOWKIT)\b/i,
  international: /\b(dubai|usa|uk|us|canada|abroad|international(ly)?|outside india|singapore|australia|uae|london)\b/i,
  delivery: /\b(cod|cash on delivery|ship(ping)?|deliver(y|ed)?|when will i get|how (many|long) days|kitne din|dispatch)\b/i,
  faqTopics: /\b(cruelty|vegan|shelf life|expir\w*|patch test|results?|how long until|together|mix|combine|layer)\b/i,
  stock: /\b(in stock|out of stock|available|availability|do you have|restock)\b/i,
  routine: /\b(routine|regime|regimen|steps)\b/i,
  greeting: /^\s*(hi+|hello|hey|namaste|namaskar|hola|good (morning|evening|afternoon))\b[\s!.]*$/i,
};

export function minorAge(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\s*(?:-|\s)?(?:year|yr|yrs|years|saal)s?/i);
  if (m) return Number(m[1]);
  return /\b(teen(ager)?)\b/i.test(text) ? 14 : null;
}

export function classifyIntent(text: string): string {
  const t = text.trim();
  if (RX.reaction.test(t)) return "adverse_reaction";
  if (RX.human.test(t)) return "human_request";
  if (RX.angry.test(t)) return "angry";
  if (RX.payment.test(t)) return "payment_dispute";
  if (RX.damaged.test(t)) return "damaged";
  if (RX.callback.test(t)) return "voice_request";
  if (RX.address.test(t)) return "address_change";
  const age = minorAge(t);
  if (age !== null && age < 16) return "minor_safety";
  if (RX.pregnancy.test(t)) return "safety_question";
  if (RX.cancel.test(t)) return "cancel";
  if (RX.return.test(t)) return "return";
  if (RX.refund.test(t)) return "refund_status";
  if (/\b(failed|didn'?t come|not delivered|delivery guy|delivery boy)\b/i.test(t) && /VB\d{4}/i.test(t)) return "ndr";
  if (RX.order.test(t) && /\bVB\d{4}\b/i.test(t)) return "order_status";
  if (RX.offer.test(t)) return "offer_question";
  if (RX.international.test(t) && /\b(ship|deliver|send)/i.test(t)) return "faq";
  if (RX.delivery.test(t)) return "delivery_question";
  if (RX.faqTopics.test(t)) return "faq";
  if (RX.stock.test(t)) return "stock_check";
  if (RX.routine.test(t)) return "routine";
  if (RX.order.test(t)) return "order_status";
  if (RX.greeting.test(t)) return "greeting";
  if (/\b(ok|safe|suitable|good for|ingredients?|how (to|do i) use|kaise use)\b/i.test(t) && /\b(serum|gel|cream|sunscreen|wash|cleanser|oil|shampoo|lotion|balm|moisturi[sz]er|this|it)\b/i.test(t))
    return "product_question";
  if (/\b(skin|acne|pimple|dull|oily|dry|pigment|tan|dark (circles|spots)|marks|pores|wrinkle|fine lines|hair|frizz|dandruff|lips?|recommend|suggest|what should i (use|buy)|kya lu|kya use|best)\b/i.test(t))
    return "product_recommendation";
  return "unknown";
}

/** Intents that, per the brief, must always create a human ticket. */
export const HANDOVER_INTENTS: Record<string, { reason: string; label: string }> = {
  adverse_reaction: { reason: "skin_reaction", label: "Skin reaction reported" },
  human_request: { reason: "human_request", label: "Customer asked for a human" },
  angry: { reason: "angry_customer", label: "Angry / repeated complaint" },
  payment_dispute: { reason: "payment_issue", label: "Payment issue" },
  damaged: { reason: "damaged_or_wrong_item", label: "Damaged or incorrect order" },
};
