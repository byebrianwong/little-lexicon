import { colors } from './colors';

// tailwind.config.js is CommonJS and exports its palette alongside the config.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require('../../tailwind.config.js') as {
  colors: Record<string, string>;
};

const toKebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('palette', () => {
  it('matches the Tailwind colours one for one', () => {
    const fromTs = Object.fromEntries(
      Object.entries(colors).map(([k, v]) => [toKebab(k), v]),
    );
    expect(fromTs).toEqual(tailwind.colors);
  });
});
