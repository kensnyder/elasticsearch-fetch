export interface ResponseMeta {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

interface ErrorCause {
  type?: string;
  reason?: string;
}

function getResponseErrorMessage(meta: ResponseMeta): string {
  const body = meta.body as { error?: string | (ErrorCause & { root_cause?: ErrorCause[] }) } | null | undefined;
  const error = body?.error;
  if (typeof error === 'string') {
    return error;
  }
  if (!error?.type) {
    return `Response Error: ${meta.statusCode}`;
  }
  if (Array.isArray(error.root_cause) && error.root_cause.length > 0) {
    const causes = error.root_cause
      .map(cause => `[${cause.type}] Reason: ${cause.reason}`)
      .join('; ');
    return `${error.type}: ${causes}`;
  }
  return error.reason ? `${error.type}: ${error.reason}` : error.type;
}

export class ResponseError extends Error {
  meta: ResponseMeta;

  constructor(meta: ResponseMeta) {
    super(getResponseErrorMessage(meta));
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

export class SerializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Error serializing payload: ${message}`, options);
    this.name = 'SerializationError';
  }
}

export class DeserializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Error deserializing response: ${message}`, options);
    this.name = 'DeserializationError';
  }
}

export class ConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out', options?: ErrorOptions) {
    super(message, options);
    this.name = 'TimeoutError';
  }
}
