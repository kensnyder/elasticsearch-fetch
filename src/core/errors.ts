export interface ResponseMeta {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

export class ResponseError extends Error {
  meta: ResponseMeta;

  constructor(meta: ResponseMeta) {
    super(`Response Error: ${meta.statusCode}`);
    this.name = 'ResponseError';
    this.meta = meta;
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
