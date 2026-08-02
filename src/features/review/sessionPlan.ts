// Assemble a session queue from due reviews and new words (Phase 3.1). Pure and
// unit tested. Reviews are time-sensitive so they come first (Anki-style), with
// new words interleaved among them.
//
// The daily goal is a target for streaks and the progress ring, NOT a cap on the
// session. A session offers everything available: every due review and every
// new word the queue returned. Nothing stops a user studying as long as they
// like.

import type { SessionItem } from '@/lib/types';

export interface SessionPlanInput {
  due: SessionItem[];
  newWords: SessionItem[];
}

export interface SessionPlan {
  items: SessionItem[];
  reviewCount: number;
  newCount: number;
}

/** Evenly distribute `news` among `reviews`, keeping both in order. */
export function interleave(reviews: SessionItem[], news: SessionItem[]): SessionItem[] {
  if (news.length === 0) return [...reviews];
  if (reviews.length === 0) return [...news];
  const out: SessionItem[] = [];
  const total = reviews.length + news.length;
  const step = total / news.length; // gap between injected new words
  let nextNewAt = step / 2;
  let ni = 0;
  let ri = 0;
  for (let i = 0; i < total; i++) {
    if (ni < news.length && i >= nextNewAt) {
      out.push(news[ni]!);
      ni++;
      nextNewAt += step;
    } else if (ri < reviews.length) {
      out.push(reviews[ri]!);
      ri++;
    } else if (ni < news.length) {
      out.push(news[ni]!);
      ni++;
    }
  }
  return out;
}

export function buildSessionPlan(input: SessionPlanInput): SessionPlan {
  const reviews = input.due;
  const news = input.newWords;
  return {
    items: interleave(reviews, news),
    reviewCount: reviews.length,
    newCount: news.length,
  };
}
