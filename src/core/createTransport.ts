import { type Auth, buildAuthHeader } from './buildAuthHeader.ts';
import { buildQuerystring } from './buildQuerystring.ts';
import { ResponseError, SerializationError } from './errors';

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

const ACCEPT_HEADER =
  'application/vnd.elasticsearch+json; compatible-with=9, application/json';

function serializeBody(
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

export function createTransport(options: TransportOptions): Transport {
  const baseUrl = (
    Array.isArray(options.node) ? options.node[0] : options.node
  ).replace(/\/+$/, '');
  const authHeader = buildAuthHeader(options.auth);

  return {
    async request<TResponse>(
      params: RequestParams,
      requestOptions: RequestOptions = {}
    ): Promise<TResponse> {
      const url = `${baseUrl}${params.path}${buildQuerystring(params.querystring)}`;

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
      if (params.body !== undefined) {
        const serialized = serializeBody(params.body, params.ndjson);
        payload = serialized.payload;
        headers['content-type'] = serialized.contentType;
      }

      const timeout = requestOptions.requestTimeout ?? options.requestTimeout;
      const controller = new AbortController();
      const timer = timeout
        ? setTimeout(() => controller.abort(), timeout)
        : undefined;

      let response: Response;
      try {
        response = await fetch(url, {
          method: params.method,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }

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

      return parsedBody as TResponse;
    },
  };
}
