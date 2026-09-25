// Line icons drawn with react-native-svg, in place of emoji. Emoji render
// differently on every platform and carry colour of their own; these take the
// ink colour and a 1.75 stroke, so they sit with the Newsreader text.

import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme/colors';

export type IconName =
  | 'arrow-right'
  | 'arrow-left'
  | 'close'
  | 'check'
  | 'cross'
  | 'speaker'
  | 'chevron-down'
  | 'chevron-up'
  | 'search';

const PATHS: Record<Exclude<IconName, 'search'>, string[]> = {
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  cross: ['M7 7l10 10', 'M17 7 7 17'],
  speaker: [
    'M11 5 6 9H3v6h3l5 4z',
    'M15.5 8.5a5 5 0 0 1 0 7',
    'M18.5 5.5a9 9 0 0 1 0 13',
  ],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
};

export function Icon({
  name,
  size = 20,
  color = colors.ink,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  // Decorative: every icon sits beside a text label or inside a control that
  // carries its own accessibilityLabel.
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={6.5} />
          <Path d="M20 20l-4.2-4.2" />
        </>
      ) : (
        PATHS[name].map((d) => <Path key={d} d={d} />)
      )}
    </Svg>
  );
}
