// The write target abstraction. Two implementations behind one interface:
//
//   JsonFileStore  - dry-run. Reads/writes pipeline/out/dry-run.json. No network.
//   SupabaseStore  - live. Writes the Little Lexicon content tables + little-lexicon-audio bucket.
//
// Every read method the stages use for idempotency (getWordByHeadword,
// listSensesForWord, ...) is implemented by both, so "re-running fills gaps and
// never duplicates" holds identically in dry-run and live mode.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from './logger.ts';
import {
  createServiceRoleClient,
  STORAGE_BUCKET,
  type PipelineSupabaseClient,
} from './supabase.ts';
import type {
  AudioBody,
  AudioObject,
  AudioUploadResult,
  DistractorRow,
  ExampleRow,
  MnemonicRow,
  NewDistractor,
  NewExample,
  NewMnemonic,
  NewRelation,
  NewSense,
  NewWord,
  RelationRow,
  SenseRow,
  WordRow,
} from './types.ts';

export type WordMetaPatch = Partial<
  Pick<WordRow, 'part_of_speech' | 'ipa' | 'syllables' | 'etymology' | 'frequency_rank'>
>;

export interface Store {
  readonly mode: 'json' | 'supabase';
  init(): Promise<void>;
  flush(): Promise<void>;

  getWordByHeadword(headword: string): Promise<WordRow | null>;
  listWords(): Promise<WordRow[]>;
  insertWord(input: NewWord): Promise<WordRow>;
  setWordAudio(wordId: number, url: string): Promise<void>;
  updateWordMeta(wordId: number, patch: WordMetaPatch): Promise<void>;

  listSensesForWord(wordId: number): Promise<SenseRow[]>;
  insertSense(input: NewSense): Promise<SenseRow>;
  setPlainDefinition(senseId: number, text: string): Promise<void>;

  listExamplesForSense(senseId: number): Promise<ExampleRow[]>;
  insertExample(input: NewExample): Promise<ExampleRow>;
  setExampleAudio(exampleId: number, url: string): Promise<void>;

  listRelationsForWord(wordId: number): Promise<RelationRow[]>;
  insertRelation(input: NewRelation): Promise<RelationRow>;

  listMnemonicsForWord(wordId: number): Promise<MnemonicRow[]>;
  insertMnemonic(input: NewMnemonic): Promise<MnemonicRow>;

  listDistractorsForSense(senseId: number): Promise<DistractorRow[]>;
  insertDistractor(input: NewDistractor): Promise<DistractorRow>;

  uploadAudio(path: string, body: AudioBody): Promise<AudioUploadResult>;
  listAudioObjects(): Promise<AudioObject[]>;
  totalBucketBytes(): Promise<number>;
}

// ---------------------------------------------------------------------------
// JSON file store (dry-run)
// ---------------------------------------------------------------------------

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
}

