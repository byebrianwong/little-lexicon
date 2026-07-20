// Cloze: fill the blank in an example sentence (Phase 3.4). Typed answer with
// typo tolerance; a hint reveals the first letter and downgrades to Hard.

import { useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Body, Button, Muted } from '@/components/ui';
import { isNearMatch, makeClozeBlank } from '@/lib/text';
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
  const [answered, setAnswered] = useState<null | boolean>(null);
  const [hintUsed, setHintUsed] = useState(false);

  function submit() {
    if (answered !== null) return;
    const correct = isNearMatch(value, target);
    setAnswered(correct);
  }

  function reveal() {
    if (answered !== null) return;
    // Give up: counts as incorrect.
    setAnswered(false);
  }

  return (
    <View>
      <Muted>Fill in the missing word</Muted>
      <Body className="mt-3 text-lg leading-7">{blanked}</Body>

      {answered === null ? (
        <>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={hintUsed ? `Starts with "${target[0]}"` : 'Type the word'}
            placeholderTextColor="#6B7699"
            className="mt-5 rounded-2xl border border-border bg-surface px-4 py-4 text-text text-base"
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <View className="mt-4 gap-3">
            <Button title="Check" onPress={submit} disabled={value.trim() === ''} />
            <Button
              title={hintUsed ? 'Reveal answer' : 'Hint'}
              variant="ghost"
              onPress={() => (hintUsed ? reveal() : setHintUsed(true))}
            />
          </View>
        </>
      ) : (
        <Reveal
          correct={answered}
          content={content}
          example={example}
          soundEnabled={soundEnabled}
          onContinue={() => onOutcome(makeOutcome(answered, startedAt, hintUsed))}
        />
      )}
    </View>
  );
}
