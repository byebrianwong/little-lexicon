// Orchestrator for the offline content-and-audio pipeline.
//
// Usage:
//   tsx src/run.ts [--only=<words|senses|generate|audio>] [--dry-run] [--limit=N] [-v]
//
// Runs the stages in order. Idempotent: each stage skips rows that already
// exist and only fills gaps, so re-running is safe and does not re-spend on
// already-generated content. With --dry-run (or when Supabase credentials are
// absent) it runs fully offline against the bundled seed list and writes to
// pipeline/out/dry-run.json.

import {
  createContext,
  parseFlags,
  STAGES,
  type RunContext,
  type StageName,
} from './config.ts';
import { ingestWords } from './stages/01-ingest-words.ts';
import { hydrate } from './stages/02-hydrate.ts';
import { generate } from './stages/03-generate.ts';
import { audio } from './stages/04-audio.ts';

const RUNNERS: Record<StageName, (ctx: RunContext) => Promise<void>> = {
  words: ingestWords,
  senses: hydrate,
  generate,
  audio,
};

function printSummary(ctx: RunContext, elapsedMs: number): void {
  const m = ctx.metrics;
  const mb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  const lines = [
    '',
    '──────────────────────────── run summary ────────────────────────────',
    `mode                 ${ctx.store.mode}${ctx.dryRun ? ' (dry-run)' : ''}`,
    `words                +${m.wordsInserted} inserted, ${m.wordsSkipped} skipped, ${m.wordsDropped} dropped from seed`,
    `senses               +${m.sensesInserted} inserted, ${m.sensesSkipped} already present`,
    `relations            +${m.relationsInserted}`,
    `examples (real)      +${m.realExamples}`,
    `examples (generated) +${m.generatedExamples}`,
    `plain definitions    +${m.plainDefsWritten}`,
    `distractors          +${m.distractorsInserted}`,
    `mnemonics            +${m.mnemonicsInserted}`,
    `rejected (invalid)   ${m.invalidRejected}   escalated to Sonnet: ${m.escalatedToSonnet}`,
    `Claude tokens        in ${m.claudeInputTokens}, out ${m.claudeOutputTokens}  (est. $${m.claudeCostUsd.toFixed(4)})`,
    `audio clips          words ${m.audioWordsSynthed}, sentences ${m.audioSentencesSynthed}, human reused ${m.audioReusedHuman}`,
    `TTS characters       ${m.ttsChars}  (est. $${m.ttsCostUsd.toFixed(4)})`,
    `bucket size          ${mb(m.bucketBytes)} of ~1 GB free tier`,
    `http cache           ${ctx.http.hits} hits, ${ctx.http.misses} misses`,
    `elapsed              ${(elapsedMs / 1000).toFixed(1)}s`,
  ];
  if (ctx.dryRun) {
    lines.push(`output               ${ctx.paths.outFile}`);
  }
  lines.push('──────────────────────────────────────────────────────────────────────');
  process.stderr.write(lines.join('\n') + '\n');
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const ctx = await createContext(flags);
  await ctx.store.init();

  const stages: StageName[] = flags.only ? [flags.only] : [...STAGES];
  ctx.log.info(
    `Stages: ${stages.join(' -> ')}${flags.limit ? `; limit ${flags.limit}` : ''}`,
  );

  const t0 = Date.now();
  for (const stage of stages) {
    await RUNNERS[stage](ctx);
  }
  await ctx.store.flush();
  printSummary(ctx, Date.now() - t0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`\n\x1b[31mPipeline failed:\x1b[0m ${message}\n`);
  process.exitCode = 1;
});
