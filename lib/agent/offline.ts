// Offline demo engine. Used when no GEMINI_API_KEY is configured (or the API
// call fails) so the full customer journey still works. It routes by intent and
// calls the SAME tools as the Gemini engine, then writes templated replies in
// English / Hinglish / Hindi.

import type { Language, Product } from "../types";
import { executeTool, cityTier, type TurnContext } from "./tools";
import { classifyIntent, detectLanguage, RX } from "./nlu";
import { getProduct, findProductsMentioned, searchProducts, needsPatchTest } from "../catalog";
import { db, seed } from "../db";
import { formatDate, inr, RULES } from "../business-rules";

type Pending = { action: "status" | "cancel" | "return"; order_id?: string; reason?: string; awaiting?: "order" | "phone" | "unused" };
interface OfflineState { pending?: Pending; unresolved?: number; complaints?: number; last_order?: string }

/** Pick the string for the customer's language (Hindi falls back to Hinglish). */
function L(lang: Language, en: string, hinglish: string, hi?: string): string {
  if (lang === "hi") return hi || hinglish;
  return lang === "hinglish" ? hinglish : en;
}

const ORDER_RX = /\bVB\s?-?(\d{4})\b/i;
function extractOrderId(t: string) {
  const m = t.match(ORDER_RX);
  return m ? `VB${m[1]}` : undefined;
}
function extractPhone(t: string) {
  const digits = t.replace(/[^\d+]/g, " ").split(/\s+/).join("");
  const m = t.replace(/[\s-]/g, "").match(/(?:\+?91)?([6-9]\d{9})/);
  return m ? m[1] : digits.length >= 10 ? digits.slice(-10) : undefined;
}

const SKIN_TYPES: [RegExp, string][] = [
  [/acne.?prone/i, "acne-prone"],
  [/\boily\b|oil(y)? skin|chipchip/i, "oily"],
  [/\bdry\b|rukhi|रूखी/i, "dry"],
  [/combination|combo skin/i, "combination"],
  [/sensitive/i, "sensitive"],
  [/\bnormal\b/i, "normal"],
];
const CONCERNS: [RegExp, string][] = [
  [/acne marks|pimple marks|dark spots|post.?acne|daag|marks/i, "acne marks"],
  [/\bacne\b|pimples?|breakouts?|muhase|daane/i, "acne"],
  [/blackheads?/i, "blackheads"],
  [/dull|glow|chamak|bejaan/i, "dullness"],
  [/pigment|uneven|dark patches|melasma/i, "pigmentation"],
  [/open pores|pores/i, "open pores"],
  [/fine lines|wrinkles?|anti.?ageing|aging|texture/i, "fine lines"],
  [/dark circles?|puff/i, "dark circles"],
  [/\btan(ning|ned)?\b/i, "tan"],
  [/sun protection|sunscreen|spf/i, "sun protection"],
  [/hair ?fall|hair loss|baal gir|jhad/i, "hair fall"],
  [/frizz/i, "frizz"],
  [/dandruff|dry scalp/i, "dry scalp"],
  [/oily scalp/i, "oily scalp"],
  [/chapped|dry lips|lips?/i, "chapped lips"],
  [/redness|irritat/i, "redness"],
  [/dryness|flaky|tight/i, "dryness"],
  [/oil control|oiliness|greasy/i, "oil control"],
];

function parseProfile(t: string) {
  const skin = SKIN_TYPES.find(([re]) => re.test(t))?.[1];
  let concerns = CONCERNS.filter(([re]) => re.test(t)).map(([, c]) => c);
  if (concerns.includes("acne marks") && !/\bacne\b(?! marks)/i.test(t)) concerns = concerns.filter((c) => c !== "acne");
  const b = t.match(/(?:budget|under|below|within|upto|up to|max|₹|rs\.?|inr)\s*(?:of|is|:)?\s*₹?\s*(\d{3,5})|(\d{3,5})\s*(?:rs|rupees|₹|tak|ke andar)/i);
  const budget = b ? Number(b[1] || b[2]) : undefined;
  const area = /\bhair|scalp|baal\b/i.test(t) ? "hair" : /\blips?\b/i.test(t) ? "lips" : /under.?eye|dark circles?/i.test(t) ? "eyes" : /\bbody\b/i.test(t) ? "body" : undefined;
  return { skin, concerns, budget, area, pregnant: RX.pregnancy.test(t) };
}

function patchLine(lang: Language) {
  return L(lang, "Please do a 24-hour patch test before starting any serum or treatment.", "Koi bhi serum ya treatment shuru karne se pehle 24 ghante ka patch test zaroor karein.", "कोई भी सीरम या ट्रीटमेंट शुरू करने से पहले 24 घंटे का पैच टेस्ट ज़रूर करें।");
}

function etaLine(lang: Language, eta: string, id: string) {
  return L(lang, `I've created ticket **${id}** for our support team. ${eta}`, `Maine ticket **${id}** bana diya hai. ${eta}`, `मैंने टिकट **${id}** बना दिया है। ${eta}`);
}

