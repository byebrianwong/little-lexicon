// Production: recall and type the word from its meaning (Phase 4.1). Highest
// retrieval demand. Accepts exact spelling and near-miss typos, but only the
// target headword (a synonym does not count).

import { useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Body, Button, H2, Muted } from '@/components/ui';
import { gradeAnswer, type AnswerGrade } from '@/lib/text';
import { mulberry32 } from '../optionPool';
import { Reveal } from '../Reveal';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function Production({ item, onOutcome, soundEnabled }: GameModeProps) {
  const content = item.content;
  const sense = content.senses[0]!;
  const startedAt = useRef(Date.now()).current;
  const [value, setValue] = useState('');
  const [grade, setGrade] = useState<AnswerGrade | null>(null);
  const [hintUsed, setHintUsed] = useState(false);

  // Vary the prompt: definition, or a "the word that means X" synonym cue.
  const prompt = useMemo(() => {
    const rng = mulberry32(content.wordId + 3);
    const syn = content.relations.find((r) => r.relationType === 'synonym');
    if (syn && rng() > 0.5) return `The word that means "${syn.relatedLemma}"`;
    return sense.plainLanguageDefinition ?? sense.definition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.wordId]);

  function submit() {
    if (grade !== null) return;
    // Only the exact target headword counts (synonyms are rejected).
    setGrade(gradeAnswer(value, content.headword));
  }

  const hint = hintUsed
    ? `${content.headword.slice(0, Math.ceil(content.headword.length / 3))}…  (${content.headword.length} letters)`
    : null;

  return (
    <View>
      <Muted>Type the word</Muted>
      <H2 className="mt-2">{prompt}</H2>
      {content.partOfSpeech ? <Muted className="mt-1">{content.partOfSpeech}</Muted> : null}

      {grade === null ? (
        <>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Your answer"
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
              onPress={() => (hintUsed ? setGrade('wrong') : setHintUsed(true))}
            />
          </View>
        </>
      ) : (
        <Reveal
          correct={grade !== 'wrong'}
          content={content}
          example={sense.examples[0] ?? null}
          soundEnabled={soundEnabled}
          attempt={{ text: value, grade }}
          onContinue={() => onOutcome(makeOutcome(grade !== 'wrong', startedAt, hintUsed))}
        />
      )}

      {grade === null ? <Body className="mt-3 text-muted">Spell the exact word.</Body> : null}
    </View>
  );
}
