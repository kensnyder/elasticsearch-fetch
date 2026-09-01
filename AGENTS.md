# Agent Guide for elasticsearch-fetch

`elasticsearch-fetch` is a lightweight, dependency-free TypeScript library
providing a fetch-based alternative to the heavy Elasticsearch SDK (on npm as
`@elastic/elasticsearch`). It works on any runtime that supports fetch including
Node, Deno, Bun and Worker runtimes.

Almost all of the endpoint code in this project is generated, not hand-written.
`@elastic/elasticsearch` ships ~600 generated methods, each of which does its
own runtime parameter validation before calling a generic
`transport.request()`. This project keeps only what's load-bearing: a small
fetch-based transport core (hand-written, `src/core/`) and one thin generated
wrapper function per Elasticsearch endpoint that just shapes
`{method, path, querystring, body}` and calls the core. Types are borrowed from
`@elastic/elasticsearch`'s own published `estypes` namespace instead of
generating a parallel type system.

## General

- **Git:** DO NOT BRANCH OR COMMIT without user review.
- **Support:** Consult docs/web for weak knowledge; ask if tasks are ambiguous
  or you're stuck (large files/output).
- **Environment:** Use `./temp` for temporary files.
- **Runtime:** Use `bun`, `bunx` and `bunx --bun`. DO NOT use `node`, `npm` or
  `npx` without user approval.

### Repository File Structure

- `index.ts`: Main entry point exporting the SDK-compatible `Client` (the `.`
  package export). Built by `esbuild`/`dts-bundle-generator` into
  `dist/index.*`.
- `.functions-entry.ts`: **Gitignored, generated at build time** by
  `scripts/build-functions-entry.ts`. It re-exports `createTransport` plus every
  individual generated endpoint function, and is the entry point for the
  tree-shakeable `./functions` package export. It does not exist in a fresh
  clone — it must be regenerated (`bun run build:functions:entry`) before
  `build:dts:functions`/`build:esm:functions`/`build:cjs:functions` can run.
  This same file is why `bun run build` runs `build:generate` and
  `build:functions:entry` before any dts/esm/cjs step.
- `/src`: Hand-written source, plus generated code:
    - `src/core/`: hand-written transport layer (`createTransport.ts`, `url.ts`,
      `errors.ts`, `buildAuthHeader.ts`). Every generated function imports from here.
    - `src/client.ts`: hand-written SDK-compatible `Client` class. Builds its
      method tree at construction time from `src/generated/manifest.ts`'s
      `endpoints` list — it does not import individual endpoint files directly.
    - `src/generated/`: **Gitignored, entirely a build artifact.** Produced by
      `scripts/generate.ts` from `data/schema.json`. One file per endpoint
      (`src/generated/bulk.ts`, `src/generated/cat/health.ts`, etc.), plus
      `src/generated/manifest.ts`. Does not exist in a fresh clone — run
      `bun run build:generate` (or `bun run scripts/generate.ts`) before
      typechecking, testing, or building.
- `/scripts`: build-time codegen scripts. See "Code Generation Pipeline" below.
- `/data`: Uncommitted reference files, gitignored.
    - `data/schema.json`: Elasticsearch's own machine-readable API schema (per
      the README, Elasticsearch publishes this on GitHub alongside the official
      JS/other-language SDKs, which are themselves generated from it). **Its
      exact source URL/version and download process are not currently documented
      anywhere in this repo** — if you need to (re)fetch it, ask the user rather
      than guessing a URL, and once you learn the source, document it here.
    - `data/client.ts`: a reference copy of `@elastic/elasticsearch`'s own
      transport source, kept only as prior-art reference material; not read by
      any script.
- `package.json`: Scripts, devDependencies (bun:test, esbuild, TypeScript,
  dts-bundle-generator), and metadata. Declares `@elastic/elasticsearch` as an
  optional peer dependency purely so `import type { estypes }` resolves — it is
  never a runtime dependency.
- `bun.lock`, `tsconfig.json`, `tsconfig.bundle-generator.json` &
  `tsconfig.bundle-generator.functions.json`: Environment and compiler
  configuration. The two `tsconfig.bundle-generator*.json` files are used only
  to emit `dist/index.d.ts` and `dist/functions.d.ts` respectively.
- `dist/`: **Gitignored build output** (both packages, `.mjs`/`.cjs`/`.d.ts`).
  Not committed; published to npm via the `files` field in `package.json`.

Declarations are bundled by `dts-bundle-generator`. That tool is built on the
legacy JavaScript compiler API, which TypeScript 7 no longer ships — its
`typescript` export is only a version string, so `ts.sys` is `undefined` and the
tool crashes on load. The project therefore keeps a second, aliased TypeScript 5
(`typescript-5`) purely for `dts-bundle-generator`. Bun does not support nested
`overrides`, so `build:dts:link` symlinks that alias into
`node_modules/dts-bundle-generator/node_modules/typescript`, which is where the
tool's `require('typescript')` looks first. `build:dts` runs that link step
every time, so a fresh clone or a `bun install` that prunes the link repairs
itself. Do not remove `typescript-5` or the link step, and do not use it for
anything else: `tsc`, `bun run typecheck`, and the editor all use the root
TypeScript 7.

