import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createTransport } from './createTransport.ts';
import { ConnectionError, ResponseError } from './errors';

// These tests talk to a real Elasticsearch, which only CI provides (see the
// `services` block in .github/workflows/workflow.yml). To run them locally,
// start Elasticsearch and set CI=true.
const isCI = Boolean(globalThis.process?.env?.CI);
// Deliberately not ELASTICSEARCH_NODE: a developer's .env may point that at a
// real cluster, and these tests create and delete an index.
const node = globalThis.process?.env?.ES_ENDPOINT ?? 'http://localhost:9200';
const index = `transport-integration-${Date.now()}`;

interface SearchResponse {
  hits: {
    total: { value: number };
    hits: Array<{ _id: string; _source: Record<string, unknown> }>;
  };
}

describe.skipIf(!isCI)('createTransport (integration)', () => {
  const transport = createTransport({ node, requestTimeout: 30_000 });

  beforeAll(async () => {
    await transport.request({
      method: 'PUT',
      path: `/${index}`,
      body: {
        mappings: {
          properties: {
            title: { type: 'text' },
            rank: { type: 'integer' },
          },
        },
      },
    });
  });

  afterAll(async () => {
    await transport.request(
      { method: 'DELETE', path: `/${index}` },
      { ignore: 404 }
    );
  });

  it('reads cluster info from the root endpoint', async () => {
    const info = await transport.request<{
      version: { number: string };
      tagline: string;
    }>({ method: 'GET', path: '/' });

    expect(info.version.number).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.tagline).toBe('You Know, for Search');
  });

  it('serializes primitive and array query params', async () => {
    const health = await transport.request<Record<string, unknown>>({
      method: 'GET',
      path: '/_cluster/health',
      querystring: {
        filter_path: ['status', 'number_of_nodes'],
        timeout: '5s',
        ignored: undefined,
      },
    });

    expect(Object.keys(health).sort()).toEqual(['number_of_nodes', 'status']);
    expect(health.number_of_nodes).toBe(1);
  });

  it('indexes a JSON document and reads it back', async () => {
    const created = await transport.request<{ result: string }>({
      method: 'PUT',
      path: `/${index}/_doc/1`,
      querystring: { refresh: true },
      body: { title: 'first document', rank: 1 },
    });
    const fetched = await transport.request<{
      found: boolean;
      _source: Record<string, unknown>;
    }>({ method: 'GET', path: `/${index}/_doc/1` });

    expect(created.result).toBe('created');
    expect(fetched.found).toBe(true);
    expect(fetched._source).toEqual({ title: 'first document', rank: 1 });
  });

  it('sends array bodies as NDJSON to _bulk', async () => {
    const result = await transport.request<{
      errors: boolean;
      items: unknown[];
    }>({
      method: 'POST',
      path: '/_bulk',
      querystring: { refresh: true },
      ndjson: true,
      body: [
        { index: { _index: index, _id: '2' } },
        { title: 'second document', rank: 2 },
        { index: { _index: index, _id: '3' } },
        { title: 'third document', rank: 3 },
      ],
    });

    expect(result.errors).toBe(false);
    expect(result.items).toHaveLength(2);
  });

  it('upgrades GET to POST so a search body is honored', async () => {
    const result = await transport.request<SearchResponse>({
      method: 'GET',
      path: `/${index}/_search`,
      body: { query: { match: { title: 'second' } } },
    });

    expect(result.hits.total.value).toBe(1);
    expect(result.hits.hits[0]?._id).toBe('2');
  });

  it('relocates complex query params into the body', async () => {
    const result = await transport.request<SearchResponse>({
      method: 'GET',
      path: `/${index}/_search`,
      querystring: {
        size: 2,
        sort: [{ rank: { order: 'desc' } }],
      },
    });

    expect(result.hits.total.value).toBe(3);
    expect(result.hits.hits.map(hit => hit._id)).toEqual(['3', '2']);
  });

  it('merges bodyParams with the caller body and querystring', async () => {
    const result = await transport.request<SearchResponse>({
      method: 'GET',
      path: `/${index}/_search`,
      bodyParams: {
        body: { query: { match_all: {} }, size: 3 },
        querystring: { filter_path: 'hits.total,hits.hits._id' },
        size: 1,
        sort: [{ rank: 'asc' }],
      },
    });

    expect(result.hits.total.value).toBe(3);
    expect(result.hits.hits).toEqual([{ _id: '1' } as never]);
  });

  it('sends a pre-serialized string body as is', async () => {
    const result = await transport.request<{ count: number }>({
      method: 'POST',
      path: `/${index}/_count`,
      body: '{"query":{"range":{"rank":{"gte":2}}}}',
    });

    expect(result.count).toBe(2);
  });

  it('resolves HEAD requests with an empty body', async () => {
    const result = await transport.request({
      method: 'HEAD',
      path: `/${index}/_doc/1`,
    });

    expect(result).toBe('');
  });

  it('returns non-JSON responses as text', async () => {
    const result = await transport.request<string>(
      { method: 'GET', path: '/_cat/indices', querystring: { h: 'index' } },
      { headers: { accept: 'text/plain' } }
    );

    expect(typeof result).toBe('string');
    expect(result).toContain(index);
  });

  it('throws ResponseError with the Elasticsearch error details', async () => {
    const promise = transport.request({
      method: 'GET',
      path: `/${index}-missing/_search`,
    });

    await expect(promise).rejects.toBeInstanceOf(ResponseError);
    const error = (await promise.catch(thrown => thrown)) as ResponseError;
    expect(error.meta.statusCode).toBe(404);
    expect(error.message).toContain('index_not_found_exception');
    expect(error.message).toContain(`no such index [${index}-missing]`);
    expect(error.meta.headers['content-type']).toContain('json');
  });

  it('returns the error body when the status is ignored', async () => {
    const result = await transport.request<{ found: boolean }>(
      { method: 'GET', path: `/${index}/_doc/does-not-exist` },
      { ignore: [404] }
    );

    expect(result.found).toBe(false);
  });

  it('throws ConnectionError when the node is unreachable', async () => {
    const unreachable = createTransport({ node: 'http://127.0.0.1:1' });
    const promise = unreachable.request({ method: 'GET', path: '/' });

    await expect(promise).rejects.toBeInstanceOf(ConnectionError);
  });
});
