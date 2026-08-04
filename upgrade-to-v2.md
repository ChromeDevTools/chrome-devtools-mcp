---
title: Upgrading from v1.x to v2
name: migrate-v1-to-v2
description: Migrate MCP TypeScript SDK code from v1 (@modelcontextprotocol/sdk) to v2 (@modelcontextprotocol/core, /client, /server). Use when a user asks to migrate, upgrade, or port their MCP TypeScript code from v1 to v2.
---

# Upgrading from v1.x to v2

This guide covers upgrading from `@modelcontextprotocol/sdk` (v1.x) to the v2 packages.
It is written for shell-capable agents and humans alike: run the codemod first, then
work through the manual sections for what the codemod can't rewrite.

If you are already on v2 and want to adopt the **2026-07-28 protocol revision**, see
[support-2026-07-28.md](./support-2026-07-28.md) instead.

## TL;DR — quick path

1. **Prerequisites.** Node.js 20+. v2 is ESM-first but ships a CommonJS build too, so
   both `import` and `require('@modelcontextprotocol/…')` resolve natively.
2. **Run the codemod.**
   ```bash
   npx @modelcontextprotocol/codemod@beta v1-to-v2 .
   ```
   Run it at the **package root** (`.`), not `./src` — it also rewrites `package.json`,
   and real projects import the SDK from `test/`, `scripts/`, and fixtures too.
3. **Grep for markers.** Anything the codemod recognized but could not safely rewrite is
   marked in place:
   ```bash
   grep -rn '@mcp-codemod-error' .
   ```
