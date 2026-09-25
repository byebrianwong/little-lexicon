// Shared reveal shown after every answer: correctness, the correct answer, one
// example, and audio (Phase 3.1). Modes render this in their answered state so
// audio-on-reveal and the continue affordance are consistent everywhere.

import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import type { ExampleContent, WordContent } from '@/lib/types';
import type { AnswerGrade } from '@/lib/text';
import { speakSentence, speakWord } from '@/lib/audio';
import { Body, Button, Muted } from '@/components/ui';
import { feedbackCorrect, feedbackIncorrect } from './feedback';
import { useScrollToReveal } from './RevealScroll';

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

/**
 * What the user typed, for the modes with a text box. The panel uses it to say
 * "close enough" when a typo was accepted, and to show a wrong attempt next to
 * the word that was wanted. Tap-to-choose modes leave it out.
 */
export interface RevealAttempt {
  text: string;
  grade: AnswerGrade;
}

export function Reveal({
  correct,
  content,
  example,
  onContinue,
  nextDueLabel,
  soundEnabled,
  attempt,
}: {
  correct: boolean;
  content: WordContent;
  example?: ExampleContent | null;
  onContinue: () => void;
  nextDueLabel?: string | null;
  soundEnabled: boolean;
  attempt?: RevealAttempt | null;
}) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const scrollToReveal = useScrollToReveal();
  const scrolled = useRef(false);

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    if (correct) feedbackCorrect(soundEnabled);
    else feedbackIncorrect(soundEnabled);
    speakWord(content.headword, content.audioUrl);
    // Play once on reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the panel has a size, the question area can bring it on screen. Only
  // the first layout counts: the panel is the last thing in the question, and
  // later layouts (the spring finishing, a font loading) should not re-scroll.
  function onLayout() {
    if (scrolled.current) return;
    scrolled.current = true;
    requestAnimationFrame(scrollToReveal);
  }

  const primaryDef =
    content.senses[0]?.plainLanguageDefinition ?? content.senses[0]?.definition ?? '';

  const nearMiss = correct && attempt?.grade === 'near';
  const title = !correct ? 'Not quite' : nearMiss ? 'Close enough' : 'Correct';
  const typed = attempt && attempt.grade !== 'exact' ? attempt.text.trim() : '';

  return (
    <Animated.View style={{ transform: [{ scale }] }} className="mt-4" onLayout={onLayout}>
      <View
        className={`rounded-2xl border p-4 ${
          correct ? 'border-success bg-success/10' : 'border-danger bg-danger/10'
        }`}
      >
        <Text
          className={`text-lg font-bold ${correct ? 'text-success' : 'text-danger'}`}
        >
          {title}
        </Text>
        {typed !== '' ? <Muted className="mt-1">{`You typed "${typed}"`}</Muted> : null}
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
