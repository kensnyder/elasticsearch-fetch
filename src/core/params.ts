export function pickAliased(params: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (params[name] !== undefined) {
      return params[name];
    }
  }
  return undefined;
}
