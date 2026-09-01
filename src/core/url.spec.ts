import { describe, expect, it } from 'bun:test';
import { resolveUrl, type UrlTemplate } from './url';

describe('resolveUrl', () => {
  const catIndicesUrls: UrlTemplate[] = [
    [['GET'], '/_cat/indices/{index}'],
    [['GET'], '/_cat/indices'],
  ];

  it('selects the most specific template when placeholders are satisfied', () => {
    const resolved = resolveUrl(catIndicesUrls, { index: 'my-index' });
    expect(resolved.path).toBe('/_cat/indices/my-index');
  });

  it('falls back to the least specific template when placeholders are missing', () => {
    const resolved = resolveUrl(catIndicesUrls, {});
    expect(resolved.path).toBe('/_cat/indices');
  });

  it('comma-joins array path params without percent-encoding the comma', () => {
    const urls: UrlTemplate[] = [[['GET'], '/{index}/_search']];
    const resolved = resolveUrl(urls, { index: ['foo', 'bar'] });
    expect(resolved.path).toBe('/foo,bar/_search');
  });
});
