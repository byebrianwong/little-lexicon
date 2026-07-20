// Multiple choice recognition (Phase 3.3). Two variants:
//  - mc_def_to_word: show the definition, pick the headword.
//  - mc_word_to_def: show the headword (+ audio), pick the meaning.
// Also reused by Listening mode with the prompt hidden.

import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, H2, Muted, Row } from '@/components/ui';
import { speakWord } from '@/lib/audio';
import { useGameContext } from '../GameContext';
import {
  buildOptions,
  mulberry32,
  pickDefinitionDistractors,
  pickWordDistractors,
  type Option,
} from '../optionPool';
import { AudioButton, Reveal } from '../Reveal';
import { OptionButton } from './OptionButton';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function MultipleChoice({
  item,
  mode,
  onOutcome,
  soundEnabled,
  audioFirst = false,
}: GameModeProps & { audioFirst?: boolean }) {
  const { pool } = useGameContext();
  const content = item.content;
  const sense = content.senses[0]!;
  const isDefToWord = mode === 'mc_def_to_word';
  const startedAt = useRef(Date.now()).current;
  const [answered, setAnswered] = useState<Option | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());

  const seed = content.wordId * 100 + (isDefToWord ? 1 : 2);
  const options = useMemo<Option[]>(() => {
    const rng = mulberry32(seed);
    if (isDefToWord) {
      const distractors = pickWordDistractors(pool, content.wordId, 3, rng);
      return buildOptions(content.headword, distractors, rng);
    }
    const distractors = pickDefinitionDistractors(sense, pool, content.wordId, 3, rng);
    return buildOptions(sense.definition, distractors, rng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const prompt = isDefToWord
    ? (sense.plainLanguageDefinition ?? sense.definition)
    : content.headword;

  function choose(opt: Option) {
    if (answered) return;
    setAnswered(opt);
  }

  function useHint() {
    if (hintUsed || answered) return;
    // 50/50: eliminate one wrong option.
    const wrong = options.find((o) => !o.correct && !eliminated.has(o.text));
    if (wrong) setEliminated(new Set([...eliminated, wrong.text]));
    setHintUsed(true);
  }

  return (
    <View>
      <Muted>{isDefToWord ? 'Which word means:' : 'What does this word mean?'}</Muted>
      {isDefToWord ? (
        <H2 className="mt-2">{prompt}</H2>
      ) : (
        <Row className="mt-2 gap-3">
          {!audioFirst ? <H2>{content.headword}</H2> : <H2>🔊 …</H2>}
          <AudioButton onPress={() => speakWord(content.headword, content.audioUrl)} label="Hear it" />
        </Row>
      )}

      <View className="mt-5">
        {options.map((opt) => {
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
              label={opt.text}
              state={state}
              disabled={!!answered || eliminated.has(opt.text)}
              onPress={() => choose(opt)}
            />
          );
        })}
      </View>

      {!answered ? (
        <Button title="Hint (50/50)" variant="ghost" onPress={useHint} disabled={hintUsed} />
      ) : (
        <Reveal
          correct={answered.correct}
          content={content}
          example={sense.examples[0] ?? null}
          soundEnabled={soundEnabled}
          onContinue={() => onOutcome(makeOutcome(answered.correct, startedAt, hintUsed))}
        />
      )}

      {!answered && !isDefToWord ? (
        <Body className="mt-2 text-muted">Tap the meaning you think fits.</Body>
      ) : null}
    </View>
  );
}
