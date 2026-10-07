import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
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
});
