// Browse every word in the collection. No scheduling, no gating, no limits:
// the whole dictionary is readable at any time, which is what people expect of
// a vocabulary app even when nothing is due.

import { useQuery } from '@tanstack/react-query';
import { BrowseView } from '@/features/browse/BrowseView';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { backend } from '@/lib/backend';

export default function Browse() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);

  const words = useQuery({
    queryKey: ['allWords'],
    queryFn: () => backend.getAllWords(),
  });

  return (
    <BrowseView words={words.data} isLoading={words.isLoading} soundEnabled={soundEnabled} />
  );
}
