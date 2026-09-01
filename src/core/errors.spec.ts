import { describe, expect, it } from 'bun:test';
import { ConfigurationError, ResponseError } from './errors.ts';

describe('ResponseError', () => {
  it('sets the message from the status code', () => {
    const error = new ResponseError({ statusCode: 404, headers: {}, body: null });
    expect(error.message).toBe('Response Error: 404');
  });

  it('sets the name to ResponseError', () => {
    const error = new ResponseError({ statusCode: 500, headers: {}, body: null });
    expect(error.name).toBe('ResponseError');
  });

  it('stores the provided meta', () => {
    const meta = { statusCode: 400, headers: { 'content-type': 'application/json' }, body: { error: 'bad request' } };
    const error = new ResponseError(meta);
    expect(error.meta).toEqual(meta);
  });

  it('is an instance of Error', () => {
    const error = new ResponseError({ statusCode: 500, headers: {}, body: null });
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ConfigurationError', () => {
  it('sets the message', () => {
    const error = new ConfigurationError('missing node');
    expect(error.message).toBe('missing node');
  });

  it('sets the name to ConfigurationError', () => {
    const error = new ConfigurationError('missing node');
    expect(error.name).toBe('ConfigurationError');
  });

  it('is an instance of Error', () => {
    const error = new ConfigurationError('missing node');
    expect(error).toBeInstanceOf(Error);
  });
});
