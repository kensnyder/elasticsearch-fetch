import { describe, expect, it } from 'bun:test';
import { resolveRequestMethod } from './resolveRequestMethod';

describe('resolveRequestMethod', () => {
  it('upgrades GET to POST when a body is present', () => {
    expect(resolveRequestMethod('GET', true)).toBe('POST');
  });

  it('upgrades HEAD to POST when a body is present', () => {
    expect(resolveRequestMethod('HEAD', true)).toBe('POST');
  });

  it('is case-insensitive when matching GET/HEAD', () => {
    expect(resolveRequestMethod('get', true)).toBe('POST');
  });

  it('leaves GET unchanged when there is no body', () => {
    expect(resolveRequestMethod('GET', false)).toBe('GET');
  });

  it('leaves POST unchanged regardless of body', () => {
    expect(resolveRequestMethod('POST', true)).toBe('POST');
    expect(resolveRequestMethod('POST', false)).toBe('POST');
  });

  it('leaves PUT and DELETE unchanged', () => {
    expect(resolveRequestMethod('PUT', true)).toBe('PUT');
    expect(resolveRequestMethod('DELETE', true)).toBe('DELETE');
  });
});
