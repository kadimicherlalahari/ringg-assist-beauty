# Ringg Assist for Beauty: Velora Botanicals demo

A working skincare store with **Vee**, an AI shopping and support assistant, plus an agent dashboard and a test runner.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:3000
```

- **With `GEMINI_API_KEY`**, Vee runs on Google Gemini (`gemini-3.8-flash` by default, override with `GEMINI_MODEL`) using function calling.
- **Without a key**, Vee runs on a built-in offline engine that calls the same tools with templated English, Hindi or Hinglish replies. The chat header shows "demo mode" when this happens, and Vee also falls back to it if a Gemini call fails.

## Deploying to Vercel

Set these environment variables in the Vercel project: `GEMINI_API_KEY`, `GEMINI_MODEL` (optional), `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Supabase is required on Vercel because serverless functions can't share a local file. The first request seeds the Supabase tables from `data/seed/`. `vercel.json` pins functions to Mumbai (`bom1`), next to the Supabase project in `ap-south-1`.

Gemini free-tier keys are rate limited (about 15 requests a minute; one chat turn uses 2–3). Vee retries once after a short wait, then falls back to the offline engine, so running the full `/test` suite quickly may show some offline answers.

## Demo script

1. Open a product such as `/products/vb-004`, click **Chat with Vee** and ask "Is this ok for sensitive skin?". Vee knows which product you're viewing.
2. Ask "I have oily skin with acne marks, budget 800". Recommendations come back as cards. **Add to cart** from the chat.
3. "Where is my order VB1041?" → Vee asks for the registered phone (`+91 98450 11201`) and then shows the tracking details.
4. Click **📞 Call me instead**, enter a number, and the callback is saved along with a chat summary.
5. "The serum gave me a burning rash" → creates an **URGENT** ticket and tells the customer when to expect a human reply.
6. Open `/dashboard` to see Tickets (with full chat history and **Mark resolved**), Callbacks, COD confirmations / NDR (**Trigger Ringg Call** → *Call Queued*) and Metrics.
7. Open `/test` and click **Run all** to run all 30 questions from `test_questions.csv`.

Registered phones for the sample orders are in `data/seed/customers.json`.

## Where things live

| What | Where |
|---|---|
| Vee's system prompt (editable) | `prompts/vee-system-prompt.md` |
| Business rules (return window, refund limit, support hours, today = 2 Nov 2026) | `lib/business-rules.ts` |
| Sample data (source of truth) | `data/seed/` |
| Storage layer | `lib/db.ts`: Supabase when `SUPABASE_URL` + key are set, otherwise `data/runtime/db.json`. Reset from the dashboard. |
| Supabase schema (one table per collection: products, customers, offers, faqs, orders, conversations, messages, tickets, callbacks, returns, events) | `supabase/schema.sql` |
| Tools (search_products, show_product_cards, faq, policy, offers, get_order_status, cancel_order, create_return, handover_to_human, request_callback) | `lib/agent/tools.ts` |
| Gemini function-calling loop | `lib/agent/gemini.ts` |
| Offline demo engine | `lib/agent/offline.ts` |
| Orchestrator + escalation guardrails | `lib/agent/index.ts` |
| **Ringg voice API integration point** | `lib/integrations/ringg.ts` |

## Escalation rules

A ticket is created automatically when the customer asks for a human, is angry or keeps complaining, reports a skin reaction (**URGENT**), reports a damaged or incorrect order or a payment problem, has a refund above ₹1,500, wants to change their address, asks about actives for someone under 16, or still has an unresolved issue after two attempts. Server-side guardrails in `lib/agent/index.ts` create the mandatory tickets even if the model forgets to call `handover_to_human`.

Human response promise: Monday–Saturday, 10 AM–7 PM IST. Outside these hours, the customer is told to expect a reply by 12 noon on the next working day.

## Future integrations

- **Ringg voice**: replace the simulated calls in `lib/integrations/ringg.ts` (callbacks, COD confirmation and NDR calls).
- **Payments**: the demo checkout in `components/CartView.tsx` marks where to create a real order and payment session.
