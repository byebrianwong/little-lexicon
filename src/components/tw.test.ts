import { tw } from './tw';

describe('tw', () => {
  it('returns the base unchanged when there is no override', () => {
    expect(tw('font-serif text-[18px]')).toBe('font-serif text-[18px]');
    expect(tw('font-serif text-[18px]', '')).toBe('font-serif text-[18px]');
    expect(tw('font-serif', false)).toBe('font-serif');
  });

  it('lets a size override replace the base size', () => {
    expect(tw('font-serif text-[18px] leading-[26px] text-ink', 'text-[20px]')).toBe(
      'font-serif leading-[26px] text-ink text-[20px]',
    );
  });

  it('keeps size and colour apart, though both start with text-', () => {
    expect(tw('text-[18px] text-ink', 'text-graphite')).toBe('text-[18px] text-graphite');
    expect(tw('text-[18px] text-ink', 'text-[20px]')).toBe('text-ink text-[20px]');
  });

  it('replaces the font family, whichever weight either side names', () => {
    expect(tw('font-serif text-ink', 'font-serif-medium')).toBe(
      'text-ink font-serif-medium',
    );
    expect(tw('font-serif-italic', 'font-serif')).toBe('font-serif');
  });

  it('never drops a class with a variant', () => {
    expect(tw('bg-ink active:bg-ink-soft', 'bg-paper')).toBe(
      'active:bg-ink-soft bg-paper',
    );
  });

  it('passes unknown classes through from both sides', () => {
    expect(tw('flex-row gap-2', 'mt-4 self-start')).toBe(
      'flex-row gap-2 mt-4 self-start',
    );
  });

  it('replaces horizontal padding without touching vertical padding', () => {
    expect(tw('px-5 py-3 min-h-[52px]', 'px-0')).toBe('py-3 min-h-[52px] px-0');
  });
});
