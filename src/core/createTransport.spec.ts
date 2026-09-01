import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createTransport } from './createTransport.ts';
import { ResponseError, SerializationError } from './errors';

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

  it('upgrades GET to POST when a body is present', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ hits: { total: 0 } })
    );

    const transport = createTransport({ node: 'https://example.com' });
    await transport.request({
      method: 'GET',
      path: '/my-index/_search',
      body: { query: { match_all: {} } },
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"query":{"match_all":{}}}');
  });

  it('leaves GET requests without a body unchanged', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ hits: { total: 0 } })
    );

    const transport = createTransport({ node: 'https://example.com' });
    await transport.request({ method: 'GET', path: '/my-index/_search' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
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

  it('serializes a plain JSON body', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ acknowledged: true })
    );

    const transport = createTransport({ node: 'https://example.com' });
    await transport.request({
      method: 'PUT',
      path: '/my-index',
      body: { settings: { number_of_shards: 1 } },
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)['content-type']).toBe(
      'application/json'
    );
    expect(init?.body).toBe('{"settings":{"number_of_shards":1}}');
  });

  it('throws SerializationError when the body cannot be serialized', async () => {
    const transport = createTransport({ node: 'https://example.com' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    let caught: unknown;
    try {
      await transport.request({
        method: 'PUT',
        path: '/my-index',
        body: circular,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SerializationError);
    expect((caught as Error).message).toContain('Error serializing payload');
  });

  it('adds an authorization header when auth is configured', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({})
    );

    const transport = createTransport({
      node: 'https://example.com',
      auth: { bearer: 'my-token' },
    });
    await transport.request({ method: 'GET', path: '/my-index/_search' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).authorization).toBe(
      'Bearer my-token'
    );
  });

  it('aborts the request when requestTimeout elapses', async () => {
    spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });

    const transport = createTransport({ node: 'https://example.com' });

    let caught: unknown;
    try {
      await transport.request(
        { method: 'GET', path: '/slow' },
        { requestTimeout: 5 }
      );
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('aborted');
  });

  it('returns raw text for non-JSON responses', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('plain text body', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );

    const transport = createTransport({ node: 'https://example.com' });
    const result = await transport.request({
      method: 'GET',
      path: '/_cat/health',
    });

    expect(result).toBe('plain text body');
  });
});
