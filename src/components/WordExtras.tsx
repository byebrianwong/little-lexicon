// A word's extra lines, shared by every screen that shows a word: the tone
// label beside the part of speech, the "Watch out" note under the definition,
// and short labelled lines for similar and opposite words, other meanings,
// common pairings, the origin and words from the same root. What goes in each
// line is decided in lib/wordExtras; a screen chooses which lines it shows.
//
// Each line is one run of text that starts with a small-caps label, so it
// wraps like a dictionary entry and costs no more height than its words. A
// line with nothing in it is left out, label and all.

import { useState } from 'react';
import { Text, View } from 'react-native';
import { cx, Label, TextButton } from '@/components/ui';
import { tw } from '@/components/tw';
import {
  linesToShow,
  type ExtraLine,
  type RootWord,
  type WordExtras,
} from '@/lib/wordExtras';
import type { Register } from '@/lib/types';

/** The tone label, set like "Tier 3" next to the part of speech. Nothing for a neutral word. */
export function ToneLabel({ tone, className }: { tone: Register | null; className?: string }) {
  return tone ? <Label className={className}>{tone}</Label> : null;
}

/**
 * One labelled line. The label is part of the same text, so a long line wraps
 * under its label instead of in a narrow column beside it.
 */
function Line({
  label,
  labelTone = 'graphite',
  size = 'sm',
  children,
}: {
  label?: string;
  labelTone?: 'graphite' | 'ink';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}) {
  const leading = size === 'md' ? 'leading-[25px]' : 'leading-[23px]';
  return (
    <Text
      className={cx(
        'font-serif text-ink',
        size === 'md' ? 'text-[17px]' : 'text-[16px]',
        leading,
      )}
    >
      {label ? (
        <>
          {/* Same line height as the text, so the label does not change the line's spacing. */}
          <Label tone={labelTone} className={leading}>
            {label}
          </Label>
          {'  '}
        </>
      ) : null}
      {children}
    </Text>
  );
}

/**
 * The note on a common misreading, under the definition. It is never folded
 * away, because it changes how the word is understood.
 */
export function WatchOut({ note, className }: { note: string | null; className?: string }) {
  if (!note) return null;
  return (
    <View className={className}>
      <Line label="Watch out" labelTone="ink" size="md">
        {note}
      </Line>
    </View>
  );
}

function SameRoot({
  words,
  onRootWord,
}: {
  words: RootWord[];
  onRootWord?: (word: RootWord) => void;
}) {
  if (!onRootWord) {
    return <Line label="Same root">{words.map((w) => w.headword).join(', ')}</Line>;
  }
  // Each word is its own control, at the app's 44 px hit height.
  return (
    <View className="flex-row flex-wrap items-center gap-x-4">
      <Label>Same root</Label>
      {words.map((w) => (
        <TextButton
          key={w.wordId}
          label={w.headword}
          role="link"
          // Starts with the visible text, so voice control finds it.
          accessibilityLabel={`${w.headword}: show this word`}
          onPress={() => onRootWord(w)}
        />
      ))}
    </View>
  );
}

function ExtraLineView({
  line,
  extras,
  onRootWord,
}: {
  line: ExtraLine;
  extras: WordExtras;
  onRootWord?: (word: RootWord) => void;
}) {
  switch (line) {
    case 'alsoMeans':
      // One line per meaning, each followed by its own tone label.
      return (
        <View className="gap-1">
          {extras.alsoMeans.map((m, i) => (
            <Line key={m.senseId} label={i === 0 ? 'Also means' : undefined}>
              {m.text}
              {m.tone ? (
                <>
                  {'  '}
                  <Label className="leading-[23px]">{m.tone}</Label>
                </>
              ) : null}
            </Line>
          ))}
        </View>
      );
    case 'similar':
      return <Line label="Similar">{extras.similar.join(', ')}</Line>;
    case 'opposite':
      return <Line label="Opposite">{extras.opposite.join(', ')}</Line>;
    case 'pairings':
      // Set in italic, like the example sentences: they are bits of real use.
      return (
        <Line label="Often used">
          <Text className="font-serif-italic">{extras.pairings.join(', ')}</Text>
        </Line>
      );
    case 'origin':
      return <Line label="Origin">{extras.origin}</Line>;
    case 'sameRoot':
      return <SameRoot words={extras.sameRoot} onRootWord={onRootWord} />;
  }
}

/**
 * The asked-for lines that have something in them, always in the same order
 * (lib/wordExtras EXTRA_LINES). Renders nothing when none has.
 */
export function ExtraLines({
  extras,
  lines,
  onRootWord,
  className,
}: {
  extras: WordExtras;
  lines: readonly ExtraLine[];
  /** Makes each "Same root" word a link that calls this. */
  onRootWord?: (word: RootWord) => void;
  className?: string;
}) {
  const shown = linesToShow(extras, lines);
  if (shown.length === 0) return null;
  return (
    <View className={tw('gap-1', className)}>
      {shown.map((line) => (
        <ExtraLineView key={line} line={line} extras={extras} onRootWord={onRootWord} />
      ))}
    </View>
  );
}

/**
 * A "More about this word" toggle over some lines, for a screen that must stay
 * short. Renders nothing when none of the lines has anything in it.
 */
export function MoreAboutWord({
  extras,
  lines,
  className,
}: {
  extras: WordExtras;
  lines: readonly ExtraLine[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (linesToShow(extras, lines).length === 0) return null;
  return (
    <View className={className}>
      <TextButton
        label="More about this word"
        icon={open ? 'chevron-up' : 'chevron-down'}
        expanded={open}
        onPress={() => setOpen(!open)}
      />
      {open ? <ExtraLines extras={extras} lines={lines} className="mt-1" /> : null}
    </View>
  );
}