## Code Generation Pipeline

`bun run build` runs, in order: `build:clean` → `build:generate` →
`build:functions:entry` → `build:dts` → `build:esm` → `build:cjs` →
`build:gzip-size`. The first two steps regenerate everything under
`src/generated/` and `.functions-entry.ts` from scratch before any bundling
happens, since both are gitignored and never assumed to already exist.

### `scripts/generate.ts`

Reads `data/schema.json` (Elasticsearch's endpoint schema) and
`node_modules/@elastic/elasticsearch/lib/api/types.d.ts` (the `estypes`
declaration file, used only as a source of type names — never imported at
runtime). Wipes and rewrites `src/generated/` entirely on every run.

For each `endpoint` in the schema (skipping `codegenExclude` and non-public
`availability.stack.visibility` entries):

- Resolves the endpoint's request type from `schema.types` by matching
  `request.namespace`/`request.name`, giving its `path[]`, `query[]`, and
  `body` shape (`no_body` | `value` | `properties`).
- Derives the output path from the dotted endpoint name: `cat.health` →
  `src/generated/cat/health.ts`, `bulk` → `src/generated/bulk.ts` (no subfolder
  for top-level endpoints).
- Looks up `<PascalDotted>Request`/`<PascalDotted>Response` in `estypes` to
  decide whether the generated function can be fully typed. `knownInterfaces`
  matches both `export interface X` and `export type X = ...` (some Response
  types, e.g. `DeleteResponse`, are declared as aliases, not interfaces — miss
  either form and the generated function silently falls back to `unknown`).
- **Path param name resolution:** the schema's wire name (e.g. `policy`) does
  not always match the actual `estypes` request property name (e.g. `name`).
  `codegenName` is the fallback lookup key. If neither the wire name nor
  `codegenName` exists on the real interface, the whole endpoint is downgraded
  to `Record<string, any>` for its params type (`typed = false`) rather than
  emitting code that won't compile — do not "fix" a typecheck error here by
  hardcoding a name; check `codegenName` in `data/schema.json` and
  `getInterfaceProperties()`'s output for that interface first.
- **Path/query name collisions:** a handful of endpoints list the same field in
  both `path[]` and `query[]` (e.g. `indices.analyze`'s `index`,
  `_global.put_script`'s `context`, `scroll`'s `scroll_id`). The destructure
  (`const { index, ... } = params`) can only bind each name once, so the
  query-side destructure list excludes anything already claimed by a path param
  (`pathNameSet`), while the `querystring: {...}` object literal still
  references the full name list — the variable is already in scope from the path
  destructure. If you see `TS2451 Cannot redeclare block-scoped variable`
  from generated code, this is almost certainly the cause; the fix belongs in
  `generate.ts`'s param-name-set logic, not in the generated output.
- Builds a JSDoc block (`buildJsDoc`) from `endpoint.description`,
  `@since <availability.stack.since>`, and `@see <docUrl>`, all sourced directly
  from `schema.json`. Emitted above the function declaration only when at least
  one of those fields is present.
- Renames the exported symbol when it collides with a JS reserved word (only
  known case: `delete` → `async function delete_() {}` +
  `export { delete_ as delete };`).
- Emits each function using a tuple-shaped `UrlTemplate` (`[methods[], path]`,
  see `src/core/url.ts`), a single `resolveUrl(URLS, params)` call, and
  destructure-based param extraction — this is what keeps generated files small
  (see `bulk.smaller.ts`-style output: no per-field access, no intermediate
  variables).
- Appends one entry to `manifestEntries` per generated function and, after all
  files are written, emits `src/generated/manifest.ts`:
  ```ts
  export type ManifestEntry = [
    string,
    (transport: Transport, params: any, options?: RequestOptions) => Promise<any>
  ];
  export const endpoints: ManifestEntry[] = [
    ["watcher.ack_watch", fn552],
    ...
  ];
  ```
  `src/client.ts` consumes this directly: it iterates `endpoints`, splits each
  dotted name on `.`, and builds the nested method tree
  (`client.indices.create(...)`) at construction time. If you change the
  manifest's shape, `src/client.ts`'s constructor loop must change with it.

### `scripts/build-functions-entry.ts`

Runs after `generate.ts`. Walks `src/generated/` recursively (skipping
`manifest.ts`) and writes the gitignored `.functions-entry.ts` at the repo root:
one `export { fn } from './src/generated/...'` line per generated function, plus
`createTransport`/`ConfigurationError`/`ResponseError`/type re-exports from
`src/core/`.

Because top-level functions (`bulk`) and namespaced functions (`cat/health`)
must all live as distinct top-level exports from one entry file, namespaced
functions are aliased to a flat PascalCase name derived from their folder path
(`cat/health.ts` → `CatHealth`), using the same underscore-aware PascalCase
algorithm as `generate.ts` (`async_search` → `AsyncSearch`, not
`Async_search`). Top-level functions are self-aliased and printed without
`as`. This file is what `dts-bundle-generator`/`esbuild` treat as the entry
point for the `./functions` package export — it must be regenerated any time
`src/generated/`'s file layout changes.

## Two-tier export strategy

- **`.` (default export) — SDK-compatible `Client`.** Built from `index.ts` →
  `src/client.ts`. Larger bundle (imports all ~567 generated functions via the
  manifest) but call-compatible with `@elastic/elasticsearch`
  (`client.search(...)`, `client.indices.create(...)`).
- **`./functions` — tree-shakeable standalone functions.** Built from
  `.functions-entry.ts`. A consumer imports only the functions they call
  (`import { createTransport, bulk, count } from 'elasticsearch-fetch/functions'`)
  and calls them with an explicit transport (`bulk(transport, params)`), so a
  bundler only pulls in the functions actually referenced.

Both get their own `dts-bundle-generator` run (`build:dts:index` /
`build:dts:functions`, using the two separate `tsconfig.bundle-generator*.json`
files), esbuild ESM build (both `--minify`d), and esbuild CJS build
(unminified). `build:gzip-size` reports final gzipped sizes for both
`dist/index.mjs` and `dist/functions.mjs` as a sanity check that the
tree-shakeable build stays meaningfully smaller.

## Commands and Tools

- `bun run build`: Full pipeline described above — regenerates
  `src/generated/` and `.functions-entry.ts`, then emits ESM, CJS, and DTS files
  for both package exports. Bundling is done by `esbuild`;
  `bun build --bundle` is not used because Bun 1.3.14 emits dangling identifiers
  for re-export barrels like `index.ts`.
- `bun run build:generate`: Runs only `scripts/generate.ts`. Needed before
  `bun run typecheck`/`bun test` will pass on a fresh clone, since
  `src/generated/` is gitignored and required by `src/client.ts` and any test
  that imports generated code.
- `bun run build:functions:entry`: Runs only `scripts/build-functions-entry.ts`.
  Requires `src/generated/` to already exist (run `build:generate` first).
- `bun run lint`: Checks formatting, imports and lint rules using `biome`.
- `bun run typecheck`: Type-checks the project via `tsc --noEmit`. Biome does
  not check types, so run this alongside `bun run lint` before calling work
  done. Requires `src/generated/` to exist first.
- `bun run format`: Formats all files in the project using `biome`.
- `bun test`: Executes the complete test suite using `bun:test`.
- `bun test --watch`: Runs tests in watch mode for active development.
- `bun run coverage`: Generates reports via `bun test --coverage`.
- `bun run build:clean`: Removes the `dist/` directory to ensure a fresh build.
- `bun run build:dts`: Emits `dist/index.d.ts` and `dist/functions.d.ts` via
  `dts-bundle-generator`. Requires `.functions-entry.ts` to exist first.
- `bun run build:dts:link`: Points `dts-bundle-generator` at the aliased
  TypeScript 5. Run automatically by `build:dts`.

When making changes to the generator, the fastest verification loop is:
`bun run build:generate && bun run build:functions:entry && bun run typecheck`
— this catches nearly all mistakes (bad param names, type mismatches, name
collisions) without waiting for the slower `dts-bundle-generator`/esbuild steps.
`dts-bundle-generator` over the full `./functions` entry is the slowest single
step (several minutes) because it processes all ~567 functions — budget for that
before running a full `bun run build`.

## Coding Style Rules

- **Formatting:** Single statement per line. Explicit braces for `if`/`for`/
  `while` on new lines. No `return` on the same line as logic.
- **Logic:** Avoid nested ternaries. Max 80 chars for ternary lines; otherwise
  use `if` blocks.
- **Arguments:** Functions that need 3+ input values should accept 1 argument
  object with named properties.
- **Functional Approach**: Export standalone pure functions instead of modifying
  prototypes.
- **Immutability**: Never modify input parameters; always return derived values.
- **TypeScript:** Avoid `any`/`as any`; use `unknown` or proper interfaces.
  (Generated code intentionally falls back to `Record<string, any>`/`unknown`
  when an endpoint can't be fully typed against `estypes` — this is a deliberate
  degrade-gracefully rule in `generate.ts`, not a violation of this guideline.)
- **CLI:** If building CLI tools, use `import { parseArgs } from "node:util"`.
- **Inline Documentation:** Write clear, concise comments. Use JSDoc for public
  APIs.
- **Markdown:** Organize with structured headings. Avoid using bold text for
  section titles or list titles.
