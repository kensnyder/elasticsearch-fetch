import { describe, expect, it } from 'bun:test';
import { resolveBaseUrl } from './resolveBaseUrl';

describe('resolveBaseUrl', () => {
  it('returns a string node unchanged', () => {
    expect(resolveBaseUrl('https://example.com:9200')).toBe(
      'https://example.com:9200'
    );
  });

  it('strips trailing slashes', () => {
    expect(resolveBaseUrl('https://example.com:9200///')).toBe(
      'https://example.com:9200'
    );
  });

  it('picks the first node from an array', () => {
    expect(
      resolveBaseUrl(['https://node1.example.com', 'https://node2.example.com'])
    ).toBe('https://node1.example.com');
  });

  it('strips trailing slashes from the first node in an array', () => {
    expect(resolveBaseUrl(['https://node1.example.com/'])).toBe(
      'https://node1.example.com'
    );
  });
});
