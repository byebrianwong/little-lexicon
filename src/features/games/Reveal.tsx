// Shared reveal shown after every answer: correctness, the correct answer, one
// example, and audio (Phase 3.1). Modes render this in their answered state so
// audio-on-reveal and the continue affordance are consistent everywhere.

import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import type { ExampleContent, WordContent } from '@/lib/types';
import { speakSentence, speakWord } from '@/lib/audio';
import { Body, Button, Muted } from '@/components/ui';
import { feedbackCorrect, feedbackIncorrect } from './feedback';

export function AudioButton({
  onPress,
  label = 'Play audio',
}: {
  onPress: () => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-2 self-start rounded-full bg-surface2 px-4 py-2 active:opacity-70"
    >
      <Text className="text-lg">🔊</Text>
      <Text className="text-muted text-sm font-medium">{label}</Text>
    </Pressable>
  );
}

export function Reveal({
  correct,
  content,
  example,
  onContinue,
  nextDueLabel,
  soundEnabled,
}: {
  correct: boolean;
  content: WordContent;
  example?: ExampleContent | null;
  onContinue: () => void;
  nextDueLabel?: string | null;
  soundEnabled: boolean;
}) {
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    if (correct) feedbackCorrect(soundEnabled);
    else feedbackIncorrect(soundEnabled);
    speakWord(content.headword, content.audioUrl);
    // Play once on reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryDef =
    content.senses[0]?.plainLanguageDefinition ?? content.senses[0]?.definition ?? '';

  return (
    <Animated.View style={{ transform: [{ scale }] }} className="mt-4">
      <View
        className={`rounded-2xl border p-4 ${
          correct ? 'border-success bg-success/10' : 'border-danger bg-danger/10'
        }`}
      >
        <Text
          className={`text-lg font-bold ${correct ? 'text-success' : 'text-danger'}`}
        >
          {correct ? 'Correct' : 'Not quite'}
        </Text>
        <View className="mt-2 flex-row items-center gap-3">
          <Text className="text-text text-2xl font-bold">{content.headword}</Text>
          {content.ipa ? <Muted>{content.ipa}</Muted> : null}
        </View>
        <Body className="mt-1 text-muted">{primaryDef}</Body>
        {example ? (
          <Pressable
            onPress={() => speakSentence(example.text, example.audioUrl)}
            className="mt-3 active:opacity-70"
          >
            <Body className="italic">{`"${example.text}"`}</Body>
          </Pressable>
        ) : null}
        <View className="mt-3">
          <AudioButton onPress={() => speakWord(content.headword, content.audioUrl)} />
        </View>
      </View>

      {nextDueLabel ? <Muted className="mt-2">{`Next review ${nextDueLabel}`}</Muted> : null}

      <View className="mt-4">
        <Button title="Continue" onPress={onContinue} />
      </View>
    </Animated.View>
  );
}
