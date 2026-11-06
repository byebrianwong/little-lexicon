// Storybook on a simulator or phone, using the same story files as the web
// Storybook in .storybook. This package removes play functions on a device, so
// a story with one shows its starting state here.

import type { StorybookConfig } from '@storybook/react-native';

const main: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  deviceAddons: [],
};

export default main;
