// Cloze: fill the blank in an example sentence (Phase 3.4). Typed answer with
// typo tolerance. The first letter and the length are shown for free; the hint
// shows about a third of the word and downgrades to Hard.

import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Label, TextField } from '@/components/ui';
import {
  FREE_LETTERS,
  gradeAnswer,
  hintLetters,
  makeClozeBlank,
  type AnswerGrade,
} from '@/lib/text';
import { avoidShown, exampleFor } from '@/lib/examples';
import type { GameOutcome } from '@/srs/srs';
import { useGameContext, useNextDueLabel } from '../GameContext';
import { LetterCue } from '../LetterCue';
import { mulberry32 } from '../optionPool';
import { Reveal } from '../Reveal';
import { Prompt } from '../Prompt';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function Cloze({ item, onOutcome, soundEnabled }: GameModeProps) {
  const content = item.content;
  void useGameContext(); // ensure used within a provider
  const startedAt = useRef(Date.now()).current;

  // Pick a sentence that has a cloze target, other than the one this visit
  // shows on the other screens when there is another (lib/examples).
  const example = useMemo(() => {
    const shown = exampleFor(item);
    const withTarget = avoidShown(
      content.senses
        .flatMap((s) => s.examples)
        .filter((e) => (e.clozeTarget ?? '').trim() !== ''),
      shown,
    );
    const rng = mulberry32(content.wordId + 7);
    return withTarget.length > 0
      ? withTarget[Math.floor(rng() * withTarget.length)]!
      : shown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.wordId]);

  const target = example?.clozeTarget ?? content.headword;
  const blanked = example ? makeClozeBlank(example.text, target) : '';

  const [value, setValue] = useState('');
  const [grade, setGrade] = useState<AnswerGrade | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const nextDueLabel = useNextDueLabel(item, outcome);

  function finish(result: AnswerGrade) {
    if (grade !== null) return;
    setGrade(result);
    // The clock stops here, not at Continue: reading the reveal is not answering.
    setOutcome(makeOutcome(result !== 'wrong', startedAt, hintUsed));
  }

  function submit() {
    finish(gradeAnswer(value, target));
  }

  function showAnswer() {
    // Give up: counts as incorrect.
    finish('wrong');
  }

  return (
    <View>
      <Label>Fill in the missing word</Label>
      <Prompt className="mt-3 font-serif text-[24px] leading-[35px]">{blanked}</Prompt>

      {grade === null ? (
        <>
          <TextField
            value={value}
            onChangeText={setValue}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Type the word"
            accessibilityLabel="The missing word"
            className="mt-6"
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          {/* Under the box rather than in its placeholder, so it stays readable
              after the user has started typing. */}
          <LetterCue
            target={target}
            shown={hintUsed ? hintLetters(target) : FREE_LETTERS}
            className="mt-3"
          />
          <View className="mt-6 gap-2">
            <Button title="Check" onPress={submit} disabled={value.trim() === ''} />
            <Button
              title={hintUsed ? 'Show answer' : 'Hint'}
              variant="ghost"
              onPress={() => (hintUsed ? showAnswer() : setHintUsed(true))}
            />
          </View>
        </>
      ) : (
        <Reveal
          correct={grade !== 'wrong'}
          content={content}
          example={example}
          soundEnabled={soundEnabled}
          attempt={{ text: value, grade }}
          nextDueLabel={nextDueLabel}
          onContinue={() => {
            if (outcome) onOutcome(outcome);
          }}
        />
      )}
    </View>
  );
}
