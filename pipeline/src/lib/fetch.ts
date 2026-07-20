// Rate-limited, on-disk-cached fetch for the free data sources (Datamuse and
// the Free Dictionary API). These have unofficial rate limits, so we batch
// politely: one request at a time, a minimum gap between requests, and a
// permanent cache under pipeline/.cache keyed by URL. Cached responses cost
// nothing and make re-runs cheap and deterministic.
//
// This helper is only used in live mode. Dry-run never calls the network.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './logger.ts';

export interface FetchOptions {
  /** Minimum milliseconds between outgoing requests. */
  minIntervalMs?: number;
  /** Directory for the on-disk cache. */
  cacheDir: string;
  logger: Logger;
}

interface CacheEntry {
  status: number;
  body: string;
  fetchedAt: string;
}

export class CachedFetcher {
  private lastRequestAt = 0;
  private readonly minIntervalMs: number;
  private readonly cacheDir: string;
  private readonly logger: Logger;
  private ready = false;
  hits = 0;
  misses = 0;

  constructor(opts: FetchOptions) {
    this.minIntervalMs = opts.minIntervalMs ?? 350;
    this.cacheDir = opts.cacheDir;
    this.logger = opts.logger;
  }

  private async ensureDir(): Promise<void> {
    if (this.ready) return;
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }
    this.ready = true;
  }

  private cachePath(url: string): string {
    const key = createHash('sha1').update(url).digest('hex');
    return join(this.cacheDir, `${key}.json`);
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.lastRequestAt + this.minIntervalMs - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastRequestAt = Date.now();
  }

  /**
   * GET a URL, returning parsed JSON. Uses the on-disk cache when present.
   * On a non-2xx response the parsed body is still returned so callers can
   * distinguish "no data" (404 from Free Dictionary) from a transport error.
   */
  async getJson<T>(url: string): Promise<{ status: number; data: T | null }> {
    await this.ensureDir();
    const file = this.cachePath(url);

    if (existsSync(file)) {
      try {
        const cached = JSON.parse(await readFile(file, 'utf8')) as CacheEntry;
        this.hits += 1;
        return { status: cached.status, data: safeJson<T>(cached.body) };
      } catch {
        // Corrupt cache entry: fall through and refetch.
      }
    }

    await this.throttle();
    this.misses += 1;
    this.logger.debug(`GET ${url}`);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await res.text();
    const entry: CacheEntry = {
      status: res.status,
      body,
      fetchedAt: new Date().toISOString(),
    };
    await writeFile(file, JSON.stringify(entry), 'utf8');
    return { status: res.status, data: safeJson<T>(body) };
  }
}

function safeJson<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
