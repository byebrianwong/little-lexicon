// Synonym / antonym matching (Phase 4.2). Multi-select: pick every candidate of
// the requested relation from a set mixed with plausible distractors.

import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Headword, Label, Note, cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import type { GameOutcome } from '@/srs/srs';
import { useGameContext, useNextDueLabel } from '../GameContext';
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
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const nextDueLabel = useNextDueLabel(item, outcome);

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
    // The clock stops here, not at Continue: reading the reveal is not answering.
    setOutcome(makeOutcome(correct, startedAt, false));
  }

  return (
    <View>
      <Label>{`Select every ${relationType} of`}</Label>
      <Headword size="md" className="mt-1">
        {content.headword}
      </Headword>

      <View className="mt-5 border-b border-rule">
        {options.map((opt) => {
          const isSel = selected.has(opt);
          const isCorrect = correctSet.has(opt.toLowerCase());
          // Before checking, a box shows what is picked. After, the red pen
          // marks every right answer and crosses out a wrong pick.
          const mark: 'correct' | 'wrong' | null =
            answered === null ? null : isCorrect ? 'correct' : isSel ? 'wrong' : null;
          const dim = answered !== null && mark === null;
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
              className={cx(
                'min-h-[54px] flex-row items-center gap-3 border-t border-rule py-3',
                answered === null && 'active:bg-paper-deep web:hover:bg-paper-deep',
              )}
            >
              <View
                className={cx(
                  'h-5 w-5 items-center justify-center rounded-[2px] border',
                  isSel ? 'border-ink bg-ink' : 'border-line',
                  dim && 'opacity-50',
                )}
              >
                {isSel ? (
                  <Icon name="check" size={14} color={colors.paper} strokeWidth={2.5} />
                ) : null}
              </View>
              <Text
                className={cx(
                  'flex-1 text-[19px] leading-[27px]',
                  mark === 'correct'
                    ? 'font-serif-medium text-ink'
                    : mark === 'wrong'
                      ? 'font-serif text-graphite line-through'
                      : dim
                        ? 'font-serif text-graphite'
                        : 'font-serif text-ink',
                )}
              >
                {opt}
              </Text>
              {mark ? (
                <Icon
                  name={mark === 'correct' ? 'check' : 'cross'}
                  color={colors.accent}
                  strokeWidth={2.25}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {answered === null ? (
        <>
          <Note className="mt-4">You can pick more than one.</Note>
          <View className="mt-6">
            <Button title="Check" onPress={submit} disabled={selected.size === 0} />
          </View>
        </>
      ) : (
        <Reveal
          correct={answered}
          content={content}
          example={content.senses[0]?.examples[0] ?? null}
          soundEnabled={soundEnabled}
          nextDueLabel={nextDueLabel}
          onContinue={() => {
            if (outcome) onOutcome(outcome);
          }}
        />
      )}
    </View>
  );
}
