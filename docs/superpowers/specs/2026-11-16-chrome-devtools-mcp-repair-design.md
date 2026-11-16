# Chrome DevTools MCP Build and Flag Telemetry Repair

## Context

The storefront's linked Vercel project (`builderio-shopify-commerce-headless`, team `dcpllc`) has no active or archived feature flags and no flag evaluation events in the last seven days. No Vercel flag changes are needed.

The repository's main Jest suite, TypeScript check, and ESLint check pass. The separate `chrome-devtools-mcp` repository is at version 1.12.0 and is checked out on a feature branch. Its build fails with TypeScript errors across MCP and bundled DevTools sources; the flag telemetry test cannot load a generated DevTools dependency. The pinned `devtools-frontend` submodule reports an incomplete nested `clang-format` submodule checkout, and its metadata-version verification script fails on Windows with `Unsupported platform: win32`.

## Goals

- Restore a reproducible build and test environment for the pinned MCP/DevTools revisions.
- Fix remaining compiler/API incompatibilities without suppressing or weakening type checks.
- Make the metadata-version verification work on Windows as well as supported Unix platforms.
- Run the telemetry flag regression test and the package's build and test suite.

## Non-goals

- Creating or changing Vercel feature flags.
- Updating the bundled MCP or DevTools dependencies to arbitrary latest revisions.
- Fixing unrelated storefront errors or altering storefront behavior.
- Hiding compiler errors by excluding source files or relaxing TypeScript settings.

## Proposed approach

1. Inspect the nested repository and submodule state in the isolated worktree; preserve the pinned revisions and all existing user changes.
2. Use the package's `sync` script only as a local experiment to restore missing dependency/submodule content. Do not commit edits to `third_party/devtools-frontend` or advance its pin. Re-run typecheck and the telemetry flag test to distinguish checkout/dependency failures from source incompatibilities.
3. Fix remaining errors in this repository's own source, keeping types strict and tests focused on the affected API boundaries and telemetry behavior. If a fix requires changing mirrored DevTools source or its pin, stop and report the evidence rather than working around the upstream issue here.
4. Update the platform-specific metadata-version check to use a supported Windows path/command strategy and add focused coverage for platform behavior.
5. Run the package build, targeted telemetry test, and full test suite; report any errors that remain external or platform-blocked.

## Error handling and safety

Do not reset, discard, or overwrite pre-existing changes. Do not commit changes under `third_party/devtools-frontend`, weaken compiler settings, or advance dependency pins. If synchronization requires changing a pinned revision or if remaining errors indicate an upstream source mismatch, stop and document the evidence before making that broader change.

## Acceptance criteria

- The telemetry flag test passes in the repaired environment.
- The package TypeScript build and test suite pass without weakened checks.
- The metadata-version verification completes on Windows.
- The Vercel project remains unchanged.
- The final diff is limited to the nested MCP repository and its repair documentation.
