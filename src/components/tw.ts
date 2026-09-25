// Merges a component's base classes with a caller's classes so the caller's
// win. Two Tailwind classes that set the same property (text-[16px] and
// text-[17px]) are resolved by their order in the generated stylesheet, not by
// their order in the className string, so `Body className="text-[20px]"`
// would otherwise keep the base size on some screens and not others.
//
// This drops any base class whose property group the caller also sets. It
// only knows the groups the primitives use; anything else passes through.
// Classes with a variant (active:, web:hover:) are never dropped.

const GROUPS: [string, RegExp][] = [
  ['font-size', /^text-(\[\d+(\.\d+)?px\]|xs|sm|base|lg|xl|\dxl)$/],
  [
    'text-color',
    /^text-(ink|ink-soft|graphite|accent|accent-deep|paper|paper-deep|rule|line|transparent)$/,
  ],
  ['leading', /^leading-/],
  ['tracking', /^tracking-/],
  ['font-family', /^font-serif/],
  ['bg', /^bg-/],
  ['border-color', /^border-(ink|ink-soft|graphite|rule|line|accent|paper|transparent)$/],
  ['px', /^px-/],
  ['py', /^py-/],
  ['pt', /^pt-/],
  ['pb', /^pb-/],
  ['min-h', /^min-h-/],
  ['justify', /^justify-/],
  ['items', /^items-/],
];

function groupOf(cls: string): string | null {
  if (cls.includes(':')) return null;
  for (const [name, re] of GROUPS) if (re.test(cls)) return name;
  return null;
}

function split(classes: string): string[] {
  return classes.split(/\s+/).filter(Boolean);
}

export function tw(base: string, override?: string | false | null): string {
  if (!override) return base;
  const taken = new Set(
    split(override)
      .map(groupOf)
      .filter((g): g is string => g !== null),
  );
  const kept = split(base).filter((c) => {
    const g = groupOf(c);
    return g === null || !taken.has(g);
  });
  return [...kept, ...split(override)].join(' ');
}
