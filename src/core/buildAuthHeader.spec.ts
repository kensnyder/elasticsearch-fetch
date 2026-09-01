import { describe, expect, it } from 'bun:test';
import { buildAuthHeader } from './buildAuthHeader.ts';

describe('buildAuthHeader', () => {
  it('returns undefined when no auth is provided', () => {
    expect(buildAuthHeader()).toBeUndefined();
  });

  it('builds a Basic header from username/password', () => {
    expect(buildAuthHeader({ username: 'elastic', password: 'changeme' })).toBe(
      `Basic ${btoa('elastic:changeme')}`
    );
  });

  it('builds an ApiKey header from a string apiKey', () => {
    expect(buildAuthHeader({ apiKey: 'my-encoded-key' })).toBe('ApiKey my-encoded-key');
  });

  it('builds an ApiKey header from an id/api_key object', () => {
    expect(buildAuthHeader({ apiKey: { id: 'id123', api_key: 'secret' } })).toBe(
      `ApiKey ${btoa('id123:secret')}`
    );
  });

  it('builds a Bearer header', () => {
    expect(buildAuthHeader({ bearer: 'my-token' })).toBe('Bearer my-token');
  });
});
