import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createTransport } from './createTransport.ts';
import { ResponseError } from './errors';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createTransport', () => {
  afterEach(() => {
    mock.restore();
  });

  it('serializes query params and sends GET requests', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ hits: { total: 0 } })
    );

    const transport = createTransport({ node: 'https://example.com:9200' });
    const result = await transport.request({
      method: 'GET',
      path: '/my-index/_search',
      querystring: { q: 'foo', size: 10, ignored: undefined },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://example.com:9200/my-index/_search?q=foo&size=10'
    );
    expect(result).toEqual({ hits: { total: 0 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('joins array bodies as NDJSON with a trailing newline', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ items: [] })
    );

    const transport = createTransport({ node: 'https://example.com' });
    await transport.request({
      method: 'POST',
      path: '/_bulk',
      body: [{ index: { _index: 'foo' } }, { field: 'value' }],
      ndjson: true,
    });

    const init = fetchMock.mock.calls[0]?.[1];
    // biome-ignore lint/correctness/noUnsafeOptionalChaining: Unit test allows this
    expect((init?.headers as Record<string, string>)['content-type']).toBe(
      'application/x-ndjson'
    );
    expect(init?.body).toBe('{"index":{"_index":"foo"}}\n{"field":"value"}\n');
  });

  it('throws ResponseError with statusCode and body on non-2xx responses', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'index_not_found' }, 404)
    );

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