export async function runOffline(ctx: TurnContext, text: string, productId?: string): Promise<string> {
  const conv = ctx.conversation;
  const lang = (conv.language = detectLanguage(text) || conv.language || "en");
  const st = conv.state as OfflineState;
  const orderId = extractOrderId(text);
  const phone = extractPhone(text.replace(ORDER_RX, ""));
  let intent = classifyIntent(text);
  if (orderId) st.last_order = orderId;

  // --- Continue a pending order flow (order id / phone / unused confirmation) ---
  const p = st.pending;
  const handoverIntents = ["adverse_reaction", "human_request", "angry", "payment_dispute", "damaged", "voice_request"];
  if (p && !handoverIntents.includes(intent)) {
    if (orderId) p.order_id = orderId;
    if (p.awaiting === "unused" && /\b(yes|yeah|yep|haan|ha|ji|unused|sealed|unopened|seal intact|not opened)\b/i.test(text)) {
      return doReturn(ctx, lang, p.order_id!, undefined, p.reason || "not_suitable", true);
    }
    if (p.awaiting === "unused" && /\b(no|nahi|used|opened)\b/i.test(text)) {
      st.pending = undefined;
      return L(lang,
        "Thanks for letting me know. Per our policy, opened or used products can only be returned for a skin reaction or if the item was damaged / wrong. If either applies, tell me and I'll help, or I can connect you to our team.",
        "Batane ke liye thanks. Policy ke hisaab se khula ya use kiya hua product sirf skin reaction ya damaged / galat item hone par return hota hai. Agar aisa hai to batayein, ya main aapko team se connect kar sakti hoon.");
    }
    if (phone || orderId || intent === "unknown") {
      if (!p.order_id) {
        p.awaiting = "order";
        return L(lang, "Could you share your order ID? It looks like VB1041.", "Apna order ID batayein? Jaise VB1041.");
      }
      if (p.action === "status") return doStatus(ctx, lang, p.order_id, phone);
      if (p.action === "cancel") return doCancel(ctx, lang, p.order_id, phone);
      if (p.action === "return") return doReturn(ctx, lang, p.order_id, phone, p.reason || "not_suitable", /unused|sealed|unopened/i.test(text));
    }
  }
  if (orderId && (intent === "unknown" || intent === "greeting")) intent = "order_status";
  // Greeting menu button: ask which of the two the customer needs.
  if (/^\s*return or cancel\s*$/i.test(text)) intent = "unknown";

  // Repeated complaints escalate (brief: "angry or repeatedly complains").
  if (/\b(still|again|not resolved|no reply|koi jawab nahi|phir se)\b/i.test(text)) st.complaints = (st.complaints || 0) + 1;
  if ((st.complaints || 0) >= 2 && intent !== "angry") intent = "angry";

  if (intent !== "unknown") st.unresolved = 0;

  switch (intent) {
    case "adverse_reaction": {
      const mentioned = findProductsMentioned(text)[0] || (productId ? getProduct(productId) : undefined);
      const r = (await executeTool("handover_to_human", {
        reason: "skin_reaction",
        summary: `URGENT skin reaction reported${mentioned ? ` after using ${mentioned.name}` : ""}${orderId ? ` (order ${orderId})` : ""}: "${text.slice(0, 160)}"`,
        order_id: orderId || st.last_order,
      }, ctx)) as { ticket_id: string; human_response_eta: string };
      return L(lang,
        `I'm so sorry this happened. Please do this right away:\n- **Stop using the product** and rinse the area gently with cool water.\n- Don't apply any other actives on that area.\n- If the burning, swelling or rash is severe or spreading, please **see a doctor**.\n\nI've marked this **URGENT** and handed it to our care team (ticket **${r.ticket_id}**). ${r.human_response_eta} The product is eligible for a return with a photo of the reaction and the product.`,
        `Mujhe bahut afsos hai. Abhi yeh karein:\n- **Product use karna band karein** aur thande paani se dhoyein.\n- Us jagah koi aur active na lagayein.\n- Agar jalan, sujan ya rash zyada hai to **doctor ko dikhayein**.\n\nMaine ise **URGENT** mark karke care team ko de diya hai (ticket **${r.ticket_id}**). ${r.human_response_eta} Reaction aur product ki photo ke saath return ho sakta hai.`,
        `मुझे बहुत अफ़सोस है। अभी यह करें:\n- **प्रोडक्ट इस्तेमाल करना बंद करें** और ठंडे पानी से धोएँ।\n- अगर जलन, सूजन या रैश ज़्यादा है तो **डॉक्टर को दिखाएँ**।\n\nमैंने इसे **URGENT** मार्क करके केयर टीम को दे दिया है (टिकट **${r.ticket_id}**)। ${r.human_response_eta}`);
    }

    case "human_request": {
      const r = (await executeTool("handover_to_human", { reason: "human_request", summary: `Customer asked to talk to a person. Last message: "${text.slice(0, 160)}"`, order_id: st.last_order }, ctx)) as { ticket_id: string; human_response_eta: string };
      return L(lang, `Of course. I'm connecting you with our support team. ${etaLine(lang, r.human_response_eta, r.ticket_id)}\n\nIf you'd prefer a phone call, tap **Call me instead** below.`,
        `Bilkul. Main aapko support team se connect kar rahi hoon. ${etaLine(lang, r.human_response_eta, r.ticket_id)}\n\nPhone par baat karni ho to neeche **Call me instead** dabayein.`,
        `ज़रूर। मैं आपको सपोर्ट टीम से जोड़ रही हूँ। ${etaLine(lang, r.human_response_eta, r.ticket_id)}`);
    }

    case "angry": {
      const r = (await executeTool("handover_to_human", { reason: "angry_customer", summary: `Customer is upset / repeated complaint. Message: "${text.slice(0, 200)}". Topics so far: ${[...new Set(conv.intents)].join(", ")}`, order_id: st.last_order }, ctx)) as { ticket_id: string; human_response_eta: string };
      return L(lang, `I'm really sorry for the frustration, and that you've had to ask again. I've escalated this to a senior member of our team with the full chat history so you won't need to repeat yourself. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`,
        `Aapko pareshani hui, iske liye maafi chahti hoon. Maine poori chat ke saath ise senior team ko escalate kar diya hai, aapko dobara batana nahi padega. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`,
        `आपको परेशानी हुई, इसके लिए माफ़ी चाहती हूँ। मैंने पूरी चैट के साथ इसे सीनियर टीम को भेज दिया है। ${etaLine(lang, r.human_response_eta, r.ticket_id)}`);
    }

    case "payment_dispute": {
      const r = (await executeTool("handover_to_human", { reason: "payment_issue", summary: `Payment issue reported: "${text.slice(0, 200)}"`, order_id: orderId || st.last_order }, ctx)) as { ticket_id: string; human_response_eta: string };
      return L(lang, `Sorry about this. Payment issues like a double charge need our payments team to check with the bank, so I've handed this over. ${etaLine(lang, r.human_response_eta, r.ticket_id)} If you have your order ID and the transaction reference / UTR handy, please keep them ready.`,
        `Sorry is pareshani ke liye. Double charge jaise payment issues payments team bank se check karti hai, isliye maine handover kar diya hai. ${etaLine(lang, r.human_response_eta, r.ticket_id)} Order ID aur transaction reference / UTR ready rakhein.`);
    }

    case "damaged": {
      const r = (await executeTool("handover_to_human", { reason: "damaged_or_wrong_item", summary: `Damaged / incorrect item reported${orderId ? ` for ${orderId}` : ""}: "${text.slice(0, 200)}"`, order_id: orderId || st.last_order }, ctx)) as { ticket_id: string; human_response_eta: string };
      return L(lang, `I'm sorry your order arrived like this. To sort it quickly, please share:\n- your **order ID** (e.g. VB1041)\n- a **photo** of the damaged / wrong item and the box\n\nDamaged or wrong items should be reported within 48 hours of delivery. I've passed this to our team. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`,
        `Sorry aapka order aisa pahuncha. Jaldi solve karne ke liye bhejiye:\n- **order ID** (jaise VB1041)\n- damaged / galat item aur box ki **photo**\n\nDelivery ke 48 ghante ke andar report karna hota hai. Maine team ko de diya hai. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`);
    }

    case "voice_request": {
      await executeTool("request_callback", phone ? { phone } : {}, ctx);
      if (phone) return L(lang, `Done! Our voice assistant will call you on ${phone} shortly with a summary of this chat.`, `Ho gaya! Hamara voice assistant ${phone} par jaldi call karega.`);
      return L(lang, "Happy to call you! Please enter your phone number in the form below and our voice assistant will ring you shortly. I'll pass along a summary of our chat so you don't have to repeat anything.",
        "Bilkul, hum aapko call karenge! Neeche form mein apna phone number daaliye, hamara voice assistant jaldi call karega. Chat ka summary bhi saath jayega.",
        "ज़रूर! नीचे फ़ॉर्म में अपना फ़ोन नंबर डालें, हमारा वॉइस असिस्टेंट जल्द ही कॉल करेगा।");
    }

    case "address_change": {
      const oid = orderId || st.last_order;
      const order = oid ? await db.get("orders", oid) : undefined;
      const r = (await executeTool("handover_to_human", { reason: "address_change", summary: `Address change requested for ${oid || "unknown order"} (status: ${order?.status || "n/a"}).`, order_id: oid }, ctx)) as { ticket_id: string; human_response_eta: string };
      const shipped = order && !["Placed", "Pending COD confirmation"].includes(order.status);
      return L(lang,
        `${order ? `Order ${order.order_id} is **${order.status}**${shipped ? "" : " and hasn't shipped yet, so the address can still be updated"}.` : ""} For your security, address changes are done by our team after verifying you${order?.payment_mode === "COD" && !shipped ? " — you can also confirm the new address on the COD confirmation call before dispatch" : ""}. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`.trim(),
        `${order ? `Order ${order.order_id} abhi **${order.status}** hai${shipped ? "" : ", ship nahi hua, isliye address badla ja sakta hai"}.` : ""} Address change hamari team verify karke karti hai${order?.payment_mode === "COD" && !shipped ? " — COD confirmation call par bhi naya address bata sakte hain" : ""}. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`.trim());
    }

    case "minor_safety": {
      const prod = findProductsMentioned(text)[0] || (productId ? getProduct(productId) : undefined);
      const r = (await executeTool("handover_to_human", { reason: "minor_safety", summary: `Safety question for someone under 16${prod ? ` about ${prod.name}` : ""}: "${text.slice(0, 160)}"`, order_id: st.last_order }, ctx)) as { ticket_id: string; human_response_eta: string };
      return L(lang,
        `Thanks for checking first. For anyone under 16, we recommend seeing a **dermatologist** before using actives${prod ? ` like the ${prod.name}` : ""}. Young skin can react differently, and I can't give medical advice. A gentle cleanser and sunscreen are usually a safe starting point.\n\nI've also asked our team to follow up. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`,
        `Pehle poochne ke liye thanks. 16 saal se kam umar mein${prod ? ` ${prod.name} jaise` : ""} actives use karne se pehle **dermatologist** se zaroor milein. Main medical advice nahi de sakti. Gentle cleanser aur sunscreen se shuru karna safe rehta hai.\n\nMaine team ko bhi follow-up ke liye bola hai. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`);
    }

    case "safety_question": {
      await executeTool("faq", { topic: "pregnancy" }, ctx);
      const prod = findProductsMentioned(text)[0];
      const avoid = prod && ["VB-009", "VB-010"].includes(prod.product_id);
      return L(lang,
        `${prod ? (avoid ? `No, please don't use the **${prod.name}** while pregnant or breastfeeding.` : `The ${prod.name} isn't on our avoid list for pregnancy.`) : "Most of our products are fine, but two actives aren't recommended."} During pregnancy or breastfeeding, avoid both the **0.3% Retinol Night Serum** and the **2% Salicylic Acid Spot Gel**. Please check with your doctor before starting any new active. I can't give medical advice, but I'm happy to suggest pregnancy-friendly options.`,
        `${prod ? (avoid ? `Pregnancy ya breastfeeding mein **${prod.name} avoid karein**.` : `${prod.name} pregnancy avoid list mein nahi hai.`) : "Zyada tar products theek hain, par kuch actives avoid karne chahiye."} Pregnancy / breastfeeding mein **0.3% Retinol Night Serum aur 2% Salicylic Acid Spot Gel avoid karein**. Koi naya active shuru karne se pehle doctor se zaroor poochein.`);
    }

    case "cancel": {
      const oid = orderId || st.last_order;
      if (!oid) {
        st.pending = { action: "cancel", awaiting: "order" };
        return L(lang, "I can help cancel. Please share your order ID (e.g. VB1046) and the phone number registered on the order.", "Cancel karne mein madad karti hoon. Order ID (jaise VB1046) aur registered phone number batayein.");
      }
      return doCancel(ctx, lang, oid, phone);
    }

    case "return": {
      const oid = orderId || st.last_order;
      const reason = /shade/i.test(text) ? "wrong_shade" : "not_suitable";
      if (!oid) {
        st.pending = { action: "return", reason, awaiting: "order" };
        return L(lang, "Sure. Please share your order ID and the phone number registered on the order so I can check return eligibility.", "Zaroor. Return check karne ke liye order ID aur registered phone number batayein.");
      }
      return doReturn(ctx, lang, oid, phone, reason, /unused|sealed|unopened|not opened/i.test(text));
    }

    case "refund_status":
    case "order_status":
    case "ndr": {
      const oid = orderId || st.last_order;
      if (!oid) {
        st.pending = { action: "status", awaiting: "order" };
        return L(lang, "I can check that. Please share your order ID (e.g. VB1041) and the phone number registered on the order.", "Main check karti hoon. Apna order ID (jaise VB1041) aur registered phone number batayein.", "मैं चेक करती हूँ। अपना ऑर्डर ID (जैसे VB1041) और रजिस्टर्ड फ़ोन नंबर बताएँ।");
      }
      return doStatus(ctx, lang, oid, phone);
    }

    case "offer_question": {
      const r = (await executeTool("offers", { code: text.match(/\b(DIWALI25|WELCOME10|PREPAID5|GLOWKIT)\b/i)?.[1] }, ctx)) as { checked?: { code: string; status: string; description?: string }; offers: { code: string; description: string; status: string; min_order_inr: number; valid_till: string }[] };
      const valid = r.offers.filter((o) => !o.status.startsWith("EXPIRED"));
      if (r.checked) {
        const o = r.offers.find((x) => x.code === r.checked!.code);
        if (o && o.status.startsWith("EXPIRED"))
          return L(lang, `Sorry, **${o.code}** was our Diwali sale code and it expired on ${formatDate(o.valid_till)}. You can still use:\n- **WELCOME10**: 10% off your first order (min ₹499, up to ₹150)\n- **PREPAID5**: extra 5% off when you pay online (up to ₹100)`,
            `Sorry, **${o.code}** Diwali sale code tha aur ${formatDate(o.valid_till)} ko expire ho gaya. Abhi yeh use kar sakte hain:\n- **WELCOME10**: pehle order par 10% off (min ₹499, max ₹150)\n- **PREPAID5**: online pay karne par extra 5% off (max ₹100)`);
        if (o) return L(lang, `**${o.code}** is active: ${o.description} (min order ${inr(o.min_order_inr)}, ${o.status}). Apply it in the cart.`, `**${o.code}** chal raha hai: ${o.description} (min order ${inr(o.min_order_inr)}, ${o.status}). Cart mein apply karein.`);
      }
      if (/\bkits?\b/i.test(text)) {
        const kits = ["VB-017", "VB-018"];
        await executeTool("show_product_cards", { product_ids: kits, reasons: ["Bundle saves 20%", "Bundle saves 17%"] }, ctx);
        return L(lang, `Yes! Use **GLOWKIT** for a flat **₹200 off** any kit (min order ₹1,399), valid till 30 Nov. Kits are already priced below MRP:`, `Haan! **GLOWKIT** code se kisi bhi kit par flat **₹200 off** (min ₹1,399), 30 Nov tak valid. Kits pehle se MRP se sasti hain:`);
      }
      return L(lang, `Here are the offers running right now:\n${valid.map((o) => `- **${o.code}**: ${o.description} (${o.status})`).join("\n")}`, `Abhi yeh offers chal rahe hain:\n${valid.map((o) => `- **${o.code}**: ${o.description} (${o.status})`).join("\n")}`);
    }

    case "delivery_question": {
      const city = findCity(text);
      if (/\bcod\b|cash on delivery/i.test(text)) {
        await executeTool("policy", { topic: "cod", city }, ctx);
        return L(lang, `Yes, Cash on Delivery is available across India${city ? `, including ${city}` : ""}, on orders up to ₹3,000. A ₹49 COD fee applies. Tip: pay online (UPI/card) to skip the fee and get an extra 5% off with code **PREPAID5**.`,
          `Haan, COD poore India mein available hai${city ? `, ${city} mein bhi` : ""}, ₹3,000 tak ke orders par. ₹49 COD fee lagti hai. Online pay karein to fee bachegi aur **PREPAID5** se extra 5% off milega.`);
      }
      const r = (await executeTool("policy", { topic: "delivery_time", city }, ctx)) as { city_tier?: string; delivery_estimate?: string };
      if (city)
        return L(lang, `If you order today, delivery to **${city}** (${r.city_tier}) usually takes **${r.delivery_estimate}**. Orders are packed within 24 hours (Mon–Sat). Shipping is free above ₹499, otherwise ₹59.`,
          `Aaj order karein to **${city}** (${r.city_tier}) mein delivery usually **${r.delivery_estimate}** mein hoti hai. Order 24 ghante mein pack hota hai (Mon–Sat). ₹499 se upar free shipping, warna ₹59.`);
      return L(lang, `Delivery times after packing (within 24 hours, Mon–Sat):\n- Metro cities: 2–4 days\n- Tier 1 & Tier 2 cities: 4–6 days\n- Tier 3 & rural: 6–8 days\n\nFree shipping on orders ₹499+, otherwise ₹59. Tell me your city for a closer estimate.`,
        `Packing ke baad delivery time:\n- Metro: 2–4 din\n- Tier 1 / Tier 2: 4–6 din\n- Tier 3 / rural: 6–8 din\n\n₹499+ par free shipping. Apna city batayein to exact estimate dungi.`);
    }

    case "faq":
      return answerFaq(ctx, lang, text);

    case "stock_check": {
      const prod = findProductsMentioned(text)[0] || (productId ? getProduct(productId) : undefined);
      if (!prod) return askClarify(ctx, lang);
      await executeTool("search_products", { product_ids: [prod.product_id] }, ctx);
      if (!prod.in_stock) {
        await executeTool("show_product_cards", { product_ids: ["VB-007"], reasons: ["In stock · SPF 50, no white cast"] }, ctx);
        return L(lang, `Sorry, the **${prod.name}** is **out of stock** right now${/shade/i.test(prod.notes) ? ` (it comes in ${prod.notes.replace("shades: ", "")} shades)` : ""}. I don't have a restock date yet. Meanwhile, our **Ultra-Light Sunscreen SPF 50 PA++++** is in stock and leaves no white cast:`,
          `Sorry, **${prod.name}** abhi **out of stock** hai. Restock date abhi pata nahi. Tab tak **Ultra-Light Sunscreen SPF 50 PA++++** stock mein hai, white cast nahi chhodta:`);
      }
      await executeTool("show_product_cards", { product_ids: [prod.product_id] }, ctx);
      return L(lang, `Yes, the **${prod.name}** is in stock at ${inr(prod.price_inr)} (MRP ${inr(prod.mrp_inr)}).`, `Haan, **${prod.name}** stock mein hai, ${inr(prod.price_inr)} (MRP ${inr(prod.mrp_inr)}).`);
    }

    case "product_question":
      return answerProductQuestion(ctx, lang, text, productId);

    case "routine":
      return buildRoutine(ctx, lang, text);

    case "product_recommendation":
      return recommend(ctx, lang, text);

    case "greeting":
      ctx.actions.push({ type: "quick_replies", options: ["Find products for my skin", "Track my order", "Return or cancel", "Talk to a person"] });
      return L(lang, "Hi! I'm Vee from Velora Botanicals. How can I help you today?", "Hi! Main Vee hoon, Velora Botanicals se. Aaj kaise madad karun?", "नमस्ते! मैं Vee हूँ, Velora Botanicals से। आज कैसे मदद करूँ?");

    default: {
      // Menu shortcuts from the greeting buttons.
      if (/find products/i.test(text)) return askClarify(ctx, lang);
      if (/track my order/i.test(text)) {
        st.pending = { action: "status", awaiting: "order" };
        return L(lang, "Sure! Please share your order ID (e.g. VB1041) and the phone number registered on the order.", "Zaroor! Order ID (jaise VB1041) aur registered phone number batayein.");
      }
      if (/return or cancel/i.test(text))
        return L(lang, "I can help with that. Do you want to **cancel** an order that hasn't shipped, or **return** a delivered one? Please share the order ID too.", "Madad karti hoon. Aap order **cancel** karna chahte hain ya delivered order **return**? Order ID bhi batayein.");
      if (productId && /\b(this|it|ye|yeh)\b/i.test(text)) return answerProductQuestion(ctx, lang, text, productId);
      st.unresolved = (st.unresolved || 0) + 1;
      if (st.unresolved >= 2) {
        const r = (await executeTool("handover_to_human", { reason: "unresolved", summary: `Vee could not understand / resolve the request after two attempts. Last message: "${text.slice(0, 160)}"` }, ctx)) as { ticket_id: string; human_response_eta: string };
        st.unresolved = 0;
        return L(lang, `Sorry, I'm still not able to help with this properly, so I've passed it to our team. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`, `Sorry, main abhi bhi theek se madad nahi kar paa rahi, isliye team ko de diya hai. ${etaLine(lang, r.human_response_eta, r.ticket_id)}`);
      }
      ctx.actions.push({ type: "quick_replies", options: ["Find products for my skin", "Track my order", "Return or cancel", "Talk to a person"] });
      return L(lang, "Sorry, I didn't quite get that. I can help you find products, check ingredients and offers, track or cancel orders, and arrange returns. What would you like to do?",
        "Sorry, samajh nahi aaya. Main products dhoondhne, ingredients, offers, order track/cancel aur returns mein madad kar sakti hoon. Kya karna hai?");
    }
  }
}

