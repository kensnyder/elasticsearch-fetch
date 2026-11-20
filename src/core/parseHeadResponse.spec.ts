import { describe, expect, it } from 'bun:test';
import { ResponseError } from './errors';
import { parseHeadResponse } from './parseHeadResponse';

function headResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { 'content-type': 'application/json', 'x-custom': 'value' },
  });
}

describe('parseHeadResponse', () => {
  it('resolves true on 200', async () => {
    const result = await parseHeadResponse(headResponse(200));
    expect(result).toBe(true);
  });

  it('resolves true on any 2xx', async () => {
    const result = await parseHeadResponse(headResponse(204));
    expect(result).toBe(true);
  });

  it('resolves false on 404', async () => {
    const result = await parseHeadResponse(headResponse(404));
    expect(result).toBe(false);
  });

  it('throws ResponseError on 500', async () => {
    let caught: unknown;
    try {
      await parseHeadResponse(headResponse(500));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ResponseError);
    const responseError = caught as ResponseError;
    expect(responseError.meta.statusCode).toBe(500);
    expect(responseError.meta.body).toBe('');
    expect(responseError.meta.headers['x-custom']).toBe('value');
  });

  it('throws ResponseError on 401', async () => {
    const promise = parseHeadResponse(headResponse(401));
    await expect(promise).rejects.toBeInstanceOf(ResponseError);
  });

  it('resolves false when the status is in the ignore array', async () => {
    const result = await parseHeadResponse(headResponse(500), [500, 503]);
    expect(result).toBe(false);
  });

  it('resolves false when the status matches a single ignore number', async () => {
    const result = await parseHeadResponse(headResponse(401), 401);
    expect(result).toBe(false);
  });

  it('throws ResponseError when the status does not match ignore', async () => {
    const promise = parseHeadResponse(headResponse(500), [400]);
    await expect(promise).rejects.toBeInstanceOf(ResponseError);
  });
});
