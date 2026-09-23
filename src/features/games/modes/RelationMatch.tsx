// Synonym / antonym matching (Phase 4.2). Multi-select: pick every candidate of
// the requested relation from a set mixed with plausible distractors.

import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, H2, Muted } from '@/components/ui';
import { useGameContext } from '../GameContext';
import { mulberry32, pickRelationDistractors, shuffle } from '../optionPool';
import { Reveal } from '../Reveal';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function RelationMatch({ item, mode, onOutcome, soundEnabled }: GameModeProps) {
  const { pool } = useGameContext();
  const content = item.content;
  const relationType = mode === 'antonym_match' ? 'antonym' : 'synonym';
  const startedAt = useRef(Date.now()).current;

  const { options, correctSet } = useMemo(() => {
    const rng = mulberry32(content.wordId + (relationType === 'antonym' ? 5 : 4));
    const all = content.relations
      .filter((r) => r.relationType === relationType)
      .map((r) => r.relatedLemma);
    const correct = shuffle(all, rng).slice(0, Math.min(2, all.length));
    const distractors = pickRelationDistractors(
      pool,
      [...correct, content.headword, ...all],
      Math.max(2, 5 - correct.length),
      rng,
    );
    return {
      options: shuffle([...correct, ...distractors], rng),
      correctSet: new Set(correct.map((c) => c.toLowerCase())),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.wordId, relationType]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState<null | boolean>(null);

  function toggle(opt: string) {
    if (answered !== null) return;
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    setSelected(next);
  }

  function submit() {
    if (answered !== null) return;
    const chosen = new Set([...selected].map((s) => s.toLowerCase()));
    const correct =
      chosen.size === correctSet.size && [...chosen].every((c) => correctSet.has(c));
    setAnswered(correct);
  }

  return (
    <View>
      <Muted>{`Select every ${relationType} of`}</Muted>
      <H2 className="mt-1">{content.headword}</H2>

      <View className="mt-5">
        {options.map((opt) => {
          const isSel = selected.has(opt);
          const isCorrect = correctSet.has(opt.toLowerCase());
          const cls =
            answered === null
              ? isSel
                ? 'border-primary bg-primary/15'
                : 'border-border bg-surface'
              : isCorrect
                ? 'border-success bg-success/15'
                : isSel
                  ? 'border-danger bg-danger/15'
                  : 'border-border bg-surface opacity-60';
          return (
            <Pressable
              key={opt}
              // Without an explicit role these rows reach a screen reader as
              // plain text, so the choice is invisible to anyone not looking at
              // the screen. `selected` carries the tick mark's meaning.
              accessibilityRole="button"
              accessibilityState={{ selected: isSel, disabled: answered !== null }}
              onPress={() => toggle(opt)}
              disabled={answered !== null}
              className={`flex-row items-center justify-between rounded-2xl border px-4 py-4 mb-3 ${cls}`}
            >
              <Text className="text-text text-base">{opt}</Text>
              {isSel ? <Text className="text-primary text-base">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {answered === null ? (
        <Button title="Check" onPress={submit} disabled={selected.size === 0} />
      ) : (
        <Reveal
          correct={answered}
          content={content}
          example={content.senses[0]?.examples[0] ?? null}
          soundEnabled={soundEnabled}
          onContinue={() => onOutcome(makeOutcome(answered, startedAt, false))}
        />
      )}
      {answered === null ? (
        <Body className="mt-2 text-muted">You can pick more than one.</Body>
      ) : null}
    </View>
  );
}
