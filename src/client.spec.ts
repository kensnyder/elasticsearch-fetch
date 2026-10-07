import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Client, registerEndpoints } from './client';
import type {
  EndpointFn,
  RequestOptions,
  Transport,
} from './core/createTransport';

describe('registerEndpoints', () => {
  afterEach(() => {
    mock.restore();
  });
  it('registers top-level endpoints on target object', async () => {
    const dummyTransport = {} as Transport;
    const target: Record<
      string,
      (params?: unknown, options?: RequestOptions) => Promise<unknown>
    > = {};
    const mockFn = mock((_transport: Transport, params: unknown) =>
      Promise.resolve({ acknowledged: true, params })
    );

    registerEndpoints(target, dummyTransport, {
      ping: mockFn as EndpointFn,
    });

    expect(typeof target.ping).toBe('function');
    const result = await target.ping?.({ verbose: true });
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn.mock.calls[0]?.[0]).toBe(dummyTransport);
    expect(mockFn.mock.calls[0]?.[1]).toEqual({ verbose: true });
    expect(result).toEqual({ acknowledged: true, params: { verbose: true } });
  });

  it('builds nested namespace structure from dotted keys without clobbering siblings', async () => {
    const dummyTransport = {} as Transport;
    const target: {
      indices?: {
        create?: (params: { index: string }) => Promise<{ created: string }>;
        get?: (params: {
          index: string;
        }) => Promise<{ found: boolean; index: string }>;
      };
      cat?: {
        health?: () => Promise<Array<{ status: string }>>;
      };
    } = {};

    const createFn = mock((_transport: Transport, params: { index: string }) =>
      Promise.resolve({ created: params.index })
    );
    const getFn = mock((_transport: Transport, params: { index: string }) =>
      Promise.resolve({ found: true, index: params.index })
    );
    const catHealthFn = mock((_transport: Transport) =>
      Promise.resolve([{ status: 'green' }])
    );

    registerEndpoints(target, dummyTransport, {
      'indices.create': createFn as unknown as EndpointFn,
      'indices.get': getFn as unknown as EndpointFn,
      'cat.health': catHealthFn as unknown as EndpointFn,
    });

    expect(typeof target.indices?.create).toBe('function');
    expect(typeof target.indices?.get).toBe('function');
    expect(typeof target.cat?.health).toBe('function');

    const createRes = await target.indices?.create?.({ index: 'users' });
    expect(createRes).toEqual({ created: 'users' });
    expect(createFn).toHaveBeenCalledTimes(1);

    const getRes = await target.indices?.get?.({ index: 'users' });
    expect(getRes).toEqual({ found: true, index: 'users' });
    expect(getFn).toHaveBeenCalledTimes(1);

    const catRes = await target.cat?.health?.();
    expect(catRes).toEqual([{ status: 'green' }]);
    expect(catHealthFn).toHaveBeenCalledTimes(1);
  });

  it('passes requestOptions to the endpoint function', async () => {
    const dummyTransport = {} as Transport;
    const target: {
      search?: (
        params: { q: string },
        options?: RequestOptions
      ) => Promise<{ options?: RequestOptions }>;
    } = {};
    const mockFn = mock(
      (
        _transport: Transport,
        _params: { q: string },
        options?: RequestOptions
      ) => Promise.resolve({ options })
    );

    registerEndpoints(target, dummyTransport, {
      search: mockFn as unknown as EndpointFn,
    });

    const requestOptions: RequestOptions = {
      ignore: [404],
      headers: { 'x-test': '1' },
    };
    const result = await target.search?.({ q: 'test' }, requestOptions);
    expect(result).toEqual({ options: requestOptions });
    expect(mockFn.mock.calls[0]?.[2]).toBe(requestOptions);
  });
});

describe('Client', () => {
  it('instantiates with transport and registers constructor endpoints', async () => {
    const mockSearch = mock(
      (_transport: Transport, params: { query: string }) =>
        Promise.resolve({ hits: params.query })
    );

    const client = new Client(
      { node: 'http://localhost:9200' },
      { search: mockSearch as unknown as EndpointFn }
    );

    expect(client.transport).toBeDefined();
    expect(typeof client.search).toBe('function');

    const res = await client.search({ query: 'books' });
    expect(res).toEqual({ hits: 'books' });
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('allows registering additional endpoints after construction', async () => {
    const client = new Client({ node: 'http://localhost:9200' });
    const mockCount = mock(
      (_transport: Transport, params: { index?: string }) =>
        Promise.resolve({ count: params.index ? 10 : 0 })
    );

    const dynamicClient = client as unknown as {
      count?: (params: { index: string }) => Promise<{ count: number }>;
    };
    expect(dynamicClient.count).toBeUndefined();

    client.register({
      count: mockCount as unknown as EndpointFn,
    });

    expect(typeof dynamicClient.count).toBe('function');
    const res = await dynamicClient.count?.({ index: 'orders' });
    expect(res).toEqual({ count: 10 });
    expect(mockCount).toHaveBeenCalledTimes(1);
  });
});