// ---------------------------------------------------------------------------

function findCity(text: string): string | undefined {
  const cities = [...new Set([...seed.customers.map((c) => c.city), "Mumbai", "Delhi", "Chennai", "Kolkata", "Jaipur", "Ahmedabad", "Bangalore"])];
  const c = cities.find((x) => new RegExp(`\\b${x}\\b`, "i").test(text));
  return c && cityTier(c) ? c : undefined;
}

async function doStatus(ctx: TurnContext, lang: Language, orderId: string, phone?: string): Promise<string> {
  const st = ctx.conversation.state as OfflineState;
  const r = (await executeTool("get_order_status", { order_id: orderId, phone }, ctx)) as Record<string, unknown> & { order?: { order_id: string; status: string; status_note: string; courier: string | null; awb: string | null; expected_delivery: string | null; payment_mode: string; total_inr: number } };
  if (!r.order) return verificationReply(ctx, lang, "status", orderId, r);
  st.pending = undefined;
  const o = r.order;
  const exp = formatDate(o.expected_delivery);
  switch (o.status) {
    case "Shipped":
    case "Out for delivery":
      return L(lang, `Good news! Order **${o.order_id}** is **${o.status.toLowerCase()}** with ${o.courier} (AWB ${o.awb}). Latest update: ${o.status_note}. Expected delivery: **${exp}**.`,
        `Order **${o.order_id}** ${o.courier} ke saath **${o.status}** hai (AWB ${o.awb}). Update: ${o.status_note}. Expected delivery: **${exp}**.`,
        `ऑर्डर **${o.order_id}** ${o.courier} के साथ **${o.status}** है (AWB ${o.awb})। अपेक्षित डिलीवरी: **${exp}**।`);
    case "Delayed":
      return L(lang, `I'm really sorry, order **${o.order_id}** is running late. ${o.status_note}. It's with ${o.courier} (AWB ${o.awb}). Since it has already shipped it can't be cancelled, but I can arrange a call back with updates, or connect you to our team if you'd like.`,
        `Maafi chahti hoon, aapka order **${o.order_id}** late ho gaya hai. Pehle 30 Oct bola tha, ab nayi expected date **4 Nov** hai (hub backlog ki wajah se). Order ${o.courier} ke paas hai (AWB ${o.awb}). Ship ho chuka hai isliye cancel nahi ho sakta, par main call back ya team se baat karwa sakti hoon.`,
        `माफ़ी चाहती हूँ, ऑर्डर **${o.order_id}** लेट है। नई अपेक्षित तारीख **4 Nov** है। ${o.courier} (AWB ${o.awb})।`);
    case "Delivery failed (NDR)":
      return L(lang, `Sorry about the missed delivery for **${o.order_id}**. ${o.status_note}. To make sure the next attempt works, please confirm:\n- your full address with a landmark\n- a good time to deliver (and that your phone will be reachable)\n\nReply here, or tap **Call me instead** and our voice assistant will confirm it with you.`,
        `**${o.order_id}** ki delivery miss hone ke liye sorry. Courier ne 31 Oct ko try kiya, aap reachable nahi the. Ab **1 attempt aur bacha hai**. Please batayein:\n- poora address aur landmark\n- delivery ke liye sahi time\n\nYa **Call me instead** dabayein.`);
    case "Pending COD confirmation":
      return L(lang, `Order **${o.order_id}** is placed and waiting for a quick COD confirmation call before dispatch. Once confirmed, expected delivery is around **${exp}**.`, `Order **${o.order_id}** place ho gaya hai, dispatch se pehle COD confirmation call aayega. Expected delivery **${exp}**.`);
    case "Refund processed":
      return L(lang, `The refund for **${o.order_id}** is done: ${o.status_note}. Bank / UPI credits can take ${RULES.refundDays} to reflect, so please check your UPI app or bank statement. If it's not there after that, I can raise it with our team.`,
        `**${o.order_id}** ka refund ho gaya hai: ${o.status_note}. Bank / UPI mein dikhne mein ${RULES.refundDays} lag sakte hain. Phir bhi na dikhe to main team se check karwa dungi.`);
    default:
      return L(lang, `Order **${o.order_id}** status: **${o.status}**. ${o.status_note}.${o.expected_delivery && !["Delivered", "Cancelled"].includes(o.status) ? ` Expected delivery: **${exp}**.` : ""}`,
        `Order **${o.order_id}** ka status: **${o.status}**. ${o.status_note}.${o.expected_delivery && !["Delivered", "Cancelled"].includes(o.status) ? ` Expected delivery: **${exp}**.` : ""}`);
  }
}

