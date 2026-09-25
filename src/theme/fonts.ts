// The Newsreader faces the app uses. The root layout loads these before it
// renders, and tailwind.config.js names each one as a font-serif-* class.
// Loading only the five in use keeps the bundle down: each face is ~200 KB.

import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';

export const fontFaces = {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_500Medium_Italic,
  Newsreader_600SemiBold,
};
