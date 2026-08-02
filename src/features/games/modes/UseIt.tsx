// "Use it": write your own sentence with the word (Phase 4.4). Highest XP tier.
// Available to everyone. Evaluation is a runtime Claude call routed through an
// Edge Function (rate-limited, key server-side); in demo mode it is a local
// heuristic. Malformed or unavailable evaluation degrades to a neutral, logged
// result rather than blocking the answer.

import { useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { Body, Button, Card, H2, Muted } from '@/components/ui';
import { backend, type SentenceFeedback } from '@/lib/backend';
import { speakWord } from '@/lib/audio';
import { Reveal } from '../Reveal';
import { makeOutcome, type GameModeProps } from '../modeTypes';

export function UseIt({ item, onOutcome, soundEnabled }: GameModeProps) {
  const content = item.content;
  const sense = content.senses[0]!;
  const startedAt = useRef(Date.now()).current;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<SentenceFeedback | null>(null);

  async function evaluate() {
    if (busy || feedback) return;
    setBusy(true);
    try {
      const result = await backend.evaluateSentence({
        wordId: content.wordId,
        headword: content.headword,
        sentence: text,
      });
      setFeedback(result);
    } catch {
      setFeedback({ correct: null, feedback: 'Saved. Evaluation is unavailable right now.' });
    } finally {
      setBusy(false);
    }
  }

  const correct = feedback ? feedback.correct !== false : false;

  return (
    <View>
      <Muted>Write a sentence using</Muted>
      <H2 className="mt-1">{content.headword}</H2>
      <Body className="mt-1 text-muted">{sense.plainLanguageDefinition ?? sense.definition}</Body>

      {!feedback ? (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={`Use "${content.headword}" naturally...`}
            placeholderTextColor="#6B7699"
            className="mt-5 min-h-24 rounded-2xl border border-border bg-surface px-4 py-3 text-text text-base"
          />
          <View className="mt-4">
            {busy ? (
              <View className="items-center py-3">
                <ActivityIndicator color="#6C8CFF" />
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
          <Card
            className={`mt-5 ${
              feedback.correct === false ? 'border-danger' : 'border-success'
            }`}
          >
            <Body className="font-semibold">{feedback.feedback}</Body>
            {feedback.suggestion ? (
              <Muted className="mt-2">{feedback.suggestion}</Muted>
            ) : null}
          </Card>
          <View className="mt-3">
            <Button
              title="Hear the word"
              variant="ghost"
              onPress={() => speakWord(content.headword, content.audioUrl)}
            />
          </View>
          <Reveal
            correct={correct}
            content={content}
            example={sense.examples[0] ?? null}
            soundEnabled={soundEnabled}
            onContinue={() => onOutcome(makeOutcome(correct, startedAt, false))}
          />
        </View>
      )}
    </View>
  );
}
