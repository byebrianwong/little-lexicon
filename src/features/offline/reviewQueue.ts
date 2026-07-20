// Offline review queue (Phase 7.3). When a review commit fails (offline), it is
// persisted and retried later. Duplicates are prevented by only ever removing an
// item on a confirmed success and never re-adding it, so a review is committed
// at most once from this device.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { backend } from '@/lib/backend';
import type { SubmitReviewInput } from '@/lib/backend';

const QUEUE_KEY = 'little_lexicon.reviewQueue.v1';

export interface QueuedReview extends SubmitReviewInput {
  clientId: string;
  enqueuedAt: string;
}

let flushing = false;

async function read(): Promise<QueuedReview[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedReview[]) : [];
  } catch {
    return [];
  }
}

async function write(items: QueuedReview[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function newClientId(): string {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export async function enqueueReview(input: SubmitReviewInput): Promise<void> {
  const items = await read();
  items.push({ ...input, clientId: newClientId(), enqueuedAt: new Date().toISOString() });
  await write(items);
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

/**
 * Flush queued reviews. Stops on the first failure (assume still offline) and
 * leaves the rest for next time. Returns how many committed. Guards against
 * concurrent flushes so an item cannot be sent twice.
 */
export async function flushReviewQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let committed = 0;
  try {
    let items = await read();
    while (items.length > 0) {
      const next = items[0]!;
      try {
        await backend.submitReview(next);
      } catch {
        break; // still offline; keep the remainder queued
      }
      items = items.slice(1);
      await write(items);
      committed++;
    }
  } finally {
    flushing = false;
  }
  return committed;
}
