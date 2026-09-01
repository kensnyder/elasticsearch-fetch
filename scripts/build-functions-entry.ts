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

function findGeneratedFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findGeneratedFiles(fullPath));
    } else if (entry.endsWith('.ts') && entry !== 'manifest.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

const files = findGeneratedFiles(GENERATED_DIR).sort();

const exportLines = files.map(filePath => {
  const relPath = relative(GENERATED_DIR, filePath).replace(/\.ts$/, '');
  const segments = relPath.split('/');
  const functionName = segments[segments.length - 1];
  const aliasName =
    segments.length === 1
      ? functionName
      : segments.slice(0, -1).map(toPascalWord).join('') +
        toPascalWord(functionName);
  return functionName === aliasName
    ? `export { ${functionName} } from './src/generated/${relPath}';`
    : `export { ${functionName} as ${aliasName} } from './src/generated/${relPath}';`;
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
