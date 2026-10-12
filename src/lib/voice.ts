// Choose the most natural on-device voice for the speech fallback.
//
// Bundled clips cover the words file, so device speech is only heard for a
// word or sentence that has no clip yet. Platforms list their voices with
// different conventions, and the default is often the most robotic one:
//
// - iOS: identifiers carry the tier, "com.apple.voice.compact.en-US.Samantha",
//   ".enhanced." or ".premium." (the last two exist only if downloaded in
//   Settings). "eloquence" and "speech.synthesis.voice" voices are the old
//   novelty and formant voices.
// - Android: Google voices end in "-network" (server quality) or "-local".
// - Web: Edge lists "Microsoft ... Online (Natural)", Chrome lists
//   "Google US English", both clearer than the system default.

export interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

const NOVELTY = /eloquence|speech\.synthesis\.voice|novelty/i;

function score(v: VoiceInfo): number | null {
  const lang = v.language.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return null;
  const label = `${v.identifier} ${v.name}`;
  if (NOVELTY.test(label)) return null;

  let s = lang === 'en-us' ? 10 : 5;
  if (/premium/i.test(label)) s += 8;
  else if (/natural/i.test(label)) s += 8;
  else if (v.quality === 'Enhanced' || /enhanced/i.test(label)) s += 6;
  if (/network/i.test(label)) s += 4;
  else if (/google/i.test(label)) s += 4;
  return s;
}

/** Identifier of the best English voice, or undefined to keep the platform default. */
export function pickVoice(voices: VoiceInfo[]): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const v of voices) {
    const s = score(v);
    if (s !== null && (!best || s > best.score)) best = { id: v.identifier, score: s };
  }
  return best?.id;
}
