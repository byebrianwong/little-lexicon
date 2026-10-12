// What a learner can report about a word, and how a report is cleaned before
// it is saved. Reports are read by the curation process in pipeline/ (see
// .claude/skills/improve-words), which fixes the word and marks the report
// resolved. The learner is not told when that happens.

export const REPORT_REASONS = [
  { value: 'definition', label: 'Definition' },
  { value: 'example', label: 'Example sentence' },
  { value: 'pronunciation', label: 'Pronunciation' },
  { value: 'answers', label: 'Quiz answers' },
  { value: 'hook', label: 'Memory hook' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** Where the report was sent from. Tells the curator which text the learner saw. */
export type ReportScreen = 'intro' | 'reveal' | 'browse';

/** Longest note kept. The database rejects anything longer. */
export const REPORT_NOTE_MAX = 500;

export function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((r) => r.value === value);
}

/**
 * The note as it will be saved: whitespace collapsed, cut to the limit, and
 * null when nothing is left.
 */
export function cleanNote(note: string): string | null {
  const text = note.replace(/\s+/g, ' ').trim().slice(0, REPORT_NOTE_MAX).trim();
  return text === '' ? null : text;
}
