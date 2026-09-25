// Cloze: fill the blank in an example sentence (Phase 3.4). Typed answer with
// typo tolerance; a hint shows the first letter and downgrades to Hard.

import { useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Body, Button, Muted } from '@/components/ui';
import { gradeAnswer, makeClozeBlank, type AnswerGrade } from '@/lib/text';
import { useGameContext } from '../GameContext';
import { mulberry32 } from '../optionPool';
import { Reveal } from '../Reveal';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function Cloze({ item, onOutcome, soundEnabled }: GameModeProps) {
  const content = item.content;
  void useGameContext(); // ensure used within a provider
  const startedAt = useRef(Date.now()).current;

  // Pick a sentence that has a cloze target.
  const example = useMemo(() => {
    const withTarget = content.senses
      .flatMap((s) => s.examples)
      .filter((e) => (e.clozeTarget ?? '').trim() !== '');
    const rng = mulberry32(content.wordId + 7);
    return withTarget.length > 0
      ? withTarget[Math.floor(rng() * withTarget.length)]!
      : (content.senses[0]?.examples[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.wordId]);

  const target = example?.clozeTarget ?? content.headword;
  const blanked = example ? makeClozeBlank(example.text, target) : '';

  const [value, setValue] = useState('');
  const [grade, setGrade] = useState<AnswerGrade | null>(null);
  const [hintUsed, setHintUsed] = useState(false);

  function submit() {
    if (grade !== null) return;
    setGrade(gradeAnswer(value, target));
  }

  function showAnswer() {
    if (grade !== null) return;
    // Give up: counts as incorrect.
    setGrade('wrong');
  }

  // The hint sits under the box rather than in its placeholder, so it stays
  // readable after the user has started typing.
  const hint = hintUsed ? `Starts with "${target[0]}", ${target.length} letters` : null;

  return (
    <View>
      <Muted>Fill in the missing word</Muted>
      <Body className="mt-3 text-lg leading-7">{blanked}</Body>

      {grade === null ? (
        <>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Type the word"
            placeholderTextColor="#6B7699"
            className="mt-5 rounded-2xl border border-border bg-surface px-4 py-4 text-text text-base"
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          {hint ? <Muted className="mt-2">{hint}</Muted> : null}
          <View className="mt-4 gap-3">
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
          onContinue={() => onOutcome(makeOutcome(grade !== 'wrong', startedAt, hintUsed))}
        />
      )}
    </View>
  );
}
