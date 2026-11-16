# Chrome DevTools MCP Upstream Integration

## Intent

Restore a working and reproducible Chrome DevTools MCP package on the isolated repair branch while preserving the local feature commits. The Vercel project itself has no active or archived flags; the package's flag telemetry test remains the relevant regression check.

## Current state

- The isolated repair branch is `fix/devtools-mcp-flags-errors`, currently at `86cf6b8dee66bbaabe38ab7d427ffaf04e3a2a19`.
- The invalid local-only DevTools gitlink was replaced with reachable upstream parent `1e16983d27a40f1e449fe73503e6fdbb797c31d4`; `npm run sync` now succeeds.
- This source branch still fails its direct TypeScript build with compiler errors across MCP source, tests, and mocks, plus errors in the unchanged DevTools mirror. The focused telemetry test cannot load the generated `intl-messageformat.esm.js` artifact because the build does not reach post-build.
- The official MCP `main` is `dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a` and pins DevTools `08f67fe94eef8c632a069c37b82d08606386c86f`.
- Testing that official pin alone in a disposable worktree produced 339 TypeScript diagnostics: the current branch's direct `tsc` build does not generate DevTools protocol modules required by that revision. Official `main` uses a coordinated GN/Ninja build pipeline and contains fixes in several of the failing MCP files.
- The local feature history contains 11 commits not in refreshed `origin/main`; refreshed official `main` is 74 commits ahead. The upstream integration changes many files and is not a pin-only repair.

## Approved direction

Merge the refreshed official `origin/main` into the isolated repair branch using a normal merge commit. Preserve all local feature commits and their history; do not rebase, reset, or replace the branch. Resolve merge conflicts to retain the local feature behavior and tests while adopting the coherent upstream build system, source fixes, and supported DevTools pin. The user approved this broader integration after reviewing the merge-versus-backport tradeoff.

## Goals

- Integrate the exact refreshed upstream commit `dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a` into `fix/devtools-mcp-flags-errors`.
- Preserve the local branch's unique commits as ancestors of the resulting merge commit.
- Retain the official upstream GN/Ninja build pipeline and the DevTools submodule pin used by that upstream commit.
- Resolve conflicts without weakening type checks or deleting the local retry/catalog work.
- Validate the resulting package build and flag telemetry behavior using the package's existing scripts.

## Non-goals

- Pushing to GitHub or merging into a shared branch.
- Changing Vercel flags or storefront behavior.
- Editing files inside `third_party/devtools-frontend`; the submodule may move only to the gitlink selected by upstream.
- Rewriting local branch history with rebase, reset, or amend.
- Adding Windows support to `verify-server-json-version`, which is explicitly Linux-only.
- Performing unrelated refactors beyond what is necessary to resolve genuine merge conflicts.

## Merge and conflict policy

1. Confirm the isolated branch is clean except for the already-reviewed repair spec/plan documentation and capture the exact merge parents.
2. Merge only the refreshed `origin/main` commit named above; do not fetch or merge an additional revision mid-task.
3. Keep all local commits reachable. When conflict resolution changes behavior or an interface, add or update a focused test first, verify it fails for the intended reason, then implement the minimal resolution.
4. Do not change upstream DevTools mirror source. Preserve upstream's generated-source build through its repository scripts; do not manually fabricate generated protocol files.
5. If a conflict cannot be resolved without guessing the intended local behavior, stop and report the exact conflict rather than silently dropping either side.

## Validation

- `npm run sync` completes against the merged upstream gitlink.
- `npm run build` completes using the merged GN/Ninja scripts.
- `npm run test:no-build -- tests/telemetry/flagUtils.test.ts` passes after a successful build.
- `npm run test` passes the complete package suite.
- The merge commit has both the pre-merge repair head and the approved `origin/main` SHA as parents; local commits remain in its ancestry.
- The working tree is clean, and no Vercel or nested DevTools source changes were introduced by conflict resolution.

## Failure handling

If dependency sync, build, or tests still fail after the upstream merge, retain the exact diagnostics and identify whether they arise from upstream state, local conflict resolution, or environment constraints. Do not suppress errors or modify the DevTools mirror to force a green result. Stop for a focused follow-up design if the remaining failure requires a different architectural choice.
