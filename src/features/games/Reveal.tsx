// Shared reveal shown after every answer: correctness, the correct answer, one
// example, and audio (Phase 3.1). Modes render this in their answered state so
// audio-on-reveal and the continue affordance are consistent everywhere.
//
// It is set like a dictionary entry under an ink rule: the verdict in small
// capitals, the word, its definition, then the example in italic.

import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import type { ExampleContent, WordContent } from '@/lib/types';
import type { AnswerGrade } from '@/lib/text';
import { speakSentence, speakWord } from '@/lib/audio';
import {
  Body,
  Button,
  Headword,
  Label,
  Muted,
  Note,
  Row,
  TextButton,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import { feedbackCorrect, feedbackIncorrect } from './feedback';
import { useScrollToReveal } from './RevealScroll';

export function AudioButton({
  onPress,
  label = 'Play audio',
}: {
  onPress: () => void;
  label?: string;
}) {
  return <TextButton icon="speaker" label={label} onPress={onPress} />;
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
  const scrollToReveal = useScrollToReveal();
  const scrolled = useRef(false);

  useEffect(() => {
    if (correct) feedbackCorrect(soundEnabled);
    else feedbackIncorrect(soundEnabled);
    speakWord(content.headword, content.audioUrl);
    // Play once on reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the panel has a size, the question area can bring it on screen. Only
  // the first layout counts: the panel is the last thing in the question, and
  // later layouts (a font loading, say) should not re-scroll.
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
    // No entrance animation. The panel used to spring in from 90% scale; on
    // iOS the native-driven spring could stop short of 1 and leave the panel
    // inset from the question above it, and a calm page suits it better.
    <View onLayout={onLayout}>
      <View className="mt-8 border-t border-ink pt-4">
        <Row className="gap-2">
          <Icon
            name={correct ? 'check' : 'cross'}
            size={16}
            color={colors.accent}
            strokeWidth={2.25}
          />
          <Label tone="accent">{title}</Label>
        </Row>
        {typed !== '' ? <Note className="mt-2">{`You typed "${typed}"`}</Note> : null}

        <View className="mt-3 flex-row flex-wrap items-baseline gap-x-3">
          <Headword size="md">{content.headword}</Headword>
          {content.ipa ? <Muted>{content.ipa}</Muted> : null}
          {content.partOfSpeech ? <Note>{content.partOfSpeech}</Note> : null}
        </View>
        <Body className="mt-2 text-[19px] leading-[27px]">{primaryDef}</Body>
        {example ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Hear the sentence: ${example.text}`}
            onPress={() => speakSentence(example.text, example.audioUrl)}
            className="mt-2 active:opacity-60"
          >
            <Note className="text-[17px] leading-[25px]">{`“${example.text}”`}</Note>
          </Pressable>
        ) : null}
        <View className="mt-2">
          <AudioButton
            onPress={() => speakWord(content.headword, content.audioUrl)}
            label="Hear it"
          />
        </View>
      </View>

      <View className="mt-6 gap-3">
        {nextDueLabel ? (
          <Note className="text-center text-[15px]">{`Next review ${nextDueLabel}`}</Note>
        ) : null}
        <Button title="Continue" onPress={onContinue} />
      </View>
    </View>
  );
}
