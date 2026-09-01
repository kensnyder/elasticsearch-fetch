export type BasicAuth = { username: string; password: string };
export type ApiKeyAuth = { apiKey: string | { id: string; api_key: string } };
export type BearerAuth = { bearer: string };
export type Auth = BasicAuth | ApiKeyAuth | BearerAuth;

function toBase64(value: string): string {
  return btoa(value);
}

export function buildAuthHeader(auth?: Auth): string | undefined {
  if (!auth) {
    return undefined;
  }
  if ('apiKey' in auth) {
    if (typeof auth.apiKey === 'object') {
      return `ApiKey ${toBase64(`${auth.apiKey.id}:${auth.apiKey.api_key}`)}`;
    }
    return `ApiKey ${auth.apiKey}`;
  }
  if ('bearer' in auth) {
    return `Bearer ${auth.bearer}`;
  }
  if ('username' in auth) {
    return `Basic ${toBase64(`${auth.username}:${auth.password}`)}`;
  }
  return undefined;
}