function verificationReply(ctx: TurnContext, lang: Language, action: Pending["action"], orderId: string, r: Record<string, unknown>, reason?: string): string {
  const st = ctx.conversation.state as OfflineState;
  if (r.error) {
    st.pending = { action, reason, awaiting: "order" };
    return L(lang, `I couldn't find an order with ID ${orderId}. Could you double-check it? Order IDs look like VB1041.`, `${orderId} ID ka koi order nahi mila. Ek baar check karein? Order ID VB1041 jaisa hota hai.`);
  }
  st.pending = { action, order_id: orderId, reason, awaiting: "phone" };
  if (r.verification_failed)
    return L(lang, `That phone number doesn't match the one on order ${orderId}. Could you check and share the number you used while ordering?`, `Yeh number order ${orderId} se match nahi ho raha. Order karte waqt wala number batayein?`);
  return L(lang, `I can help with order **${orderId}**. For your security, please share the **phone number registered** on this order.`,
    `Order **${orderId}** mein madad karti hoon. Security ke liye, is order par **registered phone number** batayein.`,
    `ऑर्डर **${orderId}** में मदद करती हूँ। सुरक्षा के लिए, इस ऑर्डर पर **रजिस्टर्ड फ़ोन नंबर** बताएँ।`);
}

async function doCancel(ctx: TurnContext, lang: Language, orderId: string, phone?: string): Promise<string> {
  const st = ctx.conversation.state as OfflineState;
  const r = (await executeTool("cancel_order", { order_id: orderId, phone }, ctx)) as Record<string, unknown> & { cancelled?: boolean; refund?: string; reason?: string; status?: string };
  if (r.cancelled === undefined) return verificationReply(ctx, lang, "cancel", orderId, r);
  st.pending = undefined;
  if (r.cancelled)
    return L(lang, `Done. Order **${orderId}** has been **cancelled**. ${r.refund}. You'll get a confirmation shortly.`, `Ho gaya. Order **${orderId}** **cancel** kar diya gaya hai. ${r.refund}.`);
  if (r.status === "Packed")
    return L(lang, `Sorry, order **${orderId}** is already **packed** and ready to ship, so it can't be cancelled now (orders can be cancelled only until they're packed). Once it's delivered, you can return it within 7 days if it's unused with the seal intact, and I'll set up a free pickup.`,
      `Sorry, order **${orderId}** pack ho chuka hai, isliye ab cancel nahi ho sakta. Delivery ke baad 7 din ke andar unused aur sealed product return kar sakte hain, pickup free hoga.`);
  return L(lang, `Sorry, order **${orderId}** can't be cancelled: ${r.reason}`, `Sorry, order **${orderId}** cancel nahi ho sakta: ${r.reason}`);
}

