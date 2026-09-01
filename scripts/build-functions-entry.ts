import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const GENERATED_DIR = join(ROOT, 'src/generated');
const ENTRY_PATH = join(ROOT, '.functions-entry.ts');

function toPascalWord(word: string): string {
  return word
    .split('_')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function toCamelWord(word: string): string {
  const pascal = toPascalWord(word);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

/** Builds a namespaced camelCase function name from generated-file path segments, e.g. ["cat", "aliases"] -> "catAliases". */
function toNamespacedCamel(segments: string[]): string {
  return segments
    .map((segment, i) =>
      i === 0 ? toCamelWord(segment) : toPascalWord(segment)
    )
    .join('');
}

function findGeneratedFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findGeneratedFiles(fullPath));
    } else if (
      entry.endsWith('.ts') &&
      entry !== 'manifest.ts' &&
      entry !== 'presets.ts'
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = findGeneratedFiles(GENERATED_DIR).sort();

const exportLines = files.map(filePath => {
  const relPath = relative(GENERATED_DIR, filePath).replace(/\.ts$/, '');
  const segments = relPath.split('/');
  const functionName = toNamespacedCamel(segments);
  return `export { ${functionName} } from './src/generated/${relPath}';`;
});

const entrySource = `export { createTransport } from './src/core/createTransport';
export type { RequestOptions, Transport, TransportOptions } from './src/core/createTransport';
export { ConfigurationError, ResponseError } from './src/core/errors';
${exportLines.join('\n')}
`;

writeFileSync(ENTRY_PATH, entrySource);

console.log(
  `Generated functions entry with ${files.length} exports at ${relative(ROOT, ENTRY_PATH)}`
);
