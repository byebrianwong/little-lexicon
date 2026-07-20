// Assemble a session queue from due reviews and new words (Phase 3.1). Pure and
// unit tested. Reviews are time-sensitive so they claim slots first (Anki-style);
// new words fill the remaining slots up to the per-day new allowance.

import type { SessionItem } from '@/lib/types';

export interface SessionPlanInput {
  due: SessionItem[];
  newWords: SessionItem[];
  dailyGoal: number;
  // Max new words to introduce today (free tier caps this; Pro raises it).
  newAllowance: number;
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
  const goal = Math.max(1, Math.floor(input.dailyGoal));
  const reviewCount = Math.min(input.due.length, goal);
  const newSlots = Math.max(0, goal - reviewCount);
  const newCount = Math.min(input.newWords.length, input.newAllowance, newSlots);

  const reviews = input.due.slice(0, reviewCount);
  const news = input.newWords.slice(0, newCount);
  return {
    items: interleave(reviews, news),
    reviewCount,
    newCount,
  };
}
