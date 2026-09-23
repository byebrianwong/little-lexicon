import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { phone } from '@/stories/decorators';
import type { PurchasesPackage } from '@/lib/purchases';
import { PaywallView } from './PaywallView';

const PACKAGES: PurchasesPackage[] = [
  { identifier: 'annual', priceString: '$39.99', period: 'annual' },
  { identifier: 'monthly', priceString: '$4.99', period: 'monthly' },
];

const meta = {
  title: 'Screens/Paywall',
  component: PaywallView,
  args: {
    packages: PACKAGES,
    purchasesAvailable: true,
    busy: false,
    isPro: false,
    showDemoControls: false,
    onBuy: () => {},
    onRestore: () => {},
    onToggleDemoPro: () => {},
    onDismiss: () => {},
  },
  decorators: [phone],
} satisfies Meta<typeof PaywallView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both plans offered. What a shipping build shows. */
export const PlansOffered: Story = {};

/** A purchase in flight: both Choose buttons spin. */
export const PurchaseInProgress: Story = {
  args: { busy: true },
};

/**
 * Store keys are missing or the flag is off, so the screen explains itself
 * instead of showing prices it cannot charge.
 */
export const PurchasesUnavailable: Story = {
  args: { purchasesAvailable: false, packages: [] },
};

/** Purchases are on but the offering came back empty. */
export const NoPackagesReturned: Story = {
  args: { packages: [] },
};

/** Demo builds get a local toggle under a divider. */
export const DemoMode: Story = {
  args: { purchasesAvailable: false, packages: [], showDemoControls: true },
};

/** The same demo toggle once Pro is on. */
export const DemoModeAlreadyPro: Story = {
  args: { purchasesAvailable: false, packages: [], showDemoControls: true, isPro: true },
};
