import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
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

  it('returns undefined for an auth object with no recognized shape', () => {
    expect(buildAuthHeader({} as never)).toBeUndefined();
  });

  describe('env fallback', () => {
    const keys = [
      'ELASTICSEARCH_API_KEY',
      'ELASTICSEARCH_BEARER',
      'ELASTICSEARCH_USERNAME',
      'ELASTICSEARCH_PASSWORD',
    ] as const;
    const originalValues: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const key of keys) {
        originalValues[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of keys) {
        if (originalValues[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalValues[key];
        }
      }
    });

    it('returns undefined when no auth and no env vars are set', () => {
      expect(buildAuthHeader()).toBeUndefined();
    });

    it('uses ELASTICSEARCH_API_KEY from env when no auth is provided', () => {
      process.env.ELASTICSEARCH_API_KEY = 'env-key';
      expect(buildAuthHeader()).toBe('ApiKey env-key');
    });

    it('uses ELASTICSEARCH_BEARER from env when no auth is provided', () => {
      process.env.ELASTICSEARCH_BEARER = 'env-bearer';
      expect(buildAuthHeader()).toBe('Bearer env-bearer');
    });

    it('uses ELASTICSEARCH_USERNAME/PASSWORD from env when no auth is provided', () => {
      process.env.ELASTICSEARCH_USERNAME = 'env-user';
      process.env.ELASTICSEARCH_PASSWORD = 'env-pass';
      expect(buildAuthHeader()).toBe(`Basic ${btoa('env-user:env-pass')}`);
    });
  });
});
