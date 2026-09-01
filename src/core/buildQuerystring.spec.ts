import { describe, expect, it } from 'bun:test';
import { buildQuerystring } from './buildQuerystring.ts';

describe('buildQuerystring', () => {
  it('returns an empty string when no query is provided', () => {
    expect(buildQuerystring()).toBe('');
  });

  it('returns an empty string for an empty query object', () => {
    expect(buildQuerystring({})).toBe('');
  });

  it('builds a querystring from string and number values', () => {
    expect(buildQuerystring({ q: 'foo', size: 10 })).toBe('?q=foo&size=10');
  });

  it('joins array values with commas', () => {
    expect(buildQuerystring({ fields: ['a', 'b', 'c'] })).toBe('?fields=a%2Cb%2Cc');
  });

  it('skips undefined and null values', () => {
    expect(buildQuerystring({ q: 'foo', missing: undefined, absent: null })).toBe('?q=foo');
  });

  it('stringifies boolean values', () => {
    expect(buildQuerystring({ pretty: true })).toBe('?pretty=true');
  });

  it('returns an empty string when all values are undefined or null', () => {
    expect(buildQuerystring({ a: undefined, b: null })).toBe('');
  });

  it('encodes special characters in keys and values', () => {
    expect(buildQuerystring({ 'q&a': 'foo bar' })).toBe('?q%26a=foo+bar');
  });
});
