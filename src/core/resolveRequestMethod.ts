/**
 * Fetch (and most HTTP infrastructure) doesn't allow a body on GET/HEAD, but the
 * Elasticsearch REST API allows GET requests with a body (e.g. `_search`). When a
 * body is present, the method is upgraded to POST so `fetch` will actually send it.
 */
export function resolveRequestMethod(method: string, hasBody: boolean): string {
  return hasBody && /^(GET|HEAD)$/i.test(method) ? 'POST' : method;
}
