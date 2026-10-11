// Learners' reports of problems with a word (migration 0012, table
// little_lexicon.word_reports). Curation reads the open ones, puts the
// reported words in a worksheet with the reports attached, and after the
// worksheet is applied marks those reports resolved. Learners are not told.
//
// This talks to Supabase's REST API with the service role key, which bypasses
// RLS. The key lives only in pipeline/.env (CLAUDE.md > Secrets).

export interface OpenReport {
  id: number;
  wordId: number;
  reason: string;
  note: string | null;
  /** Where the learner was: intro (new-word card), reveal (after an answer) or browse. */
  screen: string;
  createdAt: string;
}

/** What a worksheet entry shows the writer about one report. */
export interface ReportNote {
  reason: string;
  screen: string;
  note: string | null;
  createdAt: string;
}

export interface SupabaseAdmin {
  url: string;
  serviceRoleKey: string;
}

interface ReportRow {
  id: number;
  word_id: number;
  reason: string;
  note: string | null;
  screen: string;
  created_at: string;
}

const SCHEMA = 'little_lexicon';

function headers(admin: SupabaseAdmin, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: admin.serviceRoleKey,
    Authorization: `Bearer ${admin.serviceRoleKey}`,
    'Accept-Profile': SCHEMA,
    'Content-Profile': SCHEMA,
    ...extra,
  };
}

async function failIfBad(res: Response, what: string): Promise<void> {
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status} ${await res.text()}`);
}

/** Every report not yet resolved, oldest first. */
export async function fetchOpenReports(admin: SupabaseAdmin): Promise<OpenReport[]> {
  const query = 'select=id,word_id,reason,note,screen,created_at&resolved_at=is.null&order=created_at.asc';
  const res = await fetch(`${admin.url}/rest/v1/word_reports?${query}`, { headers: headers(admin) });
  await failIfBad(res, 'Reading open reports');
  const rows = (await res.json()) as ReportRow[];
  return rows.map((r) => ({
    id: r.id,
    wordId: r.word_id,
    reason: r.reason,
    note: r.note,
    screen: r.screen,
    createdAt: r.created_at,
  }));
}

/** Mark reports resolved. Only ones still open are touched. */
export async function resolveReports(admin: SupabaseAdmin, ids: number[], resolutionNote: string): Promise<void> {
  if (ids.length === 0) return;
  const query = `id=in.(${ids.join(',')})&resolved_at=is.null`;
  const res = await fetch(`${admin.url}/rest/v1/word_reports?${query}`, {
    method: 'PATCH',
    headers: headers(admin, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ resolved_at: new Date().toISOString(), resolution_note: resolutionNote }),
  });
  await failIfBad(res, 'Resolving reports');
}

/** Reports grouped by word, words in the order of their oldest report. */
export function groupByWord(reports: OpenReport[]): Map<number, OpenReport[]> {
  const sorted = [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const groups = new Map<number, OpenReport[]>();
  for (const r of sorted) groups.set(r.wordId, [...(groups.get(r.wordId) ?? []), r]);
  return groups;
}

export function toReportNotes(reports: OpenReport[]): ReportNote[] {
  return reports.map((r) => ({ reason: r.reason, screen: r.screen, note: r.note, createdAt: r.createdAt }));
}

/**
 * The reports an applied worksheet answers: open reports on its words that
 * were filed before the worksheet was made, for words reviewed since then
 * (`reviewedSince`). A report filed later may be about the new content, so it
 * stays open.
 */
export function reportsAnswered(
  reports: OpenReport[],
  worksheet: { createdAt: string; wordIds: number[] },
  reviewedSince: (wordId: number) => boolean,
): OpenReport[] {
  const words = new Set(worksheet.wordIds);
  return reports.filter((r) => words.has(r.wordId) && r.createdAt < worksheet.createdAt && reviewedSince(r.wordId));
}
