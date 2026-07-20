// little-lexicon-generate-personalized (Phase 6.4)
//
// POST { wordId, kind: 'mnemonic' | 'sentence', interests: string[] }
// -> mnemonic: { kind: 'mnemonic', id, text }  (also persisted, owner-only)
//    sentence: { kind: 'sentence', text }       (returned only, never written to shared content)
//
// Same gating as little-lexicon-evaluate-sentence:
//   1. Auth via the incoming bearer JWT -> getUser(); no user -> 401.
//   2. Pro gate on profiles.is_pro via a service-role client; non-Pro -> 403.
//   3. Rate limit via bump_ai_usage('generate'); over the cap -> 429.
//   4. Generation with claude-haiku-4-5 (rubric cached).
//
// Personalized mnemonics are written with user_id set, so RLS keeps them
// owner-visible only. Sentences are personal and short-lived, so they are
// returned but never inserted into the shared example_sentences content.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callAnthropic, HAIKU_MODEL } from "../_shared/anthropic.ts";

const DAILY_CAP = 30;

type Kind = "mnemonic" | "sentence";

interface GenRequest {
  wordId?: number;
  kind?: Kind;
  interests?: string[];
}

const MNEMONIC_RUBRIC = `You write short, vivid memory aids for vocabulary learners.
Given a target word, its definition, and a few of the learner's interests, write ONE
mnemonic (at most two sentences) that connects the word's meaning to those interests.
Keep it concrete and easy to picture. Return ONLY the mnemonic text, no quotes, no
preamble, no JSON.`;

const SENTENCE_RUBRIC = `You write natural example sentences for vocabulary learners.
Given a target word, its definition, and a few of the learner's interests, write ONE
example sentence that uses the target word correctly and draws on those interests.
Return ONLY the sentence, no quotes, no preamble, no JSON.`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "Server not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing bearer token" }, 401);
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "little_lexicon" },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  let body: GenRequest;
  try {
    body = (await req.json()) as GenRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const wordId = body.wordId;
  const kind: Kind = body.kind === "sentence" ? "sentence" : "mnemonic";
  if (typeof wordId !== "number") {
    return jsonResponse({ error: "wordId is required" }, 400);
  }
  if (body.kind !== "mnemonic" && body.kind !== "sentence") {
    return jsonResponse({ error: "kind must be 'mnemonic' or 'sentence'" }, 400);
  }
  const interests = (Array.isArray(body.interests) ? body.interests : [])
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .slice(0, 5)
    .map((s) => s.trim());

  // Pro gate via service role.
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "little_lexicon" },
  });
  const { data: profile, error: profErr } = await serviceClient
    .from("profiles")
    .select("is_pro")
    .eq("user_id", userId)
    .maybeSingle();
  if (profErr) {
    return jsonResponse({ error: "Profile lookup failed" }, 500);
  }
  if (!profile?.is_pro) {
    return jsonResponse({ error: "Pro required" }, 403);
  }

  // Rate limit (increment-first, atomic), as the caller.
  const { data: usageCount, error: usageErr } = await authClient.rpc("bump_ai_usage", {
    p_kind: "generate",
  });
  if (usageErr) {
    return jsonResponse({ error: "Rate limit check failed" }, 500);
  }
  if (typeof usageCount === "number" && usageCount > DAILY_CAP) {
    return jsonResponse({ error: "Daily limit reached" }, 429);
  }

  // Word content is readable by authenticated users (content-read RLS).
  const { data: word, error: wordErr } = await authClient
    .from("words")
    .select("headword")
    .eq("id", wordId)
    .maybeSingle();
  if (wordErr) {
    return jsonResponse({ error: "Word lookup failed" }, 500);
  }
  if (!word?.headword) {
    return jsonResponse({ error: "Word not found" }, 404);
  }
  const { data: sense } = await authClient
    .from("senses")
    .select("definition, plain_language_definition")
    .eq("word_id", wordId)
    .order("sense_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  const definition = sense?.plain_language_definition ?? sense?.definition ?? "";

  const rubric = kind === "mnemonic" ? MNEMONIC_RUBRIC : SENTENCE_RUBRIC;
  const interestLine = interests.length > 0 ? interests.join(", ") : "general topics";

  let text: string;
  try {
    text = await callAnthropic({
      apiKey: ANTHROPIC_API_KEY,
      model: HAIKU_MODEL,
      maxTokens: 200,
      temperature: 0.8,
      system: [{ type: "text", text: rubric, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content:
            `Target word: ${word.headword}\n` +
            `Definition: ${definition}\n` +
            `Learner interests: ${interestLine}`,
        },
      ],
    });
  } catch (_err) {
    return jsonResponse({ error: "Generation failed" }, 502);
  }

  text = text.trim();
  if (!text) {
    return jsonResponse({ error: "Empty generation" }, 502);
  }

  if (kind === "sentence") {
    // Personal sentence: return it, do not write to shared content.
    return jsonResponse({ kind, text }, 200);
  }

  // Personalized mnemonic: persist owner-only (RLS: user_id = auth.uid()).
  const { data: inserted, error: insErr } = await authClient
    .from("mnemonics")
    .insert({ word_id: wordId, text, source: "claude", user_id: userId })
    .select("id, text")
    .single();
  if (insErr || !inserted) {
    // Generation succeeded but persistence failed; still return the text.
    return jsonResponse({ kind, text, persisted: false }, 200);
  }

  return jsonResponse({ kind, id: inserted.id, text: inserted.text }, 200);
});
