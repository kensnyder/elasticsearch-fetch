import {
  createTransport,
  type RequestOptions,
  type Transport,
  type TransportOptions,
} from './core/createTransport.ts';
import { endpoints } from './generated/manifest';

export type {
  RequestOptions,
  Transport,
  TransportOptions,
} from './core/createTransport.ts';
export { ConfigurationError, ResponseError } from './core/errors';

/**
 * SDK-compatible client. Method names/namespacing mirror @elastic/elasticsearch
 * (client.search(...), client.indices.create(...)) but the object is built
 * dynamically from the generated endpoint manifest, so it is typed loosely
 * ([key: string]: any) rather than with a fully-typed method-per-namespace shape.
 */
export interface Client {
  transport: Transport;
  [namespace: string]: any;
}

export class Client {
  constructor(options: TransportOptions) {
    const transport = createTransport(options);
    this.transport = transport;

    for (const [dots, fn] of endpoints) {
      const path = dots.split('.');
      let target: any = this;
      for (let i = 0; i < path.length - 1; i++) {
        target[path[i]] ??= {};
        target = target[path[i]];
      }
      target[path[path.length - 1]] = (
        params: any,
        requestOptions?: RequestOptions
      ) => fn(transport, params, requestOptions);
    }
  }
}
