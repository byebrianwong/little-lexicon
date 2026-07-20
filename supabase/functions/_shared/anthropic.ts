// Minimal Anthropic Messages API helper for the little-lexicon-* Edge Functions.
//
// This talks to the REST API directly with fetch instead of pulling in the SDK,
// which keeps the function cold-start small and gives precise control over
// prompt caching (cache_control on the system block). The API key is always
// passed in by the caller after reading it from Deno.env; this module never
// reads, stores, or logs the key.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Model id per SPEC section 7 and the Phase 4/6 tasks.
export const HAIKU_MODEL = "claude-haiku-4-5";

export interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicTextBlock[];
}

export interface AnthropicCallOptions {
  apiKey: string;
  model?: string;
  system?: AnthropicTextBlock[];
  messages: AnthropicMessage[];
  maxTokens?: number;
  temperature?: number;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

// Calls the Messages API and returns the concatenated text of the response.
// Throws on a non-2xx status; callers are expected to catch and degrade.
export async function callAnthropic(opts: AnthropicCallOptions): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: opts.model ?? HAIKU_MODEL,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: opts.messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  return (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

// Best-effort JSON extraction from a model response: strips ```json fences and
// falls back to the first {...} span. Returns null when nothing parses, so the
// caller can degrade to a neutral result instead of crashing.
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();

  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) s = s.slice(start, end + 1);
  }

  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
