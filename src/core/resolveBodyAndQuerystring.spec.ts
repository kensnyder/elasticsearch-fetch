import { describe, expect, it } from 'bun:test';
import { ConfigurationError } from './errors';
import { resolveBodyAndQuerystring } from './resolveBodyAndQuerystring';

describe('resolveBodyAndQuerystring', () => {
  describe('without caller body/querystring keys', () => {
    it('passes the querystring entries and body through', () => {
      const querystring = { refresh: true, routing: undefined };
      const body = { title: 't' };
      const result = resolveBodyAndQuerystring({ querystring, body });
      expect(result.querystring).toEqual({ refresh: true });
      expect(result.body).toBe(body);
    });

    it('handles a missing querystring and body', () => {
      const result = resolveBodyAndQuerystring({});
      expect(result).toEqual({ querystring: {}, body: undefined });
    });

    it('never inspects an explicit body, even one with body/querystring fields', () => {
      const body = { title: 't', body: 'text', querystring: 'q' };
      const result = resolveBodyAndQuerystring({ querystring: {}, body });
      expect(result.body).toBe(body);
    });
  });

  describe('named-payload and no-payload endpoints (keys in querystring)', () => {
    it('uses the caller body when there is no named payload', () => {
      const record = { title: 't' };
      const result = resolveBodyAndQuerystring({
        querystring: { refresh: true, body: record },
        body: undefined,
      });
      expect(result.querystring).toEqual({ refresh: true });
      expect(result.body).toBe(record);
    });

    it('prefers the named payload over the caller body', () => {
      const document = { title: 'named' };
      const result = resolveBodyAndQuerystring({
        querystring: { body: { title: 'ignored' } },
        body: document,
      });
      expect(result.querystring).toEqual({});
      expect(result.body).toBe(document);
    });

    it('treats a null named payload as absent', () => {
      const result = resolveBodyAndQuerystring({
        querystring: { body: { a: 1 } },
        body: null,
      });
      expect(result.body).toEqual({ a: 1 });
    });

    it('keeps a string caller body as is', () => {
      const result = resolveBodyAndQuerystring({
        querystring: { body: '{"a":1}' },
      });
      expect(result.body).toBe('{"a":1}');
    });

    it('adds querystring entries to the query', () => {
      const result = resolveBodyAndQuerystring({
        querystring: { querystring: { routing: 'x' } },
      });
      expect(result.querystring).toEqual({ routing: 'x' });
      expect(result.body).toBeUndefined();
    });

    it('lets known query params win over querystring entries', () => {
      const result = resolveBodyAndQuerystring({
        querystring: {
          routing: 'known',
          querystring: { routing: 'extra', preference: '_local' },
        },
      });
      expect(result.querystring).toEqual({
        routing: 'known',
        preference: '_local',
      });
    });

    it('does not mutate the input querystring', () => {
      const querystring = { refresh: true, body: { a: 1 } };
      resolveBodyAndQuerystring({ querystring });
      expect(querystring).toEqual({ refresh: true, body: { a: 1 } });
    });
  });

  describe('property-payload endpoints (keys in bodyParams)', () => {
    it('sends the remaining properties as the body', () => {
      const result = resolveBodyAndQuerystring({
        querystring: { size: undefined },
        bodyParams: { query: { match_all: {} } },
      });
      expect(result.body).toEqual({ query: { match_all: {} } });
    });

    it('spreads an object body first, then named properties override it', () => {
      const result = resolveBodyAndQuerystring({
        querystring: {},
        bodyParams: {
          body: { query: { match_all: {} }, aggs: { a: {} } },
          aggs: { b: {} },
        },
      });
      expect(result.body).toEqual({
        query: { match_all: {} },
        aggs: { b: {} },
      });
    });

    it('sends a string body as is', () => {
      const result = resolveBodyAndQuerystring({
        querystring: {},
        bodyParams: { body: '{"query":{"match_all":{}}}' },
      });
      expect(result.body).toBe('{"query":{"match_all":{}}}');
    });

    it('throws when a string body is combined with body properties', () => {
      expect(() =>
        resolveBodyAndQuerystring({
          querystring: {},
          bodyParams: { body: '{}', query: { match_all: {} } },
        })
      ).toThrow(ConfigurationError);
    });

    it('takes querystring entries out of the body and into the query', () => {
      const result = resolveBodyAndQuerystring({
        querystring: { size: undefined, routing: undefined },
        bodyParams: {
          querystring: { size: 5, routing: 'x' },
          query: { match_all: {} },
        },
      });
      expect(result.querystring).toEqual({ size: 5, routing: 'x' });
      expect(result.body).toEqual({ query: { match_all: {} } });
    });

    it('does not let undefined known params erase querystring entries', () => {
      const result = resolveBodyAndQuerystring({
        querystring: { size: 10, from: undefined },
        bodyParams: { querystring: { size: 5, from: 20 } },
      });
      expect(result.querystring).toEqual({ size: 10, from: 20 });
    });

    it('does not mutate bodyParams or the caller body', () => {
      const callerBody = { query: { match_all: {} } };
      const bodyParams = { body: callerBody, size: 1 };
      resolveBodyAndQuerystring({ querystring: {}, bodyParams });
      expect(bodyParams).toEqual({ body: callerBody, size: 1 });
      expect(callerBody).toEqual({ query: { match_all: {} } });
    });
  });
});
