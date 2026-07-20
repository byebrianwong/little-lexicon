// Renders the right game mode for an item, substituting when a mode is not
// available to this user (e.g. use_it for a free user degrades to production).

import type { GameOutcome } from '@/srs/srs';
import type { GameModeId, SessionItem } from '@/lib/types';
import { isModeAllowed } from '@/features/monetization/limits';
import { useGameContext } from './GameContext';
import { MultipleChoice } from './modes/MultipleChoice';
import { Cloze } from './modes/Cloze';
import { Production } from './modes/Production';
import { RelationMatch } from './modes/RelationMatch';
import { Listening } from './modes/Listening';
import { UseIt } from './modes/UseIt';

export function GameHost({
  item,
  mode,
  onOutcome,
  soundEnabled,
}: {
  item: SessionItem;
  mode: GameModeId;
  onOutcome: (o: GameOutcome) => void;
  soundEnabled: boolean;
}) {
  const { profile } = useGameContext();
  const effective: GameModeId = isModeAllowed(mode, profile) ? mode : 'production';
  const common = { item, onOutcome, soundEnabled };

  switch (effective) {
    case 'mc_def_to_word':
    case 'mc_word_to_def':
      return <MultipleChoice {...common} mode={effective} />;
    case 'cloze':
      return <Cloze {...common} mode={effective} />;
    case 'production':
      return <Production {...common} mode={effective} />;
    case 'synonym_match':
    case 'antonym_match':
      return <RelationMatch {...common} mode={effective} />;
    case 'listening':
      return <Listening {...common} mode={effective} />;
    case 'use_it':
      return <UseIt {...common} mode={effective} />;
    default:
      return <MultipleChoice {...common} mode="mc_word_to_def" />;
  }
}
