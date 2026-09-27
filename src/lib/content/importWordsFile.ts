// The one place the words file is imported. A dynamic import lets the web
// build put the words in their own download. Jest cannot run a dynamic import
// without Metro, so jest.setup.ts swaps this module for a plain require.

export function importWordsFile(): Promise<{ default: unknown }> {
  return import('@/content/words.json');
}
