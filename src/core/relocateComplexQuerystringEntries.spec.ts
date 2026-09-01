import { describe, expect, it } from 'bun:test';
import {
  isSimpleQuerystringValue,
  relocateComplexQuerystringEntries,
} from './relocateComplexQuerystringEntries';

describe('isSimpleQuerystringValue', () => {
  it('is true for strings, numbers, booleans, and bigints', () => {
    expect(isSimpleQuerystringValue('foo')).toBe(true);
    expect(isSimpleQuerystringValue(10)).toBe(true);
    expect(isSimpleQuerystringValue(true)).toBe(true);
    expect(isSimpleQuerystringValue(10n)).toBe(true);
  });

  it('is true for null and undefined', () => {
    expect(isSimpleQuerystringValue(null)).toBe(true);
    expect(isSimpleQuerystringValue(undefined)).toBe(true);
  });

  it('is true for an array of primitives', () => {
    expect(isSimpleQuerystringValue(['a', 'b', 3])).toBe(true);
  });

  it('is false for a plain object', () => {
    expect(isSimpleQuerystringValue({ order: 'asc' })).toBe(false);
  });

  it('is false for an array containing an object', () => {
    expect(
      isSimpleQuerystringValue([{ verseSequence: { order: 'asc' } }])
    ).toBe(false);
  });
});

describe('relocateComplexQuerystringEntries', () => {
  it('returns the inputs unchanged when there is no querystring', () => {
    const result = relocateComplexQuerystringEntries(undefined, { query: {} });
    expect(result).toEqual({ querystring: undefined, body: { query: {} } });
  });

  it('returns the inputs unchanged when the querystring has no complex values', () => {
    const querystring = { size: 10, q: 'foo' };
    const body = { query: {} };
    const result = relocateComplexQuerystringEntries(querystring, body);
    expect(result.querystring).toBe(querystring);
    expect(result.body).toBe(body);
  });

  it('moves a complex value (the Sort DSL) into the body', () => {
    const querystring = {
      size: 500,
      sort: [{ verseSequence: { order: 'asc' } }],
    };
    const body = { query: { term: { chapterOsisID: 'Song.8' } } };

    const result = relocateComplexQuerystringEntries(querystring, body);

    expect(result.querystring).toEqual({ size: 500 });
    expect(result.body).toEqual({
      query: { term: { chapterOsisID: 'Song.8' } },
      sort: [{ verseSequence: { order: 'asc' } }],
    });
  });

  it('leaves a simple "field:order" sort string in the querystring', () => {
    const querystring = { sort: 'age:desc' };
    const result = relocateComplexQuerystringEntries(querystring, undefined);

    expect(result.querystring).toEqual({ sort: 'age:desc' });
    expect(result.body).toBeUndefined();
  });

  it('creates the body when it was undefined', () => {
    const querystring = { sort: [{ age: { order: 'desc' } }] };
    const result = relocateComplexQuerystringEntries(querystring, undefined);

    expect(result.body).toEqual({ sort: [{ age: { order: 'desc' } }] });
  });

  it('does not relocate into a non-mergeable body (e.g. an ndjson array body)', () => {
    const querystring = { sort: [{ age: { order: 'desc' } }] };
    const body = [{ index: { _index: 'foo' } }];

    const result = relocateComplexQuerystringEntries(querystring, body);

    expect(result.querystring).toBe(querystring);
    expect(result.body).toBe(body);
  });
});
