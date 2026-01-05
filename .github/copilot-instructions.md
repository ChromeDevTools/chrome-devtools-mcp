# Guidance for AI coding agents working on chrome-devtools-mcp

This file contains short, actionable guidance for an AI coding agent to be productive in this repository.

1. Purpose (big picture)
   - This repo implements an MCP server that exposes Chrome DevTools functionality to MCP clients.
   - High-level flow: MCP client -> `McpContext` -> tool dispatcher (`src/tools/*`) -> `DevToolsConnectionAdapter` / `PageCollector` -> Puppeteer + DevTools.

2. Key files & why they matter
   - `src/McpContext.ts` — request lifecycle, context and quota handling.
   - `src/DevToolsConnectionAdapter.ts` — adapter between MCP tools and DevTools/Puppeteer.
   - `src/tools/ToolDefinition.ts` and `src/tools/*.ts` — where each MCP tool is defined; modify here to add/update tools.
   - `src/PageCollector.ts` — collects and manages trace/pages when recording performance.
   - `src/formatters/*` — formatting functions for console, network and snapshot outputs.
   - `third_party/devtools.ts` — mappings and constants derived from DevTools frontend.
   - `server.json` — server metadata; `scripts/verify-server-json-version.ts` validates this.

3. Build / test / doc workflows (exact commands)
   - Node requirement: Node v20.19+ (see `package.json.engines`).
   - Build (compile + post-process): `npm run build` (runs `tsc` then `scripts/post-build.ts`).
   - Build+bundle (production): `npm run bundle` (also runs Rollup). After bundling, `build/src` is the runtime output.
   - Start server (dev): `npm run start` or `npm run start-debug` (sets `DEBUG=mcp:*`).
   - Tests: tests run against the transpiled build. Typical sequence: `npm run build && npm run test:no-build` or simply `npm run test`.
   - Generate docs / tool reference: `npm run docs` (calls `scripts/generate-docs.ts`). The README contains an auto-generated tools block; update docs after editing `src/tools/*`.

4. Project-specific conventions & gotchas
   - Tests run against `build/tests/*` and rely on `build/tests/setup.js` being imported. Always run `npm run build` first.
   - The build pipeline uses `node --experimental-strip-types` in post-build. Do not assume plain `tsc` output is fully runnable without `post-build` steps.
   - The `bin` entry points to `build/src/index.js`: changes to CLI entry must be reflected in the build output.
   - Tool definitions are canonical sources for the public MCP surface; changing `src/tools/*` often requires regenerating the docs (`npm run docs`).
   - Lint/format: `npm run format`; `eslint_rules/` contains custom rules used by CI.

5. Integration points & external deps
   - Puppeteer (`puppeteer`) is used to drive Chrome. `DevToolsConnectionAdapter` and `PageCollector` contain the Puppeteer interactions.
   - DevTools frontend assets: `chrome-devtools-frontend` is a dependency; `third_party/devtools.ts` references generated artifacts.
   - Many runtime behaviors are controlled by CLI flags (see README for `--browser-url`, `--ws-endpoint`, `--isolated`, etc.).

6. When editing code, practical examples
   - Adding a new tool: add `src/tools/mytool.ts`, update exports in `src/tools/tools.ts`, run `npm run build` and `npm run docs` to update the README tools list.
   - Fixing a formatter: update `src/formatters/*.ts` and run unit tests (`npm run build && npm run test:no-build`).
   - Debugging live behavior: use `npm run start-debug` and set `DEBUG=mcp:* DEBUG_COLORS=false` to reproduce logs similar to CI.

7. Useful places to check before changes
   - `README.md` — contains overall guidance and auto-generated tools block.
   - `docs/tool-reference.md` — canonical documentation of tools and their inputs/outputs.
   - `scripts/` — build/post-build/docs generation behaviors.
   - `tests/` — examples of how tools are used and what outputs/fixtures look like (snapshots live under `tests/*/*.snapshot`).

8. Safety & scope
   - This project exposes browser content via MCP — avoid adding code that leaks secrets into logs or public responses. Follow existing patterns for masking or avoiding sensitive content.

If any section is unclear or you want more examples (e.g., a walkthrough of adding a tool end-to-end), I can expand specific parts. Please tell me which area you'd like more detail on.
