// little-lexicon-revenuecat-webhook (Phase 7.2)
//
// POST from RevenueCat. Verifies a shared-secret Authorization header
// (REVENUECAT_WEBHOOK_SECRET) and, on a recognized subscription event, sets
// little_lexicon.profiles.is_pro server-side. Entitlement is never trusted from a client
// flag; this webhook plus profiles.is_pro is the source of truth.
//
//   Authorization mismatch          -> 401
//   is_pro = true  on INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE
//   is_pro = false on EXPIRATION
//   any other event (including CANCELLATION), or unmappable app_user_id
//                                   -> 200 (acknowledged, no change)
//
// Note on CANCELLATION: in RevenueCat this means auto-renew was turned off, but
// the user keeps access until the period ends. Entitlement is only revoked at
// EXPIRATION, so CANCELLATION is acknowledged without touching is_pro.
//
// RevenueCat's app_user_id must be the Supabase auth user id (set the app to
// call Purchases.logIn(session.user.id) at sign-in). Values that are not UUIDs
// (for example anonymous "$RCAnonymousID:..." ids) are acknowledged and ignored.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { jsonResponse } from "../_shared/cors.ts";

const PRO_ON = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
// Only EXPIRATION revokes. CANCELLATION just means auto-renew is off; access
// continues until the period ends, at which point EXPIRATION fires.
const PRO_OFF = new Set(["EXPIRATION"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  // Shared-secret check. RevenueCat sends the configured value as the full
  // Authorization header.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== WEBHOOK_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: { event?: RevenueCatEvent } & RevenueCatEvent;
  try {
    payload = (await req.json()) as { event?: RevenueCatEvent } & RevenueCatEvent;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const event: RevenueCatEvent = payload.event ?? payload;
  const type = (event.type ?? "").toUpperCase();
  const appUserId = event.app_user_id ?? event.original_app_user_id ?? "";

  // Only act on known subscription transitions.
  let isPro: boolean | null = null;
  if (PRO_ON.has(type)) isPro = true;
  else if (PRO_OFF.has(type)) isPro = false;

  if (isPro === null) {
    return jsonResponse({ received: true, applied: false, reason: "unhandled_event" }, 200);
  }
  if (!UUID_RE.test(appUserId)) {
    return jsonResponse({ received: true, applied: false, reason: "unmappable_user" }, 200);
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "little_lexicon" },
  });

  const { error: updErr } = await serviceClient
    .from("profiles")
    .update({ is_pro: isPro, updated_at: new Date().toISOString() })
    .eq("user_id", appUserId);
  if (updErr) {
    // Let RevenueCat retry on a genuine write failure.
    return jsonResponse({ error: "Update failed" }, 500);
  }

  return jsonResponse({ received: true, applied: true, is_pro: isPro }, 200);
});
