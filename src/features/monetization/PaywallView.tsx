// The Pro screen's layout. app/paywall.tsx owns the RevenueCat calls and the
// alerts; this renders whatever state they leave behind.

import { View } from 'react-native';
import { Body, Button, Card, Divider, H1, H2, Muted, Row, Screen, Spacer } from '@/components/ui';
import type { PurchasesPackage } from '@/lib/purchases';

const BENEFITS = [
  'Unlimited new words every day',
  'Every game mode, including write-your-own with instant feedback',
  'Personalized examples and memory hooks tuned to your interests',
  'Advanced stats and offline audio',
];

export interface PaywallViewProps {
  /** Empty until the offerings load, and always empty when purchases are off. */
  packages: PurchasesPackage[];
  /** False in builds without store keys or with the RevenueCat flag off. */
  purchasesAvailable: boolean;
  busy: boolean;
  isPro: boolean;
  /** Demo builds can flip the local Pro flag to try Pro features. */
  showDemoControls: boolean;
  onBuy: (identifier: string) => void;
  onRestore: () => void;
  onToggleDemoPro: () => void;
  onDismiss: () => void;
}

export function PaywallView({
  packages,
  purchasesAvailable,
  busy,
  isPro,
  showDemoControls,
  onBuy,
  onRestore,
  onToggleDemoPro,
  onDismiss,
}: PaywallViewProps) {
  return (
    <Screen scroll>
      <Spacer h={16} />
      <H1>Little Lexicon Pro</H1>
      <Muted className="mt-2">Go further, faster. Cancel anytime.</Muted>

      <Card className="mt-5">
        {BENEFITS.map((b, i) => (
          <Row key={b} className={`gap-3 ${i > 0 ? 'mt-3' : ''}`}>
            <Body className="text-success">✓</Body>
            <Body className="flex-1">{b}</Body>
          </Row>
        ))}
      </Card>

      <Spacer h={20} />

      {purchasesAvailable && packages.length > 0 ? (
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
                <Button title="Choose" onPress={() => onBuy(pkg.identifier)} loading={busy} />
              </View>
            </Card>
          ))}
          <Button title="Restore purchases" variant="ghost" onPress={onRestore} disabled={busy} />
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

      {showDemoControls ? (
        <>
          <Divider />
          <Muted>Demo only</Muted>
          <View className="mt-2">
            <Button
              title={isPro ? 'Turn off demo Pro' : 'Unlock Pro (demo)'}
              variant="secondary"
              onPress={onToggleDemoPro}
            />
          </View>
          <Muted className="mt-2">
            This flips the local Pro flag so you can try Pro features. In production the flag is
            set by the RevenueCat webhook, never the client.
          </Muted>
        </>
      ) : null}

      <Spacer h={20} />
      <Button title="Maybe later" variant="ghost" onPress={onDismiss} />
    </Screen>
  );
}
