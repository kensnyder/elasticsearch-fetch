import { describe, expect, it } from 'bun:test';
import { ConfigurationError, ResponseError, SerializationError } from './errors.ts';

describe('ResponseError', () => {
  it('sets the message from the status code when the body has no error info', () => {
    const error = new ResponseError({ statusCode: 404, headers: {}, body: null });
    expect(error.message).toBe('Response Error: 404');
  });

  it('sets the message from a string error body', () => {
    const error = new ResponseError({ statusCode: 500, headers: {}, body: { error: 'boom' } });
    expect(error.message).toBe('boom');
  });

  it('sets the message from the error type and reason', () => {
    const error = new ResponseError({
      statusCode: 400,
      headers: {},
      body: { error: { type: 'illegal_argument_exception', reason: 'bad request' } },
    });
    expect(error.message).toBe('illegal_argument_exception: bad request');
  });

  it('sets the message from root_cause entries when present', () => {
    const error = new ResponseError({
      statusCode: 400,
      headers: {},
      body: {
        error: {
          type: 'illegal_argument_exception',
          reason: 'The bulk request must be terminated by a newline [\\n]',
          root_cause: [
            {
              type: 'illegal_argument_exception',
              reason: 'The bulk request must be terminated by a newline [\\n]',
            },
          ],
        },
      },
    });
    expect(error.message).toBe(
      'illegal_argument_exception: [illegal_argument_exception] Reason: The bulk request must be terminated by a newline [\\n]'
    );
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

describe('SerializationError', () => {
  it('prefixes the message', () => {
    const error = new SerializationError('circular structure');
    expect(error.message).toBe('Error serializing payload: circular structure');
  });

  it('sets the name to SerializationError', () => {
    const error = new SerializationError('circular structure');
    expect(error.name).toBe('SerializationError');
  });

  it('stores the cause when provided', () => {
    const cause = new Error('original');
    const error = new SerializationError('circular structure', { cause });
    expect(error.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const error = new SerializationError('circular structure');
    expect(error).toBeInstanceOf(Error);
  });
});