async function doReturn(ctx: TurnContext, lang: Language, orderId: string, phone: string | undefined, reason: string, unused: boolean): Promise<string> {
  const st = ctx.conversation.state as OfflineState;
  const r = (await executeTool("create_return", { order_id: orderId, phone, reason, product_unused: unused || undefined }, ctx)) as Record<string, unknown> & {
    created?: boolean; eligible?: boolean; needs_confirmation?: string; window_ends?: string; reason?: string; pickup_window?: string; refund?: string; type?: string; needs_human_approval?: boolean; approval_ticket?: string; handed_to_human?: boolean; ticket_id?: string; eta?: string;
  };
  if (r.created === undefined) return verificationReply(ctx, lang, "return", orderId, r, reason);
  if (r.handed_to_human) {
    st.pending = undefined;
    return L(lang, `I've passed this return to our team with priority (ticket **${r.ticket_id}**). Please keep a photo ready. ${r.eta}`, `Maine yeh return team ko priority par de diya hai (ticket **${r.ticket_id}**). Photo ready rakhein. ${r.eta}`);
  }
  if (!r.created && r.needs_confirmation) {
    st.pending = { action: "return", order_id: orderId, reason, awaiting: "unused" };
    return L(lang, `Good news: order **${orderId}** is inside the 7-day return window (until **${formatDate(r.window_ends)}**). Returns for "doesn't suit me" need the product to be **unused with the seal intact**. Is it unused and sealed?`,
      `Order **${orderId}** 7-day return window ke andar hai (**${formatDate(r.window_ends)}** tak). Return ke liye product **unused aur sealed** hona chahiye. Kya product unused hai?`);
  }
  st.pending = undefined;
  if (!r.created)
    return L(lang, `I'm sorry, I can't create a return for **${orderId}**. ${r.reason} If you feel this is a special case, I can connect you with our support team.`,
      `Sorry, **${orderId}** ka return nahi ho sakta. ${r.reason} Agar aapko lagta hai yeh special case hai, to main team se connect kar sakti hoon.`);
  return L(lang,
    `Your ${r.type === "Exchange" ? "exchange" : "return"} for **${orderId}** is created. Our courier will pick it up **${r.pickup_window}** (within 2–3 working days). ${r.refund}.${r.needs_human_approval ? ` Since the refund is above ₹1,500, a team member will approve it (ticket ${r.approval_ticket}).` : ""}`,
    `**${orderId}** ka ${r.type === "Exchange" ? "exchange" : "return"} ban gaya hai. Pickup **${r.pickup_window}** ko hoga. ${r.refund}.${r.needs_human_approval ? ` ₹1,500 se zyada refund hai, isliye team approve karegi (ticket ${r.approval_ticket}).` : ""}`);
}