4. **Type-check.** `tsc --noEmit` (or your build). Remaining errors map to the
   [manual sections](#manual-changes-what-the-codemod-does-not-handle) below.
5. **Format.** The codemod rewrites the AST without reformatting — run your formatter on
   the changed files (`prettier --write` / `eslint --fix` / `biome format --write`); the
   codemod prints the exact command after it runs.
6. **Run your tests.**

Migrating a large codebase gradually instead of in one pass? See
[Migrating in stages (large codebases)](#migrating-in-stages-large-codebases).

## Contents

- [What the codemod handles](#what-the-codemod-handles)
- [What the codemod does NOT handle](#what-the-codemod-does-not-handle)
- [Manual changes](#manual-changes-what-the-codemod-does-not-handle)
  - [Packaging & runtime](#packaging--runtime)
  - [Imports & transports](#imports--transports)
  - [Low-level protocol & handler context (`ctx`)](#low-level-protocol--handler-context-ctx)
  - [Server registration API](#server-registration-api)
  - [HTTP & headers](#http--headers)
  - [Errors](#errors)
  - [Auth](#auth)
  - [Types & schemas](#types--schemas)
  - [Behavioral changes](#behavioral-changes)
- [Enhancements](#enhancements)
- [Unchanged APIs](#unchanged-apis)
- [Need help?](#need-help)

---

## What the codemod handles

The codemod ([`@modelcontextprotocol/codemod`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/README.md))
mechanically applies every rename whose mapping is fixed. The mappings are the
**source of truth** — they live in the codemod package and are not reproduced here:

| Mapping                                                                                   | Source file                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk/...` import paths → v2 packages                                | [`mappings/importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts)                   |
| Symbol renames (`McpError` → `ProtocolError`, `JSONRPCError` → `JSONRPCErrorResponse`, …) | [`mappings/symbolMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/symbolMap.ts)                   |
| `setRequestHandler(Schema, …)` → `setRequestHandler('method/string', …)`                  | [`mappings/schemaToMethodMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/schemaToMethodMap.ts)   |
| `extra.*` → `ctx.mcpReq.*` / `ctx.http?.*` property remap                                 | [`mappings/contextPropertyMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/contextPropertyMap.ts) |

In addition the codemod:

- Updates `package.json` dependencies (`@modelcontextprotocol/sdk` → the v2 packages
  your imports actually use).
- Rewrites `.tool()` / `.prompt()` / `.resource()` to `registerTool` / `registerPrompt`
  / `registerResource` and wraps `inputSchema` / `outputSchema` / `argsSchema` /
  `uriSchema` raw Zod shapes with `z.object()`, adding `import { z } from 'zod'`
  when the file has no `z` binding.
- Drops the result-schema argument from `client.request()` / `client.callTool()` for
  spec methods.
- Routes the spec Zod `*Schema` constants imported from `sdk/types.js` to
  `@modelcontextprotocol/core` (mixed imports are split; `.parse()` / `.safeParse()`
  calls are left untouched). Task-handler schema constants
  (`GetTaskRequestSchema` etc.) used as `setRequestHandler` args are **not** rewritten
  — the experimental tasks feature was removed (SEP-2663), so each such registration
  is marked with an action-required diagnostic instead (see
  [Experimental tasks interception removed](#experimental-tasks-interception-removed)).
- Renames `ErrorCode` → `ProtocolErrorCode` and routes the local-only members
  (`RequestTimeout`, `ConnectionClosed`) to `SdkErrorCode` — rewriting an all-SDK
  condition's `instanceof ProtocolError` guard to `SdkError`, and marking guards
  that mix the two enums.
- Renames every `StreamableHTTPError` reference to `SdkHttpError` and adds the import
  (constructor calls are marked for review — argument shape changed).
- Replaces `IsomorphicHeaders` with the Web Standard `Headers` type and drops the
  import (a warning notes `Headers` uses `.get()`/`.set()`, not bracket access).
- Rewrites `SchemaInput<T>` → `StandardSchemaWithJSON.InferInput<T>`.
- Renames `RequestHandlerExtra` → `ServerContext` / `ClientContext` and the `extra`
  parameter to `ctx`.
- Rewrites `vi.mock` / `jest.mock` and dynamic `import()` paths.
- Renames the `ResourceTemplate` **type** imported from `@modelcontextprotocol/sdk/types.js`
  to `ResourceTemplateType` (the spec wire type). The `ResourceTemplate` URI-template
  helper **class** from `server/mcp.js` keeps its name and is not renamed.
- Drops `@modelcontextprotocol/sdk/server/zod-compat.js` imports.
- Inverts optional completable nesting — `completable(schema.optional(), cb)` becomes
  `completable(schema, cb).optional()` (see
  [Standard Schema objects](#standard-schema-objects-raw-shapes-deprecated)); shapes it
  cannot invert get an `@mcp-codemod-error` marker.
- Rewrites `Protocol` / `mergeCapabilities` imports from `shared/protocol.js` to the
  client or server package root, like the module's other symbols.

## What the codemod does NOT handle

Each of these maps to a manual section below. The codemod marks every site it
recognized but could not safely rewrite with an `@mcp-codemod-error` comment.

- **Node 20 / ESM** — pre-flight, not a code rewrite. → [Packaging & runtime](#packaging--runtime)
- **Header-read `.get()` rewrite** — `IsomorphicHeaders` is renamed to `Headers`
  and `extra.requestInfo?.headers[…]` is remapped to `ctx.http?.req?.headers[…]`, but
  converting that bracket access to `.get()` is manual. (Headers you _pass in_ via
  `requestInit.headers` need no rewrite — plain objects remain valid.)
  → [HTTP & headers](#http--headers)
- **`ctx.mcpReq.send()` schema-arg drop** — the codemod drops the schema arg from
  `client.request()` / `client.callTool()` but leaves nested `ctx.mcpReq.send()` calls
  alone. → [Low-level protocol](#low-level-protocol--handler-context-ctx)
- **OAuth error-class consolidation** — `instanceof InvalidGrantError` → `OAuthError` +
  `OAuthErrorCode` is a judgment rewrite. → [Auth](#auth)
- **`SdkErrorCode` branch selection** — the codemod renames `StreamableHTTPError` →
  `SdkHttpError`; deciding which `SdkErrorCode` branch a given catch should match is
  judgment. → [Errors](#errors)
- **Namespace schema access** — `import * as t from '…/types.js'` +
  `t.CallToolResultSchema.parse(…)` can't be split per-symbol; the codemod flags it
  action-required — re-import the schema from `@modelcontextprotocol/core` by hand.
  → [Types & schemas](#types--schemas)
- **Import-less (injected) SDK surfaces** — the codemod is import-driven: a file that
  receives the SDK surface as a parameter (dependency injection, factory seams) and has
  no SDK import is never rewritten, and the v1 idioms there fail at **runtime**, not
  compile time — e.g. the v1 schema-first `setRequestHandler(Schema, …)` form throws a
  `TypeError` at registration. Grep such seams for v1 API tokens beyond import
  statements (`setRequestHandler(`, `ErrorCode.`, `extra.`) and apply the
  [handler-registration](#setrequesthandler--setnotificationhandler-use-method-strings)
  and [Errors](#errors) sections by hand.
  → [Low-level protocol](#low-level-protocol--handler-context-ctx)
- **Behavioral adaptation** — list auto-aggregation, capability empties, lazy validator
  compilation, output-schema validation rules. → [Behavioral changes](#behavioral-changes)

---

## Manual changes (what the codemod does not handle)

### Packaging & runtime

The single `@modelcontextprotocol/sdk` package is split:

| v1                              | v2                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk`     | `@modelcontextprotocol/client` (client implementation)                                                                          |
|                                 | `@modelcontextprotocol/server` (server implementation)                                                                          |
|                                 | `@modelcontextprotocol/core` (public Zod `*Schema` constants)                                                                   |
|                                 | `@modelcontextprotocol/core-internal` (internal — never import directly)                                                        |
| Built-in HTTP framework support | `@modelcontextprotocol/node` / `@modelcontextprotocol/express` / `@modelcontextprotocol/hono` / `@modelcontextprotocol/fastify` |

`@modelcontextprotocol/client` and `@modelcontextprotocol/server` both re-export shared
types from `@modelcontextprotocol/core-internal`, so import types and error classes from
whichever package you already depend on. `@modelcontextprotocol/core-internal` is
`private: true` and is not published — **do not import from it directly.**
`@modelcontextprotocol/core` is the public Zod-schema package (raw `*Schema` constants
only); see [Zod `*Schema` constants moved to `@modelcontextprotocol/core`](#zod-schema-constants-moved-to-modelcontextprotocolcore) below.

After the codemod runs, review the manifest summary it prints: the swap rewrites the
**nearest** manifest found walking up from the target directory — one manifest total.
Workspace-member manifests in a monorepo are never modified; instead the codemod lists
each member that still declares the v1 SDK together with the exact dependency changes
it needs (remove the v1 entry, add the v2 packages that member's imports use) — apply
those edits yourself, then install. The v2 additions are computed from the final import
state of each package's sources, so already-migrated sources still receive the v2
packages they need when the v1 dependency is removed. In a hoisted monorepo (members
without their own SDK dependency), member usage counts toward the manifest that
declares the v1 SDK, and the summary notes which members contributed. See
[Monorepo workspace members](#monorepo-workspace-members) for how to decide each
member's packages.

#### Monorepo workspace members

Declare in every member exactly what its own sources import: files importing
`@modelcontextprotocol/server` (or its subpaths) need `@modelcontextprotocol/server`;
client imports need `@modelcontextprotocol/client`; raw `*Schema` constants need
`@modelcontextprotocol/core`; a framework adapter import (`@modelcontextprotocol/express`
etc.) needs the adapter package **plus the framework itself** in that member (the
adapter declares it as a peer dependency). Place a package in `dependencies` when
shipped runtime code imports it and in `devDependencies` when only tests, fixtures, or
local tooling do — when in doubt, use the section where the member previously declared
`@modelcontextprotocol/sdk`.

A member that never declared the v1 SDK and resolved it through the root can keep
root-level declarations (the codemod's root rewrite already adds the union of the
contributing members' v2 packages — its hoisting note names them) or move to
per-member declarations; per-member is recommended, since the v2 package split makes each member's
actual needs explicit. To answer "which packages does this member need" directly, run
the codemod against that member's directory with `--dry-run`: the manifest summary is
computed from that member's own imports. (The authoritative import-path routing lives
in the codemod's [mapping file](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts).)

The framework adapter packages declare their framework as a **peer dependency**
(`express`, `hono`, `fastify`); v1 shipped them as direct deps. The codemod adds the
`@modelcontextprotocol/*` packages your imports use, but does not add the framework
peer — install it explicitly (`pnpm add express` etc.). `@modelcontextprotocol/node`
depends on `@hono/node-server` at runtime (Node HTTP ↔ Web Standard conversion) but
does **not** require the `hono` framework — your package manager may emit a harmless
unmet-peer warning for `hono` (upstream `@hono/node-server` declares it).

v2 requires **Node.js 20+**. It is ESM-first but ships a **CommonJS build alongside
ESM**, so CommonJS projects can `require('@modelcontextprotocol/…')` directly — no
dynamic `import()` shim required.

Repo-local tooling that encodes the literal v1 package name — dependency-pin lints,
version allowlists, CI checks, scripts — fails after the manifest swap and is invisible
to the codemod (it rewrites sources and manifests, not bespoke gates). Grep for
`@modelcontextprotocol/sdk` outside `src/` before declaring the migration done. While
grepping, also remove v1-era double casts on SDK types (`as unknown as Transport` and
similar, usually annotated to a v1 issue) — v2's types satisfy those contracts
directly, and a surviving cast keeps suppressing type checking that would otherwise
catch real errors.

Tooling that pins SDK **dist text** (reading a constant out of a built file with
`require.resolve` + a regex) breaks in two stacked ways: the literal usually lives in a
content-hashed sibling chunk (`dist/sse-<hash>.mjs`), not the subpath's entry module,
so fixed-path reads do not survive a rebuild — scan the package's `dist/` directory
for the literal instead; and the emitted quote style differs from v1, so a
quote-anchored pattern misses silently — match either quote. The build layout also
changed: v2 emits `.mjs`/`.cjs` siblings in a flat `dist/`, so v1's `/dist/cjs/` ↔
`/dist/esm/` flavor-pair path swaps have no equivalent.

#### Registry availability during the beta

All v2 packages are published on the public npm registry. Two notes for the beta
window:

- As of `2.0.0-beta.1` all v2 packages share one version number (earlier alphas
  did not). The codemod writes ranges that match what is published, so prefer its
  manifest output over hand-pinning every package.
- Environments that resolve through a corporate or private registry mirror may not
  have synced the newer scoped packages yet (the symptom is "not found" for a package
  that exists on npmjs.org). Point the install at the public registry
  (`npm install --registry=https://registry.npmjs.org/` or the equivalent `.npmrc`
  entry), ask your mirror's operators to sync the `@modelcontextprotocol` scope, or —
  where neither is possible — build a tarball from a checkout of this repository
  (`pnpm install && pnpm build`, then `pnpm pack` in the package directory) and
  reference it with a committed `file:` dependency.

#### CommonJS test runners (Jest)

v2 ships a CommonJS build, so CJS test runners resolve the packages natively through the
`require` export condition — Jest (including `next/jest` setups) no longer needs a
`moduleNameMapper` workaround to import `@modelcontextprotocol/*`. If you carried a
v1-era mapping that pinned these packages to their `dist/*.mjs` files, remove it. Vitest
and native Node ESM are unaffected.

#### Bundlers: nested `zod` copies in zod@3-pinned monorepos

v1's `zod ^3.25 || ^4.0` peer range deduplicated onto a workspace's hoisted zod@3. The
v2 packages depend on `zod ^4.2.0`, so in a workspace that pins zod@3 the dependency
cannot dedupe — each installed v2 package resolves its own nested zod@4 copy. Two
bundler consequences:

- **Path-substring vendor pins capture the nested copies.** Bundler rules that match
  zod by module path — `manualChunks` pins, vendor-chunk matchers, bundle budgets keyed
  on a `zod/` path segment — also match `@modelcontextprotocol/*/node_modules/zod`,
  which can pull the nested copies into an eagerly-loaded vendor chunk and trip a
  budget gate. Exclude the SDK-nested paths from such pins so the copies ride with the
  SDK's own (typically lazy) chunks.
- **Ballpark size cost.** Measured on a large production SPA, adding the v2 client and
  server packages (with their nested zod@4 copies) alongside a hoisted zod@3 cost
  roughly +83 KB gzipped of total JS (about +0.7% whole-app). Upgrading the workspace
  to `zod ^4.2.0` re-dedupes and removes the duplication.

#### Migrating in stages (large codebases)

The v1 package and the v2 packages have **different names**, so both can be installed
in one manifest at the same time — nothing forces a one-shot swap. The safe order for
an incremental migration: (1) add the v2 packages (and the `zod ^4.2.0` bump) while
**keeping** `@modelcontextprotocol/sdk`; (2) rewrite sources incrementally,
directory-by-directory or package-by-package; (3) remove the v1 dependency only when
nothing imports it any more (`grep -rn "@modelcontextprotocol/sdk" --include="*.ts"`,
plus a look at `package.json`). The inverse order strands files: swapping the manifest
first leaves every not-yet-rewritten import failing module resolution (TS2307) until it
is updated.

Two caveats for the transition window. First, a codemod run against a subdirectory
still updates the nearest manifest walking up — including removing the v1 dependency —
so during a staged pass review or revert that edit until the final stage (or preview
with `--dry-run`). Second, v1 and v2 modules each have their own classes and types:
objects must not flow between v1-imported and v2-imported code (`instanceof` and
nominal types do not cross — the same boundary described for dual-role processes in
[Errors](#errors)), so stage along process or transport boundaries where the two sides
share only the wire format; the two sides negotiate
a protocol version through the ordinary 2025-era `initialize` handshake and settle
on the newest revision both packages support (currently 2025-11-25 — published v1
1.29.x and v2 ship the same supported-version list).

Dependencies you do not control (vendored fixtures, third-party packages) that still
declare `@modelcontextprotocol/sdk` resolve their own v1 copy and need no action. For
`peerDependencies` declarations, keep the v1 package installed to satisfy the range —
or point the name at a chosen version via your package manager's
`overrides`/`resolutions` — until those packages migrate. The same boundary rule
applies: objects must not flow between their v1-imported code and your v2-imported
code.

**Dependencies that compile against the host's v1 SDK.** A stricter variant of the
above: a workspace or vendored package that ships TypeScript **source** importing
`@modelcontextprotocol/sdk` — resolved from the host's `node_modules` rather than its
own — pins the host. Keep the v1 package installed as a real dependency (not merely a
surviving transitive) until that package migrates. The host files that construct or
hand objects to such a package are part of its v1 boundary and must stay on v1 imports
— and the codemod cannot see that distinction: it rewrites them like any other file
(e.g. converting a `setRequestHandler(Schema, …)` call into the v2 method-string form
against what is still a v1 `Server`, which then fails at runtime). Run the codemod with
`--ignore` glob patterns covering those interfacing files, and migrate them together
with the dependency later. The boundary rule above applies unchanged: objects from the
dependency's v1 modules must never flow into v2-imported code.

#### Library authors: peer-depending on the SDK

If your package declares `@modelcontextprotocol/sdk` as a `peerDependency`, the v2
packages are differently **named**, so swapping the peer declaration is itself a
breaking change for every consumer — ship it as a semver-major. You can migrate
ahead of your consumers only if no SDK object crosses your public API (the
v1/v2 boundary rule above applies to your exports too: a v1-constructed `Client`
or error instance handed to v2-importing consumer code fails `instanceof` and
nominal checks). Until your consumers migrate, they can keep resolving your peer
range with the v1 package installed alongside their own v2 packages — the two
coexist under different names.

### Imports & transports

The codemod rewrites every `@modelcontextprotocol/sdk/...` import path via
[`importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts).
A few transports need a decision the codemod can't make:

- **`StreamableHTTPServerTransport` → which runtime?** The codemod renames it to
  `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node`. If you deploy
  to a web-standard runtime (Cloudflare Workers, Deno, Bun), use
  `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/server`
  instead. **Decision rule:** if your handler receives a Node `IncomingMessage` /
  `ServerResponse`, use `@modelcontextprotocol/node`; if it receives a web-standard
  `Request` and returns a `Response`, use `@modelcontextprotocol/server`.
- **stdio transports moved to a `./stdio` subpath.** Import `StdioClientTransport`,
  `getDefaultEnvironment`, `DEFAULT_INHERITED_ENV_VARS`, and `StdioServerParameters`
  from `@modelcontextprotocol/client/stdio`; import `StdioServerTransport` from
  `@modelcontextprotocol/server/stdio`. The package root barrels do **not** export
  these (the root entries are runtime-neutral so browser/Workers bundlers can consume
  them). The stdio utilities `ReadBuffer`, `serializeMessage`, `deserializeMessage`
  stay in the root barrel.
- **Zod `*Schema` constants → `@modelcontextprotocol/core`.** A mixed
  `import { CallToolResult, CallToolResultSchema } from '…/types.js'` is split by the
  codemod — see [Types & schemas](#types--schemas).

  ```typescript
  // v1
  import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
  // v2
  import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
  ```

- **`SSEServerTransport`** is removed. Migrate to Streamable HTTP. A frozen v1 copy is
  available from `@modelcontextprotocol/server-legacy/sse` as a temporary bridge.
- **`WebSocketClientTransport`** is removed (WebSocket is not a spec transport). Use
  `StreamableHTTPClientTransport` for remote servers or `StdioClientTransport` for
  local servers; the `Transport` interface is exported if you need a custom
  implementation.
- **`InMemoryTransport`** is now exported from `@modelcontextprotocol/client` and
  `@modelcontextprotocol/server` (both re-export it). The two packages bundle separate
  copies with private state, so the halves of a linked pair must come from the **same
  package's** import — pick one package per file (per linked pair) rather than mixing
  the client's `InMemoryTransport` with the server's:

  ```typescript
  // v1
  import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
  // v2
  import {InMemoryTransport} from '@modelcontextprotocol/server'; // or /client
  ```

- **`EventStore`, `StreamId`, `EventId`** are exported from `@modelcontextprotocol/server`
  only (v1 re-exported them alongside the transport from `sdk/server/streamableHttp.js`;
  `@modelcontextprotocol/node` does not).
- **Client fetch middleware moved to the root barrel.** `createMiddleware`,
  `applyMiddlewares`, `withLogging`, `withOAuth`, and the `Middleware` type (v1:
  `sdk/client/middleware.js`) are now exported from `@modelcontextprotocol/client`
  directly, as is `FetchLike` (v1: `sdk/shared/transport.js`). The call signatures are
  unchanged from v1 (`Middleware` is still `(next: FetchLike) => FetchLike`) — only the
  import path changes.
- **Server auth split.** Resource Server helpers (`requireBearerAuth`,
  `mcpAuthMetadataRouter`, `getOAuthProtectedResourceMetadataUrl`, `OAuthTokenVerifier`)
  → `@modelcontextprotocol/express`; the runtime-neutral core (`requireBearerAuth`
  for web-standard `fetch` hosts, `verifyBearerToken`, `bearerAuthChallengeResponse`,
  `OAuthTokenVerifier`, and the discovery serving `oauthMetadataResponse` /
  `buildOAuthProtectedResourceMetadata` / `getOAuthProtectedResourceMetadataUrl`)
  is also exported from `@modelcontextprotocol/server`. Authorization Server helpers (`mcpAuthRouter`,
  `OAuthServerProvider`, `ProxyOAuthServerProvider`, `allowedMethods`,
  `authenticateClient`, `metadataHandler`, `createOAuthMetadata`,
  `authorizationHandler` / `tokenHandler` / `revocationHandler` /
  `clientRegistrationHandler`) → `@modelcontextprotocol/server-legacy/auth`
  (deprecated, frozen v1 copy); migrate AS to a dedicated IdP/OAuth library. `AuthInfo`
  is now re-exported by `@modelcontextprotocol/client` and `@modelcontextprotocol/server`.

  The codemod's [`importMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/importMap.ts)
  routes every `…/server/auth/**` deep path (including
  `…/server/auth/middleware/{bearerAuth,allowedMethods,clientAuth}.js`,
  `…/server/auth/handlers/*.js`, `…/server/auth/providers/proxyProvider.js`) to
  `@modelcontextprotocol/server-legacy/auth`, and `…/server/express.js` /
  `…/server/middleware/hostHeaderValidation.js` to `@modelcontextprotocol/express`. The
  AS→`server-legacy` routing is conservative — re-point RS-only call sites
  (`requireBearerAuth`, `mcpAuthMetadataRouter`) at `@modelcontextprotocol/express` by hand.
  Staying on the frozen `server-legacy/auth` copy is a supported interim choice when you
  deliberately want the v1 middleware behavior. If you re-point at
  `@modelcontextprotocol/express` by hand, also add that package — plus its `express`
  peer dependency — to your manifest: the codemod's manifest summary reflects only the
  imports it wrote, not re-points you make afterwards.

### Low-level protocol & handler context (`ctx`)

The second parameter to every request handler — previously the flat `RequestHandlerExtra`
object named `extra` — is now a structured **context** object named `ctx`. This is the
`ctx` that appears throughout the rest of this guide.

The codemod renames the parameter and remaps property access via
[`contextPropertyMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/contextPropertyMap.ts).
A few mappings need optional-chaining adjustment (the `http` group is `undefined` on
stdio):

| v1 (`extra.*`)                                    | v2 (`ctx.*`)                   | Note                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extra.signal`                                    | `ctx.mcpReq.signal`            |                                                                                                                                                                                                                                                                                                                         |
| `extra.requestId`                                 | `ctx.mcpReq.id`                |                                                                                                                                                                                                                                                                                                                         |
| `extra._meta`                                     | `ctx.mcpReq._meta`             |                                                                                                                                                                                                                                                                                                                         |
| `extra.sendRequest(...)`                          | `ctx.mcpReq.send(...)`         |                                                                                                                                                                                                                                                                                                                         |
| `extra.sendNotification(...)`                     | `ctx.mcpReq.notify(...)`       |                                                                                                                                                                                                                                                                                                                         |
| `extra.sessionId`                                 | `ctx.sessionId`                |                                                                                                                                                                                                                                                                                                                         |
| `extra.authInfo`                                  | `ctx.http?.authInfo`           | optional — `undefined` on stdio                                                                                                                                                                                                                                                                                         |
| `extra.requestInfo`                               | `ctx.http?.req`                | a standard Web `Request`; `ServerContext` only                                                                                                                                                                                                                                                                          |
| `extra.closeSSEStream`                            | `ctx.http?.closeSSE`           | `ServerContext` only; the member itself is also optional — defined only when the transport has an `eventStore` AND the client's negotiated protocol version supports resumable close (2025-11-25+); an `eventStore` transport serving a 2025-06-18 client still leaves it `undefined`. Call as `ctx.http?.closeSSE?.()` |
| `extra.closeStandaloneSSEStream`                  | `ctx.http?.closeStandaloneSSE` | `ServerContext` only; member optional as above — `ctx.http?.closeStandaloneSSE?.()`                                                                                                                                                                                                                                     |
| `extra.taskStore` / `taskId` / `taskRequestedTtl` | _removed_                      | see [Experimental tasks](#experimental-tasks-interception-removed)                                                                                                                                                                                                                                                      |

The transport-level seam behind `ctx.http?.authInfo` is unchanged from v1: a transport
that passes `{ authInfo }` as the second argument to `onmessage(message, extra)` — e.g.
an `InMemoryTransport` test seam — still surfaces it as `ctx.http?.authInfo` on any
transport, and `ctx.http` is defined whenever `authInfo` is supplied, even without an
HTTP transport.

`BaseContext` is the common base; `ServerContext` and `ClientContext` extend it. None
of the three takes type parameters — v1's `RequestHandlerExtra<TRequest, TNotification>`
arguments selected request/notification unions that the v2 context carries
intrinsically, so their removal loses no type information; review only handlers that
passed custom (non-standard) unions, whose `sendRequest` / `sendNotification` typing
was narrowed by them. `ServerContext.mcpReq` adds convenience methods that replace
calling `server.*` from inside a handler:

| `ctx.mcpReq.*` (new)                           | Replaces (inside a handler)                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.mcpReq.log(level, data, logger?)`         | `server.sendLoggingMessage(...)` — ⚠ **`@deprecated`**, see [§Deprecated in v2](#deprecated-in-v2-sep-2577); the notification also becomes request-related on every era — see [§`ctx.mcpReq.log()` is request-related on every era](#ctxmcpreqlog-is-request-related-on-every-era) |
| `ctx.mcpReq.elicitInput(params, options?)`     | `server.elicitInput(...)`                                                                                                                                                                                                                                                          |
| `ctx.mcpReq.requestSampling(params, options?)` | `server.createMessage(...)` — ⚠ **`@deprecated`**, see [§Deprecated in v2](#deprecated-in-v2-sep-2577)                                                                                                                                                                             |

#### Deprecated in v2 (SEP-2577)

The roots, sampling, and logging subsystems are deprecated as of protocol version
2026-07-28 (SEP-2577). Everything below is **still fully functional in v2** and marked
`@deprecated` for removal in a later major; on a 2026-07-28 connection prefer the
[multi-round-trip `input_required` pattern](./support-2026-07-28.md#multi-round-trip-requests)
instead.

- **Runtime APIs**: `Server.createMessage` / `listRoots` / `sendLoggingMessage`,
  `McpServer.sendLoggingMessage`, `Client.setLoggingLevel` / `sendRootsListChanged`, and
  the `ctx.mcpReq.log` / `ctx.mcpReq.requestSampling` handler-context helpers. Outside a
  handler, `McpServer` users reach the `Server.*` methods via the unchanged
  [`mcpServer.server` accessor](#unchanged-apis).
- **Capability fields**: the `roots`, `sampling`, and `logging` capability schema fields.
- **Type stacks**: the full Logging stack (`LoggingLevel`, `SetLevelRequest`,
  `LoggingMessageNotification` and params), the full Sampling stack
  (`CreateMessageRequest`/`Result`, `SamplingMessage`, `ModelPreferences`/`ModelHint`,
  `ToolChoice`, `ToolUseContent`/`ToolResultContent`, the `includeContext` enum values),
  and the full Roots stack (`Root`, `ListRootsRequest`/`Result`,
  `RootsListChangedNotification`).
- **`registerClient`** (Dynamic Client Registration) — prefer Client ID Metadata
  Documents per SEP-991.

The deprecation is annotation-only — JSDoc `@deprecated` markers were added, nothing
else: every deprecated runtime API keeps its v1 call signature (e.g.
`Server.sendLoggingMessage(params, sessionId?)` keeps the two-argument form) and its
wire behavior, and remains functional for at least the twelve-month deprecation window.

#### `setRequestHandler` / `setNotificationHandler` use method strings

The low-level handler registration takes a **method string** instead of a Zod schema.
The codemod rewrites every spec-method registration via
[`schemaToMethodMap.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/src/migrations/v1-to-v2/mappings/schemaToMethodMap.ts).

```typescript
// v1
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => { ... });
// v2
server.setRequestHandler('tools/call', async (request, ctx) => { ... });
```

**Custom (non-spec) methods** use the 3-arg form `(method, { params, result? }, handler)`
where `params` and `result` are any [Standard Schema](https://standardschema.dev). The
handler receives the parsed `params` directly (not the full request envelope); `_meta`
is at `ctx.mcpReq._meta`. The 3-arg notification handler is `(params, notification) => void`.

```typescript
server.setRequestHandler('acme/search', { params: SearchParams, result: SearchResult }, async (params, ctx) => { ... });
```

The custom form also covers **spec method names carried with custom payloads**: a v1
integration that reused a spec method string for its own payload shape (e.g.
`notifications/message` notifications carrying a proprietary params object) registers
it with the 3-arg form and its own schema. The overloads are selected by the arguments'
shape, not by the method name — a schemas object as the second argument always selects
the custom form, which validates against **your** schema (the spec schema is not
applied) and hands the handler the parsed params rather than the envelope.

**Spec notifications** use the 2-arg form `setNotificationHandler(method, handler)`.
Unlike the 3-arg custom form, the spec-form handler receives the **full notification
envelope** (`{ method, params }`), parsed against the spec schema — read
`notification.params`:

```typescript
client.setNotificationHandler(
  'notifications/tools/list_changed',
  async notification => {
    console.log(notification.method, notification.params);
  },
);
```

The two overloads are selected by the method string's **type**: the spec form binds the
method to the `NotificationMethod` union (`RequestMethod` on the request side — both
exported), so a method string computed at runtime must be typed as `NotificationMethod`
to select it; an untyped `string` lands on the custom-schema overload and fails to
compile without a schemas argument. `Parameters<Client['setNotificationHandler']>[0]`
also resolves to the custom `string` overload by design — name `NotificationMethod`
directly instead. The request side has the same trap one slot over:
`Parameters<Client['setRequestHandler']>` (and `typeof`-indexed casts over the overload
set) resolve against the 3-arg custom-method overload, so index `[1]` is the
`{ params, result }` schemas object, **not** the handler — v1 signature-erasing handler
casts derived positionally change meaning with no runtime symptom. Name the exported
types (`RequestMethod` and your own handler/param types) instead of deriving them
positionally. Generic helpers that v1 parameterized on a notification schema need
this conversion by hand; the codemod only warns on them.

**Handler returns are spec-typed.** In v1 the handler's return type flowed from the
schema you registered; v2 types it from the method name (`'tools/list'` →
`ListToolsResult`, and so on). Tool tables kept as plain object literals surface two
recurring compile errors: an unannotated literal widens `type: 'object'` to `string`
and no longer satisfies the spec type's `type: 'object'` literal member (fix:
`type: 'object' as const`, or annotate the table as `Tool[]`); and a heterogeneous
table whose inferred union carries `prop?: undefined` members does not satisfy the spec
types' `Record<string, JSONValue>` index signatures, since `undefined` is not a
`JSONValue` (fix: annotate the handler's return type —
`async (req): Promise<ListToolsResult> => …` — or the table itself, so each literal is
checked against the target type instead of being inferred and widened first).

#### `request()`, `ctx.mcpReq.send()`, and `callTool()` no longer require a schema for spec methods

For **spec** methods, drop the result-schema argument; the SDK resolves it from the
method name. The codemod drops it from `client.request()` and `client.callTool()`; drop
it from `ctx.mcpReq.send()` by hand.

```typescript
// v1
import { CreateMessageResultSchema } from '@modelcontextprotocol/sdk/types.js';
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const r = await extra.sendRequest({ method: 'sampling/createMessage', params: { ... } }, CreateMessageResultSchema);
    return { content: [{ type: 'text', text: 'done' }] };
});

// v2
server.setRequestHandler('tools/call', async (request, ctx) => {
    const r = await ctx.mcpReq.send({ method: 'sampling/createMessage', params: { ... } });
    return { content: [{ type: 'text', text: 'done' }] };
});
```

For **custom (non-spec)** methods, keep the result-schema argument:
`await client.request({ method: 'acme/search', params }, SearchResult)` — only drop the
schema when calling a spec method.

**Forwarding arbitrary methods (gateways / proxies).** Dropping the schema changes
semantics, not just the signature: a schema-less spec-method call now **enforces** the
spec result schema (a non-conforming upstream result is rejected locally with
`SdkError(SdkErrorCode.InvalidResult)` and a conforming one is re-serialized in schema
key order), and a schema-less call for a **non-spec** method throws a `TypeError` at
the call site (`'…' is not a spec method; pass a result schema`).
A relay that forwards `{ method, params }` it does not understand must keep passing an
explicit result schema. The v1 idiom survives with an import-path change:

```typescript
import {ResultSchema} from '@modelcontextprotocol/core';
const result = await upstream.request({method, params}, ResultSchema); // v1-identical passthrough
```

For byte-exact forwarding (member order preserved), pass your own accept-anything
Standard Schema instead. Check call sites whose `method` is **not a literal** — the
codemod may have dropped the schema argument there; restore it.

The **inbound half** — a relay re-emitting an upstream JSON-RPC error from its own
handler — has a supported surface too: reconstruct the typed error with
`ProtocolError.fromError(code, message, data)` and throw it; the encode seam serializes
it back to the wire shape (see [Typed `ProtocolError` subclasses](#typed-protocolerror-subclasses)).
Note this is typed reconstruction, not byte-exact relay: legacy codes are normalized at
the encode seam (`-32002` re-emits as `-32602`) and the typed subclasses keep only their
schema-defined `data` members, so extra upstream data keys are dropped. Throwing a plain
object carrying `.code` / `.message` / `.data` happens to work today, but it is
unspecified behavior — prefer `fromError`.

The return type is inferred from the method name via `ResultTypeMap` (e.g.
`client.request({ method: 'tools/call', ... })` returns `Promise<CallToolResult>`).
v1 call sites that passed `CreateMessageResultWithToolsSchema` explicitly need no
replacement: the schema-less send resolves to
`CreateMessageResult | CreateMessageResultWithTools`, and validation selects the
with-tools variant when the request set `tools` or `toolChoice`.

### Server registration API

The deprecated variadic `.tool()`, `.prompt()`, `.resource()` are removed. Use
`registerTool` / `registerPrompt` / `registerResource` with an explicit config object.
The codemod converts the call shape and wraps `inputSchema` / `outputSchema` /
`argsSchema` / `uriSchema` raw shapes.

```typescript
// v1 — raw shape, variadic
server.tool('greet', 'Greet a user', {name: z.string()}, async ({name}) => {
  return {content: [{type: 'text', text: `Hello, ${name}!`}]};
});

// v2 — config object, Standard Schema
server.registerTool(
  'greet',
  {description: 'Greet a user', inputSchema: z.object({name: z.string()})},
  async ({name}) => {
    return {content: [{type: 'text', text: `Hello, ${name}!`}]};
  },
);
```

`registerResource` requires a `metadata` argument — pass `{}` if you have none.

A tool or prompt registered **without** an `inputSchema` / `argsSchema` passes the
context as its callback's single argument — v1 passed `(extra)`, v2 passes `(ctx)`:

```typescript
server.registerTool('ping', {description: 'Liveness check'}, async ctx => ({
  content: [],
}));
```

A one-parameter callback typechecks under either reading, so remember that the first
parameter here is the context object, not an args object.

#### Standard Schema objects (raw shapes deprecated)

v2 expects schema objects implementing the [Standard Schema spec](https://standardschema.dev/)
for `inputSchema`, `outputSchema`, and `argsSchema`. Raw `{ field: z.string() }` shapes
are still **accepted via `@deprecated` overloads** on `registerTool`/`registerPrompt`
(auto-wrapped with `z.object()`), and `completable()` accepts any `StandardSchemaV1`;
prefer wrapping explicitly. Zod v4, ArkType, and Valibot all implement the spec.

For **optional completable arguments**, apply `.optional()` to the _result_ of
`completable()` — `completable(z.string(), cb).optional()`, not
`completable(z.string().optional(), cb)`. v2 resolves completion metadata on the schema
found after unwrapping an outer optional wrapper, so the v1 nesting returns empty
completion lists — nothing errors — and if no argument carries completion metadata in
the v2 position, the server does not advertise the `completions` capability at all. The
codemod inverts the common nesting automatically and flags shapes it cannot rewrite.

**Zod v3 is no longer supported** (v1 peer was `^3.25 || ^4.0`). Check the **declared
range** in your `package.json`, not just the installed version: a zod-3 range that
satisfied the v1 peer installs and typechecks cleanly under v2 and only fails at
runtime — and quietly: registration swallows the conversion failure, the server starts
and connects normally, and the first `tools/list` (so `client.listTools()`) answers
with an error pointing at `fromJsonSchema()` while the process keeps running. (Only the
deprecated unwrapped raw-shape form with zod-3 field values throws at registration,
with a message pointing at `zod/v4`.) Zod **≥4.2.0** self-converts via
`~standard.jsonSchema` — the supported path. Zod **4.0–4.1** lacks it, so the SDK falls
back to its bundled Zod's `z.toJSONSchema()` with a one-time `[mcp-sdk]` console
warning; and because `.describe()` field descriptions live in the _authoring_ Zod's
registry, the fallback **drops them** from the generated JSON Schema. Fix ladder:
(1) upgrade to `zod ^4.2.0`; (2) if you must pin an older or separate Zod, attach a
`~standard.jsonSchema` provider backed by _your_ Zod's `toJSONSchema` so conversion
(and descriptions) run through your instance; (3) author the schema as raw JSON Schema
via `fromJsonSchema()`. (Raw shapes are wrapped with the SDK's **bundled** Zod — built
with a foreign Zod they fail at registration or at the first `tools/list`; pass
`z.object()`-wrapped schemas from your own Zod instead.)

In a monorepo that pins zod@3 workspace-wide and cannot bump, step (1) can be applied
**per workspace member**: add a zod-4 alias dependency to the migrating member only —
`"zod-v4": "npm:zod@^4.2.0"` in that member's `package.json` — and author SDK-bound
schemas with it (`import { z } from 'zod-v4'`), leaving the rest of the workspace, and
the member's own zod-3 consumer schemas, untouched. The alias copy does not need to be
the same instance as the SDK's bundled zod: conversion runs through the **authoring**
instance's `~standard.jsonSchema`, so `.describe()` descriptions are preserved and the
emitted dialect is 2020-12. Keep the two z's apart — schemas authored with the alias
are for the SDK; they do not compose with the workspace's zod-3 schemas. (For the
bundle-side effects of the same pin, see
[Bundlers: nested `zod` copies](#bundlers-nested-zod-copies-in-zod3-pinned-monorepos).)

**Hosts that forward consumer-authored schemas.** The ladder assumes you author the
schemas yourself. A host API that accepts raw shapes or schemas written by **its own
consumers** — plugin systems, agent frameworks — cannot control the authoring zod
version or instance, and v1's built-in conversion of foreign shapes is gone. Convert on
the host side and register the result with `fromJsonSchema()`: zod-4 input via zod's
own `z.toJSONSchema(z.object(shape), { io: 'input', target: 'draft-2020-12' })` (the
conversion is runtime-structural, so a zod ≥4.2 in the host handles schemas built by a
different zod-4 copy), zod-3 input via the
[`zod-to-json-schema`](https://www.npmjs.com/package/zod-to-json-schema) package. Strip
the `$schema` member from the converted output before passing it to `fromJsonSchema()`
— `zod-to-json-schema` stamps a draft-07 `$schema` by default, and the default
validator [accepts 2020-12 only](#json-schema-2020-12-posture-sep-1613-sep-2106).

How a too-old zod surfaces depends on which entry point your code imports. With
main-entry `import { z } from 'zod'` on a zod-3 range, the project **typechecks cleanly
and fails at the first `tools/list`** (the quiet runtime path above). With
`import * as z from 'zod/v4'` — or any zod whose _typings_ predate
`~standard.jsonSchema` (zod 4.0–4.1, and zod 3.25.x via the `zod/v4` subpath) — the
same code **runs** through the bundled fallback but **fails to compile**:
`registerTool`/`registerPrompt` reject the schema with `TS2769: No overload matches
this call` listing both overloads. The real cause is buried in the first overload's
elaboration — `Property 'jsonSchema' is missing in type …` (that property is
`~standard.jsonSchema`, added in zod 4.2.0) — and a follow-on implicit-`any` error on
the handler's arguments usually appears below it. If you see that two-overload error on
a registration call with a zod schema, check the installed zod version before anything
else; both symptoms resolve identically with step (1) of the ladder.

Projects that must stay below zod 4.2 and accept the documented runtime fallback can
resolve the remaining registration compile errors with an explicit assertion to the
registration schema type — `inputSchema: schema as unknown as
StandardSchemaWithJSON<Input, Output>` — or a small typed wrapper that attaches a
`~standard.jsonSchema` provider (step (2) of the ladder, which changes runtime
conversion but not the schema's static type) and returns the asserted type. The
fallback caveats (one-time warning, dropped `.describe()` descriptions) still apply
unless the provider is attached.

The forced zod-4 bump also surfaces zod's **own** type-level API changes in consumer
annotations: `z.ZodTypeDef` no longer exists and `z.ZodType`'s generic parameters
changed, so v3-era annotations like `z.ZodType<Output, z.ZodTypeDef, Input>` fail to
compile — see [zod's v3-to-v4 changelog](https://zod.dev/v4/changelog). Consumer-only
schemas can keep compiling via zod's v3 compat subpath (`zod/v3`), but anything passed
to the SDK must be a zod-4 (or other Standard Schema) schema.

The deprecated raw-shape overloads exist only on `registerTool` / `registerPrompt`.
`RegisteredTool.update()` / `RegisteredPrompt.update()` take **schema objects**
(`paramsSchema` / `outputSchema`: `StandardSchemaWithJSON`) — a raw shape passed to
`update()` is not auto-wrapped; wrap it with `z.object()` yourself.

```typescript
import * as z from 'zod/v4';
server.registerTool(
  'greet',
  {inputSchema: z.object({name: z.string()})},
  handler,
);

// ArkType works too
import {type} from 'arktype';
server.registerTool('greet', {inputSchema: type({name: 'string'})}, handler);

// Raw JSON Schema via fromJsonSchema (validator defaults to runtime-appropriate choice)
import {fromJsonSchema} from '@modelcontextprotocol/server';
server.registerTool(
  'greet',
  {
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {name: {type: 'string'}},
    }),
  },
  handler,
);

// No-parameter tools: z.object({})
```

Removed Zod-specific helpers (the codemod marks each call site `@mcp-codemod-error`):
`schemaToJson` — use `fromJsonSchema()` from `@modelcontextprotocol/server` for raw JSON
Schema, or your schema library's native JSON-Schema conversion; `parseSchemaAsync` — use
your schema library's validation directly (e.g. Zod's `.safeParseAsync()`);
`getSchemaShape` / `getSchemaDescription` / `isOptionalSchema` / `unwrapOptionalSchema`
have no replacement (internal Zod introspection). `SchemaInput<T>` →
`StandardSchemaWithJSON.InferInput<T>` is rewritten mechanically by the codemod. The
internal `standardSchemaToJsonSchema` / `validateStandardSchema` helpers are **not** part
of the public surface — do not import them.

v1's second compat module, `server/zod-json-schema-compat.js` (`toJsonSchemaCompat`), is
also removed — and the codemod does **not** rewrite its import (expect `TS2307`). If you
build `Tool` / `Prompt` advertisements yourself, use your schema library's native
conversion: zod 4's `z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' })`
produces the dialect v2 advertises.

### HTTP & headers

Header **reads** use the Web Standard `Headers` object (`IsomorphicHeaders` is
removed): `ctx.http?.req` is a standard Web `Request`, so
`ctx.http?.req?.headers` takes `.get()` instead of bracket access.

```typescript
// v1
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: {headers: {Authorization: 'Bearer token'}},
});
const sessionId = extra.requestInfo?.headers['mcp-session-id'];

// v2 — requestInit is unchanged; only the header *read* changes
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: {headers: {Authorization: 'Bearer token'}},
});
const sessionId = ctx.http?.req?.headers.get('mcp-session-id');
const debug = new URL(ctx.http!.req!.url).searchParams.get('debug');
```

On the **write** side, `requestInit` on `StreamableHTTPClientTransport` /
`SSEClientTransport` options is a standard fetch `RequestInit`, so `headers` accepts
any `HeadersInit` — a plain object record (as above), a tuple array, or a `Headers`
instance all keep working unchanged; the transports normalize whichever form they
receive. Wrapping with `new Headers()` is optional, not required.

`StreamableHTTPClientTransport` now **appends** any custom `requestInit.headers.Accept`
value to the spec-required `application/json, text/event-stream` (v1 let it replace
them). The required media types are always present; additional types are kept for
proxy/gateway routing.

`hostHeaderValidation()` and `localhostHostValidation()` moved to
`@modelcontextprotocol/express`. The `(allowedHostnames: string[])` signature is the
same as every released v1.x — only the import path changes. Framework-agnostic helpers
(`validateHostHeader`, `localhostAllowedHostnames`, `hostHeaderValidationResponse`) are
in `@modelcontextprotocol/server`.

Server entries validate the request `Content-Type` by its **parsed media type**, not a
substring: every POST whose media type is not `application/json` answers
`415 Unsupported Media Type`. Previously any value merely containing the substring
passed (for example `text/plain; a=application/json`), case variants were wrongly
rejected, and the 2026-07-28 entry did not inspect `Content-Type` at all — so
hand-rolled clients that omit the header (or send a non-JSON type) must now set
`Content-Type: application/json`. Parameters (`; charset=utf-8`) and unambiguous
values with malformed parameter sections (`application/json;`) keep working; SDK
clients always sent the correct header and are unaffected. Custom entries that
compose `classifyInboundRequest` / `PerRequestHTTPServerTransport` directly must
apply the same validation themselves — use the exported `isJsonContentType(header)`.

### Errors

The SDK now distinguishes three error kinds:

1. **`ProtocolError`** (renamed from `McpError`) — protocol errors that cross the wire
   as JSON-RPC error responses. Uses `ProtocolErrorCode` (renamed from `ErrorCode`).
2. **`SdkError`** — local SDK errors that never cross the wire. Uses `SdkErrorCode`.
3. **`SdkHttpError`** (extends `SdkError`) — HTTP transport errors with typed `.status`
   and `.statusText`.

These classes (and `OAuthError`, the client's `SseError`, `UnauthorizedError`, and the
OAuth-client-flow error family) brand-match under `instanceof`, so checks work across
separately bundled copies of the SDK — e.g. a process using both
`@modelcontextprotocol/client` and `@modelcontextprotocol/server`. Each branded
hierarchy also exposes the same check as an explicit static guard
(`SdkError.isInstance(err)`, `ProtocolError.isInstance(err)`, …) that narrows in
TypeScript — use whichever style your codebase prefers; both read the same brand.
Fine print (applies equally to `instanceof` and `isInstance`):

- **Version skew** — matching needs _both_ copies at a brand-aware release; against an
  older copy, behavior degrades to plain prototype `instanceof` (false across bundles).
  During mixed-version rollouts, recognize errors without class identity: match
  `error.name` plus the class's discriminant field (`code`, `status`), or reconstruct
  typed protocol errors with `ProtocolError.fromError(code, message, data)`.
- **Worker boundaries** — `structuredClone`/`postMessage` drop the (symbol-keyed) brand,
  so a rehydrated error no longer brand-matches; recognize forwarded errors by
  `code`/`data` instead.
- **Brands assert identity, not shape** — a matched instance from another SDK version
  may lack newer fields; read fields defensively.
- **Re-bundling with property mangling** (`mangle.props` and similar) breaks the brand
  statics; default esbuild/webpack/terser settings are safe.

The codemod renames `McpError` → `ProtocolError`, `ErrorCode` → `ProtocolErrorCode`
(routing `RequestTimeout` / `ConnectionClosed` to `SdkErrorCode`), and
`StreamableHTTPError` → `SdkHttpError`. After the codemod runs, your `instanceof`
checks already name the v2 classes — what's left is choosing which `SdkErrorCode` /
class to match per scenario:

| Scenario                                         | v1                                        | v2                                                                 |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| Request timeout                                  | `McpError` + `ErrorCode.RequestTimeout`   | `SdkError` + `SdkErrorCode.RequestTimeout`                         |
| Connection closed                                | `McpError` + `ErrorCode.ConnectionClosed` | `SdkError` + `SdkErrorCode.ConnectionClosed`                       |
| Capability not supported                         | `new Error(...)`                          | `SdkError` + `SdkErrorCode.CapabilityNotSupported`                 |
| Not connected                                    | `new Error('Not connected')`              | `SdkError` + `SdkErrorCode.NotConnected`                           |
| Response result fails schema                     | raw `ZodError`                            | `SdkError` + `SdkErrorCode.InvalidResult`                          |
| Invalid params (server response)                 | `McpError` + `ErrorCode.InvalidParams`    | `ProtocolError` + `ProtocolErrorCode.InvalidParams`                |
| HTTP transport error                             | `StreamableHTTPError`                     | `SdkHttpError` + `SdkErrorCode.ClientHttp*`                        |
| Failed to open SSE stream                        | `StreamableHTTPError`                     | `SdkHttpError` + `SdkErrorCode.ClientHttpFailedToOpenStream`       |
| 401 after re-auth (circuit break)                | `StreamableHTTPError`                     | `SdkHttpError` + `SdkErrorCode.ClientHttpAuthentication`           |
| `SSEClientTransport.send()` 401 after re-auth    | `UnauthorizedError`                       | `SdkHttpError` + `SdkErrorCode.ClientHttpAuthentication`           |
| 403 `insufficient_scope` after step-up retry cap | `StreamableHTTPError`                     | `SdkHttpError` + `SdkErrorCode.ClientHttpForbidden`                |
| Unexpected content type                          | `StreamableHTTPError`                     | `SdkError` + `SdkErrorCode.ClientHttpUnexpectedContent`            |
| Session termination failed                       | `StreamableHTTPError`                     | `SdkHttpError` + `SdkErrorCode.ClientHttpFailedToTerminateSession` |

```typescript
// v1
if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) { ... }
if (error instanceof StreamableHTTPError) { console.log('HTTP status:', error.code); }

// v2
import { SdkError, SdkHttpError, SdkErrorCode, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/client';
if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) { ... }
if (error instanceof SdkHttpError) {
    console.log('HTTP status:', error.status, error.statusText);
    switch (error.code) {
        case SdkErrorCode.ClientHttpAuthentication:
        case SdkErrorCode.ClientHttpForbidden:
        case SdkErrorCode.ClientHttpFailedToOpenStream:
        case SdkErrorCode.ClientHttpNotImplemented:
            break;
    }
}
```

`StreamableHTTPError` is removed.

**Status read off `.code` by duck-typing.** Code that classified HTTP failures by the
status without an `instanceof` — `if ('code' in e && e.code === 403)` — silently stops
matching: on `SdkHttpError` the HTTP status moved to `.status` (its `.code` is a
`SdkErrorCode` string). The codemod renames `instanceof StreamableHTTPError`, but a
status read that never named the class is invisible to it. Watch the inconsistency:
`SseError` still carries its HTTP status on numeric `.code`, so one duck-typed
`.code === 401` that caught both transports in v1 now catches only SSE.

```typescript
// v1 — one duck-typed check caught both Streamable HTTP and SSE
if ('code' in e && (e.code === 401 || e.code === 403)) reauth();
// v2 — match each explicitly
if (e instanceof SdkHttpError && (e.status === 401 || e.status === 403))
  reauth(); // Streamable HTTP
if (e instanceof SseError && (e.code === 401 || e.code === 403)) reauth(); // SSE still uses .code
```

Silent at runtime (no compile error) — grep for `.code ===` status comparisons.

**Classification keyed on the error class name.** The same import-free classifiers
often match by name instead of code: telemetry and allowlists keyed on `error.name` or
`error.constructor.name` against `'McpError'` / `'StreamableHTTPError'` silently stop
matching — the v2 classes are named `ProtocolError`, `SdkError`, and `SdkHttpError`,
and all three assign `.name` accordingly. One v1 asymmetry disappears along the way:
v1's `StreamableHTTPError` never assigned `.name` (instances reported `'Error'`), so
`.name`-keyed matchers saw only `'McpError'`; v2's `SdkHttpError` reports
`'SdkHttpError'`, and assertions pinning `.name === 'Error'` on transport errors need
re-baselining. Add the v2 names to your match lists; during a
[staged migration](#migrating-in-stages-large-codebases) keep the v1 names alongside
for as long as the v1 package remains installed.

**Status read out of the message text.** Per transport: the Streamable HTTP message
text never carried the status (v1 put it on `.code`, v2 puts it on `.status` — read
`error.status`), and v2's SSE transport still embeds it exactly as v1 did
(`Error POSTing to endpoint (HTTP 404): …`). The silent break is **switching
transports while keeping a message regex**: a status pattern written against SSE
matches nothing on Streamable HTTP. Read `error.status` instead of parsing text.

**Raw numeric code comparisons.** The codemod rewrites `ErrorCode.X` symbol references,
but a check against the raw JSON-RPC number — `(e as { code?: unknown }).code === -32000`
— is invisible to it and silently never matches in v2, because the two SDK-local codes
it usually targeted are now **string** `SdkErrorCode` values:

| v1 numeric                  | v2                                           |
| --------------------------- | -------------------------------------------- |
| `-32000` (ConnectionClosed) | `SdkError` + `SdkErrorCode.ConnectionClosed` |
| `-32001` (RequestTimeout)   | `SdkError` + `SdkErrorCode.RequestTimeout`   |

- Requests that require a session but omit the `Mcp-Session-Id` header still
  respond `400` with JSON-RPC `-32000` (`Bad Request: Mcp-Session-Id header is
required`), unchanged from v1 — as with `-32001`, the code is an SDK
  convention; key off the HTTP status.

Replace the literal with the named code. Loud (`TS2367`) when the compared value is
typed `SdkErrorCode`; silent when the left side is `unknown` or a cast — grep for
`=== -32000` / `=== -32001`.

**Dual-role processes: `instanceof` does not cross the packages.**
`@modelcontextprotocol/client` and `@modelcontextprotocol/server` each bundle their own
copy of these error classes, so in a process that uses both — a gateway, a host, an
in-process test — an error constructed by one package fails `instanceof` against the
class imported from the other, silently. When an error may originate from the other
package, match on stable fields instead of class identity: `error.code` values
(`SdkErrorCode` strings for SDK errors, numeric JSON-RPC codes for protocol errors,
`OAuthErrorCode` strings for OAuth errors) plus presence checks like `'status' in e`,
or reconstruct typed protocol errors with `ProtocolError.fromError(code, message, data)`
— it exists precisely because `instanceof` does not survive bundle boundaries.

**Constructing the error (test stubs, custom transports).** v1
`new StreamableHTTPError(code, message)` becomes
`new SdkHttpError(code, message, data)`: the first argument is now a `SdkErrorCode`
string (pick the branch from the scenario table above) and the HTTP status moves into
the third argument — `new SdkHttpError(SdkErrorCode.ClientHttpNotImplemented,
'Not Found', { status: 404, statusText: 'Not Found' })`. v1's implicit
`Streamable HTTP error: ` message prefix is gone; pass the full message you want.

#### `SdkErrorCode` enum (complete)

| Code                                  | When thrown                                                                |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `NotConnected`                        | Transport is not connected                                                 |
| `AlreadyConnected`                    | Transport is already connected                                             |
| `NotInitialized`                      | Protocol is not initialized                                                |
| `CapabilityNotSupported`              | Required capability is not supported                                       |
| `RequestTimeout`                      | Request timed out waiting for response                                     |
| `ConnectionClosed`                    | Connection was closed                                                      |
| `SendFailed`                          | Failed to send message                                                     |
| `InvalidResult`                       | Response result failed local schema validation                             |
| `UnsupportedResultType`               | A 2026-era response carried an unrecognized `resultType`                   |
| `InputRequiredRoundsExceeded`         | Multi-round-trip auto-fulfilment hit `maxRounds`                           |
| `ListPaginationExceeded`              | No-arg `list*()` aggregate walk hit `listMaxPages`                         |
| `MethodNotSupportedByProtocolVersion` | Outbound spec method does not exist on the negotiated protocol version     |
| `EraNegotiationFailed`                | `connect()` could not negotiate a protocol era (probe failed / no overlap) |
| `ClientHttpNotImplemented`            | HTTP POST request failed                                                   |
| `ClientHttpAuthentication`            | Server returned 401 after re-authentication                                |
| `ClientHttpForbidden`                 | Server returned 403 `insufficient_scope` after step-up retry cap           |
| `ClientHttpUnexpectedContent`         | Unexpected content type in HTTP response                                   |
| `ClientHttpFailedToOpenStream`        | Failed to open SSE stream                                                  |
| `ClientHttpFailedToTerminateSession`  | Failed to terminate session                                                |

#### Typed `ProtocolError` subclasses

`ResourceNotFoundError` (carries `.uri`) and `MissingRequiredClientCapabilityError`
(carries `data.requiredCapabilities`) are new typed `ProtocolError` subclasses.
`resources/read` for an unknown URI now answers `-32602` on every protocol revision
(v1.x already emitted `-32602`; an interim `-32002` from earlier v2 alphas is mapped at
the encode seam — `2.0.0-alpha.3` and earlier predate the mapping and still emit
`-32002` on the wire, so accept both if peers may run those alphas; `2.0.0-alpha.4`
and later emit `-32602`). The encode-seam mapping applies to **your own throws too**: a handler
that deliberately throws `ProtocolError(ProtocolErrorCode.ResourceNotFound, …)` reaches
peers as `-32602` — a server can no longer emit `-32002` on the wire.
`ProtocolErrorCode.ResourceNotFound` (`-32002`) stays importable as
receive-tolerated vocabulary — accept both `-32602` and `-32002` from peers.
`ProtocolError.fromError(code, message, data)` reconstructs the typed subclass from
code + data alone — the version-agnostic path: it also works on plain wire shapes and
against SDK copies that predate brand-matched `instanceof`.
The default message text changed alongside: v1's unknown-resource error read
`Resource <uri> not found`; v2's `ResourceNotFoundError` default is
`Resource not found: <uri>` (the code is unchanged). Tests pinning the exact string
need re-baselining — prefer matching `error.code` plus a URI substring (or the typed
`error.uri`).

Custom **non-spec** codes pass through untouched: a handler that throws a
`ProtocolError` with a custom code (e.g. `-1`) and `data` reaches the peer as a
JSON-RPC error with that code and `data` unchanged — the encode seam rewrites only the
legacy `-32002` code; `data` is sent verbatim for every thrown error (the typed
subclasses shape their `data` at construction, not at encode time). Construct via
`ProtocolError.fromError(code, message, data)`.

### Auth

#### OAuth error consolidation

The individual OAuth error classes are replaced with a single `OAuthError` + `OAuthErrorCode`.
The `OAUTH_ERRORS` constant is removed. The codemod does not rewrite `instanceof` checks
on these classes — switch on `error.code` instead.

| v1 class                       | v2 equivalent                                           |
| ------------------------------ | ------------------------------------------------------- |
| `InvalidRequestError`          | `OAuthError` + `OAuthErrorCode.InvalidRequest`          |
| `InvalidClientError`           | `OAuthError` + `OAuthErrorCode.InvalidClient`           |
| `InvalidGrantError`            | `OAuthError` + `OAuthErrorCode.InvalidGrant`            |
| `UnauthorizedClientError`      | `OAuthError` + `OAuthErrorCode.UnauthorizedClient`      |
| `UnsupportedGrantTypeError`    | `OAuthError` + `OAuthErrorCode.UnsupportedGrantType`    |
| `InvalidScopeError`            | `OAuthError` + `OAuthErrorCode.InvalidScope`            |
| `AccessDeniedError`            | `OAuthError` + `OAuthErrorCode.AccessDenied`            |
| `ServerError`                  | `OAuthError` + `OAuthErrorCode.ServerError`             |
| `TemporarilyUnavailableError`  | `OAuthError` + `OAuthErrorCode.TemporarilyUnavailable`  |
| `UnsupportedResponseTypeError` | `OAuthError` + `OAuthErrorCode.UnsupportedResponseType` |
| `UnsupportedTokenTypeError`    | `OAuthError` + `OAuthErrorCode.UnsupportedTokenType`    |
| `InvalidTokenError`            | `OAuthError` + `OAuthErrorCode.InvalidToken`            |
| `MethodNotAllowedError`        | `OAuthError` + `OAuthErrorCode.MethodNotAllowed`        |
| `TooManyRequestsError`         | `OAuthError` + `OAuthErrorCode.TooManyRequests`         |
| `InvalidClientMetadataError`   | `OAuthError` + `OAuthErrorCode.InvalidClientMetadata`   |
| `InsufficientScopeError`       | `OAuthError` + `OAuthErrorCode.InsufficientScope` ¹     |
| `InvalidTargetError`           | `OAuthError` + `OAuthErrorCode.InvalidTarget`           |
| `CustomOAuthError`             | `new OAuthError(customCode, message)`                   |

¹ Unrelated to the new transport-layer `InsufficientScopeError` (SEP-2350) exported from
`@modelcontextprotocol/client`, which carries an RFC 6750 challenge from the resource
server and extends `OAuthClientFlowError`, **not** `OAuthError`. Do not rewrite that one.

```typescript
// v1
if (error instanceof InvalidClientError) { ... }
// v2
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/client';
if (error instanceof OAuthError && error.code === OAuthErrorCode.InvalidClient) { ... }
```

⚠ **Token verifiers must throw the v2 `OAuthError`.** `requireBearerAuth` (from
`@modelcontextprotocol/express`, or from `@modelcontextprotocol/server` on
web-standard hosts) classifies the error your
`OAuthTokenVerifier.verifyAccessToken()` throws: a v2
`OAuthError(OAuthErrorCode.InvalidToken)` produces the proper `401` +
`WWW-Authenticate` challenge, while the legacy `InvalidTokenError` (from
`server-legacy`) or a generic `Error` falls through as unexpected — **invalid tokens
become HTTP `500`**. When you re-point `requireBearerAuth` at
`@modelcontextprotocol/express`, migrate the error classes your verifier throws in the
same change.

A frozen copy of the v1 classes (and `mcpAuthRouter`) is available from
`@modelcontextprotocol/server-legacy/auth` during migration.

#### `AuthProvider` — non-OAuth bearer auth and the widened `authProvider` option

The transport `authProvider` option is widened to `AuthProvider | OAuthClientProvider`.
**`AuthProvider`** is a new minimal interface — `{ token(): Promise<string | undefined>;
onUnauthorized?(ctx): Promise<void> }` — for static-token / non-OAuth bearer auth.
Transports call `token()` before every request and `onUnauthorized()` on 401 (then retry
once). Existing `OAuthClientProvider` implementations need no changes — transports adapt
them internally via the new `adaptOAuthProvider()` export. Also exported:
`isOAuthClientProvider()` (type guard) and `handleOAuthUnauthorized()` (the standard
OAuth `onUnauthorized` behavior, for composing your own adapter).

#### OAuth client flow — behavioral changes

- **Resolved scope passed to DCR (SEP-835).** `auth()` now computes the resolved scope
  once (WWW-Authenticate → PRM `scopes_supported` → `clientMetadata.scope`) and passes
  it to **both** the DCR POST body and the authorization request. `registerClient()`
  gained an optional `scope` parameter that overrides `clientMetadata.scope` in the
  registration body.
- **OAuth error on HTTP 200.** `exchangeAuthorization()` / `refreshAuthorization()` now
  throw `OAuthError` when the AS returns HTTP 200 with a JSON `{error: ...}` body (e.g.
  GitHub). v1 surfaced this as a Zod parse failure on the tokens schema.
- **Metadata discovery falls through on 502.** `discoverAuthorizationServerMetadata()`
  treats `502 Bad Gateway` like 4xx — fall through to the next candidate URL instead of
  throwing (fixes path-aware discovery behind reverse proxies). Other 5xx still throw.
- **Scoped credential invalidation on `invalid_client` / `unauthorized_client`.** The
  `auth()` retry for these errors now issues two scoped calls —
  `invalidateCredentials('client')` then `invalidateCredentials('tokens')` — instead of
  v1's single `invalidateCredentials('all')`, deliberately preserving the stored
  discovery state so the callback-leg check on retry does not mask the original error.
  A provider whose `invalidateCredentials()` implementation special-cases the `'all'`
  scope must handle the split calls.

#### OAuth client flow errors (new)

The OAuth client flow now throws dedicated classes from `@modelcontextprotocol/client`
(all extend `OAuthClientFlowError`, **not** `OAuthError` — `auth()`'s `OAuthError` retry
path will not catch them):

| Throw site                                                                                                               | v2 class                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `registerClient()` rejected by AS (⚠ `@deprecated` — see [§Deprecated in v2](#deprecated-in-v2-sep-2577))                | `RegistrationRejectedError` (`status`, `body`, `submittedMetadata`)                   |
| Token-exchange / refresh / `fetchToken` / Cross-App grant on a non-`https:` token endpoint                               | `InsecureTokenEndpointError` (`tokenEndpoint`)                                        |
| RFC 9207 `iss` mismatch / RFC 8414 §3.3 issuer-echo mismatch                                                             | `IssuerMismatchError` (`kind`, `expected`, `received`)                                |
| Transport 403 `insufficient_scope` with `onInsufficientScope: 'throw'`, or default mode without an `OAuthClientProvider` | `InsufficientScopeError` (`requiredScope`, `resourceMetadataUrl`, `errorDescription`) |
| `auth()` callback leg: discovery resolves a different AS than the recorded redirect target                               | `AuthorizationServerMismatchError` (`recordedIssuer`, `currentIssuer`)                |

#### Connect-time OAuth retry (`UnauthorizedError`)

`UnauthorizedError` survives in v2 (exported from `@modelcontextprotocol/client` —
its only appearance in the error table above is the removed `SSEClientTransport.send()`
401 path), and the v1 connect-time pattern carries over: catch it from `connect()`,
complete the browser flow, call `transport.finishAuth(…)`, reconnect.

```typescript
try {
  await client.connect(transport);
} catch (error) {
  if (!(error instanceof UnauthorizedError)) throw error;
  // provider.redirectToAuthorization() has been called; complete the flow,
  // then reconnect on a FRESH transport (a started transport cannot be restarted).
  await transport.finishAuth(new URL(callbackUrl).searchParams);
  await client.connect(
    new StreamableHTTPClientTransport(url, {authProvider: provider}),
  );
}
```

One qualification: this direct `instanceof` check applies under the default `'legacy'`
version negotiation. Under the probing modes (`versionNegotiation: { mode: 'auto' }`,
with or without a pin) the connect-time 401 currently surfaces wrapped as
`SdkError(SdkErrorCode.EraNegotiationFailed)` with the `UnauthorizedError` at
`error.data.cause` — unwrap before the check, as shown in the
[client OAuth guide](../clients/oauth.md).

#### `auth()` options are now `AuthOptions`

The inline options object on `auth()` is now the named `AuthOptions` type. New fields:
`iss?: string` (the form-urldecoded `iss` from the authorization callback — pass it
alongside `authorizationCode` for RFC 9207 validation), `skipIssuerMetadataValidation?:
boolean` (security-weakening opt-out of the RFC 8414 §3.3 issuer-echo check), and
`forceReauthorization?: boolean` (skip the refresh-token branch — set by the transport's
step-up path; hosts driving step-up themselves set it under the same condition).

#### Authorization-server mix-up defense (RFC 9207 / RFC 8414 §3.3) — action required

`transport.finishAuth()` and `auth()` now validate `iss` from the authorization callback
against the issuer recorded from validated AS metadata. A mismatched `iss` throws
`IssuerMismatchError` before the code is exchanged regardless of advertised support; a
**missing** `iss` throws only when the AS advertised
`authorization_response_iss_parameter_supported: true`.

Pass the callback URL's `URLSearchParams` so the SDK can read `iss` alongside `code`.
The SDK does **not** validate `state`; compare it yourself before calling `finishAuth`:

```typescript
const params = new URL(callbackUrl).searchParams;
if (params.get('state') !== expectedState) throw new Error('state mismatch');
await transport.finishAuth(params); // SDK reads `code` + `iss`
```

`transport.finishAuth(code, iss)` remains supported. Do **not** display `error` /
`error_description` / `error_uri` from a callback that failed `iss` validation — those
values are attacker-controlled in a mix-up attack.

`discoverAuthorizationServerMetadata()` now rejects metadata whose `issuer` does not
exactly match the URL it was fetched for (RFC 8414 §3.3). Set
`skipIssuerMetadataValidation: true` only as a temporary workaround for a known-misconfigured AS.

(`@modelcontextprotocol/server-legacy` AS implementers: `mcpAuthRouter()` now advertises
`authorization_response_iss_parameter_supported: true` by default and the bundled
authorize handler appends `iss` to every redirect issued via `res.redirect(...)` on the
supplied `res`. If you emit `Location` another way, append `params.issuer` as `iss`
yourself; if your callback is issued by an upstream AS you proxy to, set
`authorizationResponseIssParameterSupported = false` so the metadata does not over-claim.)

#### Dynamic Client Registration defaults (SEP-837, SEP-2207)

`auth()` now resolves `provider.clientMetadata` once via `resolveClientMetadata()` and
applies defaults to the DCR body: `grant_types` defaults to
`['authorization_code', 'refresh_token']`; `application_type` is derived from
`redirect_uris` (loopback / custom URI scheme → `'native'`, else `'web'`). A field you
set explicitly is never overwritten. The `grant_types` default applies to the DCR body
only — it does **not** drive the `offline_access` / `prompt=consent` augmentation on the
authorize request; statically-registered and CIMD clients that want that augmentation
must set `clientMetadata.grant_types` explicitly. Non-interactive providers (no
`redirectUrl`) get no `grant_types` default. Direct `registerClient()` callers (⚠
`@deprecated` — see [§Deprecated in v2](#deprecated-in-v2-sep-2577)) wanting the same
defaults pass `resolveClientMetadata(provider)` as `clientMetadata`. DCR
rejection now throws `RegistrationRejectedError` (carrying `status`, `body`,
`submittedMetadata`).

#### Token endpoint must use TLS (SEP-2207)

`exchangeAuthorization()`, `refreshAuthorization()`, `fetchToken()`, and the Cross-App
Access helpers throw `InsecureTokenEndpointError` when the token endpoint is not
`https:` (loopback `localhost` / `127.0.0.1` / `::1` exempt). `auth()` surfaces this on
every path including refresh — switch any plain-`http:` AS on a non-loopback host to
TLS; there is no opt-out. Storage confidentiality of `refresh_token` remains your
`saveTokens()` implementation's responsibility.

#### Scope step-up on `403 insufficient_scope` (SEP-2350)

`StreamableHTTPClientTransport` accepts `onInsufficientScope: 'reauthorize' | 'throw'`
(default `'reauthorize'`). On `'reauthorize'` the transport re-authorizes with the
**union** of the previously-requested and challenged scope (`computeScopeUnion`); when
that union strictly exceeds the current token's granted scope (`isStrictScopeSuperset`),
the SDK bypasses the refresh-token branch and forces a fresh authorization request. On
`'throw'` the transport raises `InsufficientScopeError` and does not re-authorize — set
this for `client_credentials` / m2m clients where re-authorization can't widen scope, or
to gate the consent prompt behind UX. Step-up retries are hard-capped per send
(`maxStepUpRetries`, default 1). With a non-OAuth [`AuthProvider`](#authprovider--non-oauth-bearer-auth-and-the-widened-authprovider-option),
a `403 insufficient_scope` now throws `InsufficientScopeError` instead of the previous
`SdkHttpError(ClientHttpNotImplemented)`. The GET listen-stream open path applies the
same handling as the POST send path.

#### Credentials bound to the issuing authorization server (SEP-2352)

`auth()` stamps an `issuer` field onto every value it passes to `saveTokens()` /
`saveClientInformation()` and threads `{ issuer }` as the `ctx` argument to those
methods plus `tokens()` / `clientInformation()`. On read, a stored value whose `issuer`
names a different AS is treated as `undefined` and the flow re-registers / re-authorizes.
**Round-trip the stored object verbatim and you're protected** — single-slot storage
works. Dropping the stamp is easy to miss: a `saveTokens()` implementation that
rebuilds the object field-by-field and drops `issuer` leaves the value unstamped —
reads still succeed and refresh keeps working, the per-AS issuer check simply does not
apply to that credential, and every read logs an `[mcp-sdk]` warning (`auth()`
re-stamps on first use where the provider can persist it). If you see that warning
repeating after upgrading, check this first. To hold credentials for several authorization servers at once, key your storage
on `ctx.issuer` (treat **`ctx === undefined` as "return the most-recently-saved token
set"** — the transport's per-request `Authorization: Bearer` read calls `tokens()` with
no `ctx`). New TypeScript-only aliases `StoredOAuthTokens` / `StoredOAuthClientInformation`
add an optional `issuer?: string` field on top of the wire types.

`OAuthClientProvider.saveAuthorizationServerUrl()` / `authorizationServerUrl()` are
`@deprecated` (still written for back-compat, never read by the SDK). The bundled
`ClientCredentialsProvider`, `PrivateKeyJwtProvider`, `StaticPrivateKeyJwtProvider`, and
`CrossAppAccessProvider` gain `expectedIssuer?: string` and no longer define
`saveClientInformation()`. Implement `discoveryState()` / `saveDiscoveryState()` so the
callback leg can verify it is exchanging the code at the same AS the redirect targeted;
without it the SDK `console.warn`s once per callback (`discoveryState` must persist with
the same durability as `codeVerifier`). Both methods are optional on
`OAuthClientProvider` and may be sync or async; `OAuthDiscoveryState` (exported from
`@modelcontextprotocol/client`) extends `OAuthServerInfo` with the optional
`resourceMetadataUrl` the protected-resource metadata was found at:

```typescript
import type { OAuthDiscoveryState } from '@modelcontextprotocol/client';

// On OAuthClientProvider:
saveDiscoveryState?(state: OAuthDiscoveryState): void | Promise<void>;
discoveryState?(): OAuthDiscoveryState | undefined | Promise<OAuthDiscoveryState | undefined>;
```

#### Conformance obligations for `OAuthClientProvider` implementers

The SDK enforces every authorization MUST that lands in SDK code. The following live in
**your** implementation and the SDK structurally cannot enforce them:

- **Round-trip the `issuer` stamp** on persisted credentials (SEP-2352). Persist the
  value verbatim from `saveTokens` / `saveClientInformation` and return it verbatim.
- **Pass `expectedIssuer`** when constructing static-credential providers (SEP-2352).
- **Keep refresh tokens confidential in storage** (SEP-2207) — OS keychain or
  encrypted-at-rest store, never `localStorage` / plain files / logs.
- **Extract `iss` from the callback URL** and pass it to `finishAuth` (SEP-2468); when
  `IssuerMismatchError` is thrown, do not render the callback's `error*` values.
- **Set `application_type` correctly** when overriding the heuristic (SEP-837).
- **Track cross-request step-up failures yourself** (SEP-2350) — `maxStepUpRetries` is
  per request; per-session backoff is host state.
- **Persist discovery state**: implement `discoveryState()` / `saveDiscoveryState()` so
  the authorization-server metadata your tokens were issued against survives restarts.
- **Choose the insufficient-scope behavior**: keep the default
  `onInsufficientScope: 'reauthorize'`, or handle `InsufficientScopeError` yourself.
- **Resource-server operators: do not advertise `offline_access`** in `WWW-Authenticate`
  `scope` or PRM `scopes_supported` (SEP-2207).

### Types & schemas

#### Zod `*Schema` constants moved to `@modelcontextprotocol/core`

The Zod schemas (`CallToolResultSchema`, `ListToolsResultSchema`, …) that v1 exported
from `types.js` now live in a separate **`@modelcontextprotocol/core`** package. Neither
`@modelcontextprotocol/client` nor `@modelcontextprotocol/server` re-exports them — both
packages stay Zod-free in their public surface.

The v1→v2 change is just an import-path swap — `.parse()` / `.safeParse()` keep working
unchanged:

```typescript
// v1
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
if (CallToolResultSchema.safeParse(value).success) { ... }

// v2 — same Zod schema, new package
import { CallToolResultSchema } from '@modelcontextprotocol/core';
if (CallToolResultSchema.safeParse(value).success) { ... }
```

`@modelcontextprotocol/core` is the canonical home for the spec's Zod schema constants
(and the OAuth/OpenID metadata schemas). It is runtime-neutral (its only dependency is
`zod`) and arrives transitively as the shared runtime schema graph of `client` /
`server` — add it to your own `dependencies` only when you import the raw schemas
directly.

If you would rather keep your project Zod-free, the **`isSpecType` / `specTypeSchemas`**
alternatives are exported from `@modelcontextprotocol/client` and `…/server`:

```typescript
import { isSpecType, specTypeSchemas } from '@modelcontextprotocol/client';
if (isSpecType.CallToolResult(value)) { ... }
const blocks = mixed.filter(isSpecType.ContentBlock);
const result = specTypeSchemas.CallToolResult['~standard'].validate(value);
```

`isSpecType` and `specTypeSchemas` are keyed by `SpecTypeName` — a literal union of
every named type in the MCP spec — so you get autocomplete and a compile error on typos.
`specTypeSchemas.X` is a `StandardSchemaV1Sync<In, Out>` (`validate()` is synchronous).
`validate()` returns `{ value }` or `{ issues }` and never throws — unlike `.parse()` on
the real schema; code that caught a `ZodError` should inspect `result.issues` (or keep
`.parse()` on the schema imported from `@modelcontextprotocol/core`).
The pre-existing `isCallToolResult(value)` guard still works.

**`specTypeSchemas.X` is `StandardSchemaV1`, not `ZodType`.** Zod-specific composition
— `.extend()`, `.pick()`, `.omit()`, `.merge()`, `.shape`, `.passthrough()`,
`.parseAsync()` — does **not** compile on a `specTypeSchemas` entry; reach for the real
Zod schema from `@modelcontextprotocol/core` when you need to derive a tolerant variant
of a spec schema (e.g.
`ListToolsResultSchema.extend({ tools: ToolSchema.omit({ outputSchema: true }).array() })`).
The Zod-specific `AnySchema` / `SchemaOutput` types from `…/zod-compat.js` are removed —
replace with `StandardSchemaV1` / `StandardSchemaV1.InferOutput<T>` (the codemod's
removal message says the same).

**Composing two core schemas.** Zod composition needs a shared zod: deriving from a
single core schema (as above) and combining core schemas with your own `z` typecheck
when your `zod` resolves to the **same copy** `@modelcontextprotocol/core` uses (a
`zod ^4.2.0` range that dedupes). When it cannot — a zod@3-pinned project nests core's
own zod@4 — v1 idioms that combined two spec schemas with your `z` no longer compile:
core does not export its zod instance, and a foreign zod's `z.union(…)` / `.or(…)`
rejects core's schema types. For accept-either result parsing, skip composition:
request with the `ResultSchema` passthrough (the same one the
[gateway note](#request-ctxmcpreqsend-and-calltool-no-longer-require-a-schema-for-spec-methods)
uses) and discriminate with sequential `safeParse`:

```typescript
// v1 — one composed schema
const result = await client.request(
  req,
  z.union([CompatibilityCallToolResultSchema, CreateTaskResultSchema]),
);

// v2 — passthrough request, then sequential discrimination
import {
  CompatibilityCallToolResultSchema,
  CreateTaskResultSchema,
  ResultSchema,
} from '@modelcontextprotocol/core';
const raw = await client.request(req, ResultSchema);
const asTask = CreateTaskResultSchema.safeParse(raw);
const result = asTask.success
  ? asTask.data
  : CompatibilityCallToolResultSchema.parse(raw);
```

Order the candidates from most to least specific, and `.parse()` the last one so a
result that matches no candidate still fails loudly.

The role-aggregate unions (`ClientRequest`, `ServerResult`, `ServerRequest`,
`ClientResult`, `ClientNotification`, `ServerNotification`) and the typed-method maps
(`RequestMethod`, `RequestTypeMap`, `ResultTypeMap`, `NotificationTypeMap`) no longer
include task vocabulary; the deprecated `Task*` types remain importable on their own.
(One published-alpha qualification, like the `-32002` note in [Errors](#errors): the
`2.0.0-alpha.3` and earlier typings predate this — the typed maps there still carry the
`tasks/*` entries, and `ResultTypeMap['tools/call']` still unions `CreateTaskResult`, so
a `client.request({ method: 'tools/call', … })` result does not assign to
`Promise<CallToolResult>`. If pinned to those alphas, narrow with the
`isCallToolResult` guard — the recommended discrimination tool anyway, per the next
paragraph; `2.0.0-alpha.4` and later are unaffected.)

**Discriminating result shapes: use guards, not the `in` operator.** The v2
zod-inferred result types are passthrough objects — every union member carries an index
signature — so v1-idiomatic property discrimination such as
`if ('content' in result) { … } else { result.toolResult }` no longer narrows: the `in`
check is satisfiable by every member, and the else branch can collapse to `never`
(surfacing as `TS2339` on the property you then read). Use the exported guards instead:
`isCallToolResult(result)`, or `isSpecType.GetPromptResult(result)` and friends for any
other spec type ([above](#zod-schema-constants-moved-to-modelcontextprotocolcore)). An
adjacent trap when keeping a union for later narrowing: a `const` **annotation** is
control-flow-narrowed straight back to the initializer's type — after
`const r: A | B = await fn()`, `r` has `fn`'s return type, not the union — so when you
need the wider union (e.g. a `CompatibilityCallToolResult` branch), apply an
`as A | B` assertion instead of an annotation.

#### Removed type aliases

| Removed                                                         | Replacement                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `JSONRPCError`                                                  | `JSONRPCErrorResponse`                                          |
| `JSONRPCErrorSchema`                                            | `JSONRPCErrorResponseSchema`                                    |
| `isJSONRPCError`                                                | `isJSONRPCErrorResponse`                                        |
| `isJSONRPCResponse` (deprecated in v1)                          | `isJSONRPCResultResponse` ²                                     |
| `JSONRPCResponseSchema` (result-only in v1)                     | `JSONRPCResultResponseSchema` ²                                 |
| `JSONRPCResponse` (result-only in v1)                           | `JSONRPCResultResponse` ²                                       |
| `ResourceReference` / `ResourceReferenceSchema`                 | `ResourceTemplateReference` / `ResourceTemplateReferenceSchema` |
| `IsomorphicHeaders`                                             | Web Standard `Headers`                                          |
| `RequestHandlerExtra`                                           | `ServerContext` / `ClientContext` / `BaseContext`               |
| `ResourceTemplate` (the spec wire **type** from `sdk/types.js`) | `ResourceTemplateType` ³                                        |

² v2 introduces **new** `isJSONRPCResponse` / `JSONRPCResponse` / `JSONRPCResponseSchema`
with corrected semantics — they match **both** result and error responses (the schema is
`z.union([JSONRPCResultResponseSchema, JSONRPCErrorResponseSchema])`). v1's symbols only
matched results. To preserve v1 behavior, rename to `isJSONRPCResultResponse` /
`JSONRPCResultResponse` / `JSONRPCResultResponseSchema` (the codemod does this).

³ The `ResourceTemplate` URI-template helper **class** (from `sdk/server/mcp.js`) is
**unchanged** — keep `new ResourceTemplate(...)` as-is. Only the like-named spec wire
type from `types.js` was renamed to `ResourceTemplateType` to resolve the v1 collision;
the codemod scopes the rename to imports from `sdk/types.js` only.

All other symbols from `@modelcontextprotocol/sdk/types.js` retain their original
names — import the TypeScript types, error classes, enums, and type guards from
`@modelcontextprotocol/client` or `@modelcontextprotocol/server`, and the Zod
`*Schema` constants from `@modelcontextprotocol/core`.

One type-level narrowing to note: client/server capability `experimental` payloads are
now typed as JSON-compatible objects (nested JSON values) rather than arbitrary
objects. A payload typed `Record<string, unknown>` no longer assigns (`TS2322`) — give
the source a JSON-compatible type or cast at the boundary.

The `Protocol` base class and `mergeCapabilities` moved: import them from the
`@modelcontextprotocol/client` or `@modelcontextprotocol/server` package root instead
of `shared/protocol.js`. Most code should not use `Protocol` directly — `Client` and
`Server` are the supported surfaces, and for observing unmatched inbound requests
prefer `client.fallbackRequestHandler` / `server.fallbackRequestHandler`. The codemod
rewrites `Protocol` and `mergeCapabilities` imports to the package root, like the
module's other symbols. One caveat: the client and server packages each bundle their
own compiled copy of the class, so the two roots' `Protocol` exports are distinct
classes — import it from one package consistently within a process.

#### JSON Schema 2020-12 posture (SEP-1613, SEP-2106)

The default validator supports **JSON Schema 2020-12 only**. On Node it is now `Ajv2020`
instead of draft-07 `Ajv`; the Cloudflare Workers default was already 2020-12. Schemas
declaring a different `$schema` are rejected with `Error("…unsupported dialect…")`.

`CallToolResult.structuredContent` is widened from `{ [k: string]: unknown }` to
`unknown` (SEP-2106 lifts the `type:"object"` root restriction). The presence check is
`!== undefined`, not falsy (`null` / `0` / `false` / `""` are legal values now). External
`$ref` is not dereferenced (unchanged from v1; Ajv throws `MissingRefError` at compile,
surfaced per-tool on `callTool`).

| v1 pattern                                                         | Mechanical fix                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `result.structuredContent.<key>` / `result.structuredContent?.<k>` | narrow first: `const sc = result.structuredContent; if (typeof sc === 'object' && sc !== null && '<k>' in sc) { sc.<k> }`                                                                              |
| `if (!result.structuredContent)`                                   | `if (result.structuredContent === undefined)`                                                                                                                                                          |
| relying on default `Ajv` being draft-07                            | `new AjvJsonSchemaValidator(new Ajv({ strict: false, validateFormats: true, validateSchema: false, allErrors: true }))` (import `Ajv`, `addFormats`, `AjvJsonSchemaValidator` from `…/validators/ajv`) |
| draft-07 idioms via `fromJsonSchema(schema)`                       | `fromJsonSchema(schema, new AjvJsonSchemaValidator(ajv))` — the `McpServer`/`Client` `jsonSchemaValidator` option does **not** reach `fromJsonSchema`-authored schemas                                 |
| `outputSchema` / `inputSchema` with absolute-URI `$ref`            | inline under `$defs` and reference with `#/$defs/Name`                                                                                                                                                 |

A tool may now register an `outputSchema` whose root is `type:"array"`, `type:"string"`,
etc.; toward 2025-era clients the codec wraps it in a `{result:…}` envelope, and toward
every era a non-object `structuredContent` with no `text` block of its own gets a
`JSON.stringify(...)` `text` block auto-appended. See [support-2026-07-28.md › Per-era wire codecs](./support-2026-07-28.md#per-era-wire-codecs) for how the codec applies these per era.

**Your advertised tool schemas change shape on the wire.** The same `registerTool`
calls produce `tools/list` entries whose generated `inputSchema` differs from v1:
JSON Schema 2020-12 idioms (zod 4 conversion), different `additionalProperties`
handling (no `additionalProperties: false` by default; passthrough objects emit
`"additionalProperties": {}` instead of `true`), and no `execution.taskSupport` member.
Golden tests, transcript pins, and strict client-side validators of your advertised
tool list need re-baselining — the new shapes are spec-conformant.

### Behavioral changes

These are runtime-behavior changes that may affect tests and assertions; no source
rewrite required unless noted.

#### Error-shape changes (every era)

- **Unchanged, for re-baselining relief:** timeout rejections still carry
  `data.timeout` / `data.maxTotalTimeout` exactly as v1 `McpError` did — v1 assertions
  on those survive verbatim. The cancelled-on-timeout signal is unchanged on legacy-era
  connections and on stdio/in-memory at any era; on 2026-era Streamable HTTP the cancel
  signal is the per-request stream close instead of a `notifications/cancelled` POST
  (see [support-2026-07-28.md](./support-2026-07-28.md)).
- **Also unchanged: SSE reconnection exhaustion.** `StreamableHTTPClientTransport`'s
  standalone GET-stream reconnection behavior and its exhaustion signal carry over from
  v1: when retries run out, the transport emits `onerror` with a plain `Error` whose
  message is `Maximum reconnection attempts (N) exceeded.` — there is no typed error
  class for this condition, so monitors that match the message text keep working.
- **Also unchanged: elicitation response validation.** `elicitInput`'s local validation
  of elicitation responses against `requestedSchema`, the resulting `-32602` error
  message wording (`Elicitation response content does not match requested schema: …`),
  and the `McpServer` / `Client` `jsonSchemaValidator` option carry over from v1 —
  tests pinning the local-validation message and custom validator wiring need no
  re-baselining.
- **Unknown / disabled tool calls now reject** with `ProtocolError(-32602 InvalidParams)`
  instead of resolving `CallToolResult{isError: true}`. v1 callers that checked
  `result.isError` for an unknown tool will get an unhandled rejection — catch the
  rejected promise instead.
- **The `MCP error <code>: ` message prefix is gone.** v1 prefixed relayed JSON-RPC
  error messages (`MCP error -32602: …`); v2's `ProtocolError.message` carries the
  peer's message verbatim. Tests and log scrapers that matched the prefix or the numeric
  code in rendered text should match `error.code` instead.
- **In-flight request handlers are aborted on transport close** — `ctx.mcpReq.signal`
  fires (v1 let them run to completion). `InMemoryTransport.close()` no longer
  double-fires `onclose` on the initiating side.
- **`Protocol.request()` with an already-aborted signal** rejects with
  `SdkError(SdkErrorCode.RequestTimeout, reason)` instead of throwing the raw
  `signal.reason`, matching the in-flight-abort path.
- **OAuth discovery (`discoverOAuthProtectedResourceMetadata` / `discoverOAuthMetadata`,
  transitively `auth()`) throws on fetch `TypeError`** (DNS failure, `ECONNREFUSED`,
  invalid URL) in Node and Cloudflare Workers instead of swallowing it as a CORS miss
  → `undefined`. The CORS-swallow remains browser-only.

#### Client connection & dispatch

- **`connect()` skips the `initialize` handshake when the transport already exposes a
  `sessionId`** — it assumes it is reconnecting to an existing session (unchanged from
  v1.x, where the same guard has existed since 1.10.0; recorded here because the
  far-away symptom keeps surprising migrators). A custom or test transport that sets `sessionId` at construction
  silently skips initialization: `getServerCapabilities()` stays `undefined` and the
  list verbs return empty results. Expose `sessionId` only after the first request has
  been sent.
- **The typed verbs dispatch after async pre-work.** `Protocol.request()` itself still
  hands the frame to the transport before its first `await` (v1-compatible). The typed
  verbs on top of it — `callTool()` and the cacheable list verbs — perform async work
  first (header-mirroring scan, response-cache freshness, output-validator resolution),
  so an abort fired in the same tick can land before the frame is ever sent: the call
  rejects with `SdkError(RequestTimeout, reason)` and **no `notifications/cancelled` is
  emitted** (nothing was in flight). v1 sent the frame synchronously from these verbs.
  Once the frame is on the wire, aborting still sends `notifications/cancelled` before
  rejecting.
- **Protocol-version pinning is a first-class option.**
  `ProtocolOptions.supportedProtocolVersions` pins the legacy `initialize` handshake:
  the **first** pre-2026 entry in the list is offered (list order is preference order),
  a counter-offer is accepted only if it is one of the list's pre-2026 entries, and a
  list with no pre-2026 entry makes the handshake throw. Under
  `versionNegotiation: 'auto'` the modern probe candidates are the list's modern
  entries when it has any (otherwise the SDK's default modern set); a `{ pin }` is
  honored as given and is not checked against the list (see
  [support-2026-07-28.md](./support-2026-07-28.md#client-side-versionnegotiation)).
  v1 had no public equivalent (`SUPPORTED_PROTOCOL_VERSIONS` was a fixed constant) —
  replace any workaround that patched the offered version with this option.
- **Also unchanged: HTTP 405 tolerances.** A `405` answering the standalone GET stream
  open is benign (the client proceeds without the stream), and a `405` answering the
  session DELETE resolves `terminateSession()` normally — stateless-topology servers
  that decline both verbs keep working without changes, as in v1.

#### stdio transport

- A configurable `maxBufferSize` (default **10 MB**) caps the stdio read buffer. A
  single message that would push the buffer past the limit emits `onerror` and
  **closes the connection** (v1 buffered unbounded). Configure via
  `new StdioClientTransport({ ..., maxBufferSize })` /
  `new StdioServerTransport(stdin, stdout, { maxBufferSize })`.
- `ReadBuffer.readMessage()` now **silently skips non-JSON stdout lines** instead of
  throwing `SyntaxError` → `onerror`. Hot-reload tools (tsx, nodemon) that write debug
  output to stdout no longer break the transport. Lines that parse as JSON but fail
  JSON-RPC schema validation still throw.
- `StdioClientTransport` always sets `windowsHide: true` when spawning the server
  process on Windows (previously Electron-only). Prevents stray console windows in
  non-Electron Windows hosts.
- Outbound write failures — e.g. the host closing the stdout pipe while a send is
  pending — now reject the pending `send()` and close the transport through
  `onerror`/`onclose` instead of surfacing an unhandled stream error; lifecycle
  tests that pinned a crash-class exit observe a clean shutdown instead.

#### Client list methods

- `listPrompts()`, `listResources()`, `listResourceTemplates()`, `listTools()` return
  **empty results** when the server didn't advertise the corresponding capability,
  instead of sending the request. Set `enforceStrictCapabilities: true` in `ClientOptions`
  to restore the v1 throw.
- Called **without a `cursor`**, the same methods now **auto-aggregate every page** and
  return an aggregate with no `nextCursor`. Passing `{ cursor }` still fetches one page. Manual
  pagination loops keep working (the first iteration returns everything); replace them
  with the bare no-arg call. The walk is capped at `ClientOptions.listMaxPages` (default
  64); overrun throws `SdkError(ListPaginationExceeded)`. There is no way to fetch only
  the **first** page through the typed verbs — for page-level observation
  (pagination tooling, per-page stats) drop to
  `client.request({ method: 'tools/list', params })`, which never aggregates.
- Output-schema validator compilation is now **lazy** — validators compile on the first
  `callTool()` against the cached `tools/list` entry, not eagerly inside `listTools()`.
  In v1, `listTools()` threw on an uncompilable `outputSchema`; now `listTools()`
  succeeds and the compile failure surfaces when `callTool()` is invoked on the affected
  tool, as `ProtocolError(InvalidParams, "Tool 'X' has an invalid outputSchema: …")`,
  before the request is sent. Validation is never silently skipped.
- On a 2026-07-28 connection the cacheable verbs honour the server-stamped `ttlMs` /
  `cacheScope` (SEP-2549) and may return a still-fresh cached entry without a round
  trip. Per-call override: `{ cacheMode: 'refresh' | 'bypass' }`. New `ClientOptions`:
  `cachePartition`, `defaultCacheTtlMs`. `ResponseCacheStore` gained `delete(key)`;
  `InMemoryResponseCacheStore` is now bounded (`{ maxEntries }`, default 512).
  `CacheEntry.value` (and the `set()` entry value) is the JSON-serialized result
  document (`string`, not `unknown`): persist and return it verbatim, `JSON.parse`
  it to inspect.

#### Server (Streamable HTTP transport)

- Resumability behavior (SSE priming events, `closeSSE` / `closeStandaloneSSE`
  callbacks) is only enabled for protocol versions in the transport's supported-versions
  list that are `>= 2025-11-25`. Unknown future version strings in an `initialize`
  request body no longer enable it.
- Session-ID mismatch still responds `404` with JSON-RPC `-32001` (`Session not found`),
  unchanged from v1. This `-32001` is an SDK convention, not spec-assigned; client code
  should key off the HTTP `404` status, not `-32001`.

#### Server (deprecated accessors and app-factory Origin validation)

- `Server.getClientCapabilities()`, `getClientVersion()`, `getNegotiatedProtocolVersion()`
  are `@deprecated` but functional. On 2026-07-28 requests, prefer `ctx.mcpReq.envelope`.
- `createMcpExpressApp()` / `createMcpHonoApp()` / `createMcpFastifyApp()` with a
  localhost-class `host` now also validate the `Origin` header by default. Browser-served
  clients on a non-localhost origin need `allowedOrigins: [...]` (replaces the default
  localhost allowlist; validation cannot be disabled for localhost binds). Requests
  without an `Origin` header are unaffected; a present `Origin` that cannot be parsed
  — including the opaque **`Origin: null`** sent by sandboxed iframes, `file://` pages,
  and cross-origin redirects — is **rejected with 403** and cannot be allowlisted via
  `allowedOrigins`. Framework-agnostic helpers
  (`validateOriginHeader`, `localhostAllowedOrigins`, `originValidationResponse`) are in
  `@modelcontextprotocol/server`; `@modelcontextprotocol/node` ships
  `hostHeaderValidation` / `originValidation` request guards for plain `node:http`.

#### Server (McpServer / Streamable HTTP behavior)

- **Eager capability-handler install.** `McpServer` now installs list/read/call handlers
  for every primitive capability declared in `ServerOptions.capabilities`, even with
  zero registrations. `new McpServer(info, { capabilities: { tools: {} } })` with no
  registered tools answers `tools/list` with `{ tools: [] }` instead of `-32601 Method
not found`. Low-level `Server` users remain responsible for registering handlers for
  declared capabilities — with one exception: declaring the `logging` capability (in
  the constructor's capabilities or via pre-connect `registerCapabilities()`) installs
  the `logging/setLevel` handler on the low-level `Server` too, so `logging/setLevel`
  requests that answered `-32601` in v1 now resolve. Eager install also rewrites the **advertised** capability
  objects: a declared `tools: {}` / `resources: {}` / `prompts: {}` is advertised with
  `listChanged: true` at construction, so capability pins and initialize-result golden
  tests need re-baselining. To advertise without the default, set
  `listChanged: false` explicitly; capabilities declared on the low-level `Server` are
  advertised verbatim.
- **`WebStandardStreamableHTTPServerTransport` store-first `eventStore` semantics.**
  Request-related events emitted after `closeSSE()` — and the final response when no
  per-request stream is connected — are now persisted to the configured `eventStore` for
  replay (v1 dropped them / threw `"No connection established"`). Without an
  `eventStore`, the same condition surfaces via `onerror` and the request id is retired.
  `NodeStreamableHTTPServerTransport` is a thin wrapper over
  `WebStandardStreamableHTTPServerTransport`, so this — like every behavioral note on
  the web-standard transport — applies to the Node transport too.
- **`registerResource` reserves the `cacheHint` config key.** It is validated
  (`RangeError` on invalid values) and stripped from the resource's list metadata; v1
  passed it through verbatim as ordinary metadata. Untyped callers that previously
  smuggled a `cacheHint` key through resource metadata should rename it.

#### `ctx.mcpReq.log()` is request-related on every era

`ctx.mcpReq.log()` now emits its `notifications/message` request-related (it rides the
in-flight exchange like progress) on every era. On a 2025-era sessionful Streamable HTTP
transport this moves handler-emitted logs from the standalone GET stream onto the
per-request POST response stream — a spec-conformance correction. The session-scoped
`logging/setLevel` filter applies as before on 2025-era connections. (On 2026-07-28
requests, the per-request `_meta.logLevel` envelope key is the filter — see
[support-2026-07-28.md](./support-2026-07-28.md#serving-the-2026-07-28-revision).)

#### Wire tightening (every era)

- **`CallToolResult.content` keeps the v1 parse tolerance on the legacy era.** An
  inbound result without `content` defaults to `[]` (deployed servers omit it
  alongside `structuredContent`); 2026-07-28 connections stay strict. Authoring is
  unchanged and era-independent: the TypeScript surface requires `content` on handler
  results, and a content-less handler result is normalized to `content: []` before it
  reaches the wire. One sharpening remains: a content-less body carrying another
  result family's vocabulary (a task handle or an `input_required` round) is still
  rejected loudly — tolerance never turns a different result kind into a silent empty
  success. A body whose only foreign key was `resultType` strips to an empty object
  and defaults, exactly as v1 parsed a payload-free body.
- **`ElicitResult.content` values are typed and validated as
  `string | number | boolean | string[]`.** v1's TypeScript surface accepted
  `Record<string, unknown>` content values; an elicitation handler returning arbitrary
  objects now fails to compile (and fails schema validation) — narrow to the primitives
  the elicitation spec allows.
- **Custom (3-arg) handlers receive `_meta`.** `setRequestHandler(method, {params}, handler)`
  used to delete `params._meta` before validation; it now passes `_meta` through (minus
  the reserved `io.modelcontextprotocol/*` envelope keys). If your params schema is
  strict, add an optional `_meta` member.
- **`specTypeSchemas` validate the neutral model.** Result entries no longer accept
  `resultType`; the validators for the 2025-only task message types and
  `RequestMetaEnvelope` left the public set (`SpecTypeName` narrowed accordingly).
- **Sampling `hasTools` discriminant** now keys on `tools || toolChoice` (previously
  `tools` only) when selecting the with-tools `CreateMessageResult` variant, on every
  era.
- **Inbound frames that fail message-shape validation are not answered.** v2 routes
  every inbound frame through typed message guards; a frame that matches no JSON-RPC
  shape (e.g. a hand-built ping with an explicitly-`undefined` `id`, or non-object
  `params`) is dropped and surfaces only via `onerror` (`Unknown message type: …`) — no
  response is sent. v1-era test fences that await a reply to a hand-written raw frame
  hang instead of resolving; send through the typed surface (`client.ping()`,
  `client.request()`) instead.

#### Experimental tasks interception removed

The 2025-11 task side-channel through `Protocol` is removed (was always `@experimental`).
No mechanical migration; remove usages. Gone: `ProtocolOptions.tasks`,
`protocol.taskManager`, `RequestOptions.task` / `relatedTask`, `BaseContext.task`,
`assertTaskCapability` / `assertTaskHandlerCapability`, `*.experimental.tasks.*`
accessors and `Experimental{Client,Server,McpServer}Tasks`, `requestStream` /
`callToolStream` / `createMessageStream` / `elicitInputStream` and the `ResponseMessage`
types they yielded, `registerToolTask`, `ToolTaskHandler`, `TaskRequestHandler`,
`CreateTaskRequestHandler`, `TaskMessageQueue`, `InMemoryTaskMessageQueue`,
`BaseQueuedMessage` / `Queued*`, `CreateTaskServerContext`, `TaskServerContext`,
`TaskToolExecution`, `TaskStore`, `InMemoryTaskStore`, `CreateTaskOptions`, `isTerminal`,
and the `new McpServer(info, { taskStore, taskMessageQueue })` constructor option keys
(the codemod emits an action-required diagnostic at each — remove the option).

The task **wire types** remain importable as `@deprecated` vocabulary for 2025-11-25
interop — see [support-2026-07-28.md](./support-2026-07-28.md#tasks-deprecated-wire-vocabulary).

#### Specification clarifications adopted (no SDK behavior change)

The 2026-07-28 specification revision includes a number of documentation-only
clarifications recorded here so an audit of the revision's changelog against this guide
is complete; nothing in this list requires code changes: per-operation timeout guidance
removal (`RequestOptions.timeout` / `DEFAULT_REQUEST_TIMEOUT_MSEC` unchanged); stdio
shutdown wording; transports-as-bindings reframe; `resources/read` wording (the
`file://` path-sanitization MUST is server-author guidance — your handler must reject
traversal / symlink escapes itself); `PromptMessage` resource links (already in
`ContentBlock`); completion `ref/resource` URI templates; pagination empty-string
cursors (already passed through verbatim); sampling host-requirement docs; elicitation
statefulness wording; cosmetic schema/JSDoc sweeps.

---

## Enhancements

### Automatic JSON Schema validator selection by runtime

The SDK auto-selects the validator: Node.js → AJV; Cloudflare Workers (workerd) →
`@cfworker/json-schema`. Cloudflare Workers users can remove explicit
`jsonSchemaValidator` configuration. You don't need to install `ajv`, `ajv-formats`, or
`@cfworker/json-schema` for the default path. To customize the built-in backend, import
the named class from the explicit subpath
(`@modelcontextprotocol/{client,server}/validators/ajv` or `…/cf-worker`) — importing
from a subpath means the corresponding peer dep must be in your `package.json`.

### `Client.connect(transport, { prior })` — connect from a cached era verdict

Probe once, persist `client.getDiscoverResult()` (`JSON.stringify`), and feed it to
every worker as `client.connect(transport, { prior: { kind: 'modern', discover } })`.
New exported types
`ConnectOptions` (extends `RequestOptions` with `prior?: PriorDiscovery`)
and `PriorDiscovery` — a cached era verdict: the modern arm wraps a `DiscoverResult`
(zero round trips), the legacy arm (`{ kind: 'legacy' }`) skips the probe and runs the
plain `initialize` handshake for servers known to be pre-2026. Freshness is the
supplying host's responsibility — date cached legacy verdicts in your own storage and
stop supplying them past your policy horizon (a stale one succeeds silently against an
upgraded server).

### Serving the 2026-07-28 revision

`createMcpHandler`, `serveStdio`, `versionNegotiation`, multi-round-trip requests
(`requestState`), client cancellation via stream-close, `subscriptions/listen`,
`Mcp-Param-*` headers, and per-era wire codecs are covered in
**[support-2026-07-28.md](./support-2026-07-28.md)** — they are net-new in v2, not v1→v2
breaks.

---

## Unchanged APIs

The following are unchanged between v1 and v2 apart from the import path — except
where an entry notes its own signature change:

- `Client` constructor and `connect`, `close`, and the typed verbs (`listTools`,
  `listPrompts`, `listResources`, `readResource`, …) — note `callTool()` and `request()`
  signatures changed (schema parameter dropped for spec methods).
- `McpServer` constructor, `server.connect(transport)`, `server.close()`, and the
  `McpServer.server` accessor — still the supported way to call the low-level
  `Server`'s push verbs (`createMessage` / `listRoots` / `sendLoggingMessage` — ⚠
  `@deprecated`, see [§Deprecated in v2](#deprecated-in-v2-sep-2577)) outside a
  handler context.
- The server Streamable HTTP transports' **constructor options** (`sessionIdGenerator`,
  `onsessioninitialized`, `onsessionclosed`, `enableJsonResponse`, `eventStore`,
  `retryInterval`) and the `handleRequest` surface — only the class name and import
  moved: `StreamableHTTPServerTransport` is now `NodeStreamableHTTPServerTransport`
  from `@modelcontextprotocol/node`, a thin wrapper over
  `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/server`,
  which exposes the same options ([decision rule](#imports--transports)). The
  transport-level `closeSSEStream(requestId)` / `closeStandaloneSSEStream()` methods
  keep their v1 names too — only the handler-context accessors moved to `ctx.http`
  ([remap table](#low-level-protocol--handler-context-ctx)).
- `UriTemplate` (v1: `@modelcontextprotocol/sdk/shared/uriTemplate.js`) — `expand` /
  `match` semantics carry over; import it from `@modelcontextprotocol/server` or
  `@modelcontextprotocol/client` (top-level export; the codemod rewrites the path).
- `StreamableHTTPClientTransport`, `SSEClientTransport` constructors and options —
  including resumability: the per-request `resumptionToken` / `onresumptiontoken`
  request options carry over from v1 unchanged
  ([Resume a dropped stream](../serving/sessions-state-scaling.md#resume-a-dropped-stream)).
- `StdioClientTransport` and `StdioServerTransport` — **import path moved** to the
  `./stdio` subpath and gained an optional `maxBufferSize` ([Imports & transports](#imports--transports)).
- The **`Transport` interface contract** — `start` / `send` / `close`, `onmessage` /
  `onclose` / `onerror`, optional `sessionId` and `setProtocolVersion`,
  `TransportSendOptions`, `MessageExtraInfo`. Hand-rolled v1 transports (recording
  wrappers, test doubles, decorators) compile and run against v2 with only the import
  path updated. v2 adds **optional** members only — `hasPerRequestStream` and
  `setSupportedProtocolVersions` on the interface, `requestSignal` / `headers` /
  `onRequestStreamEnd` on `TransportSendOptions` — which matter only for 2026-era
  per-request-stream cancellation and `Mcp-Param-*` header attachment
  ([support-2026-07-28.md](./support-2026-07-28.md)).
- All TypeScript **type** definitions from `types.ts` (except the aliases listed under
  [Removed type aliases](#removed-type-aliases) and the `experimental` capability
  payload narrowing — see [Types & schemas](#types--schemas)).
- Tool, prompt, and resource callback return types.

> The `Server` (low-level) constructor and **most** of its methods are unchanged, but
> `setRequestHandler` / `setNotificationHandler` and `request()` signatures changed
> ([Low-level protocol](#low-level-protocol--handler-context-ctx)). In particular,
> `Server.createElicitationCompletionNotifier()` is unchanged — including its
> construction-time client-capability check — for 2025-era URL-mode elicitation
> ([support-2026-07-28.md](./support-2026-07-28.md)). The Zod `*Schema`
> constants are **not** part of the unchanged surface — they moved to
> `@modelcontextprotocol/core` ([Types & schemas](#types--schemas)).

---

## Need help?

- The codemod's [`@mcp-codemod-error`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/codemod/README.md) markers point
  at every site it could not safely rewrite.
- The [Troubleshooting](../troubleshooting.md) page covers common errors and their fixes.
- Runnable [examples](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/examples)
  for every subsystem.
- Open an issue on [GitHub](https://github.com/modelcontextprotocol/typescript-sdk/issues).
