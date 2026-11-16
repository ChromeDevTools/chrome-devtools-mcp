# Chrome DevTools MCP Dependency Pin and Flag Telemetry Repair

> **Status:** The pin correction in this design is complete in commit `86cf6b8d`; `npm run sync` succeeds at the reachable parent revision. Corrected-pin build and telemetry validation remained blocked, so this pin-only design is superseded for further recovery by `docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-upstream-integration-design.md`.

## Context

The linked Vercel project (`builderio-shopify-commerce-headless`, team `dcpllc`) has no active or archived feature flags and no flag evaluation events in the last seven days. The storefront's test, TypeScript, and lint checks pass.

The separately versioned `chrome-devtools-mcp` package is at version 1.12.0. Its `third_party/devtools-frontend` gitlink points at `2f4e5dd4098fec1711f54de67c3597d10409a269`, a local-only commit authored by the MCP repository owner with the same subject as MCP commit `49986d48`. That commit removes a large set of DevTools files and is absent from the configured official DevTools remote, so `npm run sync` cannot fetch it. Its parent, `1e16983d27a40f1e449fe73503e6fdbb797c31d4`, is reachable on the official remote and contains the required DevTools MCP and telemetry source paths.

With the invalid commit restored only from a local object store, the MCP build still reports many type errors, including errors under the DevTools mirror, and the focused telemetry test cannot load a generated `intl-messageformat` module. Those results must be rechecked after restoring a reproducible upstream pin; they are not yet a trustworthy baseline.

The `verify-server-json-version` script explicitly supports macOS and Linux, while the pre-release workflow runs it only on Linux. Its Windows refusal is intentional and is outside this repair.

## Goals

- Replace the unreproducible DevTools gitlink with its reachable upstream parent revision.
- Confirm that a clean package sync and prepare succeed at that pin.
- Re-run the package build and flag telemetry test against the corrected dependency.
- If independent MCP-owned errors remain, keep any follow-up fix strict, tested, and outside the DevTools mirror.

## Non-goals

- Creating or changing Vercel feature flags.
- Updating DevTools to an arbitrary latest revision.
- Editing files under `third_party/devtools-frontend`.
- Adding Windows support to the Linux-only metadata-version verifier.
- Weakening TypeScript checks, suppressing diagnostics, or changing unrelated storefront behavior.

## Proposed approach

1. Change only the `third_party/devtools-frontend` gitlink from `2f4e5dd4098fec1711f54de67c3597d10409a269` to the verified upstream parent `1e16983d27a40f1e449fe73503e6fdbb797c31d4`.
2. Run the package's existing `sync` and `prepare` scripts, and verify the checked-out submodule matches the gitlink with no DevTools source modifications.
3. Run the package build, focused `tests/telemetry/flagUtils.test.ts`, and full test suite. Reassess diagnostics only after this clean baseline; do not infer fixes from errors emitted against the invalid pin.
4. If errors remain, prepare a focused follow-up plan from the new compiler/test output. MCP-owned code may be fixed with behavior-focused tests; DevTools mirror source, type-check settings, and the intentional Linux-only verifier contract remain unchanged.

## Error handling and safety

Do not reset or discard unrelated work. The current isolated worktree was clean before this repair. Keep the approved pin exact; do not advance it to a newer revision as a workaround. Do not edit the nested DevTools source tree. Report any remaining build or test failure precisely rather than hiding or broadly suppressing it.

## Acceptance criteria

- The nested MCP repository records the exact upstream gitlink `1e16983d27a40f1e449fe73503e6fdbb797c31d4`.
- `npm run sync` and `npm run prepare` complete successfully.
- `npm run build`, the focused flag telemetry test, and the package test suite pass, or any remaining independent blocker is documented with its exact output and scope.
- The final change contains no DevTools mirror source edits and no Vercel configuration changes.