async function answerFaq(ctx: TurnContext, lang: Language, text: string): Promise<string> {
  const r = (await executeTool("faq", { topic: text }, ctx)) as { faqs: { question: string; answer: string }[] };
  const t = text.toLowerCase();
  if (RX.international.test(text))
    return L(lang, "Not yet, sorry! We currently ship **only within India**. We'll share if international shipping opens up.", "Abhi nahi, sorry! Hum abhi **sirf India mein** ship karte hain.");
  if (/niacinamide/.test(t) && /retinol/.test(t))
    return L(lang, `Yes, niacinamide and retinol generally work well together. Niacinamide isn't an acid, so it can sit in the same night routine. Tips:\n- Start retinol slowly: **2–3 nights a week**, then build up.\n- Don't use retinol with acids (like the Salicylic Spot Gel) on the same night.\n- Use sunscreen the next morning.\n- ${patchLine(lang)}`,
      `Haan, niacinamide aur retinol usually saath use ho sakte hain. Retinol **hafte mein 2–3 raat** se shuru karein, same raat acids (jaise Spot Gel) ke saath na lagayein, agle din sunscreen lagayein. ${patchLine(lang)}`);
  const score = (q: string) => q.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && t.includes(w)).length;
  const keyMap: [RegExp, number][] = [[/cruelty|vegan/, 0], [/pregnan/, 1], [/patch/, 2], [/together|mix|combine|layer/, 3], [/result|how long until/, 4], [/shelf|expir/, 5], [/\bcod\b/, 6]];
  const idx = keyMap.find(([re]) => re.test(t))?.[1];
  const best = idx !== undefined ? r.faqs[idx] : [...r.faqs].sort((a, b) => score(b.question) - score(a.question))[0];
  if (idx === 0)
    return L(lang, `Yes! All Velora Botanicals products are **cruelty-free**. Everything is also **vegan** except the Saffron & Honey Lip Balm, which contains honey.`,
      `Haan! Velora Botanicals ke saare products **cruelty-free** hain. Saffron & Honey Lip Balm (isme honey hai) ko chhodkar baaki sab **vegan** bhi hain.`,
      `हाँ! Velora Botanicals के सभी प्रोडक्ट **क्रूएल्टी-फ्री** हैं। Saffron & Honey Lip Balm (इसमें शहद है) को छोड़कर बाकी सब **वीगन** भी हैं।`);
  return best.answer;
}

