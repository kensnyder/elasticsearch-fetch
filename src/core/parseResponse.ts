import { ResponseError } from './errors';

export async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('json');
  const rawBody = await response.text();
  const parsedBody = isJson && rawBody ? JSON.parse(rawBody) : rawBody;

  if (!response.ok) {
    throw new ResponseError({
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsedBody,
    });
  }

  return parsedBody;
}
