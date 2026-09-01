export type UrlTemplate = [methods: string[], path: string];

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
  pathParams: Record<string, any> = {}
): ResolvedUrl {
  const candidates = urls
    .map(([methods, path]) => ({
      methods,
      path,
      placeholders: [...path.matchAll(PLACEHOLDER)].map(match => match[1]),
    }))
    .sort((a, b) => b.placeholders.length - a.placeholders.length);

  const match = candidates.find(candidate =>
    candidate.placeholders.every(name => pathParams[name] !== undefined)
  );
  const chosen = match ?? candidates[candidates.length - 1];

  const path = chosen.path.replace(PLACEHOLDER, (_, name: string) =>
    encodePathValue(pathParams[name])
  );

  return { method: chosen.methods[0], path };
}
