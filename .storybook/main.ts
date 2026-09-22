// Storybook runs the app's React Native components in a browser through
// react-native-web, bundled by Vite. This is the build Chromatic snapshots.
// The app itself still builds with Metro; nothing here touches that.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from 'tailwindcss';
import type { StorybookConfig } from '@storybook/react-native-web-vite';

// Storybook loads this file as an ES module, so __dirname does not exist.
const here = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // Chromatic reads accessibility results from this addon. Without it a build
  // reports no accessibility comparisons at all, which is not the same as a
  // clean result and is easy to misread as one.
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-native-web-vite',
    options: {
      // NativeWind rewrites JSX so className reaches react-native-css-interop.
      // Without this, every className prop is dropped and stories render unstyled.
      pluginReactOptions: {
        jsxRuntime: 'automatic',
        jsxImportSource: 'nativewind',
      },
    },
  },
  viteFinal: (viteConfig) => {
    // PostCSS is configured inline rather than in a root postcss.config.js,
    // because Expo's Metro web build would pick that file up and run Tailwind
    // twice. Keeping it here leaves the app's build untouched.
    viteConfig.css = {
      ...viteConfig.css,
      postcss: {
        plugins: [
          tailwindcss({
            config: path.resolve(here, '../tailwind.config.js'),
          }),
        ],
      },
    };
    return viteConfig;
  },
};

export default config;
