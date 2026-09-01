import {
  createTransport,
  type EndpointFn,
  type RequestOptions,
  type Transport,
  type TransportOptions,
} from './core/createTransport.ts';
import type { DotsToNested } from './core/dotsToNested';

export type {
  EndpointFn,
  RequestOptions,
  Transport,
  TransportOptions,
} from './core/createTransport.ts';
export { ConfigurationError, ResponseError } from './core/errors';

export function registerEndpoints(
  target: any,
  transport: Transport,
  endpoints: Record<string, EndpointFn>
) {
  for (const [dots, fn] of Object.entries(endpoints)) {
    const path = dots.split('.');
    let node: any = target;
    for (let i = 0; i < path.length - 1; i++) {
      node[path[i]] ??= {};
      node = node[path[i]];
    }
    node[path[path.length - 1]] = (
      params: any,
      requestOptions?: RequestOptions
    ) => fn(transport, params, requestOptions);
  }
}

class ClientImpl {
  transport: Transport;
  constructor(
    options: TransportOptions,
    endpoints: Record<string, EndpointFn> = {}
  ) {
    this.transport = createTransport(options);
    this.register(endpoints);
  }
  register(endpoints: Record<string, EndpointFn>) {
    registerEndpoints(this, this.transport, endpoints);
  }
}

/**
 * Build-your-own SDK client. Register endpoints (individually, or via a
 * preset) to control exactly which methods are attached, and to keep only
 * the endpoint modules you actually use in your bundle.
 */
export type Client<T extends Record<string, EndpointFn> = {}> = ClientImpl &
  DotsToNested<T>;

export const Client = ClientImpl as new <
  T extends Record<string, EndpointFn> = {},
>(
  options: TransportOptions,
  endpoints?: T
) => Client<T>;
