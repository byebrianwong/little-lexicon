import { Redirect, router } from 'expo-router';
import { SummaryView } from '@/features/session/SummaryView';
import { useSessionResult } from '@/features/session/sessionResult';

export default function Summary() {
  const summary = useSessionResult((s) => s.summary);
  const clear = useSessionResult((s) => s.clear);

  if (!summary) return <Redirect href="/(app)" />;

  return (
    <SummaryView
      summary={summary}
      onDone={() => {
        clear();
        router.replace('/(app)');
      }}
      onAnother={() => {
        clear();
        router.replace('/session');
      }}
    />
  );
}
