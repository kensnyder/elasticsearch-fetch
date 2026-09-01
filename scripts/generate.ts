import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA_URL =
  'https://github.com/elastic/elasticsearch-specification/raw/refs/heads/main/output/schema/schema.json';

const ROOT = join(import.meta.dirname, '..');
const ESTYPES_PATH = join(
  ROOT,
  'node_modules/@elastic/elasticsearch/lib/api/types.d.ts'
);
const OUT_DIR = join(ROOT, 'src/generated');
const DOCS_DIR = join(ROOT, 'docs');

const COMMON_QUERY_PARAMS = ['error_trace', 'filter_path', 'human', 'pretty'];

const RESERVED_WORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'enum',
  'await',
  'implements',
  'package',
  'protected',
  'interface',
  'private',
  'public',
  'null',
  'true',
  'false',
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
  description?: string;
  docUrl?: string;
  availability?: {
    stack?: { visibility?: string; since?: string };
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

/** Builds a namespaced camelCase function name from endpoint path segments, e.g. ["cat", "aliases"] -> "catAliases". */
function toNamespacedCamel(segments: string[]): string {
  return segments
    .map((segment, i) =>
      i === 0 ? toCamelWord(segment) : toPascalWord(segment)
    )
    .join('');
}

const schemaResponse = await fetch(SCHEMA_URL);
if (!schemaResponse.ok) {
  throw new Error(
    `Failed to fetch schema.json: ${schemaResponse.status} ${schemaResponse.statusText}`
  );
}
const schema: Schema = await schemaResponse.json();

const estypesSource = readFileSync(ESTYPES_PATH, 'utf8');
const knownInterfaces = new Set<string>();
for (const match of estypesSource.matchAll(
  /^export (?:interface|type) (\w+)/gm
)) {
  knownInterfaces.add(match[1]);
}

/** Extracts the set of top-level property names declared directly on an exported interface. */
function getInterfaceProperties(name: string): Set<string> | null {
  const headerMatch = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(
    estypesSource
  );
  if (!headerMatch) return null;

  let i = headerMatch.index + headerMatch[0].length;
  let depth = 1;
  let body = '';
  while (depth > 0 && i < estypesSource.length) {
    const ch = estypesSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
    if (depth === 1) body += ch;
    i++;
  }

  const noComments = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const props = new Set<string>();
  for (const propMatch of noComments.matchAll(
    /(?:^|;|\n)\s*([A-Za-z_$][A-Za-z0-9_$]*)\??\s*:/g
  )) {
    props.add(propMatch[1]);
  }
  return props;
}

function buildJsDoc(endpoint: SchemaEndpoint): string {
  const lines: string[] = [];
  if (endpoint.description) {
    for (const line of endpoint.description
      .replace(/\*\//g, '*\\/')
      .split('\n')) {
      lines.push(line.length > 0 ? ` * ${line}` : ' *');
    }
  }
  const since = endpoint.availability?.stack?.since;
  const tags: string[] = [];
  if (since) tags.push(` * @since ${since}`);
  if (endpoint.docUrl) tags.push(` * @see ${endpoint.docUrl}`);
  if (tags.length > 0) {
    if (lines.length > 0) lines.push(' *');
    lines.push(...tags);
  }
  if (lines.length === 0) return '';
  return `/**\n${lines.join('\n')}\n */\n`;
}

const requestTypesByKey = new Map<string, SchemaRequestType>();
for (const type of schema.types) {
  if (type.kind === 'request' && type.name) {
    requestTypesByKey.set(
      `${type.name.namespace}::${type.name.name}`,
      type as unknown as SchemaRequestType
    );
  }
}

interface GeneratedFile {
  relPath: string; // path relative to OUT_DIR, no extension, e.g. "bulk" or "cat/health"
  functionName: string;
  code: string;
}

const files: GeneratedFile[] = [];
const manifestEntries: Array<{
  path: string[];
  relPath: string;
  functionName: string;
  docUrl?: string;
}> = [];

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

  const requestType = requestTypesByKey.get(
    `${endpoint.request.namespace}::${endpoint.request.name}`
  );
  if (!requestType) {
    console.warn(
      `No request type found for endpoint "${endpoint.name}", skipping`
    );
    skipped++;
    continue;
  }

  const segments = endpoint.name.split('.');
  const clientPath = segments.map(toCamelWord);
  const folder = segments.length > 1 ? segments[0] : null;
  const fileBaseName = toCamelWord(segments[segments.length - 1]);
  const functionName = toNamespacedCamel(segments);
  const implName = RESERVED_WORDS.has(functionName)
    ? `${functionName}_`
    : functionName;
  const relPath = folder ? `${folder}/${fileBaseName}` : functionName;
  const corePrefix = folder ? '../../core' : '../core';

  const pascalName = toPascalDotted(endpoint.name);
  const requestProps = knownInterfaces.has(`${pascalName}Request`)
    ? getInterfaceProperties(`${pascalName}Request`)
    : null;
  const responseTypeName = knownInterfaces.has(`${pascalName}Response`)
    ? `estypes.${pascalName}Response`
    : 'unknown';

  // Path param names are usually the wire name, but the estypes property is occasionally
  // named after `codegenName` instead (e.g. ilm.get_lifecycle's wire "policy" -> TS "name").
  let typed = requestProps !== null;
  const wirePathNames = requestType.path.map(p => p.name);
  const resolvedPathNames = requestType.path.map(p => {
    if (!requestProps) return p.name;
    if (requestProps.has(p.name)) return p.name;
    if (p.codegenName && requestProps.has(p.codegenName)) return p.codegenName;
    typed = false;
    return p.name;
  });
  const pathNames = typed ? resolvedPathNames : wirePathNames;
  const requestTypeName = typed
    ? `estypes.${pascalName}Request`
    : 'Record<string, any>';

  const pathRenameMap = new Map(
    wirePathNames.map((wire, i) => [wire, pathNames[i]])
  );
  const urlsLiteral = JSON.stringify(
    endpoint.urls.map(u => [
      u.methods,
      u.path.replace(
        /\{([a-zA-Z0-9_]+)\}/g,
        (_, name: string) => `{${pathRenameMap.get(name) ?? name}}`
      ),
    ])
  );

  const ndjson = Boolean(
    endpoint.requestMediaType?.includes('application/x-ndjson')
  );

  let destructureParts: string[];
  let requestObjectLines: string[];

  const pathNameSet = new Set(pathNames);

  if (requestType.body.kind === 'properties') {
    const allQueryNames = [
      ...new Set([
        ...requestType.query.map(p => p.name),
        ...COMMON_QUERY_PARAMS,
      ]),
    ].filter(name => !pathNameSet.has(name));
    destructureParts = [...pathNames, ...allQueryNames, '...body'];
    requestObjectLines = [
      `    querystring: { ${allQueryNames.join(', ')} },`,
      '    body,',
    ];
  } else {
    destructureParts = [...pathNames, '...querystring'];
    if (requestType.body.kind === 'value') {
      const bodyKey = requestType.body.codegenName ?? 'body';
      destructureParts.unshift(
        bodyKey === 'body' ? 'body' : `${bodyKey}: body`
      );
    }
    requestObjectLines = ['    querystring,'];
    if (requestType.body.kind === 'value') {
      requestObjectLines.push('    body,');
      if (ndjson) requestObjectLines.push('    ndjson: true,');
    }
  }

  const jsDoc = buildJsDoc(endpoint);
  const exportKeyword =
    implName === functionName ? 'export async function' : 'async function';
  const trailer =
    implName === functionName
      ? ''
      : `\nexport { ${implName} as ${functionName} };\n`;

  const code = `import type { estypes } from '@elastic/elasticsearch';
import type { RequestOptions, Transport } from '${corePrefix}/createTransport';
import { resolveUrl, type UrlTemplate } from '${corePrefix}/url';

const URLS: UrlTemplate[] = ${urlsLiteral};

${jsDoc}${exportKeyword} ${implName}(
  transport: Transport,
  params: ${requestTypeName},
  options?: RequestOptions
): Promise<${responseTypeName}> {
  const { ${destructureParts.join(', ')} } = params;
  return transport.request<${responseTypeName}>({
    ...resolveUrl(URLS, params),
${requestObjectLines.join('\n')}
  }, options);
}
${trailer}`;

  files.push({ relPath, functionName, code });
  manifestEntries.push({
    path: clientPath,
    relPath,
    functionName,
    docUrl: endpoint.docUrl,
  });
  generated++;
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

for (const file of files) {
  const outPath = join(OUT_DIR, `${file.relPath}.ts`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, file.code);
}

const manifestImportLines: string[] = [];
const manifestEntryLines: string[] = [];
const entryByName = new Map<
  string,
  { relPath: string; functionName: string }
>();
let importCounter = 0;

for (const entry of manifestEntries) {
  const alias = `fn${importCounter++}`;
  const name = entry.path.join('.');
  manifestImportLines.push(
    `import { ${entry.functionName} as ${alias} } from './${entry.relPath}';`
  );
  manifestEntryLines.push(`  "${name}": ${alias},`);
  entryByName.set(name, {
    relPath: entry.relPath,
    functionName: entry.functionName,
  });
}

const manifestSource = `${manifestImportLines.join('\n')}

export type { EndpointFn } from '../core/createTransport';

export const endpoints = {
${manifestEntryLines.join('\n')}
};
`;

writeFileSync(join(OUT_DIR, 'manifest.ts'), manifestSource);

const presetsModule: Record<string, string[]> = await import(
  join(ROOT, 'src/presets.ts')
);

const unresolvedNames: string[] = [];
for (const [presetName, names] of Object.entries(presetsModule)) {
  for (const name of names) {
    if (!entryByName.has(name)) {
      unresolvedNames.push(`${presetName} -> "${name}"`);
    }
  }
}
if (unresolvedNames.length > 0) {
  throw new Error(
    `src/presets.ts references unknown endpoint name(s):\n${unresolvedNames.map(n => `  ${n}`).join('\n')}`
  );
}

const presetImportLines: string[] = [];
const presetAliasByName = new Map<string, string>();
let presetImportCounter = 0;

for (const names of Object.values(presetsModule)) {
  for (const name of names) {
    if (presetAliasByName.has(name)) continue;
    const { relPath, functionName } = entryByName.get(name)!;
    const alias = `pfn${presetImportCounter++}`;
    presetImportLines.push(
      `import { ${functionName} as ${alias} } from './${relPath}';`
    );
    presetAliasByName.set(name, alias);
  }
}

const presetConstLines = Object.entries(presetsModule).map(
  ([presetName, names]) =>
    `export const ${presetName} = {\n${names
      .map(name => `  "${name}": ${presetAliasByName.get(name)},`)
      .join('\n')}\n};\n`
);

const presetsSource = `${presetImportLines.join('\n')}

${presetConstLines.join('\n')}`;

writeFileSync(join(OUT_DIR, 'presets.ts'), presetsSource);

const sortedManifestEntries = [...manifestEntries].sort((a, b) =>
  a.path.join('.').localeCompare(b.path.join('.'))
);

const apiMdLines = [
  'All methods on client:',
  '',
  ...sortedManifestEntries.map(
    entry => `- [client.${entry.path.join('.')}](${entry.docUrl})`
  ),
  '',
];
writeFileSync(join(DOCS_DIR, 'API.md'), apiMdLines.join('\n'));

const functionsMdLines = [
  'All importable functions',
  '',
  ...sortedManifestEntries.map(
    entry =>
      `- [import { ${entry.functionName} } from 'elasticsearch-fetch/functions'](${entry.docUrl})`
  ),
  '',
];
writeFileSync(join(DOCS_DIR, 'functions.md'), functionsMdLines.join('\n'));

console.log(
  `Generated ${generated} endpoint functions across ${files.length} files (skipped ${skipped}).`
);
