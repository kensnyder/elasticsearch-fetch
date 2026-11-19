import { ConfigurationError } from './errors';

type Entries = Record<string, unknown>;

export interface BodyAndQuerystringSources {
  querystring?: Entries;
  body?: unknown;
  bodyParams?: Entries;
}

/**
 * Honors the caller's `body` and `querystring` params the way
 * `@elastic/elasticsearch` does. Generated functions leave those keys in
 * whichever rest object they build: `querystring` for named-payload and
 * no-payload endpoints, `bodyParams` for property-payload endpoints.
 *
 * - `body` (an explicit or named payload such as `document`) wins over the
 *   caller's `body` param, and is never inspected.
 * - With `bodyParams`, an object `body` param is spread first and named
 *   properties override it; a string `body` param is sent as is.
 * - `querystring` entries are added to the query; known params win, unless
 *   they are `undefined`.
 */
export function resolveBodyAndQuerystring({
  querystring,
  body,
  bodyParams,
}: BodyAndQuerystringSources): { querystring: Entries; body: unknown } {
  const {
    body: queryBody,
    querystring: queryExtra,
    ...query
  } = querystring ?? {};
  const {
    body: paramsBody,
    querystring: paramsExtra,
    ...props
  } = bodyParams ?? {};
  const merged: Entries = { ...((paramsExtra ?? queryExtra) as Entries) };
  for (const key in query) {
    if (query[key] !== undefined) {
      merged[key] = query[key];
    }
  }
  return {
    querystring: merged,
    body: body ?? (bodyParams ? mergeBody(paramsBody, props) : queryBody),
  };
}

function mergeBody(paramsBody: unknown, props: Entries): unknown {
  if (paramsBody == null) {
    return props;
  }
  if (typeof paramsBody !== 'string') {
    return { ...paramsBody, ...props };
  }
  if (Object.keys(props).length > 0) {
    throw new ConfigurationError(
      'A string body cannot be combined with body properties'
    );
  }
  return paramsBody;
}
