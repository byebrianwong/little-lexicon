// Production: recall and type the word from its meaning (Phase 4.1). Highest
// retrieval demand. Accepts exact spelling and near-miss typos, but only the
// target headword (a synonym does not count).

import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Label, Note, TextField } from '@/components/ui';
import { gradeAnswer, type AnswerGrade } from '@/lib/text';
import type { GameOutcome } from '@/srs/srs';
import { useNextDueLabel } from '../GameContext';
import { mulberry32 } from '../optionPool';
import { Reveal } from '../Reveal';
import { Prompt } from '../Prompt';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function Production({ item, onOutcome, soundEnabled }: GameModeProps) {
  const content = item.content;
  const sense = content.senses[0]!;
  const startedAt = useRef(Date.now()).current;
  const [value, setValue] = useState('');
  const [grade, setGrade] = useState<AnswerGrade | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const nextDueLabel = useNextDueLabel(item, outcome);

  // Vary the prompt: definition, or a "the word that means X" synonym cue.
  const prompt = useMemo(() => {
    const rng = mulberry32(content.wordId + 3);
    const syn = content.relations.find((r) => r.relationType === 'synonym');
    if (syn && rng() > 0.5) return `The word that means "${syn.relatedLemma}"`;
    return sense.plainLanguageDefinition ?? sense.definition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.wordId]);

  function finish(result: AnswerGrade) {
    if (grade !== null) return;
    setGrade(result);
    // The clock stops here, not at Continue: reading the reveal is not answering.
    setOutcome(makeOutcome(result !== 'wrong', startedAt, hintUsed));
  }

  function submit() {
    // Only the exact target headword counts (synonyms are rejected).
    finish(gradeAnswer(value, content.headword));
  }

  const hint = hintUsed
    ? `${content.headword.slice(0, Math.ceil(content.headword.length / 3))}…  (${content.headword.length} letters)`
    : null;

  return (
    <View>
      <Label>Type the word</Label>
      <Prompt className="mt-2">{prompt}</Prompt>
      {content.partOfSpeech ? <Note className="mt-1">{content.partOfSpeech}</Note> : null}

      {grade === null ? (
        <>
          <TextField
            value={value}
            onChangeText={setValue}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Your answer"
            accessibilityLabel="Your answer"
            className="mt-6"
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          {hint ? (
            <Note className="mt-2">{hint}</Note>
          ) : (
            <Note className="mt-2">Spell the exact word.</Note>
          )}
          <View className="mt-6 gap-2">
            <Button title="Check" onPress={submit} disabled={value.trim() === ''} />
            <Button
              title={hintUsed ? 'Show answer' : 'Hint'}
              variant="ghost"
              onPress={() => (hintUsed ? finish('wrong') : setHintUsed(true))}
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
          nextDueLabel={nextDueLabel}
          onContinue={() => {
            if (outcome) onOutcome(outcome);
          }}
        />
      )}
    </View>
  );
}
