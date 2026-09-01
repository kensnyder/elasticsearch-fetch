export type BasicAuth = { username: string; password: string };
export type ApiKeyAuth = { apiKey: string | { id: string; api_key: string } };
export type BearerAuth = { bearer: string };
export type Auth = BasicAuth | ApiKeyAuth | BearerAuth;

export function buildAuthHeader(auth?: Auth): string | undefined {
  if (!auth) {
    return maybeUseEnv();
  }
  if ('apiKey' in auth) {
    if (typeof auth.apiKey === 'object') {
      return `ApiKey ${btoa(`${auth.apiKey.id}:${auth.apiKey.api_key}`)}`;
    }
    return `ApiKey ${auth.apiKey}`;
  }
  if ('bearer' in auth) {
    return `Bearer ${auth.bearer}`;
  }
  if ('username' in auth) {
    return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
  }
  return undefined;
}

function maybeUseEnv() {
  const p = typeof process !== 'undefined' ? process : null;
  if (!p) {
    return undefined;
  }
  if (p.env?.ELASTICSEARCH_API_KEY) {
    return buildAuthHeader({ apiKey: p.env.ELASTICSEARCH_API_KEY });
  }
  if (p.env?.ELASTICSEARCH_BEARER) {
    return buildAuthHeader({ bearer: p.env.ELASTICSEARCH_BEARER });
  }
  if (p.env?.ELASTICSEARCH_USERNAME && p.env?.ELASTICSEARCH_PASSWORD) {
    return buildAuthHeader({
      username: p.env.ELASTICSEARCH_USERNAME,
      password: p.env.ELASTICSEARCH_PASSWORD,
    });
  }
  return undefined;
}