function emptyDb(): JsonDb {
  const now = new Date().toISOString();
  return {
    meta: {
      note: 'Dry-run output for the Little Lexicon content pipeline. Stub content is labeled "(dry-run stub)". Not for production.',
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
  readonly mode = 'json' as const;
  private db: JsonDb = emptyDb();

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  async init(): Promise<void> {
    if (existsSync(this.filePath)) {
      try {
        this.db = JSON.parse(await readFile(this.filePath, 'utf8')) as JsonDb;
        this.logger.info(`Loaded existing dry-run state from ${this.filePath}`);
      } catch {
        this.logger.warn(`Could not parse ${this.filePath}; starting fresh`);
        this.db = emptyDb();
      }
    } else {
      this.db = emptyDb();
    }
  }

  async flush(): Promise<void> {
    this.db.meta.updatedAt = new Date().toISOString();
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.db, null, 2), 'utf8');
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

  async setWordAudio(wordId: number, url: string): Promise<void> {
    const w = this.db.words.find((x) => x.id === wordId);
    if (w) w.audio_url = url;
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

  async setExampleAudio(exampleId: number, url: string): Promise<void> {
    const e = this.db.example_sentences.find((x) => x.id === exampleId);
    if (e) e.audio_url = url;
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

  async uploadAudio(path: string, body: AudioBody): Promise<AudioUploadResult> {
    const bytes = body.kind === 'bytes' ? body.data.length : body.estimatedBytes;
    const url = `https://dry-run.local/${STORAGE_BUCKET}/${path}`;
    const existing = this.db.audio_objects.find((a) => a.path === path);
    if (existing) {
      existing.bytes = bytes;
      existing.url = url;
    } else {
      this.db.audio_objects.push({ path, bytes, url });
    }
    return { publicUrl: url, bytes };
  }

  async listAudioObjects(): Promise<AudioObject[]> {
    return [...this.db.audio_objects];
  }

  async totalBucketBytes(): Promise<number> {
    return this.db.audio_objects.reduce((sum, a) => sum + a.bytes, 0);
  }
}

// ---------------------------------------------------------------------------
// Supabase store (live). Untested in dry-run; guarded behind live credentials.
// ---------------------------------------------------------------------------

export class SupabaseStore implements Store {
  readonly mode = 'supabase' as const;
  private readonly client: PipelineSupabaseClient;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly logger: Logger,
  ) {
    this.client = createServiceRoleClient(url, serviceRoleKey);
  }

  async init(): Promise<void> {
    // Cheap connectivity probe against the content table.
    const { error } = await this.client.from('words').select('id').limit(1);
    if (error) {
      throw new Error(`Supabase connectivity check failed: ${error.message}`);
    }
    this.logger.info('Connected to Supabase (service role).');
  }

  async flush(): Promise<void> {
    // Writes are committed per row; nothing to flush.
  }

  private fail(op: string, message: string): never {
    throw new Error(`Supabase ${op} failed: ${message}`);
  }

  async getWordByHeadword(headword: string): Promise<WordRow | null> {
    const { data, error } = await this.client
      .from('words')
      .select('*')
      .eq('headword', headword)
      .maybeSingle();
    if (error) this.fail('getWordByHeadword', error.message);
    return (data as WordRow | null) ?? null;
  }

  async listWords(): Promise<WordRow[]> {
    const { data, error } = await this.client.from('words').select('*').order('id');
    if (error) this.fail('listWords', error.message);
    return (data as WordRow[] | null) ?? [];
  }

  async insertWord(input: NewWord): Promise<WordRow> {
    const { data, error } = await this.client
      .from('words')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('insertWord', error.message);
    return data as WordRow;
  }

  async setWordAudio(wordId: number, url: string): Promise<void> {
    const { error } = await this.client
      .from('words')
      .update({ audio_url: url })
      .eq('id', wordId);
    if (error) this.fail('setWordAudio', error.message);
  }

  async updateWordMeta(wordId: number, patch: WordMetaPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.client.from('words').update(patch).eq('id', wordId);
    if (error) this.fail('updateWordMeta', error.message);
  }

  async listSensesForWord(wordId: number): Promise<SenseRow[]> {
    const { data, error } = await this.client
      .from('senses')
      .select('*')
      .eq('word_id', wordId)
      .order('sense_order');
    if (error) this.fail('listSensesForWord', error.message);
    return (data as SenseRow[] | null) ?? [];
  }

  async insertSense(input: NewSense): Promise<SenseRow> {
    const { data, error } = await this.client
      .from('senses')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('insertSense', error.message);
    return data as SenseRow;
  }

  async setPlainDefinition(senseId: number, text: string): Promise<void> {
    const { error } = await this.client
      .from('senses')
      .update({ plain_language_definition: text })
      .eq('id', senseId);
    if (error) this.fail('setPlainDefinition', error.message);
  }

  async listExamplesForSense(senseId: number): Promise<ExampleRow[]> {
    const { data, error } = await this.client
      .from('example_sentences')
      .select('*')
      .eq('sense_id', senseId);
    if (error) this.fail('listExamplesForSense', error.message);
    return (data as ExampleRow[] | null) ?? [];
  }

  async insertExample(input: NewExample): Promise<ExampleRow> {
    const { data, error } = await this.client
      .from('example_sentences')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('insertExample', error.message);
    return data as ExampleRow;
  }

  async setExampleAudio(exampleId: number, url: string): Promise<void> {
    const { error } = await this.client
      .from('example_sentences')
      .update({ audio_url: url })
      .eq('id', exampleId);
    if (error) this.fail('setExampleAudio', error.message);
  }

  async listRelationsForWord(wordId: number): Promise<RelationRow[]> {
    const { data, error } = await this.client
      .from('word_relations')
      .select('*')
      .eq('word_id', wordId);
    if (error) this.fail('listRelationsForWord', error.message);
    return (data as RelationRow[] | null) ?? [];
  }

  async insertRelation(input: NewRelation): Promise<RelationRow> {
    const { data, error } = await this.client
      .from('word_relations')
      .upsert(input, { onConflict: 'word_id,related_lemma,relation_type', ignoreDuplicates: false })
      .select('*')
      .single();
    if (error) this.fail('insertRelation', error.message);
    return data as RelationRow;
  }

  async listMnemonicsForWord(wordId: number): Promise<MnemonicRow[]> {
    const { data, error } = await this.client
      .from('mnemonics')
      .select('*')
      .eq('word_id', wordId);
    if (error) this.fail('listMnemonicsForWord', error.message);
    return (data as MnemonicRow[] | null) ?? [];
  }

  async insertMnemonic(input: NewMnemonic): Promise<MnemonicRow> {
    const { data, error } = await this.client
      .from('mnemonics')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('insertMnemonic', error.message);
    return data as MnemonicRow;
  }

  async listDistractorsForSense(senseId: number): Promise<DistractorRow[]> {
    const { data, error } = await this.client
      .from('distractors')
      .select('*')
      .eq('sense_id', senseId);
    if (error) this.fail('listDistractorsForSense', error.message);
    return (data as DistractorRow[] | null) ?? [];
  }

  async insertDistractor(input: NewDistractor): Promise<DistractorRow> {
    const { data, error } = await this.client
      .from('distractors')
      .insert(input)
      .select('*')
      .single();
    if (error) this.fail('insertDistractor', error.message);
    return data as DistractorRow;
  }

  async uploadAudio(path: string, body: AudioBody): Promise<AudioUploadResult> {
    if (body.kind !== 'bytes') {
      this.fail('uploadAudio', 'live store requires real audio bytes');
    }
    const { error } = await this.client.storage
      .from(STORAGE_BUCKET)
      .upload(path, body.data, { contentType: body.contentType, upsert: true });
    if (error) this.fail('uploadAudio', error.message);
    const { data } = this.client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { publicUrl: data.publicUrl, bytes: body.data.length };
  }

  async listAudioObjects(): Promise<AudioObject[]> {
    const objects: AudioObject[] = [];
    for (const prefix of ['words', 'sentences']) {
      const { data, error } = await this.client.storage
        .from(STORAGE_BUCKET)
        .list(prefix, { limit: 100000 });
      if (error) this.fail('listAudioObjects', error.message);
      for (const obj of data ?? []) {
        const size = (obj.metadata as { size?: number } | null)?.size ?? 0;
        const path = `${prefix}/${obj.name}`;
        const { data: pub } = this.client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        objects.push({ path, bytes: size, url: pub.publicUrl });
      }
    }
    return objects;
  }

  async totalBucketBytes(): Promise<number> {
    const objects = await this.listAudioObjects();
    return objects.reduce((sum, o) => sum + o.bytes, 0);
  }
}
