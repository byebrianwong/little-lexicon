import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Divider, H1, H2, Muted, Row, Screen, Spacer } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/features/review/queries';
import {
  getOfferings,
  purchasePackage,
  purchasesEnabled,
  restorePurchases,
  type PurchasesPackage,
} from '@/lib/purchases';
import { isDemoMode } from '@/lib/env';

// Pro covers the two features that call Claude at runtime, because each call
// costs money per use. Nothing about playing is gated: every game mode, every
// word and unlimited sessions are free. The list used to promise "unlimited new
// words every day", which is no longer something Pro unlocks.
const BENEFITS = [
  'Instant feedback on the sentences you write',
  'Personalized examples and memory hooks tuned to your interests',
  'Supports the app and the words added to it',
];

export default function Paywall() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (purchasesEnabled()) getOfferings().then((o) => setPackages(o.packages));
  }, []);

  async function buy(identifier: string) {
    setBusy(true);
    try {
      const active = await purchasePackage(identifier);
      if (active) {
        // The RevenueCat webhook is the source of truth; this refresh is
        // cosmetic until the webhook flips profiles.is_pro server-side.
        Alert.alert('Welcome to Pro', 'Your purchase is being confirmed.');
        router.back();
      }
    } catch (e) {
      Alert.alert('Purchase failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      const active = await restorePurchases();
      Alert.alert(active ? 'Pro restored' : 'Nothing to restore');
      if (active) router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <Spacer h={16} />
      <H1>Little Lexicon Pro</H1>
      <Muted className="mt-2">Cancel anytime.</Muted>

      <Card className="mt-4">
        <Body className="font-semibold">Playing is free and unlimited</Body>
        <Muted className="mt-1">
          Every game mode, every word and as many sessions a day as you like are free. Pro adds
          the two features that use AI, which cost money each time they run.
        </Muted>
      </Card>

      <Card className="mt-5">
        {BENEFITS.map((b, i) => (
          <Row key={b} className={`gap-3 ${i > 0 ? 'mt-3' : ''}`}>
            <Body className="text-success">✓</Body>
            <Body className="flex-1">{b}</Body>
          </Row>
        ))}
      </Card>

      <Spacer h={20} />

      {purchasesEnabled() && packages.length > 0 ? (
        <View className="gap-3">
          {packages.map((pkg) => (
            <Card key={pkg.identifier} className="border-primary">
              <Row className="justify-between">
                <View>
                  <H2>{pkg.period === 'annual' ? 'Annual' : 'Monthly'}</H2>
                  <Muted>{pkg.period === 'annual' ? 'Best value' : 'Flexible'}</Muted>
                </View>
                <Body className="text-lg font-bold">{pkg.priceString}</Body>
              </Row>
              <View className="mt-3">
                <Button title="Choose" onPress={() => buy(pkg.identifier)} loading={busy} />
              </View>
            </Card>
          ))}
          <Button title="Restore purchases" variant="ghost" onPress={restore} disabled={busy} />
        </View>
      ) : (
        <Card>
          <Body className="font-semibold">Purchases are not available in this build</Body>
          <Muted className="mt-1">
            Payments are wired through RevenueCat and turn on with the store keys and the
            feature flag. Entitlements are always verified server-side.
          </Muted>
        </Card>
      )}

      {isDemoMode ? (
        <>
          <Divider />
          <Muted>Demo only</Muted>
          <View className="mt-2">
            <Button
              title={profile.data?.isPro ? 'Turn off demo Pro' : 'Unlock Pro (demo)'}
              variant="secondary"
              onPress={() =>
                update.mutate(
                  { isPro: !profile.data?.isPro },
                  { onSuccess: () => router.back() },
                )
              }
            />
          </View>
          <Muted className="mt-2">
            This flips the local Pro flag so you can try Pro features. In production the flag is
            set by the RevenueCat webhook, never the client.
          </Muted>
        </>
      ) : null}

      <Spacer h={20} />
      <Button title="Maybe later" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
