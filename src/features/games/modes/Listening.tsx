// Listening (Phase 4.3): play audio first with the word hidden, then identify
// it. Recognition variant (pick the word). Falls back gracefully: if speech and
// clip are both unavailable the buttons still work, just without sound.

import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Label, Note } from '@/components/ui';
import { speakWord } from '@/lib/audio';
import type { GameOutcome } from '@/srs/srs';
import { useGameContext, useNextDueLabel } from '../GameContext';
import {
  buildOptions,
  mulberry32,
  pickWordDistractors,
  type Option,
} from '../optionPool';
import { AudioButton, Reveal } from '../Reveal';
import { OptionButton, OptionList } from './OptionButton';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function Listening({ item, onOutcome, soundEnabled }: GameModeProps) {
  const { pool } = useGameContext();
  const content = item.content;
  const startedAt = useRef(Date.now()).current;
  const [answered, setAnswered] = useState<Option | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const nextDueLabel = useNextDueLabel(item, outcome);

  function choose(opt: Option) {
    if (answered) return;
    setAnswered(opt);
    // The clock stops here, not at Continue: reading the reveal is not answering.
    setOutcome(makeOutcome(opt.correct, startedAt, false));
  }

  const options = useMemo<Option[]>(() => {
    const rng = mulberry32(content.wordId + 11);
    const distractors = pickWordDistractors(pool, content.wordId, 3, rng);
    return buildOptions(content.headword, distractors, rng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.wordId]);

  useEffect(() => {
    speakWord(content.headword, content.audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View>
      <Label>Listen, then choose the word</Label>
      <View className="mt-2">
        <AudioButton
          onPress={() => speakWord(content.headword, content.audioUrl)}
          label="Play again"
        />
      </View>

      <View className="mt-4">
        <OptionList>
          {options.map((opt, i) => {
            const state = !answered
              ? 'idle'
              : opt.correct
                ? 'correct'
                : opt === answered
                  ? 'wrong'
                  : 'muted';
            return (
              <OptionButton
                key={opt.text}
                index={i}
                label={opt.text}
                state={state}
                disabled={!!answered}
                onPress={() => choose(opt)}
              />
            );
          })}
        </OptionList>
      </View>

      {!answered ? (
        <Note className="mt-4">Tap the word you heard.</Note>
      ) : (
        <Reveal
          correct={answered.correct}
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
