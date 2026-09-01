import { describe, expect, it } from 'bun:test';
import { SerializationError } from './errors';
import { serializeBody } from './serializeBody';

describe('serializeBody', () => {
  it('serializes a plain object as JSON', () => {
    const result = serializeBody({ settings: { number_of_shards: 1 } });
    expect(result.payload).toBe('{"settings":{"number_of_shards":1}}');
    expect(result.contentType).toBe('application/json');
  });

  it('serializes bigint values as strings', () => {
    const result = serializeBody({ count: 10n });
    expect(result.payload).toBe('{"count":"10"}');
  });

  it('joins array bodies as NDJSON with a trailing newline', () => {
    const result = serializeBody(
      [{ index: { _index: 'foo' } }, { field: 'value' }],
      true
    );
    expect(result.payload).toBe(
      '{"index":{"_index":"foo"}}\n{"field":"value"}\n'
    );
    expect(result.contentType).toBe('application/x-ndjson');
  });

  it('applies the bigint replacer to each NDJSON line', () => {
    const result = serializeBody([{ count: 10n }], true);
    expect(result.payload).toBe('{"count":"10"}\n');
  });

  it('throws SerializationError when the body cannot be serialized', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => serializeBody(circular)).toThrow(SerializationError);
  });

  it('includes the underlying error message in the SerializationError', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    try {
      serializeBody(circular);
      throw new Error('expected serializeBody to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SerializationError);
      expect((error as Error).message).toContain('Error serializing payload');
    }
  });
});
