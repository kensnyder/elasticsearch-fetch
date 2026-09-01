import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createTransport } from './Transport';
import { ResponseError } from './errors';
import { resolveUrl, type UrlTemplate } from './url';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Transport', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('serializes query params and sends GET requests', async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toBe(
        'https://example.com:9200/my-index/_search?q=foo&size=10'
      );
      return jsonResponse({ hits: { total: 0 } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = createTransport({ node: 'https://example.com:9200' });
    const result = await transport.request({
      method: 'GET',
      path: '/my-index/_search',
      querystring: { q: 'foo', size: 10, ignored: undefined },
    });

    expect(result).toEqual({ hits: { total: 0 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('joins array bodies as NDJSON with a trailing newline', async () => {
    let capturedBody: string | undefined;
    let capturedContentType: string | undefined;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      capturedContentType = (init?.headers as Record<string, string>)[
        'content-type'
      ];
      return jsonResponse({ items: [] });
    }) as unknown as typeof fetch;

    const transport = createTransport({ node: 'https://example.com' });
    await transport.request({
      method: 'POST',
      path: '/_bulk',
      body: [{ index: { _index: 'foo' } }, { field: 'value' }],
      ndjson: true,
    });

    expect(capturedContentType).toBe('application/x-ndjson');
    expect(capturedBody).toBe(
      '{"index":{"_index":"foo"}}\n{"field":"value"}\n'
    );
  });

  it('throws ResponseError with statusCode and body on non-2xx responses', async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({ error: 'index_not_found' }, 404)
    ) as unknown as typeof fetch;

    const transport = createTransport({ node: 'https://example.com' });

    let caught: unknown;
    try {
      await transport.request({ method: 'GET', path: '/missing' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ResponseError);
    const responseError = caught as ResponseError;
    expect(responseError.meta.statusCode).toBe(404);
    expect(responseError.meta.body).toEqual({ error: 'index_not_found' });
  });
});

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
