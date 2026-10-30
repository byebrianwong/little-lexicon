// Compact introduction shown once before a new word is first quizzed
// (Phase 3.2). Brief per the copy rules: word, part of speech, IPA, plain
// definition, one example, audio for the word and the definition, optional
// mnemonic with its own audio.
//
// Of the extras (components/WordExtras), the card shows the tone label, the
// "Watch out" note, similar and opposite words and the origin. Other meanings,
// pairings and same-root words sit behind "More about this word", so the card
// does not turn into a wall of text.

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Body,
  Button,
  Headword,
  Label,
  Note,
  Pronunciation,
  Row,
  Section,
  Spinner,
} from '@/components/ui';
import { speakDefinition, speakHook, speakWord, stopAudio } from '@/lib/audio';
import { exampleForVisit } from '@/lib/examples';
import type { WordContent } from '@/lib/types';
import { wordExtras, type ExtraLine } from '@/lib/wordExtras';
import { ExtraLines, MoreAboutWord, ToneLabel, WatchOut } from '@/components/WordExtras';
import { backend } from '@/lib/backend';
import { ReportProblem } from '@/features/report/ReportProblem';
import { SaveWordButton } from '@/features/feed/SaveWordButton';
import { aiFeaturesAvailable } from '@/lib/env';
import { AudioButton } from './Reveal';
import { useGameContext } from './GameContext';

const CARD_LINES: readonly ExtraLine[] = ['similar', 'opposite', 'origin'];
const MORE_LINES: readonly ExtraLine[] = ['alsoMeans', 'pairings', 'sameRoot'];

export function WordIntro({
  content,
  collection,
  visit = 0,
  onStart,
}: {
  content: WordContent;
  /** Every word, for "Same root". Left out, that line is empty. */
  collection?: readonly WordContent[];
  /**
   * Earlier meetings with the word (lib/examples), which pick the sentence.
   * A new word has none, so the card shows the sentence the reveal after the
   * first question shows.
   */
  visit?: number;
  onStart: () => void;
}) {
  const sense = content.senses[0];
  const example = exampleForVisit(content, visit);
  const definition = sense?.plainLanguageDefinition ?? sense?.definition ?? '';
  const extras = useMemo(() => wordExtras(content, collection), [content, collection]);
  const { profile, saved } = useGameContext();
  const [personalized, setPersonalized] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    speakWord(content);
    // Stop on Start: the first question often asks for this word, so the
    // audio must not still be playing there.
    return stopAudio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function personalize() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await backend.generatePersonalized({
        wordId: content.wordId,
        headword: content.headword,
        definition,
        kind: 'mnemonic',
        interests: profile.interests,
      });
      setPersonalized(res.text);
    } catch {
      setPersonalized('Could not generate a personalized hook right now.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <View className="flex-1 justify-center">
      <Label tone="accent">New word</Label>
      <View className="mt-2 flex-row flex-wrap items-baseline gap-x-3">
        <Headword>{content.headword}</Headword>
        <Pronunciation
          ipa={content.ipa}
          headword={content.headword}
          onPress={() => speakWord(content)}
        />
      </View>
      <View className="mt-1 flex-row flex-wrap items-baseline gap-x-3">
        {content.partOfSpeech ? (
          <Note className="text-[17px]">{content.partOfSpeech}</Note>
        ) : null}
        <ToneLabel tone={extras.tone} />
        <Label>{`Tier ${content.difficultyTier}`}</Label>
      </View>

      <View className="mt-6 border-t border-ink pt-4">
        <Body className="text-[20px] leading-[29px]">{definition}</Body>
        <WatchOut note={extras.watchOut} className="mt-3" />
        {example ? (
          <Note className="mt-3 text-[17px] leading-[25px]">{`“${example.text}”`}</Note>
        ) : null}
        <Row className="mt-2 flex-wrap gap-x-6">
          {sense ? (
            <AudioButton
              onPress={() => speakDefinition(sense)}
              label="Definition"
              accessibilityLabel="Definition: hear it read out"
            />
          ) : null}
          {saved ? (
            <SaveWordButton
              headword={content.headword}
              saved={saved.savedIds.has(content.wordId)}
              onPress={() => saved.toggle(content)}
            />
          ) : null}
        </Row>
        {/* The audio row's 44 px buttons already leave space above these. */}
        <ExtraLines extras={extras} lines={CARD_LINES} />
        <MoreAboutWord extras={extras} lines={MORE_LINES} />
      </View>

      {content.mnemonics[0] ? (
        <Section label="Memory hook" rule="hairline" className="mt-6">
          <Body>{content.mnemonics[0]}</Body>
          <Row className="mt-2 flex-wrap gap-x-6">
            <AudioButton
              onPress={() => speakHook(content)}
              label="Hook"
              accessibilityLabel="Memory hook: hear it read out"
            />
          </Row>
        </Section>
      ) : null}

      {personalized ? (
        <Section label="For you" rule="hairline" className="mt-6">
          <Body>{personalized}</Body>
        </Section>
      ) : aiFeaturesAvailable && profile.interests.length > 0 ? (
        <View className="mt-4 items-start">
          {generating ? (
            <View className="py-3">
              <Spinner />
            </View>
          ) : (
            <Button
              title="Make it personal"
              variant="ghost"
              className="px-0"
              onPress={personalize}
            />
          )}
        </View>
      ) : null}

      <View className="mt-8">
        <Button title="Got it, quiz me" trailingIcon="arrow-right" onPress={onStart} />
      </View>

      <ReportProblem
        wordId={content.wordId}
        headword={content.headword}
        screen="intro"
        className="mt-4"
      />
    </View>
  );
}
