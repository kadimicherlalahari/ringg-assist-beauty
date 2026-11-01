// ============================================================================
//  RINGG VOICE API — INTEGRATION POINT
// ============================================================================
//  Everything that should place a real phone call goes through this file:
//    1. requestCallback()   – "Call me instead" from the chat / request_callback tool
//    2. triggerOrderCall()  – COD confirmation and failed-delivery (NDR) calls
//                             from the agent dashboard
//
//  Today both functions SIMULATE the call and return a fake reference.
//  To go live:
//    - set RINGG_API_KEY (and RINGG_AGENT_ID for the voice agent to use) in .env.local
//    - replace the simulated block below with a POST to the Ringg outbound-call
//      endpoint, passing the phone number, language and the conversation
//      summary / order context as call variables
//    - optionally expose a webhook route (e.g. app/api/ringg/webhook/route.ts)
//      to receive call outcomes and update the callback / order status
// ============================================================================

export interface RinggCallResult {
  ok: boolean;
  simulated: boolean;
  provider_ref: string;
  status: string;
}

interface CallbackPayload {
  phone: string;
  summary: string;
  language: string;
  customer_name?: string;
}

interface OrderCallPayload {
  order_id: string;
  phone: string;
  purpose: "cod_confirmation" | "ndr";
  language: string;
  context: string;
}

export async function requestCallback(payload: CallbackPayload): Promise<RinggCallResult> {
  if (process.env.RINGG_API_KEY) {
    // TODO(ringg): call the Ringg outbound call API here, e.g.
    // await fetch(`${process.env.RINGG_API_URL}/calls`, {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${process.env.RINGG_API_KEY}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ agent_id: process.env.RINGG_AGENT_ID, to: payload.phone, variables: { summary: payload.summary, language: payload.language } }),
    // });
  }
  void payload;
  return { ok: true, simulated: true, provider_ref: simulatedRef(), status: "Callback scheduled (simulated)" };
}

export async function triggerOrderCall(payload: OrderCallPayload): Promise<RinggCallResult> {
  if (process.env.RINGG_API_KEY) {
    // TODO(ringg): same outbound call API, using a COD-confirmation or NDR voice
    // agent and passing order_id / address / context as call variables.
  }
  void payload;
  return { ok: true, simulated: true, provider_ref: simulatedRef(), status: "Call Queued" };
}

function simulatedRef() {
  return `SIM-RINGG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
