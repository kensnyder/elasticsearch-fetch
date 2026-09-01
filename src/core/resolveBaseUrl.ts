export function resolveBaseUrl(node: string | string[]): string {
  const first = Array.isArray(node) ? node[0] : node;
  return first.replace(/\/+$/, '');
}
