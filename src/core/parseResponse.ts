import { DeserializationError, ResponseError } from './errors';

/**
 * True when `status` matches the caller's `ignore` option (one status code or
 * a list of them).
 */
export function isIgnoredStatus(
  status: number,
  ignore?: number | number[]
): boolean {
  return Array.isArray(ignore) ? ignore.includes(status) : ignore === status;
}

export async function parseResponse(
  response: Response,
  ignore?: number | number[]
): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('json');
  const rawBody = await response.text();

  let parsedBody: unknown;
  if (isJson && rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (cause) {
      throw new DeserializationError((cause as Error).message, { cause });
    }
  } else {
    parsedBody = rawBody;
  }

  if (!response.ok && !isIgnoredStatus(response.status, ignore)) {
    throw new ResponseError({
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedBody,
    });
  }

  return parsedBody;
}
