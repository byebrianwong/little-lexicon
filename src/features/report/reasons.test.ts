import { cleanNote, isReportReason, REPORT_NOTE_MAX, REPORT_REASONS } from './reasons';

describe('report reasons', () => {
  it('has unique values', () => {
    const values = REPORT_REASONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('recognizes only the listed reasons', () => {
    expect(isReportReason('definition')).toBe(true);
    expect(isReportReason('answers')).toBe(true);
    expect(isReportReason('spelling')).toBe(false);
    expect(isReportReason('')).toBe(false);
  });
});

describe('cleanNote', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanNote('  the  second\n\nexample  ')).toBe('the second example');
  });

  it('returns null for an empty or blank note', () => {
    expect(cleanNote('')).toBeNull();
    expect(cleanNote('   \n\t ')).toBeNull();
  });

  it('cuts a long note to the limit', () => {
    const note = cleanNote('a'.repeat(REPORT_NOTE_MAX + 50));
    expect(note).toHaveLength(REPORT_NOTE_MAX);
  });

  it('does not end a cut note in a space', () => {
    const note = cleanNote(`${'a'.repeat(REPORT_NOTE_MAX - 1)} bcd`);
    expect(note).toBe('a'.repeat(REPORT_NOTE_MAX - 1));
  });
});
