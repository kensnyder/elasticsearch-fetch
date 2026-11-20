import { type Auth, buildAuthHeader } from './buildAuthHeader.ts';
import { buildQuerystring } from './buildQuerystring.ts';
import { ConnectionError, TimeoutError } from './errors';
import { parseResponse } from './parseResponse';
import { relocateComplexQuerystringEntries } from './relocateComplexQuerystringEntries';
import { resolveBaseUrl } from './resolveBaseUrl';
import { resolveBodyAndQuerystring } from './resolveBodyAndQuerystring';
import { resolveRequestMethod } from './resolveRequestMethod';
import { serializeBody } from './serializeBody';

export interface TransportOptions {
  node?: string | string[];
  auth?: Auth;
  headers?: Record<string, string>;
  requestTimeout?: number;
}

export interface RequestParams {
  method: string;
  path: string;
  querystring?: Record<string, unknown>;
  body?: unknown;
  /**
   * Body properties gathered from an endpoint's params (property-payload
   * endpoints). Unlike `body`, its own `body` and `querystring` keys are read
   * as the caller's payload and extra query params; see
   * `resolveBodyAndQuerystring`.
   */
  bodyParams?: Record<string, unknown>;
  ndjson?: boolean;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  requestTimeout?: number;
  headers?: Record<string, string>;
  ignore?: number | number[];
}

export interface Transport {
  request<TResponse = unknown>(
    params: RequestParams,
    options?: RequestOptions
  ): Promise<TResponse>;
}

/**
 * Any generated endpoint function. `params: never` is the widest parameter
 * constraint: every concrete params type is assignable to it.
 */
export type EndpointFn = (
  transport: Transport,
  params: never,
  options?: RequestOptions
) => Promise<unknown>;

const ACCEPT_HEADER =
  'application/vnd.elasticsearch+json; compatible-with=9, application/json';

export function createTransport(options: TransportOptions = {}): Transport {
  const baseUrl = resolveBaseUrl(
    options.node ??
      globalThis.process?.env?.ELASTICSEARCH_NODE ??
      'http://localhost:9200'
  );
  const authHeader = buildAuthHeader(options.auth);

  return {
    async request<TResponse>(
      params: RequestParams,
      requestOptions: RequestOptions = {}
    ): Promise<TResponse> {
      const resolved = resolveBodyAndQuerystring(params);
      const { querystring, body } = relocateComplexQuerystringEntries(
        resolved.querystring,
        resolved.body
      );
      const url = `${baseUrl}${params.path}${buildQuerystring(querystring)}`;

      const headers: Record<string, string> = {
        accept: ACCEPT_HEADER,
        ...options.headers,
        ...params.headers,
        ...requestOptions.headers,
      };
      if (authHeader) {
        headers.authorization = authHeader;
      }

      let payload: string | undefined;
      if (body !== undefined) {
        const serialized = serializeBody(body, params.ndjson);
        payload = serialized.payload;
        headers['content-type'] = serialized.contentType;
      }

      const method = resolveRequestMethod(params.method, payload !== undefined);

      const timeout = requestOptions.requestTimeout ?? options.requestTimeout;
      const controller = new AbortController();
      const timer = timeout
        ? setTimeout(() => controller.abort(), timeout)
        : undefined;

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (cause) {
        if (controller.signal.aborted) {
          throw new TimeoutError(undefined, { cause });
        }
        throw new ConnectionError((cause as Error).message, { cause });
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }

      return (await parseResponse(
        response,
        requestOptions.ignore
      )) as TResponse;
    },
  };
}
