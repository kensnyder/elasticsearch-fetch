export interface UrlTemplate {
  methods: string[];
  path: string;
  deprecation?: unknown;
}

export interface ResolvedUrl {
  method: string;
  path: string;
}

export type PathParamValue = string | number | boolean | string[] | undefined;

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

function encodePathValue(value: PathParamValue): string {
  if (Array.isArray(value)) {
    return value.map(item => encodeURIComponent(String(item))).join(',');
  }
  return encodeURIComponent(String(value));
}

export function resolveUrl(
  urls: UrlTemplate[],
  pathParams: Record<string, PathParamValue> = {}
): ResolvedUrl {
  const candidates = urls
    .map(url => ({
      url,
      placeholders: [...url.path.matchAll(PLACEHOLDER)].map(match => match[1]),
    }))
    .sort((a, b) => b.placeholders.length - a.placeholders.length);

  const match = candidates.find(candidate =>
    candidate.placeholders.every(name => pathParams[name] !== undefined)
  );
  const chosen = match ?? candidates[candidates.length - 1];

  const path = chosen.url.path.replace(PLACEHOLDER, (_, name: string) => encodePathValue(pathParams[name]));

  return { method: chosen.url.methods[0], path };
}
