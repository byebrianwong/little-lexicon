// The pipeline's record: every word, sense, example, relation, mnemonic and
// distractor row, with the ids assigned to them. It is one JSON file.
//
//   live     data/content-db.json (committed). Word ids are permanent: saved
//            progress refers to them, so the counters only ever go up and an id
//            is never reused.
//   dry-run  out/dry-run.json (git-ignored), filled with stub content.
//
// Every read method the stages use for idempotency (getWordByHeadword,
// listSensesForWord, ...) works the same in both modes, so re-running fills
// gaps and never duplicates.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from './logger.ts';
import type { ContentRows } from './exportContent.ts';
import type {
  AudioBody,
  AudioObject,
  AudioSaveResult,
  DistractorRow,
  ExampleRow,
  MnemonicRow,
  NewDistractor,
  NewExample,
  NewMnemonic,
  NewRelation,
  NewReview,
  NewSense,
  NewWord,
  RelationRow,
  ReviewRow,
  SenseRow,
  WordRow,
} from './types.ts';

export type WordMetaPatch = Partial<
  Pick<
    WordRow,
    'part_of_speech' | 'ipa' | 'syllables' | 'etymology' | 'frequency_rank' | 'difficulty_tier'
  >
>;

export interface Store {
  init(): Promise<void>;
  flush(): Promise<void>;
  /** Every content row, for the export stage. */
  snapshot(): Promise<ContentRows>;

  getWordByHeadword(headword: string): Promise<WordRow | null>;
  listWords(): Promise<WordRow[]>;
  insertWord(input: NewWord): Promise<WordRow>;
  updateWordMeta(wordId: number, patch: WordMetaPatch): Promise<void>;

  listSensesForWord(wordId: number): Promise<SenseRow[]>;
  insertSense(input: NewSense): Promise<SenseRow>;
  setPlainDefinition(senseId: number, text: string): Promise<void>;

  listExamplesForSense(senseId: number): Promise<ExampleRow[]>;
  insertExample(input: NewExample): Promise<ExampleRow>;

  listRelationsForWord(wordId: number): Promise<RelationRow[]>;
  insertRelation(input: NewRelation): Promise<RelationRow>;

  listMnemonicsForWord(wordId: number): Promise<MnemonicRow[]>;
  insertMnemonic(input: NewMnemonic): Promise<MnemonicRow>;

  listDistractorsForSense(senseId: number): Promise<DistractorRow[]>;
  insertDistractor(input: NewDistractor): Promise<DistractorRow>;

  /** Swap a sense's wrong answers for new ones (second pass). */
  replaceDistractors(senseId: number, rows: NewDistractor[]): Promise<void>;
  /** Swap a word's global (not personalized) mnemonic for a new one. */
  replaceGlobalMnemonic(wordId: number, row: NewMnemonic): Promise<void>;

  // Curation (lib/curate.ts) edits a word's first sense in place.
  updateSense(
    senseId: number,
    patch: Partial<Pick<SenseRow, 'definition' | 'plain_language_definition'>>,
  ): Promise<void>;
  replaceExamples(senseId: number, rows: NewExample[]): Promise<void>;
  replaceRelations(wordId: number, rows: NewRelation[]): Promise<void>;
  /**
   * Make a word's senses after the first match these definitions, in order.
   * Senses whose definition is unchanged keep their rows; the rest are
   * removed with their examples and wrong answers.
   */
  setOtherSenses(wordId: number, primarySenseId: number, definitions: string[]): Promise<void>;
  listReviews(): Promise<ReviewRow[]>;
  addReview(row: NewReview): Promise<ReviewRow>;

  hasAudio(path: string): Promise<boolean>;
  saveAudio(path: string, body: AudioBody): Promise<AudioSaveResult>;
  totalAudioBytes(): Promise<number>;
}


interface JsonDb {
  meta: { note: string; createdAt: string; updatedAt: string };
  counters: Record<string, number>;
  words: WordRow[];
  senses: SenseRow[];
  example_sentences: ExampleRow[];
  word_relations: RelationRow[];
  mnemonics: MnemonicRow[];
  distractors: DistractorRow[];
  audio_objects: AudioObject[];
  /** Added with curation; older records have none. */
  reviews?: ReviewRow[];
}

const LIVE_NOTE =
  'Pipeline record for Little Lexicon content. Word ids are permanent: saved progress refers ' +
  'to them. Edit content here, then run `npx tsx src/run.ts --only=export`.';
const DRY_RUN_NOTE =
  'Dry-run output for the Little Lexicon content pipeline. Stub content is labeled "(dry-run stub)". Not for production.';

