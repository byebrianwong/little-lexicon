import { readWordsParams } from './links';

describe('readWordsParams', () => {
  it('reads a view and a list', () => {
    expect(readWordsParams({ view: 'learning', status: 'due' })).toEqual({
      view: 'learning',
      status: 'due',
    });
  });

  it('takes the first of repeated params', () => {
    expect(readWordsParams({ view: ['all', 'list'], status: ['known'] })).toEqual({
      view: 'all',
      status: 'known',
    });
  });

  it('ignores anything it does not know', () => {
    expect(readWordsParams({ view: 'stats', status: 'mastered' })).toEqual({
      view: null,
      status: null,
    });
    expect(readWordsParams({})).toEqual({ view: null, status: null });
  });
});
