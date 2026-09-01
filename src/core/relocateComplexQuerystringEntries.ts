/**
 * True for values that serialize safely as a querystring value: primitives, or arrays
 * of primitives (joined with `,`). False for plain objects/arrays containing them —
 * those stringify to garbage like `[object Object]` (e.g. the Sort DSL passed as
 * `sort` on `_search`, which is also a valid body field).
 */
export function isSimpleQuerystringValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.every(isSimpleQuerystringValue);
  const type = typeof value;
  return (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'bigint'
  );
}

/**
 * Some request params (e.g. `sort`) are valid in either the querystring or the body,
 * but only survive querystring serialization in their simple string form. Anything
 * more complex is moved into the body instead, where it's serialized as real JSON.
 */
export function relocateComplexQuerystringEntries(
  querystring: Record<string, unknown> | undefined,
  body: unknown
): { querystring: Record<string, unknown> | undefined; body: unknown } {
  if (!querystring) return { querystring, body };

  const canMergeIntoBody =
    body === undefined ||
    (typeof body === 'object' && body !== null && !Array.isArray(body));
  if (!canMergeIntoBody) return { querystring, body };

  let relocated: Record<string, unknown> | undefined;
  const simpleQuerystring: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(querystring)) {
    if (isSimpleQuerystringValue(value)) {
      simpleQuerystring[key] = value;
    } else {
      relocated ??= {};
      relocated[key] = value;
    }
  }
  if (!relocated) return { querystring, body };

  return {
    querystring: simpleQuerystring,
    body: { ...(body as Record<string, unknown> | undefined), ...relocated },
  };
}
