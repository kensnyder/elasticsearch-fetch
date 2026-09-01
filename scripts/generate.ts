import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCHEMA_PATH = join(ROOT, 'data/schema.json');
const ESTYPES_PATH = join(ROOT, 'node_modules/@elastic/elasticsearch/lib/api/types.d.ts');
const OUT_DIR = join(ROOT, 'src/generated');

const COMMON_QUERY_PARAMS = ['error_trace', 'filter_path', 'human', 'pretty'];
const RESERVED_FILE_NAMES = new Set(['index', 'manifest']);

const RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'return', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'let', 'static', 'enum', 'await', 'implements', 'package', 'protected',
  'interface', 'private', 'public', 'null', 'true', 'false',
]);

interface SchemaTypeRef {
  name: string;
  namespace: string;
}

interface SchemaParam {
  name: string;
  codegenName?: string;
  aliases?: string[];
  required?: boolean;
}

interface SchemaRequestType {
  kind: 'request';
  name: SchemaTypeRef;
  path: SchemaParam[];
  query: SchemaParam[];
  body:
    | { kind: 'no_body' }
    | { kind: 'value'; codegenName?: string }
    | { kind: 'properties'; properties: SchemaParam[] };
}

interface SchemaUrl {
  methods: string[];
  path: string;
  deprecation?: unknown;
}

interface SchemaEndpoint {
  name: string;
  request: SchemaTypeRef;
  urls: SchemaUrl[];
  requestMediaType?: string[];
  codegenExclude?: boolean;
  availability?: {
    stack?: { visibility?: string };
  };
}

interface Schema {
  endpoints: SchemaEndpoint[];
  types: Array<{ kind: string; name?: SchemaTypeRef; [key: string]: unknown }>;
}

