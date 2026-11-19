import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Client } from './index';

const NODE = 'http://localhost:9200';

function stubFetch() {
  return spyOn(globalThis, 'fetch').mockImplementation(
    (async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch
  );
}

describe('path params whose wire name is also the payload name', () => {
  afterEach(() => {
    mock.restore();
  });

  // The schema names both the path param and the payload "repository"; in
  // estypes the path param is `name` and `repository` is the payload.
  it('snapshot.createRepository puts `name` in the path and sends `repository` as the payload', async () => {
    const fetchMock = stubFetch();
    const client = new Client({ node: NODE });
    const repository = {
      type: 'fs' as const,
      settings: { location: '/backups' },
    };
    await client.snapshot.createRepository({
      name: 'my_repo',
      verify: false,
      repository,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${NODE}/_snapshot/my_repo?verify=false`);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(JSON.stringify(repository));
  });
});
