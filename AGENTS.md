# Agent Guide for elasticsearch-fetch

`elasticsearch-fetch` is a lightweight, dependency-free TypeScript library 
providing a fetch-based alternative to the heavy Elasticsearch SDK
(on npm as `@elastic/elasticsearch`). It works on any runtime that supports fetch
including Node, Deno, Bun and Worker runtimes.

## General

- **Git:** DO NOT BRANCH OR COMMIT without user review.
- **Support:** Consult docs/web for weak knowledge; ask if tasks are ambiguous or you're stuck (large files/output).
- **Environment:** Use `./temp` for temporary files.
- **Runtime:** Use `bun`, `bunx` and `bunx --bun`. DO NOT use `node`, `npm` or `npx` without user approval.

### Repository File Structure
- `index.ts`: Main entry point exporting code.
- `/src`: Source files
- `/data`: Uncommitted reference files
- `package.json`: Scripts, devDependencies (bun:test, esbuild, TypeScript), and metadata.
- `bun.lock`, `tsconfig.json` & `tsconfig.bundle-generator.json`: Environment
  and compiler configuration. `tsconfig.bundle-generator.json` is used only to
  emit `dist/index.d.ts`.

Declarations are bundled into a single `dist/index.d.ts` by
`dts-bundle-generator`. That tool is built on the legacy JavaScript compiler
API, which TypeScript 7 no longer ships — its `typescript` export is only a
version string, so `ts.sys` is `undefined` and the tool crashes on load. The
project therefore keeps a second, aliased TypeScript 5 (`typescript-5`) purely
for `dts-bundle-generator`. Bun does not support nested `overrides`, so
`build:dts:link` symlinks that alias into
`node_modules/dts-bundle-generator/node_modules/typescript`, which is where the
tool's `require('typescript')` looks first. `build:dts` runs that link step
every time, so a fresh clone or a `bun install` that prunes the link repairs
itself. Do not remove `typescript-5` or the link step, and do not use it for
anything else: `tsc`, `bun run typecheck`, and the editor all use the root
TypeScript 7.

### Commands and Tools
- `bun run build`: Generates ESM, CJS, and DTS files. Bundling is done by
  `esbuild`; `bun build --bundle` is not used because Bun 1.3.14 emits dangling
  identifiers for re-export barrels like `index.ts`.
- `bun run lint`: Checks formatting, imports and lint rules using `biome`.
- `bun run typecheck`: Type-checks the project via `tsc --noEmit`. Biome does
  not check types, so run this alongside `bun run lint` before calling work
  done.
- `bun run format`: Formats all files in the project using `biome`.
- `bun test`: Executes the complete test suite using `bun:test`.
- `bun test --watch`: Runs tests in watch mode for active development.
- `bun run coverage`: Generates reports via `bun test --coverage`.
- `bun run build:clean`: Removes the `dist/` directory to ensure a fresh build.
- `bun run build:dts`: Emits a single bundled `dist/index.d.ts` via
  `dts-bundle-generator`, using `tsconfig.bundle-generator.json`.
- `bun run build:dts:link`: Points `dts-bundle-generator` at the aliased
  TypeScript 5. Run automatically by `build:dts`.

### Coding Style Rules

- **Formatting:** Single statement per line. Explicit braces for `if`/`for`/`while` on new lines. No `return` on the same line as logic.
- **Logic:** Avoid nested ternaries. Max 80 chars for ternary lines; otherwise use `if` blocks.
- **Arguments:** Functions that need 3+ input values should accept 1 argument object with named properties.
- **Functional Approach**: Export standalone pure functions instead of modifying prototypes.
- **Immutability**: Never modify input parameters; always return derived values.
- **TypeScript:** Avoid `any`/`as any`; use `unknown` or proper interfaces.
- **CLI:** If building CLI tools, use `import { parseArgs } from "node:util"`.
- **Inline Documentation:** Write clear, concise comments. Use JSDoc for public APIs.
- **Markdown:** Organize with structured headings. Avoid using bold text for section titles or list titles.
