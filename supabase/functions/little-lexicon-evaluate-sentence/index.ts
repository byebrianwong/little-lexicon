// little-lexicon-evaluate-sentence (Phase 4.4)
//
// POST { wordId, headword, sentence }
// -> { correct: boolean, feedback: string, suggestion: string }
//    or, on malformed model output, { correct: null, feedback: "Saved.", logged: true }
//
// Runtime Claude call, so it is gated:
//   1. Auth: the caller is identified from the incoming bearer JWT (anon client
//      + Authorization header -> getUser()). No user -> 401.
//   2. Pro gate: profiles.is_pro is read with a service-role client (never a
//      client flag). Non-Pro -> 403.
//   3. Rate limit: bump_ai_usage('evaluate') increments the caller's daily
//      counter atomically; over the cap -> 429.
//   4. Claude: claude-haiku-4-5 with the rubric cached (cache_control) as the
//      system prompt.
//
// Secrets are read from Deno.env only and never returned to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callAnthropic, HAIKU_MODEL, parseJsonLoose } from "../_shared/anthropic.ts";

const DAILY_CAP = 30;

interface EvalRequest {
  wordId?: number;
  headword?: string;
  sentence?: string;
}

interface EvalResult {
  correct: boolean | null;
  feedback: string;
  suggestion?: string;
  logged?: boolean;
}

// Cached rubric. Kept stable so prompt caching can reuse it across calls.
const RUBRIC = `You are a concise vocabulary tutor. A learner has written their own
sentence using a target word. Decide whether the target word is used correctly:
right meaning, right part of speech, and natural usage. Be encouraging but honest.

Rules:
- Judge only the use of the target word, not unrelated grammar or spelling.
- "correct" is true only when the target word is used with its actual meaning.
- "feedback" is ONE short sentence of plain feedback.
- "suggestion" is ONE short improved sentence, or "" if none is needed.
- Do not include the learner's personal data back in the response.

Return ONLY minified JSON, no prose and no code fences, in exactly this shape:
{"correct": true, "feedback": "...", "suggestion": "..."}`;

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

  // Caller-scoped client: identifies the user and runs RPCs as that user.
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

  let body: EvalRequest;
  try {
    body = (await req.json()) as EvalRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const headword = (body.headword ?? "").trim();
  const sentence = (body.sentence ?? "").trim();
  if (!headword || !sentence) {
    return jsonResponse({ error: "headword and sentence are required" }, 400);
  }
  if (sentence.length > 500) {
    return jsonResponse({ error: "sentence too long" }, 400);
  }

  // Service-role client for the entitlement read (bypasses RLS deliberately).
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

  // Rate limit (increment-first, atomic). Runs as the caller so auth.uid()
  // inside bump_ai_usage is this user.
  const { data: usageCount, error: usageErr } = await authClient.rpc("bump_ai_usage", {
    p_kind: "evaluate",
  });
  if (usageErr) {
    return jsonResponse({ error: "Rate limit check failed" }, 500);
  }
  if (typeof usageCount === "number" && usageCount > DAILY_CAP) {
    return jsonResponse({ error: "Daily limit reached" }, 429);
  }

  try {
    const raw = await callAnthropic({
      apiKey: ANTHROPIC_API_KEY,
      model: HAIKU_MODEL,
      maxTokens: 300,
      temperature: 0.3,
      system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Target word: ${headword}\nLearner sentence: ${sentence}`,
        },
      ],
    });

    const parsed = parseJsonLoose<EvalResult>(raw);
    if (!parsed || typeof parsed.correct !== "boolean" || typeof parsed.feedback !== "string") {
      // Degrade to a neutral, non-crashing result.
      const degraded: EvalResult = { correct: null, feedback: "Saved.", logged: true };
      return jsonResponse(degraded, 200);
    }

    const result: EvalResult = {
      correct: parsed.correct,
      feedback: parsed.feedback,
      suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    };
    return jsonResponse(result, 200);
  } catch (_err) {
    const degraded: EvalResult = { correct: null, feedback: "Saved.", logged: true };
    return jsonResponse(degraded, 200);
  }
});
