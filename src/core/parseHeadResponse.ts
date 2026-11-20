import { ResponseError } from './errors';
import { isIgnoredStatus } from './parseResponse';

/**
 * Resolves a HEAD response to a boolean, like `@elastic/elasticsearch` does
 * for exists-style endpoints (`indices.exists`, `ping`, ...): `true` on 2xx,
 * `false` on 404 or a status listed in `ignore`, otherwise throws
 * `ResponseError`.
 */
export async function parseHeadResponse(
  response: Response,
  ignore?: number | number[]
): Promise<boolean> {
  // HEAD responses carry no body, but drain it so the connection is released
  const rawBody = await response.text();

  if (response.ok) {
    return true;
  }
  if (response.status === 404 || isIgnoredStatus(response.status, ignore)) {
    return false;
  }
  throw new ResponseError({
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: rawBody,
  });
}
