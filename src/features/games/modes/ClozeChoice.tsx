// Cloze with choices: an example sentence with the word blanked out, and four
// words to fill it. Recognition in context, so it is offered earlier than the
// typed cloze. The 50/50 hint works as it does in multiple choice.

import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Label, Note } from '@/components/ui';
import { makeClozeBlank } from '@/lib/text';
import type { GameOutcome } from '@/srs/srs';
import { useGameContext, useNextDueLabel } from '../GameContext';
import {
  buildClozeChoice,
  mulberry32,
  type ClozeChoice as Choice,
  type Option,
} from '../optionPool';
import { Reveal } from '../Reveal';
import { Prompt } from '../Prompt';
import { makeOutcome, type GameModeProps } from '../modeTypes';
import { MultipleChoice } from './MultipleChoice';
import { OptionButton, OptionList } from './OptionButton';

export function ClozeChoice(props: GameModeProps) {
  const { pool } = useGameContext();
  const content = props.item.content;
  // The sentence changes from one review to the next.
  const seed = content.wordId * 100 + 3 + (props.item.state?.reps ?? 0);
  const choice = useMemo(
    () => buildClozeChoice(content, pool, mulberry32(seed)),
    // Built once per question, so a refill that grows the pool cannot reshuffle it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed],
  );
  // The ladder picks this mode only when a choice can be built, so this is a
  // guard rather than a path the app takes.
  if (!choice) return <MultipleChoice {...props} mode="mc_def_to_word" />;
  return <ClozeChoiceQuestion {...props} choice={choice} />;
}

function ClozeChoiceQuestion({
  item,
  onOutcome,
  soundEnabled,
  choice,
}: GameModeProps & { choice: Choice }) {
  const { example, options } = choice;
  const startedAt = useRef(Date.now()).current;
  const [answered, setAnswered] = useState<Option | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const nextDueLabel = useNextDueLabel(item, outcome);

  const blanked = makeClozeBlank(
    example.text,
    example.clozeTarget ?? item.content.headword,
  );

  function choose(opt: Option) {
    if (answered) return;
    setAnswered(opt);
    // The clock stops here, not at Continue: reading the reveal is not answering.
    setOutcome(makeOutcome(opt.correct, startedAt, hintUsed));
  }

  function takeHint() {
    if (hintUsed || answered) return;
    // 50/50: eliminate one wrong option.
    const wrong = options.find((o) => !o.correct && !eliminated.has(o.text));
    if (wrong) setEliminated(new Set([...eliminated, wrong.text]));
    setHintUsed(true);
  }

  return (
    <View>
      <Label>Choose the missing word</Label>
      <Prompt className="mt-3 font-serif text-[24px] leading-[35px]">{blanked}</Prompt>

      <View className="mt-5">
        <OptionList>
          {options.map((opt, i) => {
            const state = !answered
              ? eliminated.has(opt.text)
                ? 'muted'
                : 'idle'
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
                disabled={!!answered || eliminated.has(opt.text)}
                onPress={() => choose(opt)}
              />
            );
          })}
        </OptionList>
      </View>

      {!answered ? (
        <View className="mt-4 flex-row flex-wrap items-center justify-between gap-2">
          <Note>Pick the word that best fits the sentence.</Note>
          <Button
            title="Hint (50/50)"
            variant="ghost"
            className="px-0"
            onPress={takeHint}
            disabled={hintUsed}
          />
        </View>
      ) : (
        <Reveal
          correct={answered.correct}
          content={item.content}
          example={example}
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
