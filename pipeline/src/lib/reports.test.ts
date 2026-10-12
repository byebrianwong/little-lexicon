import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByWord, reportsAnswered, toReportNotes, type OpenReport } from './reports.ts';

const report = (id: number, wordId: number, createdAt: string, extra: Partial<OpenReport> = {}): OpenReport => ({
  id,
  wordId,
  reason: 'definition',
  note: null,
  screen: 'reveal',
  createdAt,
  ...extra,
});

test('groupByWord orders words by their oldest report', () => {
  const groups = groupByWord([
    report(3, 20, '2026-10-03T00:00:00Z'),
    report(1, 10, '2026-10-02T00:00:00Z'),
    report(2, 20, '2026-10-01T00:00:00Z'),
  ]);
  assert.deepEqual([...groups.keys()], [20, 10]);
  assert.deepEqual(groups.get(20)!.map((r) => r.id), [2, 3]);
});

test('toReportNotes keeps what the writer needs', () => {
  assert.deepEqual(toReportNotes([report(1, 10, '2026-10-02T00:00:00Z', { note: 'stress', reason: 'pronunciation' })]), [
    { reason: 'pronunciation', screen: 'reveal', note: 'stress', createdAt: '2026-10-02T00:00:00Z' },
  ]);
});

test('reportsAnswered resolves only reports the applied worksheet answered', () => {
  const sheet = { createdAt: '2026-10-11T07:00:00.000Z', wordIds: [10, 20, 30] };
  const reviewedSince = new Set([10, 30]);
  const answered = reportsAnswered(
    [
      report(1, 10, '2026-10-10T00:00:00Z'), // answered
      report(2, 20, '2026-10-10T00:00:00Z'), // word not reviewed since the worksheet was made
      report(3, 30, '2026-10-11T08:00:00Z'), // filed after the worksheet: may be about the new text
      report(4, 40, '2026-10-10T00:00:00Z'), // not in the worksheet
    ],
    sheet,
    (id) => reviewedSince.has(id),
  );
  assert.deepEqual(answered.map((r) => r.id), [1]);
});
