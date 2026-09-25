// The Pro screen's layout. app/paywall.tsx owns the RevenueCat calls and the
// alerts; this renders whatever state they leave behind.

import { View } from 'react-native';
import {
  Body,
  Button,
  H1,
  H2,
  Label,
  Muted,
  Note,
  Row,
  Screen,
  Section,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/colors';
import type { PurchasesPackage } from '@/lib/purchases';

// Pro covers the two features that call Claude at runtime, because each call
// costs money per use. Nothing about playing is gated: every game mode, every
// word and unlimited sessions are free. The list used to promise "unlimited new
// words every day", which is no longer something Pro unlocks.
const BENEFITS = [
  'Instant feedback on the sentences you write',
  'Personalized examples and memory hooks tuned to your interests',
  'Supports the app and the words added to it',
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
      <Label tone="accent" className="pt-6">
        Pro
      </Label>
      <H1 className="mt-2">Little Lexicon Pro</H1>
      <Note className="mt-2">Cancel anytime.</Note>

      <Section label="Free, always" className="mt-8">
        <Body className="font-serif-medium">Playing is free and unlimited</Body>
        <Muted className="mt-1">
          Every game mode, every word and as many sessions a day as you like are free. Pro
          adds the two features that use AI, which cost money each time they run.
        </Muted>
      </Section>

      <Section label="Pro adds" className="mt-8">
        {BENEFITS.map((b, i) => (
          <Row key={b} className={`items-start gap-3 ${i > 0 ? 'mt-3' : ''}`}>
            <View className="pt-[3px]">
              <Icon name="check" color={colors.accent} strokeWidth={2.25} />
            </View>
            <Body className="flex-1">{b}</Body>
          </Row>
        ))}
      </Section>

      {purchasesAvailable && packages.length > 0 ? (
        <View className="mt-8 gap-6">
          {packages.map((pkg) => (
            <Section key={pkg.identifier}>
              <Row className="items-baseline justify-between">
                <View>
                  <H2>{pkg.period === 'annual' ? 'Annual' : 'Monthly'}</H2>
                  <Note>{pkg.period === 'annual' ? 'Best value' : 'Flexible'}</Note>
                </View>
                <Body className="font-serif-medium text-[22px] leading-[28px]">
                  {pkg.priceString}
                </Body>
              </Row>
              <View className="mt-4">
                <Button
                  title="Choose"
                  onPress={() => onBuy(pkg.identifier)}
                  loading={busy}
                />
              </View>
            </Section>
          ))}
          <Button
            title="Restore purchases"
            variant="ghost"
            onPress={onRestore}
            disabled={busy}
          />
        </View>
      ) : (
        <Section label="Purchases" className="mt-8">
          <Body className="font-serif-medium">
            Purchases are not available in this build
          </Body>
          <Muted className="mt-1">
            Payments are wired through RevenueCat and turn on with the store keys and the
            feature flag. Entitlements are always verified server-side.
          </Muted>
        </Section>
      )}

      {showDemoControls ? (
        <Section label="Demo only" rule="hairline" className="mt-8">
          <Button
            title={isPro ? 'Turn off demo Pro' : 'Unlock Pro (demo)'}
            variant="secondary"
            onPress={onToggleDemoPro}
          />
          <Note className="mt-2 text-[15px]">
            This flips the local Pro flag so you can try Pro features. In production the
            flag is set by the RevenueCat webhook, never the client.
          </Note>
        </Section>
      ) : null}

      <View className="mt-8">
        <Button title="Maybe later" variant="ghost" onPress={onDismiss} />
      </View>
    </Screen>
  );
}
