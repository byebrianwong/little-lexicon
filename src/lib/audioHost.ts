// The site the app fetches pronunciation clips from: the web app's own site on
// web, and the production site in native apps. EXPO_PUBLIC_AUDIO_HOST overrides
// it in native apps, for example to test against a local dev server.

import { Platform } from 'react-native';
import { DEFAULT_AUDIO_HOST } from './clipUrl';

export const AUDIO_HOST =
  Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_AUDIO_HOST ?? DEFAULT_AUDIO_HOST);
