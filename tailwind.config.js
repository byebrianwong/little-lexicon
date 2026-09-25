/** @type {import('tailwindcss').Config} */

// Paper and Ink. One serif (Newsreader), warm paper, ink text, and one red
// used like a teacher's pen: it marks answers, the active tab and destructive
// actions, and nothing else.
//
// The same values live in src/theme/colors.ts for the places that need a
// colour as a string (spinners, placeholders, the heatmap). A unit test keeps
// the two in step.
const colors = {
  paper: '#F7F3EA',
  'paper-deep': '#EFE9DC',
  ink: '#1C1A17',
  'ink-soft': '#3A3630',
  graphite: '#6B655C',
  rule: '#D9D2C3',
  line: '#8F887C',
  accent: '#9E2B1E',
  'accent-deep': '#7F2217',
};

// Each weight and style is its own family name. Android ignores fontWeight on
// a custom font, so screens pick a family class (font-serif-medium) rather
// than a weight class (font-medium). Native reads only the first name; the
// rest are the web fallback while Newsreader loads.
const fallback = ['Georgia', 'serif'];

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      fontFamily: {
        serif: ['Newsreader_400Regular', ...fallback],
        'serif-italic': ['Newsreader_400Regular_Italic', ...fallback],
        'serif-medium': ['Newsreader_500Medium', ...fallback],
        'serif-medium-italic': ['Newsreader_500Medium_Italic', ...fallback],
        'serif-semibold': ['Newsreader_600SemiBold', ...fallback],
      },
    },
  },
  plugins: [],
};

module.exports.colors = colors;
