// Compact introduction shown once before a new word is first quizzed
// (Phase 3.2). Brief per the copy rules: word, part of speech, IPA, plain
// definition, one example, audio, optional mnemonic.

import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Body, Button, Card, H1, Muted, Pill, Row } from '@/components/ui';
import { speakWord } from '@/lib/audio';
import type { WordContent } from '@/lib/types';
import { backend } from '@/lib/backend';
import { AudioButton } from './Reveal';
import { useGameContext } from './GameContext';

export function WordIntro({
  content,
  onStart,
}: {
  content: WordContent;
  onStart: () => void;
}) {
  const sense = content.senses[0];
  const { profile } = useGameContext();
  const [personalized, setPersonalized] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    speakWord(content.headword, content.audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function personalize() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await backend.generatePersonalized({
        wordId: content.wordId,
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
      <Pill tone="primary">New word</Pill>
      <Row className="mt-3 items-end gap-3">
        <H1>{content.headword}</H1>
        {content.ipa ? <Muted className="pb-1">{content.ipa}</Muted> : null}
      </Row>
      {content.partOfSpeech ? <Muted className="mt-1">{content.partOfSpeech}</Muted> : null}

      <Card className="mt-5">
        <Body className="text-base">
          {sense?.plainLanguageDefinition ?? sense?.definition ?? ''}
        </Body>
        {sense?.examples[0] ? (
          <Body className="mt-3 italic text-muted">{`"${sense.examples[0].text}"`}</Body>
        ) : null}
        <View className="mt-4">
          <AudioButton onPress={() => speakWord(content.headword, content.audioUrl)} label="Hear it" />
        </View>
      </Card>

      {content.mnemonics[0] ? (
        <Card className="mt-3 bg-surface2">
          <Muted className="font-semibold text-muted">Memory hook</Muted>
          <Body className="mt-1">{content.mnemonics[0]}</Body>
        </Card>
      ) : null}

      {personalized ? (
        <Card className="mt-3 border-primary">
          <Muted className="font-semibold text-primary">For you</Muted>
          <Body className="mt-1">{personalized}</Body>
        </Card>
      ) : profile.isPro && profile.interests.length > 0 ? (
        <View className="mt-3">
          {generating ? (
            <View className="items-center py-2">
              <ActivityIndicator color="#6C8CFF" />
            </View>
          ) : (
            <Button title="Make it personal" variant="ghost" onPress={personalize} />
          )}
        </View>
      ) : null}

      <View className="mt-6">
        <Button title="Got it, quiz me" onPress={onStart} />
      </View>
    </View>
  );
}
