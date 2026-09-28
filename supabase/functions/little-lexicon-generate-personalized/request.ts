// Checks the request body for little-lexicon-generate-personalized.
//
// The client sends the headword and definition it shows, taken from the
// words file in the app, and both go into the prompt. So they are held to the
// shape of real content: a headword is a word or short phrase, and a
// definition is one line of text. That keeps the call to a memory aid for a
// word, not a free-form prompt.
//
// This file has no Deno or network imports, so Jest can test it
// (request.test.ts). The app's tsc and eslint skip supabase/functions.

export type Kind = "mnemonic" | "sentence";

export interface GenRequest {
  wordId: number;
  headword: string;
  definition: string;
  kind: Kind;
  interests: string[];
}

export type ParseResult =
  | { ok: true; request: GenRequest }
  | { ok: false; error: string };

// The longest headword in the words file is 13 characters, and the longest
// definition is under 150. These leave room for new words.
export const MAX_HEADWORD_LENGTH = 40;
export const MAX_DEFINITION_LENGTH = 400;

// Letters, then letters, spaces, hyphens or apostrophes: "abate", "ad hoc",
// "self-effacing", "naïve".
const HEADWORD = /^\p{L}[\p{L}\p{M}'’ -]*$/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

export function parseGenRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const wordId = b.wordId;
  if (typeof wordId !== "number" || !Number.isInteger(wordId) || wordId <= 0) {
    return { ok: false, error: "wordId must be a positive integer" };
  }

  if (b.kind !== "mnemonic" && b.kind !== "sentence") {
    return { ok: false, error: "kind must be 'mnemonic' or 'sentence'" };
  }
  const kind: Kind = b.kind;

  if (typeof b.headword !== "string") {
    return { ok: false, error: "headword is required" };
  }
  const headword = b.headword.trim();
  if (headword.length === 0) {
    return { ok: false, error: "headword is required" };
  }
  if (headword.length > MAX_HEADWORD_LENGTH) {
    return { ok: false, error: `headword must be at most ${MAX_HEADWORD_LENGTH} characters` };
  }
  if (!HEADWORD.test(headword)) {
    return {
      ok: false,
      error: "headword may contain only letters, spaces, hyphens and apostrophes",
    };
  }

  if (typeof b.definition !== "string") {
    return { ok: false, error: "definition is required" };
  }
  // Line breaks and tabs become single spaces, so the definition stays on its
  // own line of the prompt.
  const definition = b.definition.replace(/\s+/g, " ").trim();
  if (definition.length === 0) {
    return { ok: false, error: "definition is required" };
  }
  if (definition.length > MAX_DEFINITION_LENGTH) {
    return {
      ok: false,
      error: `definition must be at most ${MAX_DEFINITION_LENGTH} characters`,
    };
  }
  if (CONTROL_CHARACTER.test(definition)) {
    return { ok: false, error: "definition contains control characters" };
  }

  // Unchanged from before: up to five non-empty strings, trimmed.
  const interests = (Array.isArray(b.interests) ? b.interests : [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, 5)
    .map((s) => s.trim());

  return { ok: true, request: { wordId, headword, definition, kind, interests } };
}