function toPascalWord(word: string): string {
  return word
    .split('_')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function toPascalDotted(dotted: string): string {
  return dotted.split('.').map(toPascalWord).join('');
}

function toCamelWord(word: string): string {
  const pascal = toPascalWord(word);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function toCamelDotted(dotted: string): string {
  const pascal = toPascalDotted(dotted);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function propKey(name: string): string {
  return isValidIdentifier(name) ? name : quote(name);
}

const schema: Schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

const estypesSource = readFileSync(ESTYPES_PATH, 'utf8');
const knownInterfaces = new Set<string>();
for (const match of estypesSource.matchAll(/^export interface (\w+)/gm)) {
  knownInterfaces.add(match[1]);
}

const requestTypesByKey = new Map<string, SchemaRequestType>();
for (const type of schema.types) {
  if (type.kind === 'request' && type.name) {
    requestTypesByKey.set(`${type.name.namespace}::${type.name.name}`, type as unknown as SchemaRequestType);
  }
}

interface GeneratedFunction {
  functionName: string;
  flatName: string;
  code: string;
}

const fileGroups = new Map<string, GeneratedFunction[]>();
const manifestEntries: Array<{ path: string[]; file: string; functionName: string }> = [];

let skipped = 0;
let generated = 0;

for (const endpoint of schema.endpoints) {
  if (endpoint.codegenExclude) {
    skipped++;
    continue;
  }
  const visibility = endpoint.availability?.stack?.visibility ?? 'public';
  if (!endpoint.availability?.stack || visibility !== 'public') {
    skipped++;
    continue;
  }

  const requestType = requestTypesByKey.get(`${endpoint.request.namespace}::${endpoint.request.name}`);
  if (!requestType) {
    console.warn(`No request type found for endpoint "${endpoint.name}", skipping`);
    skipped++;
    continue;
  }

  const segments = endpoint.name.split('.');
  const file = RESERVED_FILE_NAMES.has(segments[0]) ? `${segments[0]}_api` : segments[0];
  const functionName = segments.length > 1 ? toCamelWord(segments[segments.length - 1]) : toCamelWord(segments[0]);
  const flatName = segments.length > 1 ? toCamelDotted(endpoint.name) : functionName;
  const implName = RESERVED_WORDS.has(functionName) ? `${functionName}_` : functionName;

  const pascalName = toPascalDotted(endpoint.name);
  const requestTypeName = knownInterfaces.has(`${pascalName}Request`)
    ? `estypes.${pascalName}Request`
    : 'Record<string, any>';
  const responseTypeName = knownInterfaces.has(`${pascalName}Response`) ? `estypes.${pascalName}Response` : 'unknown';

  const pathEntries = requestType.path.map(p => `    ${propKey(p.name)}: p[${quote(p.name)}],`);

  const queryNames = [...new Set([...requestType.query.map(p => p.name), ...COMMON_QUERY_PARAMS])];
  const queryEntries = queryNames.map(name => `    ${propKey(name)}: p[${quote(name)}],`);

  const ndjson = Boolean(endpoint.requestMediaType?.includes('application/x-ndjson'));

  let bodyExpr: string | undefined;
  if (requestType.body.kind === 'value') {
    const key = requestType.body.codegenName ?? 'body';
    bodyExpr = `p[${quote(key)}]`;
  } else if (requestType.body.kind === 'properties') {
    const bodyEntries = requestType.body.properties.map(p => {
      if (p.aliases?.length) {
        const names = [p.name, ...p.aliases].map(quote).join(', ');
        return `    ${propKey(p.name)}: pickAliased(p, [${names}]),`;
      }
      return `    ${propKey(p.name)}: p[${quote(p.name)}],`;
    });
    bodyExpr = bodyEntries.length > 0 ? `{\n${bodyEntries.join('\n')}\n  }` : undefined;
  }

  const urlsLiteral = JSON.stringify(endpoint.urls);

  const requestCallLines = [
    '    method,',
    '    path,',
    `    querystring: {\n${queryEntries.join('\n')}\n    },`,
  ];
  if (bodyExpr !== undefined) {
    requestCallLines.push(`    body: ${bodyExpr},`);
    if (ndjson) {
      requestCallLines.push('    ndjson: true,');
    }
  }

  const exportNames = [...new Set([functionName, flatName])];
  const exportLines = exportNames
    .map(name => (name === implName ? `export { ${implName} };` : `export { ${implName} as ${name} };`))
    .join('\n');

  const code = `const ${implName.toUpperCase()}_URLS: UrlTemplate[] = ${urlsLiteral};

async function ${implName}(
  transport: Transport,
  params: ${requestTypeName},
  options?: RequestOptions
): Promise<${responseTypeName}> {
  const p = params as Record<string, any>;
  const { method, path } = resolveUrl(${implName.toUpperCase()}_URLS, {
${pathEntries.join('\n')}
  });
  return transport.request<${responseTypeName}>({
${requestCallLines.join('\n')}
  }, options);
}
${exportLines}
`;

  if (!fileGroups.has(file)) {
    fileGroups.set(file, []);
  }
  fileGroups.get(file)!.push({ functionName, flatName, code });
  manifestEntries.push({ path: segments, file, functionName });
  generated++;
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const sortedFiles = [...fileGroups.keys()].sort();

for (const file of sortedFiles) {
  const functions = fileGroups.get(file)!;
  const usesAliased = functions.some(f => f.code.includes('pickAliased'));
  const header = [
    "import type { estypes } from '@elastic/elasticsearch';",
    "import type { RequestOptions, Transport } from '../core/Transport';",
    "import { resolveUrl, type UrlTemplate } from '../core/url';",
    usesAliased ? "import { pickAliased } from '../core/params';" : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const body = functions
    .sort((a, b) => a.functionName.localeCompare(b.functionName))
    .map(f => f.code)
    .join('\n');

  writeFileSync(join(OUT_DIR, `${file}.ts`), `${header}\n\n${body}`);
}

const barrelLines = sortedFiles.map(file => {
  const flatNames = fileGroups
    .get(file)!
    .map(f => f.flatName)
    .sort();
  return `export { ${flatNames.join(', ')} } from './${file}';`;
});
writeFileSync(join(OUT_DIR, 'index.ts'), `${barrelLines.join('\n')}\n`);

const manifestImportLines: string[] = [];
const manifestEntryLines: string[] = [];
let importCounter = 0;
const importAliasByFileAndFn = new Map<string, string>();

for (const entry of manifestEntries) {
  const key = `${entry.file}::${entry.functionName}`;
  let alias = importAliasByFileAndFn.get(key);
  if (!alias) {
    alias = `fn${importCounter++}`;
    importAliasByFileAndFn.set(key, alias);
    manifestImportLines.push(`import { ${entry.functionName} as ${alias} } from './${entry.file}';`);
  }
  const pathLiteral = JSON.stringify(entry.path);
  manifestEntryLines.push(`  { path: ${pathLiteral}, fn: ${alias} },`);
}

const manifestSource = `import type { RequestOptions, Transport } from '../core/Transport';
${manifestImportLines.join('\n')}

export interface ManifestEntry {
  path: string[];
  fn: (transport: Transport, params: any, options?: RequestOptions) => Promise<any>;
}

export const endpoints: ManifestEntry[] = [
${manifestEntryLines.join('\n')}
];
`;

writeFileSync(join(OUT_DIR, 'manifest.ts'), manifestSource);

console.log(`Generated ${generated} endpoint functions across ${sortedFiles.length} files (skipped ${skipped}).`);