function emptyDb(dryRun: boolean): JsonDb {
  const now = new Date().toISOString();
  return {
    meta: {
      note: dryRun ? DRY_RUN_NOTE : LIVE_NOTE,
      createdAt: now,
      updatedAt: now,
    },
    counters: {},
    words: [],
    senses: [],
    example_sentences: [],
    word_relations: [],
    mnemonics: [],
    distractors: [],
    audio_objects: [],
  };
}

export class JsonFileStore implements Store {
  private db: JsonDb;

  constructor(
    private readonly filePath: string,
    private readonly audioDir: string,
    dryRun: boolean,
    private readonly logger: Logger,
  ) {
    this.db = emptyDb(dryRun);
  }

  async init(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.logger.info(`No record at ${this.filePath} yet; starting a new one.`);
      return;
    }
    try {
      this.db = JSON.parse(await readFile(this.filePath, 'utf8')) as JsonDb;
    } catch (err) {
      // Never start fresh over an unreadable record: new ids would silently
      // point saved progress at different words.
      throw new Error(`Could not parse ${this.filePath}: ${(err as Error).message}`);
    }
    this.logger.info(`Loaded ${this.db.words.length} words from ${this.filePath}`);
  }

  async flush(): Promise<void> {
    this.db.meta.updatedAt = new Date().toISOString();
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.db, null, 2) + '\n', 'utf8');
  }

  async snapshot(): Promise<ContentRows> {
    const { words, senses, example_sentences, word_relations, mnemonics, distractors } = this.db;
    return { words, senses, example_sentences, word_relations, mnemonics, distractors };
  }

  private nextId(table: string): number {
    const next = (this.db.counters[table] ?? 0) + 1;
    this.db.counters[table] = next;
    return next;
  }

  async getWordByHeadword(headword: string): Promise<WordRow | null> {
    return this.db.words.find((w) => w.headword === headword) ?? null;
  }

  async listWords(): Promise<WordRow[]> {
    return [...this.db.words];
  }

  async insertWord(input: NewWord): Promise<WordRow> {
    const existing = await this.getWordByHeadword(input.headword);
    if (existing) return existing;
    const row: WordRow = { id: this.nextId('words'), ...input };
    this.db.words.push(row);
    return row;
  }

  async updateWordMeta(wordId: number, patch: WordMetaPatch): Promise<void> {
    const w = this.db.words.find((x) => x.id === wordId);
    if (w) Object.assign(w, patch);
  }

  async listSensesForWord(wordId: number): Promise<SenseRow[]> {
    return this.db.senses.filter((s) => s.word_id === wordId);
  }

  async insertSense(input: NewSense): Promise<SenseRow> {
    const dup = this.db.senses.find(
      (s) => s.word_id === input.word_id && s.definition === input.definition,
    );
    if (dup) return dup;
    const row: SenseRow = { id: this.nextId('senses'), ...input };
    this.db.senses.push(row);
    return row;
  }

  async setPlainDefinition(senseId: number, text: string): Promise<void> {
    const s = this.db.senses.find((x) => x.id === senseId);
    if (s) s.plain_language_definition = text;
  }

  async listExamplesForSense(senseId: number): Promise<ExampleRow[]> {
    return this.db.example_sentences.filter((e) => e.sense_id === senseId);
  }

  async insertExample(input: NewExample): Promise<ExampleRow> {
    const dup = this.db.example_sentences.find(
      (e) => e.sense_id === input.sense_id && e.text === input.text,
    );
    if (dup) return dup;
    const row: ExampleRow = { id: this.nextId('example_sentences'), ...input };
    this.db.example_sentences.push(row);
    return row;
  }

  async listRelationsForWord(wordId: number): Promise<RelationRow[]> {
    return this.db.word_relations.filter((r) => r.word_id === wordId);
  }

  async insertRelation(input: NewRelation): Promise<RelationRow> {
    const dup = this.db.word_relations.find(
      (r) =>
        r.word_id === input.word_id &&
        r.related_lemma === input.related_lemma &&
        r.relation_type === input.relation_type,
    );
    if (dup) return dup;
    const row: RelationRow = { id: this.nextId('word_relations'), ...input };
    this.db.word_relations.push(row);
    return row;
  }

  async listMnemonicsForWord(wordId: number): Promise<MnemonicRow[]> {
    return this.db.mnemonics.filter((m) => m.word_id === wordId);
  }

  async insertMnemonic(input: NewMnemonic): Promise<MnemonicRow> {
    const dup = this.db.mnemonics.find(
      (m) => m.word_id === input.word_id && m.text === input.text && m.user_id === input.user_id,
    );
    if (dup) return dup;
    const row: MnemonicRow = { id: this.nextId('mnemonics'), ...input };
    this.db.mnemonics.push(row);
    return row;
  }

  async listDistractorsForSense(senseId: number): Promise<DistractorRow[]> {
    return this.db.distractors.filter((d) => d.sense_id === senseId);
  }

  async insertDistractor(input: NewDistractor): Promise<DistractorRow> {
    const dup = this.db.distractors.find(
      (d) => d.sense_id === input.sense_id && d.distractor_lemma === input.distractor_lemma,
    );
    if (dup) return dup;
    const row: DistractorRow = { id: this.nextId('distractors'), ...input };
    this.db.distractors.push(row);
    return row;
  }

  // Content rows, not user data: replacing them is how the second pass
  // improves wrong answers and hooks. Ids are never reused.
  async replaceDistractors(senseId: number, rows: NewDistractor[]): Promise<void> {
    this.db.distractors = this.db.distractors.filter((d) => d.sense_id !== senseId);
    for (const row of rows) {
      this.db.distractors.push({ id: this.nextId('distractors'), ...row, sense_id: senseId });
    }
  }

  async replaceGlobalMnemonic(wordId: number, row: NewMnemonic): Promise<void> {
    this.db.mnemonics = this.db.mnemonics.filter(
      (m) => !(m.word_id === wordId && m.user_id === null),
    );
    this.db.mnemonics.push({ id: this.nextId('mnemonics'), ...row, word_id: wordId, user_id: null });
  }

  async updateSense(
    senseId: number,
    patch: Partial<Pick<SenseRow, 'definition' | 'plain_language_definition'>>,
  ): Promise<void> {
    const s = this.db.senses.find((x) => x.id === senseId);
    if (!s) throw new Error(`updateSense: no sense ${senseId}`);
    Object.assign(s, patch);
  }

  async replaceExamples(senseId: number, rows: NewExample[]): Promise<void> {
    this.db.example_sentences = this.db.example_sentences.filter((e) => e.sense_id !== senseId);
    for (const row of rows) {
      this.db.example_sentences.push({ id: this.nextId('example_sentences'), ...row, sense_id: senseId });
    }
  }

  async replaceRelations(wordId: number, rows: NewRelation[]): Promise<void> {
    this.db.word_relations = this.db.word_relations.filter((r) => r.word_id !== wordId);
    for (const row of rows) {
      this.db.word_relations.push({ id: this.nextId('word_relations'), ...row, word_id: wordId });
    }
  }

  async setOtherSenses(wordId: number, primarySenseId: number, definitions: string[]): Promise<void> {
    const others = this.db.senses.filter((s) => s.word_id === wordId && s.id !== primarySenseId);
    const keep = new Map<number, number>(); // sense id -> new order
    const added: SenseRow[] = [];
    definitions.forEach((definition, i) => {
      const order = i + 2;
      const existing = others.find((s) => s.definition.trim() === definition.trim() && !keep.has(s.id));
      if (existing) keep.set(existing.id, order);
      else {
        added.push({
          id: this.nextId('senses'),
          word_id: wordId,
          definition: definition.trim(),
          plain_language_definition: null,
          sense_order: order,
          register: null,
        });
      }
    });
    const drop = new Set(others.filter((s) => !keep.has(s.id)).map((s) => s.id));
    this.db.senses = this.db.senses.filter((s) => !drop.has(s.id));
    for (const s of this.db.senses) {
      const order = keep.get(s.id);
      if (order !== undefined) s.sense_order = order;
    }
    this.db.senses.push(...added);
    this.db.example_sentences = this.db.example_sentences.filter((e) => !drop.has(e.sense_id));
    this.db.distractors = this.db.distractors.filter((d) => !drop.has(d.sense_id));
  }

  async listReviews(): Promise<ReviewRow[]> {
    return [...(this.db.reviews ?? [])];
  }

  async addReview(row: NewReview): Promise<ReviewRow> {
    const review: ReviewRow = { id: this.nextId('reviews'), ...row };
    (this.db.reviews ??= []).push(review);
    return review;
  }

  async hasAudio(path: string): Promise<boolean> {
    return this.db.audio_objects.some((a) => a.path === path);
  }

  /**
   * Record a clip. Real bytes are written under the audio folder; dry-run stubs
   * only record an estimated size. Nothing is uploaded and no audio_url is set
   * until an audio host is chosen (see README).
   */
  async saveAudio(path: string, body: AudioBody): Promise<AudioSaveResult> {
    let bytes: number;
    if (body.kind === 'bytes') {
      const file = join(this.audioDir, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body.data);
      bytes = body.data.length;
    } else {
      bytes = body.estimatedBytes;
    }
    const existing = this.db.audio_objects.find((a) => a.path === path);
    if (existing) existing.bytes = bytes;
    else this.db.audio_objects.push({ path, bytes });
    return { bytes };
  }

  async totalAudioBytes(): Promise<number> {
    return this.db.audio_objects.reduce((sum, a) => sum + a.bytes, 0);
  }
}
