import { describe, expect, it } from 'bun:test';
import { ResponseError } from './errors';
import { parseResponse } from './parseResponse';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parseResponse', () => {
  it('parses a JSON body on success', async () => {
    const result = await parseResponse(jsonResponse({ hits: { total: 0 } }));
    expect(result).toEqual({ hits: { total: 0 } });
  });

  it('returns raw text for non-JSON responses', async () => {
    const response = new Response('plain text body', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    const result = await parseResponse(response);
    expect(result).toBe('plain text body');
  });

  it('returns an empty string for an empty non-JSON body', async () => {
    const response = new Response('', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    const result = await parseResponse(response);
    expect(result).toBe('');
  });

  it('throws ResponseError with statusCode and body on non-2xx responses', async () => {
    const response = jsonResponse({ error: 'index_not_found' }, 404);

    let caught: unknown;
    try {
      await parseResponse(response);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ResponseError);
    const responseError = caught as ResponseError;
    expect(responseError.meta.statusCode).toBe(404);
    expect(responseError.meta.body).toEqual({ error: 'index_not_found' });
  });

  it('includes response headers in the ResponseError meta', async () => {
    const response = new Response('{"error":"boom"}', {
      status: 500,
      headers: { 'content-type': 'application/json', 'x-custom': 'value' },
    });

    let caught: unknown;
    try {
      await parseResponse(response);
    } catch (error) {
      caught = error;
    }

    expect((caught as ResponseError).meta.headers['x-custom']).toBe('value');
  });
});
