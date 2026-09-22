import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Body, Button, Card, H1, H2, Muted, Pill, Row, Screen, Spacer } from '@/components/ui';
import { useSessionResult } from '@/features/session/sessionResult';
import { achievementByCode } from '@/features/gamification/achievements';

export default function Summary() {
  const summary = useSessionResult((s) => s.summary);
  const clear = useSessionResult((s) => s.clear);

  if (!summary) return <Redirect href="/(app)" />;

  const accuracyPct = Math.round(summary.accuracy * 100);

  function done() {
    clear();
    router.replace('/(app)');
  }

  return (
    <Screen scroll>
      <Spacer h={24} />
      <View className="items-center">
        <H1>{summary.goalMet ? 'Goal met 🎉' : 'Session complete'}</H1>
        <Muted className="mt-2">
          {summary.goalMet
            ? `Streak is now ${summary.streakCount} day${summary.streakCount === 1 ? '' : 's'}.`
            : 'Every review counts. Keep going whenever you have the time.'}
        </Muted>
      </View>

      <Row className="mt-6 gap-3">
        <Metric label="Reviewed" value={`${summary.reviewed}`} />
        <Metric label="Accuracy" value={`${accuracyPct}%`} />
        <Metric label="XP" value={`+${summary.xpEarned}`} />
      </Row>

      {summary.newWords > 0 ? (
        <Card className="mt-4">
          <Body>{`You learned ${summary.newWords} new word${summary.newWords === 1 ? '' : 's'} in that session.`}</Body>
        </Card>
      ) : null}

      {summary.newAchievements.length > 0 ? (
        <Card className="mt-4 border-gold">
          <H2>Achievements unlocked</H2>
          <View className="mt-3 gap-3">
            {summary.newAchievements.map((code) => {
              const a = achievementByCode(code);
              return (
                <Row key={code} className="gap-3">
                  <Pill tone="gold">★</Pill>
                  <View className="flex-1">
                    <Body className="font-semibold">{a?.title ?? code}</Body>
                    {a?.description ? <Muted>{a.description}</Muted> : null}
                  </View>
                </Row>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Spacer h={28} />
      <Button title="Done" onPress={done} />
      <Spacer h={10} />
      <Button
        title="Keep going"
        variant="secondary"
        onPress={() => {
          clear();
          router.replace('/session');
        }}
      />
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1 items-center">
      <H2>{value}</H2>
      <Muted className="mt-1">{label}</Muted>
    </Card>
  );
}
