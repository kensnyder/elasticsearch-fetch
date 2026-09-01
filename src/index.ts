import { type EndpointFn, registerEndpoints } from './client';
import {
  createTransport,
  type Transport,
  type TransportOptions,
} from './core/createTransport.ts';
import type { DotsToNested } from './core/dotsToNested';
import { endpoints as fullEndpoints } from './generated/manifest';

export type {
  RequestOptions,
  Transport,
  TransportOptions,
} from './core/createTransport.ts';
export { ConfigurationError, ResponseError } from './core/errors';

class ClientImpl {
  transport: Transport;
  constructor(
    options: TransportOptions,
    endpoints: Record<string, EndpointFn> = fullEndpoints
  ) {
    this.transport = createTransport(options);
    registerEndpoints(this, this.transport, endpoints);
  }
  register(endpoints: Record<string, EndpointFn>) {
    registerEndpoints(this, this.transport, endpoints);
  }
}

/**
 * SDK-compatible client, pre-registered with every generated Elasticsearch
 * endpoint. Method names/namespacing mirror @elastic/elasticsearch
 * (client.search(...), client.indices.create(...)).
 */
export type Client<
  T extends Record<string, EndpointFn> = typeof fullEndpoints,
> = ClientImpl & DotsToNested<T>;

export const Client = ClientImpl as new <
  T extends Record<string, EndpointFn> = typeof fullEndpoints,
>(
  options: TransportOptions,
  endpoints?: T
) => Client<T>;
