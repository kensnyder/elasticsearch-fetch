import type { EndpointFn } from './createTransport';

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

type ClientMethod<F extends EndpointFn> = F extends (
  transport: any,
  params: infer P,
  options?: infer O
) => infer R
  ? (params: P, options?: O) => R
  : never;

/**
 * Turns a Record of dotted endpoint names (e.g. "cluster.health") into the
 * nested method shape a Client exposes them under (e.g. { cluster: { health(...) } }).
 */
export type DotsToNested<T extends Record<string, EndpointFn>> = [
  keyof T & string,
] extends [never]
  ? {}
  : UnionToIntersection<
      {
        [K in keyof T & string]: K extends `${infer Head}.${infer Rest}`
          ? { [P in Head]: DotsToNested<Record<Rest, T[K]>> }
          : { [P in K]: ClientMethod<T[K]> };
      }[keyof T & string]
    >;
