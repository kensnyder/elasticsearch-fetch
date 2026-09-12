import { DeserializationError, ResponseError } from './errors';

export async function parseResponse(response: Response): Promise<unknown> {
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

  if (!response.ok) {
    throw new ResponseError({
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedBody,
    });
  }

  return parsedBody;
}
