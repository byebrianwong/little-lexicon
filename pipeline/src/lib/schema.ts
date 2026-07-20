// Zod schemas for Claude-generated content. Every generated row is validated
// here before any write (SPEC.md section 7). Malformed items are rejected and
// retried, never inserted.

import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

/**
 * One generated example sentence. cloze_target must be a token that literally
 * appears in the sentence, otherwise the cloze game cannot blank it out.
 */
export const GeneratedExampleSchema = z
  .object({
    text: nonEmpty.max(400),
    cloze_target: nonEmpty.max(80),
  })
  .refine(
    (ex) => ex.text.toLowerCase().includes(ex.cloze_target.toLowerCase()),
    { message: 'cloze_target must appear in the sentence text' },
  );

/** The JSON contract we ask Claude to return for a single sense. */
export const GeneratedSenseSchema = z.object({
  sense_id: z.number().int().positive(),
  plain_language_definition: nonEmpty.max(400),
  examples: z.array(GeneratedExampleSchema).min(3).max(5),
  distractors: z.array(nonEmpty.max(80)).min(4).max(6),
  // One global mnemonic per word. We ask for it alongside the word's first
  // sense so the batch stays one-request-per-sense.
  mnemonic: nonEmpty.max(300).nullable().optional(),
});

export type GeneratedExample = z.infer<typeof GeneratedExampleSchema>;
export type GeneratedSense = z.infer<typeof GeneratedSenseSchema>;

/**
 * Parse a raw model string into a validated GeneratedSense.
 * Strips markdown code fences before parsing, then validates with Zod.
 * Returns a discriminated result so callers can reject-and-retry cleanly.
 */
export function parseGeneratedSense(
  raw: string,
): { ok: true; value: GeneratedSense } | { ok: false; error: string } {
  const cleaned = stripCodeFences(raw);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    return { ok: false, error: `not valid JSON: ${(err as Error).message}` };
  }
  const parsed = GeneratedSenseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  return { ok: true, value: parsed.data };
}

/** Remove a leading/trailing ```json ... ``` fence if the model added one. */
export function stripCodeFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z0-9]*\s*\n?/, '');
    s = s.replace(/\n?```\s*$/, '');
  }
  // If the model wrapped prose around the object, grab the outermost braces.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first > 0 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}
