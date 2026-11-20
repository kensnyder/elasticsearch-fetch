import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ResponseError } from './core/errors';
import { Client } from './index';

describe('Full Client (src/index)', () => {
  afterEach(() => {
    mock.restore();
  });

  it('instantiates full client with all manifest endpoints', () => {
    const client = new Client({ node: 'http://localhost:9200' });

    expect(client.transport).toBeDefined();
    expect(typeof client.ping).toBe('function');
    expect(typeof client.search).toBe('function');
    expect(typeof client.bulk).toBe('function');
    expect(typeof client.indices?.create).toBe('function');
    expect(typeof client.cat?.health).toBe('function');
    expect(typeof client.cluster?.health).toBe('function');
  });

  it('successfully invokes an endpoint method via fetch', async () => {
    const mockResponse = {
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 42, relation: 'eq' as const }, hits: [] },
    };
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const client = new Client({ node: 'http://localhost:9200' });
    const response = await client.search({
      index: 'test-index',
      query: { match_all: {} },
    });

    expect(response).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callUrl = fetchMock.mock.calls[0]?.[0];
    expect(callUrl).toBe('http://localhost:9200/test-index/_search');
  });

  describe('exists-style HEAD endpoints', () => {
    it('indices.exists resolves true when the index exists', async () => {
      const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 })
      );

      const client = new Client({ node: 'http://localhost:9200' });
      const exists = await client.indices.exists({ index: 'test-index' });

      expect(exists).toBe(true);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'http://localhost:9200/test-index'
      );
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('HEAD');
    });

    it('indices.exists resolves false when the index is missing', async () => {
      spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 404 })
      );

      const client = new Client({ node: 'http://localhost:9200' });
      const exists = await client.indices.exists({ index: 'missing' });

      expect(exists).toBe(false);
    });

    it('indices.existsAlias, exists and ping resolve booleans', async () => {
      spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status: 200 }));

      const client = new Client({ node: 'http://localhost:9200' });

      expect(await client.indices.existsAlias({ name: 'my-alias' })).toBe(true);
      expect(await client.exists({ index: 'test-index', id: '1' })).toBe(false);
      expect(await client.ping({})).toBe(true);
    });

    it('throws ResponseError for other error statuses', async () => {
      spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 500 })
      );

      const client = new Client({ node: 'http://localhost:9200' });
      const promise = client.indices.exists({ index: 'test-index' });

      await expect(promise).rejects.toBeInstanceOf(ResponseError);
    });
  });
});
