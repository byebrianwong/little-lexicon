// The Paper and Ink palette as strings, for props that take a colour rather
// than a class name: ActivityIndicator, placeholderTextColor, RefreshControl,
// SVG strokes and the heatmap. tailwind.config.js holds the same values for
// class names; colors.test.ts fails if the two drift apart.

export const colors = {
  paper: '#F7F3EA',
  paperDeep: '#EFE9DC',
  ink: '#1C1A17',
  inkSoft: '#3A3630',
  graphite: '#6B655C',
  rule: '#D9D2C3',
  line: '#8F887C',
  accent: '#9E2B1E',
  accentDeep: '#7F2217',
} as const;

/**
 * Heatmap shades, lightest to darkest: no activity, then four steps of ink.
 * The empty cell is one step darker than the paper so the grid still reads
 * when nothing has been done.
 */
export const heat = ['#E8E1D3', '#CFC5B2', '#A69C8A', '#6B655C', '#1C1A17'] as const;
