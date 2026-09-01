# Agent Guide for elasticsearch-fetch

`elasticsearch-fetch` is a lightweight, dependency-free TypeScript library
providing a fetch-based alternative to the heavy `@elastic/elasticsearch` SDK.
Works on any fetch-capable runtime (Node, Deno, Bun, Workers). Almost all
endpoint code is generated, not hand-written: a small fetch-based transport
core (hand-written, `src/core/`) plus one thin generated wrapper function per
Elasticsearch endpoint that shapes `{method, path, querystring, body}` and
calls the core. Types are borrowed from `@elastic/elasticsearch`'s `estypes`
namespace, not regenerated.

**Git:** DO NOT BRANCH OR COMMIT without user review. **Runtime:** use
`bun`/`bunx`/`bunx --bun`, not `node`/`npm`/`npx`, without user approval. Ask
if tasks are ambiguous; use `./temp` for scratch files.

## Repository File Structure

- `index.ts`: entry point exporting the SDK-compatible `Client` (`.` export).
- `.functions-entry.ts`: **gitignored, generated** by
  `scripts/build-functions-entry.ts`, entry point for `./functions`. Run
  `bun run build:functions:entry` (after `build:generate`) to create it.
- `src/core/`: hand-written transport layer (`createTransport.ts`, `url.ts`,
  `errors.ts`, `buildAuthHeader.ts`) that every generated function imports.
- `src/client.ts`: hand-written `Client` class, built at construction time
  from `src/generated/manifest.ts`'s `endpoints` list.
- `src/generated/`: **gitignored build artifact** of `scripts/generate.ts`,
  sourced from `data/schema.json` — one file per endpoint plus `manifest.ts`.
  Run `bun run build:generate` before typechecking/testing/building.
- `/data`: uncommitted, gitignored — `schema.json` is Elasticsearch's API
  schema (source URL undocumented, ask before refetching); `client.ts` is
  `@elastic/elasticsearch`'s transport source, prior-art reference only.
- `dist/`: gitignored build output, published to npm.

`dts-bundle-generator` needs a legacy TypeScript API TS7 no longer exposes, so
an aliased TypeScript 5 (`typescript-5`) is kept for it, symlinked by
`build:dts:link` (auto-run via `build:dts`). Don't remove it or use it
elsewhere — `tsc`/`typecheck`/editor use root TypeScript 7.

## Code Generation Pipeline

`bun run build` runs: `build:clean` → `build:generate` →
`build:functions:entry` → `build:dts` → `build:esm` →
`build:gzip-size`.

### `scripts/generate.ts`

Reads `data/schema.json` and `estypes` type names from
`node_modules/@elastic/elasticsearch/lib/api/types.d.ts` (never imported at
runtime). Wipes and rewrites `src/generated/` entirely every run. For each
`endpoint` (skipping `codegenExclude` and non-public
`availability.stack.visibility` entries):

- Resolves the request type from `schema.types` via
  `request.namespace`/`request.name` for `path[]`/`query[]`/`body` shape.
  Output path from dotted name: `cat.health` → `src/generated/cat/health.ts`.
- Looks up `<PascalDotted>Request`/`<PascalDotted>Response` in `estypes`.
  `knownInterfaces` matches both `export interface X` and `export type X =`
  (some Response types, e.g. `DeleteResponse`, are aliases not interfaces) —
  missing either form silently falls back to `unknown`.
- **Path param name resolution:** the schema's wire name (e.g. `policy`)
  doesn't always match the real `estypes` property name (e.g. `name`);
  `codegenName` is the fallback lookup key. If neither matches, the endpoint
  downgrades to `Record<string, any>` (`typed = false`) rather than emit code
  that won't compile — don't hardcode a name to fix that; check `codegenName`
  in `schema.json` and `getInterfaceProperties()` first.
- **Path/query name collisions** (e.g. `indices.analyze`'s `index` in both
  `path[]` and `query[]`): a destructure binds each name once, so the
  query-side destructure excludes names already claimed by a path param
  (`pathNameSet`), while `querystring: {...}` still references the full list.
  `TS2451 Cannot redeclare block-scoped variable` from generated code means
  this — fix in `generate.ts`'s param-name-set logic, not the output.
- Builds a JSDoc block from `endpoint.description`/`@since`/`@see` when
  present, renames reserved-word collisions (`delete` →
  `async function delete_() {}` + `export { delete_ as delete };`), and emits
  each function via a tuple-shaped `UrlTemplate` (`[methods[], path]`, see
  `src/core/url.ts`) with destructure-based param extraction to stay small.
- Appends one entry per function to `manifestEntries`, then emits
  `src/generated/manifest.ts` (`endpoints: ManifestEntry[]`, where
  `ManifestEntry = [string, fn]`). `src/client.ts` iterates `endpoints`,
  splitting each dotted name on `.` to build the nested method tree — if the
  manifest's shape changes, update that constructor loop too.

### `scripts/build-functions-entry.ts`

Runs after `generate.ts`. Walks `src/generated/` recursively (skipping
`manifest.ts`) and writes the gitignored `.functions-entry.ts`: one
`export { fn } from './src/generated/...'` line per function, plus
`createTransport`/`ConfigurationError`/`ResponseError`/type re-exports from
`src/core/`. Namespaced functions (`cat/health.ts`) get a flat PascalCase
alias from their folder path (`CatHealth`), via the same underscore-aware
algorithm as `generate.ts` (`async_search` → `AsyncSearch`); top-level
functions self-alias, no `as`. This is the `./functions` entry point for
`dts-bundle-generator`/`esbuild` — regenerate whenever `src/generated/`'s
file layout changes.

## Two-tier export strategy

`.` (default) is the SDK-compatible `Client`, from `index.ts` →
`src/client.ts` — larger bundle (all ~567 functions via the manifest) but
call-compatible with `@elastic/elasticsearch`. `./functions` is
tree-shakeable, from `.functions-entry.ts` — consumers import only what they
call and pass an explicit transport (`bulk(transport, params)`). Both get
separate `dts-bundle-generator`/ESM(minified)/CJS builds; `build:gzip-size`
checks `./functions` stays meaningfully smaller than `.`.

## Commands and Tools

`bun run build` runs the full pipeline; `build:generate` /
`build:functions:entry` / `build:clean` / `build:dts` run one step standalone
(see ordering above for prerequisites). `bun run lint` / `format` run `biome`
(no type checking — also run `bun run typecheck`, requires `src/generated/`).
`bun test` / `bun test --watch` / `bun run coverage` run tests. Fastest
verification loop when editing the generator: `bun run build:generate &&
bun run build:functions:entry && bun run typecheck` — skips the slow
(several-minute) `dts-bundle-generator`/esbuild steps over all ~567 functions.

## Coding Style Rules

Single statement per line; explicit braces for `if`/`for`/`while` on new
lines; no `return` on the same line as logic; avoid nested ternaries.
Functions needing 3+ inputs take 1 argument object with named properties.
Export standalone pure functions instead of modifying prototypes; never
mutate input parameters — always return derived values. Avoid `any`/`as any`
(generated code's deliberate `Record<string, any>`/`unknown` fallback is not
a violation). CLI tools use `import { parseArgs } from "node:util"`. Concise
comments, JSDoc for public APIs; markdown uses structured headings, no bold
titles.
