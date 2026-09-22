import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { PaywallView } from '@/features/monetization/PaywallView';
import { useProfile, useUpdateProfile } from '@/features/review/queries';
import {
  getOfferings,
  purchasePackage,
  purchasesEnabled,
  restorePurchases,
  type PurchasesPackage,
} from '@/lib/purchases';
import { isDemoMode } from '@/lib/env';

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
    <PaywallView
      packages={packages}
      purchasesAvailable={purchasesEnabled()}
      busy={busy}
      isPro={!!profile.data?.isPro}
      showDemoControls={isDemoMode}
      onBuy={buy}
      onRestore={restore}
      onToggleDemoPro={() =>
        update.mutate({ isPro: !profile.data?.isPro }, { onSuccess: () => router.back() })
      }
      onDismiss={() => router.back()}
    />
  );
}
