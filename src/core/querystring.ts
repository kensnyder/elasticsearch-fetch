export function buildQuerystring(query?: Record<string, unknown>): string {
  if (!query) {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}
