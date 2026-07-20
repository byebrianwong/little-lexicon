import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Body, Button, H1, H2, Muted, ProgressBar, Row } from '@/components/ui';
import type { SessionItem } from '@/lib/types';
import { useProfile } from '@/features/review/queries';
import { backend } from '@/lib/backend';
import { submitReview } from '@/features/review/submitReview';
import {
  buildOptionPool,
  buildOptions,
  mulberry32,
  pickDefinitionDistractors,
  type Option,
} from '@/features/games/optionPool';
import { OptionButton } from '@/features/games/modes/OptionButton';
import { useSessionResult } from '@/features/session/sessionResult';
import { FAST_THRESHOLD_MS } from '@/srs/srs';

const ROUND_SECONDS = 60;

export default function SpeedRound() {
  const profileQuery = useProfile();
  const setSummary = useSessionResult((s) => s.setSummary);
  const qc = useQueryClient();

  const [items, setItems] = useState<SessionItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Option | null>(null);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const startedAt = useRef(Date.now());
  const itemStart = useRef(Date.now());
  const totals = useRef({ reviewed: 0, correct: 0, xp: 0 });
  const finished = useRef(false);

  useEffect(() => {
    (async () => {
      const due = await backend.getDueQueue(40);
      const fresh = due.length < 10 ? await backend.getNewWords(15) : [];
      setItems([...due, ...fresh]);
    })().catch(() => setItems([]));
  }, []);

  const pool = useMemo(() => buildOptionPool(items ?? []), [items]);
  const current = items?.[index];
  const sense = current?.content.senses[0];

  const options = useMemo<Option[]>(() => {
    if (!current || !sense) return [];
    const rng = mulberry32(current.content.wordId + 21);
    const d = pickDefinitionDistractors(sense, pool, current.content.wordId, 3, rng);
    return buildOptions(sense.definition, d, rng);
  }, [current, sense, pool]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    const t = totals.current;
    setSummary({
      reviewed: t.reviewed,
      correct: t.correct,
      xpEarned: t.xp,
      newWords: 0,
      accuracy: t.reviewed > 0 ? t.correct / t.reviewed : 0,
      goalMet: false,
      streakCount: profileQuery.data?.streakCount ?? 0,
      newAchievements: [],
    });
    qc.invalidateQueries();
    router.replace('/summary');
  }, [profileQuery.data, qc, setSummary]);

  // Countdown.
  useEffect(() => {
    if (items === null) return;
    const id = setInterval(() => {
      const left = ROUND_SECONDS - Math.floor((Date.now() - startedAt.current) / 1000);
      setRemaining(left);
      if (left <= 0) finish();
    }, 250);
    return () => clearInterval(id);
  }, [items, finish]);

  async function choose(opt: Option) {
    if (chosen || !current || !profileQuery.data) return;
    setChosen(opt);
    const responseMs = Date.now() - itemStart.current;
    try {
      const commit = await submitReview({
        item: current,
        outcome: {
          correct: opt.correct,
          firstAttempt: true,
          hintUsed: false,
          responseMs,
        },
        mode: 'mc_word_to_def',
        profile: profileQuery.data,
      });
      totals.current = {
        reviewed: totals.current.reviewed + 1,
        correct: totals.current.correct + (commit.correct ? 1 : 0),
        xp: totals.current.xp + commit.xp,
      };
    } catch {
      totals.current.reviewed += 1;
    }
    // Auto-advance quickly for the lightning feel.
    setTimeout(() => {
      setChosen(null);
      itemStart.current = Date.now();
      const next = index + 1;
      if (!items || next >= items.length) finish();
      else setIndex(next);
    }, 450);
  }

  if (items === null || profileQuery.isLoading) {
    return (
      <Center>
        <ActivityIndicator color="#6C8CFF" size="large" />
      </Center>
    );
  }

  if (items.length === 0) {
    return (
      <Center>
        <View className="items-center px-8">
          <Text className="text-5xl">⚡️</Text>
          <H2 className="mt-4 text-center">Nothing to race yet</H2>
          <Muted className="mt-2 text-center">
            Learn a few words first, then come back for a speed round.
          </Muted>
          <View className="mt-6 w-full">
            <Button title="Back" onPress={() => router.replace('/(app)')} />
          </View>
        </View>
      </Center>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="px-5 pt-2">
        <Row className="items-center gap-3">
          <Pressable
            onPress={() => router.replace('/(app)')}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface2"
          >
            <Text className="text-text text-lg">✕</Text>
          </Pressable>
          <View className="flex-1">
            <ProgressBar fraction={Math.max(0, remaining) / ROUND_SECONDS} />
          </View>
          <Muted>{`${Math.max(0, remaining)}s`}</Muted>
        </Row>
      </View>

      <View className="flex-1 px-5 pt-8">
        <Row className="justify-between">
          <H1>{current?.content.headword}</H1>
          <Muted>{`⚡️ ${totals.current.reviewed}`}</Muted>
        </Row>
        <Body className="mt-2 text-muted">Pick the meaning, fast.</Body>

        <View className="mt-6">
          {options.map((opt) => {
            const state = !chosen
              ? 'idle'
              : opt.correct
                ? 'correct'
                : opt === chosen
                  ? 'wrong'
                  : 'muted';
            return (
              <OptionButton
                key={opt.text}
                label={opt.text}
                state={state}
                disabled={!!chosen}
                onPress={() => choose(opt)}
              />
            );
          })}
        </View>
        <Muted className="mt-2">
          {`Fast answers under ${Math.round(FAST_THRESHOLD_MS / 1000)}s earn bonus XP.`}
        </Muted>
      </View>
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-bg">{children}</SafeAreaView>
  );
}
