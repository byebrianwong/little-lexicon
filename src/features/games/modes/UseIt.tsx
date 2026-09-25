// "Use it": write your own sentence with the word (Phase 4.4). Highest XP tier.
// Available to everyone. Evaluation is a runtime Claude call routed through an
// Edge Function (rate-limited, key server-side); in demo mode it is a local
// heuristic. Malformed or unavailable evaluation degrades to a neutral, logged
// result rather than blocking the answer.

import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  Headword,
  Label,
  Muted,
  Note,
  Section,
  Spinner,
  TextButton,
  TextField,
} from '@/components/ui';
import { backend, type SentenceFeedback } from '@/lib/backend';
import { speakWord } from '@/lib/audio';
import type { GameOutcome } from '@/srs/srs';
import { useNextDueLabel } from '../GameContext';
import { Reveal } from '../Reveal';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function UseIt({ item, onOutcome, soundEnabled }: GameModeProps) {
  const content = item.content;
  const sense = content.senses[0]!;
  const startedAt = useRef(Date.now()).current;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const nextDueLabel = useNextDueLabel(item, outcome);

  async function evaluate() {
    if (busy || feedback) return;
    setBusy(true);
    // The clock stops when the sentence is handed in, not when the evaluation
    // comes back and not at Continue.
    const answeredAt = Date.now();
    let result: SentenceFeedback;
    try {
      result = await backend.evaluateSentence({
        wordId: content.wordId,
        headword: content.headword,
        sentence: text,
      });
    } catch {
      result = { correct: null, feedback: 'Saved. Evaluation is unavailable right now.' };
    } finally {
      setBusy(false);
    }
    setFeedback(result);
    setOutcome(makeOutcome(result.correct !== false, startedAt, false, answeredAt));
  }

  const correct = feedback ? feedback.correct !== false : false;

  return (
    <View>
      <Label>Write a sentence using</Label>
      <Headword size="md" className="mt-1">
        {content.headword}
      </Headword>
      <Muted className="mt-1">{sense.plainLanguageDefinition ?? sense.definition}</Muted>

      {!feedback ? (
        <>
          <TextField
            variant="box"
            value={text}
            onChangeText={setText}
            autoFocus
            multiline
            placeholder={`Use "${content.headword}" naturally...`}
            accessibilityLabel={`Your sentence using ${content.headword}`}
            className="mt-6"
          />
          <View className="mt-6">
            {busy ? (
              <View className="items-center py-3">
                <Spinner />
              </View>
            ) : (
              <Button
                title="Get feedback"
                onPress={evaluate}
                disabled={text.trim().split(/\s+/).length < 3}
              />
            )}
          </View>
        </>
      ) : (
        <View>
          <Section label="Feedback" className="mt-6">
            <Body>{feedback.feedback}</Body>
            {feedback.suggestion ? (
              <Note className="mt-2">{feedback.suggestion}</Note>
            ) : null}
            <View className="mt-1">
              <TextButton
                icon="speaker"
                label="Hear the word"
                onPress={() => speakWord(content.headword, content.audioUrl)}
              />
            </View>
          </Section>
          <Reveal
            correct={correct}
            content={content}
            example={sense.examples[0] ?? null}
            soundEnabled={soundEnabled}
            nextDueLabel={nextDueLabel}
            onContinue={() => {
              if (outcome) onOutcome(outcome);
            }}
          />
        </View>
      )}
    </View>
  );
}