async function answerProductQuestion(ctx: TurnContext, lang: Language, text: string, productId?: string): Promise<string> {
  const prod = findProductsMentioned(text)[0] || (productId ? getProduct(productId) : undefined);
  if (!prod) return askClarify(ctx, lang);
  await executeTool("search_products", { product_ids: [prod.product_id] }, ctx);
  const skin = SKIN_TYPES.find(([re]) => re.test(text))?.[1];
  const lines: string[] = [];
  if (skin) {
    const fits = prod.skin_types.some((s) => s === skin || s === "all");
    if (fits) lines.push(L(lang, `Yes, the **${prod.name}** is suitable for ${skin} skin.`, `Haan, **${prod.name}** ${skin} skin ke liye suitable hai.`));
    else {
      lines.push(L(lang, `The **${prod.name}** is made for ${prod.skin_types.join(", ")} skin, so it isn't specifically formulated for ${skin} skin.${prod.avoid_if ? ` Note: ${prod.avoid_if}.` : ""}`, `**${prod.name}** ${prod.skin_types.join(", ")} skin ke liye bana hai, ${skin} skin ke liye specially nahi.${prod.avoid_if ? ` Dhyan dein: ${prod.avoid_if}.` : ""}`));
      const alts = searchProducts({ skin_type: skin, area: prod.area }).filter((p) => p.skin_types.includes(skin) && p.product_id !== prod.product_id && p.in_stock);
      const alt = alts.find((p) => p.category === "Moisturiser") || alts[0];
      if (alt) {
        lines.push(L(lang, `A gentle option made for ${skin} skin is the **${alt.name}** (${inr(alt.price_inr)}): ${alt.notes || alt.key_ingredients.join(", ")}.`, `${skin} skin ke liye gentle option: **${alt.name}** (${inr(alt.price_inr)}).`));
        await executeTool("show_product_cards", { product_ids: [prod.product_id, alt.product_id], reasons: ["Patch test first", `Made for ${skin} skin`] }, ctx);
      }
    }
  } else {
    lines.push(L(lang,
      `**${prod.name}** (${prod.size}, ${inr(prod.price_inr)}, MRP ${inr(prod.mrp_inr)})\n- **Key ingredients:** ${prod.key_ingredients.join(", ")}\n- **Best for:** ${prod.skin_types.join(", ")} · ${prod.concerns.join(", ")}\n- **How to use:** ${prod.how_to_use}${prod.avoid_if ? `\n- **Avoid if:** ${prod.avoid_if}` : ""}${prod.in_stock ? "" : "\n- Currently **out of stock**."}`,
      `**${prod.name}** (${prod.size}, ${inr(prod.price_inr)})\n- **Ingredients:** ${prod.key_ingredients.join(", ")}\n- **Kiske liye:** ${prod.skin_types.join(", ")} · ${prod.concerns.join(", ")}\n- **Kaise use karein:** ${prod.how_to_use}${prod.avoid_if ? `\n- **Avoid:** ${prod.avoid_if}` : ""}`));
  }
  if (needsPatchTest(prod)) lines.push(patchLine(lang));
  if (!ctx.cards.length) await executeTool("show_product_cards", { product_ids: [prod.product_id] }, ctx);
  return lines.join("\n\n");
}

