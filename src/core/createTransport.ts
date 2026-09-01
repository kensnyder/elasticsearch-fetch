import { type Auth, buildAuthHeader } from './buildAuthHeader.ts';
import { buildQuerystring } from './buildQuerystring.ts';
import { parseResponse } from './parseResponse';
import { relocateComplexQuerystringEntries } from './relocateComplexQuerystringEntries';
import { resolveBaseUrl } from './resolveBaseUrl';
import { resolveRequestMethod } from './resolveRequestMethod';
import { serializeBody } from './serializeBody';

export interface TransportOptions {
  node: string | string[];
  auth?: Auth;
  headers?: Record<string, string>;
  requestTimeout?: number;
}

export interface RequestParams {
  method: string;
  path: string;
  querystring?: Record<string, unknown>;
  body?: unknown;
  ndjson?: boolean;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  requestTimeout?: number;
  headers?: Record<string, string>;
}

export interface Transport {
  request<TResponse = unknown>(
    params: RequestParams,
    options?: RequestOptions
  ): Promise<TResponse>;
}

export type EndpointFn = (
  transport: Transport,
  params: any,
  options?: RequestOptions
) => Promise<any>;

const ACCEPT_HEADER =
  'application/vnd.elasticsearch+json; compatible-with=9, application/json';

export function createTransport(options: TransportOptions): Transport {
  const baseUrl = resolveBaseUrl(options.node);
  const authHeader = buildAuthHeader(options.auth);

  return {
    async request<TResponse>(
      params: RequestParams,
      requestOptions: RequestOptions = {}
    ): Promise<TResponse> {
      const { querystring, body } = relocateComplexQuerystringEntries(
        params.querystring,
        params.body
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
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }

      return (await parseResponse(response)) as TResponse;
    },
  };
}
