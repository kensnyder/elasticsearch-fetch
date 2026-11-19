import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createTransport } from './core/createTransport';
import { bulk } from './generated/bulk';
import { index } from './generated/index';
import { Client } from './index';

const NODE = 'http://localhost:9200';

function stubFetch() {
  return spyOn(globalThis, 'fetch').mockImplementation(
    (async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch
  );
}

/**
 * estypes types every known param as `never` inside `body`/`querystring`,
 * but untyped (or cast) callers still pass them there; this bypasses the
 * types to cover that runtime behavior.
 */
function untyped<T>(params: object): T {
  return params as T;
}

function sentRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return { url, method: init?.method, body: init?.body };
}

describe('caller `body` and `querystring` params through generated endpoints', () => {
  afterEach(() => {
    mock.restore();
  });

  describe('index (named payload)', () => {
    it('sends `body` as the document, not wrapped in { body }', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.index({
        index: 'docs',
        id: '1',
        refresh: true,
        body: { title: 't' },
      });
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_doc/1?refresh=true`,
        method: 'PUT',
        body: '{"title":"t"}',
      });
    });

    it('sends a document with its own `body` field unchanged', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.index({
        index: 'docs',
        id: '1',
        document: { title: 't', body: 'text' },
      });
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_doc/1`,
        method: 'PUT',
        body: '{"title":"t","body":"text"}',
      });
    });

    it('prefers `document` over `body`', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.index({
        index: 'docs',
        id: '1',
        document: { title: 'named' },
        body: { title: 'ignored' },
      });
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_doc/1`,
        method: 'PUT',
        body: '{"title":"named"}',
      });
    });

    it('works the same through the tree-shakeable function', async () => {
      const fetchMock = stubFetch();
      const transport = createTransport({ node: NODE });
      await index(transport, {
        index: 'docs',
        id: '1',
        body: { title: 't' },
        querystring: { custom_param: 'p' },
      });
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_doc/1?custom_param=p`,
        method: 'PUT',
        body: '{"title":"t"}',
      });
    });
  });

  describe('bulk (named ndjson payload)', () => {
    const operations = [{ index: { _id: '1' } }, { title: 't' }];
    const expected = {
      url: `${NODE}/docs/_bulk`,
      method: 'POST',
      body: '{"index":{"_id":"1"}}\n{"title":"t"}\n',
    };

    it('sends `operations` as ndjson', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.bulk({ index: 'docs', operations });
      expect(sentRequest(fetchMock)).toEqual(expected);
    });

    it('sends `body` as the same ndjson', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.bulk({ index: 'docs', body: operations });
      expect(sentRequest(fetchMock)).toEqual(expected);
    });

    it('sends a pre-serialized ndjson string `body` as is', async () => {
      const fetchMock = stubFetch();
      const transport = createTransport({ node: NODE });
      await bulk(transport, { index: 'docs', body: expected.body });
      expect(sentRequest(fetchMock)).toEqual(expected);
    });
  });

  describe('update (property payload)', () => {
    const expected = {
      url: `${NODE}/docs/_update/1`,
      method: 'POST',
      body: '{"doc":{"title":"t"}}',
    };

    it('sends `body: { doc }` as { doc }', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.update(
        untyped({ index: 'docs', id: '1', body: { doc: { title: 't' } } })
      );
      expect(sentRequest(fetchMock)).toEqual(expected);
    });

    it('sends `doc` as { doc }', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.update({ index: 'docs', id: '1', doc: { title: 't' } });
      expect(sentRequest(fetchMock)).toEqual(expected);
    });
  });

  describe('search (property payload)', () => {
    it('spreads `body` and lets named properties override it', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.search(
        untyped({
          index: 'docs',
          body: { query: { match_all: {} }, size: 5 },
          size: 10,
        })
      );
      // `size` is also a known query param, so the named one goes to the URL
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_search?size=10`,
        method: 'POST',
        body: '{"query":{"match_all":{}},"size":5}',
      });
    });

    it('lets a named body property override the same key in `body`', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.search(
        untyped({
          index: 'docs',
          body: { query: { match_all: {} }, aggs: { a: {} } },
          aggs: { b: { terms: { field: 'f' } } },
        })
      );
      expect(sentRequest(fetchMock).body).toBe(
        '{"query":{"match_all":{}},"aggs":{"b":{"terms":{"field":"f"}}}}'
      );
    });

    it('sends a string `body` as is', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.search({
        index: 'docs',
        body: '{"query":{"match_all":{}}}',
      });
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_search`,
        method: 'POST',
        body: '{"query":{"match_all":{}}}',
      });
    });

    it('adds `querystring` entries to the URL, known params winning', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.search(
        untyped({
          index: 'docs',
          routing: 'known',
          querystring: { routing: 'extra', preference: '_local' },
          query: { match_all: {} },
        })
      );
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_search?routing=known&preference=_local`,
        method: 'POST',
        body: '{"query":{"match_all":{}}}',
      });
    });

    it('still relocates a Sort DSL `sort` into the body', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.search({
        index: 'docs',
        query: { match_all: {} },
        sort: [{ age: { order: 'desc' } }],
        size: 5,
      });
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_search?size=5`,
        method: 'POST',
        body: '{"query":{"match_all":{}},"sort":[{"age":{"order":"desc"}}]}',
      });
    });
  });

  describe('get (no payload)', () => {
    it('puts `querystring` entries in the URL and sends no payload', async () => {
      const fetchMock = stubFetch();
      const client = new Client({ node: NODE });
      await client.get(
        untyped({ index: 'docs', id: '1', querystring: { routing: 'x' } })
      );
      expect(sentRequest(fetchMock)).toEqual({
        url: `${NODE}/docs/_doc/1?routing=x`,
        method: 'GET',
        body: undefined,
      });
    });
  });
});
