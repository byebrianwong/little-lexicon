// RevenueCat integration, behind a feature flag that is OFF by default
// (Phase 0.5 stub; Phase 7.1 paywall). The SDK is loaded lazily so the app runs
// with the flag off and in demo mode without any purchase UI.
//
// Entitlement decisions are NOT trusted from the client. The source of truth is
// profiles.is_pro, set server-side by the RevenueCat webhook (Phase 7.2). This
// module only drives the purchase flow and reflects a cached entitlement.

import { Platform } from 'react-native';
import { env } from './env';

export const PRO_ENTITLEMENT = 'pro';

export interface PurchasesPackage {
  identifier: string;
  priceString: string;
  period: 'monthly' | 'annual' | 'unknown';
}

export interface PaywallOfferings {
  packages: PurchasesPackage[];
}

export function purchasesEnabled(): boolean {
  if (!env.revenueCatEnabled) return false;
  const key = Platform.OS === 'ios' ? env.revenueCatIosKey : env.revenueCatAndroidKey;
  return key !== '';
}

/**
 * Configure the SDK once. No-op when the flag is off. Wrapped in a dynamic
 * import so `react-native-purchases` native code is never initialized unless
 * explicitly enabled.
 */
export async function configurePurchases(appUserId?: string): Promise<void> {
  if (!purchasesEnabled()) return;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const apiKey = Platform.OS === 'ios' ? env.revenueCatIosKey : env.revenueCatAndroidKey;
    Purchases.configure({ apiKey, appUserID: appUserId });
  } catch (e) {
    console.warn('purchases: failed to configure', e);
  }
}

export async function getOfferings(): Promise<PaywallOfferings> {
  if (!purchasesEnabled()) return { packages: [] };
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return { packages: [] };
    return {
      packages: current.availablePackages.map((p) => ({
        identifier: p.identifier,
        priceString: p.product.priceString,
        period: p.packageType === 'ANNUAL' ? 'annual' : p.packageType === 'MONTHLY' ? 'monthly' : 'unknown',
      })),
    };
  } catch (e) {
    console.warn('purchases: failed to load offerings', e);
    return { packages: [] };
  }
}

/**
 * Kick off a purchase. Returns whether the Pro entitlement is now active
 * according to the client SDK. The server webhook is still the authority.
 */
export async function purchasePackage(identifier: string): Promise<boolean> {
  if (!purchasesEnabled()) return false;
  const Purchases = (await import('react-native-purchases')).default;
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find((p) => p.identifier === identifier);
  if (!pkg) throw new Error('Package not available');
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export async function restorePurchases(): Promise<boolean> {
  if (!purchasesEnabled()) return false;
  const Purchases = (await import('react-native-purchases')).default;
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}