async function buildRoutine(ctx: TurnContext, lang: Language, text: string): Promise<string> {
  const { skin, concerns } = parseProfile(text);
  const night = /\bnight|raat|pm\b/i.test(text);
  const acne = concerns.some((c) => c.startsWith("acne")) || /pimple/i.test(text);
  await executeTool("search_products", { skin_type: skin || (acne ? "oily" : undefined), concerns: concerns.length ? concerns : undefined, query: "routine" }, ctx);
  if (acne && night) {
    await executeTool("show_product_cards", { product_ids: ["VB-002", "VB-009", "VB-006"], reasons: ["Step 1: cleanse", "Step 2: dab on active spots", "Step 3: light, non-comedogenic hydration"] }, ctx);
    return L(lang, `A simple night routine for acne:\n1. **Neem & Tea Tree Oil-Control Face Wash**: cleanse.\n2. **2% Salicylic Acid Spot Gel**: dab only on active spots.\n3. **Aloe & Green Tea Oil-Free Gel Moisturiser**: lightweight hydration.\n\nOnce your skin is used to this (a few weeks), you can consider adding **0.3% Retinol Night Serum** 2–3 nights a week, but not on the same night as the spot gel. ${patchLine(lang)} Avoid the spot gel if pregnant or breastfeeding.`,
      `Acne ke liye simple night routine:\n1. **Neem & Tea Tree Face Wash**\n2. **2% Salicylic Acid Spot Gel** sirf pimples par\n3. **Aloe & Green Tea Gel Moisturiser**\n\nKuch hafte baad **Retinol Night Serum** hafte mein 2–3 raat add kar sakte hain (spot gel wali raat nahi). ${patchLine(lang)}`);
  }
  return recommend(ctx, lang, text);
}

async function askClarify(ctx: TurnContext, lang: Language): Promise<string> {
  ctx.actions.push({ type: "quick_replies", options: ["Oily skin, acne", "Dry, dull skin", "Sensitive skin", "Hair fall"] });
  return L(lang, "Happy to help you find the right products! What's your **skin type** (oily, dry, combination, sensitive, normal) and your main **concern** (acne, dullness, pigmentation, dark circles, hair fall...)? A budget helps too.",
    "Sahi products dhoondhne mein madad karti hoon! Aapki **skin type** kya hai (oily, dry, combination, sensitive) aur main **concern** kya hai (acne, dullness, pigmentation, hair fall...)? Budget bhi batayein.",
    "सही प्रोडक्ट ढूँढने में मदद करती हूँ! आपकी **स्किन टाइप** क्या है और मुख्य **समस्या** क्या है? बजट भी बताएँ।");
}

async function recommend(ctx: TurnContext, lang: Language, text: string): Promise<string> {
  const prof = parseProfile(text);
  if (!prof.skin && !prof.concerns.length) return askClarify(ctx, lang);
  const ranked = (await executeTool("search_products", {
    skin_type: prof.skin, concerns: prof.concerns, area: prof.area, max_price_inr: prof.budget, pregnancy_safe: prof.pregnant,
  }, ctx)) as { results: Product[] };
  const pool = ranked.results.filter((p) => p.in_stock);
  if (!pool.length) return askClarify(ctx, lang);

  const picks: Product[] = [];
  const above: Product[] = [];
  let total = 0;
  const tryAdd = (p?: Product) => {
    if (!p || picks.some((x) => x.product_id === p.product_id) || picks.length >= 3) return;
    if (prof.budget && total + p.price_inr > prof.budget) { if (!above.includes(p)) above.push(p); return; }
    picks.push(p);
    total += p.price_inr;
  };

  const face = (prof.area || pool[0].area) === "face";
  if (face) {
    const active = pool.find((p) => ["Serum", "Treatment"].includes(p.category)) || pool[0];
    tryAdd(active);
    const moist = searchProducts({ skin_type: prof.skin || active.skin_types[0], category: "Moisturiser" }).find((p) => p.in_stock && p.category === "Moisturiser");
    tryAdd(moist);
    tryAdd(pool.find((p) => p.category === "Kit"));
    if (picks.length < 3 && !prof.budget) tryAdd(getProduct("VB-007"));
    if (!picks.length) tryAdd(pool[0]);
  } else {
    pool.slice(0, 3).forEach((p) => tryAdd(p));
  }
  if (!picks.length) picks.push(pool.sort((a, b) => a.price_inr - b.price_inr)[0]);

  const reasonFor = (p: Product) => {
    const c = p.concerns.filter((x) => prof.concerns.some((pc) => x.includes(pc) || pc.includes(x)));
    return c.length ? `Targets ${c.join(", ")}` : p.category === "Moisturiser" ? `Suits ${prof.skin || "your"} skin` : p.category === "Sunscreen" ? "Daily sun protection" : p.notes || p.category;
  };
  await executeTool("show_product_cards", { product_ids: picks.map((p) => p.product_id), reasons: picks.map(reasonFor) }, ctx);

  const profileText = [prof.skin ? `${prof.skin} skin` : "", prof.concerns.join(" & ")].filter(Boolean).join(" with ");
  const lines = picks.map((p) => `- **${p.name}** (${inr(p.price_inr)}): ${reasonFor(p).toLowerCase()}. ${p.how_to_use}`);
  const kitAbove = above.find((p) => p.category === "Kit");
  const extra: string[] = [];
  if (kitAbove) extra.push(L(lang, `If your budget allows, the **${kitAbove.name}** (${inr(kitAbove.price_inr)}, ${kitAbove.notes}) covers the full routine.`, `Budget allow kare to **${kitAbove.name}** (${inr(kitAbove.price_inr)}, ${kitAbove.notes}) poora routine cover karta hai.`));
  if (face && !picks.some((p) => p.category === "Sunscreen" || p.product_id === "VB-018"))
    extra.push(L(lang, "Please pair this with a daily sunscreen like our **Ultra-Light Sunscreen SPF 50** (₹499), especially with actives.", "Din mein sunscreen zaroor lagayein, jaise **Ultra-Light Sunscreen SPF 50** (₹499)."));
  if (picks.some(needsPatchTest)) extra.push(patchLine(lang));
  if (prof.pregnant) extra.push(L(lang, "Since you're pregnant / breastfeeding, I've left out the Retinol serum and Salicylic spot gel. Please check with your doctor before starting new actives.", "Pregnancy ki wajah se Retinol aur Salicylic spot gel nahi suggest kiye. Naya active shuru karne se pehle doctor se poochein."));

  const intro = L(lang,
    `For ${profileText || "your needs"}${prof.budget ? ` within ${inr(prof.budget)}` : ""}, I'd suggest:`,
    `${profileText || "Aapki zaroorat"} ke liye${prof.budget ? ` ${inr(prof.budget)} budget mein` : ""} yeh suggest karungi:`,
    `${profileText || "आपकी ज़रूरत"} के लिए${prof.budget ? ` ${inr(prof.budget)} बजट में` : ""} मेरा सुझाव:`);
  return [intro, lines.join("\n"), extra.join(" ")].filter(Boolean).join("\n\n");
}
