import { SerializationError } from './errors';

export function serializeBody(
  body: unknown,
  ndjson?: boolean
): { payload: string; contentType: string } {
  if (ndjson) {
    const lines = (body as unknown[]).map(line => toJson(line));
    return {
      payload: `${lines.join('\n')}\n`,
      contentType: 'application/x-ndjson',
    };
  }
  return { payload: toJson(body), contentType: 'application/json' };
}

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function toJson(body: unknown): string {
  try {
    return JSON.stringify(body, bigIntReplacer);
  } catch (error) {
    throw new SerializationError((error as Error).message, { cause: error });
  }
}
