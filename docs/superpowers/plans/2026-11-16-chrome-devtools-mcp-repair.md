# Chrome DevTools MCP Build and Flag Telemetry Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the bundled Chrome DevTools MCP package's build and test workflow, including flag telemetry tests and Windows metadata verification, without weakening checks or changing its DevTools mirror.

**Architecture:** First restore the package's pinned dependency/submodule working state using its own sync script. Then correct compiler/API mismatches only in MCP-owned source and tests, and make the metadata verification script support Windows. Validate the package using its existing npm scripts.

**Tech Stack:** Node.js 24, npm, TypeScript 6, Chrome DevTools MCP test harness, Vercel feature flags.

**Spec:** `docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-repair-design.md`

## Global Constraints

- Do not commit changes under `third_party/devtools-frontend`, weaken compiler settings, or advance dependency pins.
- Fix remaining errors in this repository's own source.
- Use only scripts from `package.json` to run commands.
- Do not reset, discard, or overwrite pre-existing changes.
- Keep the Vercel project unchanged; it currently has no active or archived flags.

## Review Focus

- An incomplete submodule checkout must be repaired from the pinned state, not by advancing its revision.
- A `Browser` API without `restrictNetwork` must not be papered over with unsafe casts or weakened types.
- Missing WebAuthn exports and methods must be handled through APIs actually available to MCP, with existing behavior covered by page tests.
- Geolocation reset/input handling must match the installed Puppeteer type and preserve the intended reset behavior.
- Windows metadata validation must use Windows-compatible path/process behavior and keep Linux CI behavior intact.

---

### Task 1: Restore and verify the pinned package dependencies

**Files:**
- No tracked files should change.
- Validation uses `package.json` scripts and `third_party/devtools-frontend` only as a local synchronized dependency.

**Interfaces:**
- Consumes: the nested repo's `sync`, `build`, and `test:no-build` npm scripts.
- Produces: a locally consistent dependency tree at the existing pinned revisions.

- [ ] **Step 1: Synchronize dependencies from the package script**

Run from the MCP worktree root:

```powershell
npm run sync
```

Expected: npm installs the lockfile dependency set and initializes the revisions already pinned by the repository.

- [ ] **Step 2: Re-run the package build**

```powershell
npm run build
```

Expected: either a clean build or the same remaining compiler errors, now separated from missing generated/submodule files.

- [ ] **Step 3: Run the focused telemetry test without rebuilding if compilation still blocks**

```powershell
npm run test:no-build -- tests/telemetry/flagUtils.test.ts
```

Expected: the flag telemetry test loads its generated dependencies and reports its assertions; it must not fail because the pinned submodule is incomplete.

- [ ] **Step 4: Confirm dependency synchronization did not change tracked pins**

```powershell
git status --short -- third_party/devtools-frontend
```

Expected: no staged or committed changes to the DevTools mirror or its gitlink. If synchronization requires a pin change, stop and report the evidence instead.

### Task 2: Resolve MCP-owned TypeScript API errors

**Files:**
- Modify: `src/index.ts`
- Modify: `src/McpContext.ts`
- Modify: `src/McpPage.ts`
- Modify: `tests/McpContext.test.ts`
- Modify: `tests/McpPage.test.ts`
- Modify: `tests/formatters/ConsoleFormatter.test.ts`
- Modify: `tests/mocks.ts`

**Interfaces:**
- Consumes: the APIs exported by the synchronized pinned DevTools and Puppeteer dependencies.
- Produces: MCP source and test doubles that typecheck against those APIs without casts or suppressed diagnostics.

- [ ] **Step 1: Address the watcher inference error in `src/index.ts`**

Use the local watcher API's declared type to break the recursive initializer inference at the reported `watcher` declaration. Keep the existing watcher lifecycle and callbacks unchanged.

- [ ] **Step 2: Correct network-restriction usage in `McpContext`**

Use only a method present on the installed `Browser` API. Update the existing `McpContext.test.ts` cases and `tests/mocks.ts` stubs to assert the supported API and retain the current allow/deny behavior.

- [ ] **Step 3: Correct WebAuthn access in `McpPage`**

Replace the unavailable `WebAuthnModel`/`removeAuthenticator` references with the supported MCP/Puppeteer API, or stop if the behavior is owned by DevTools and cannot be fixed outside the mirror. Update the related `McpPage.test.ts` expectations and mocks without introducing `any`, type assertions, or ignored errors.

- [ ] **Step 4: Correct geolocation typing and formatter fixture**

Make the `McpPage` geolocation call conform to `GeolocationOptions` while preserving the established reset behavior. Update the `ConsoleFormatter.test.ts` fixture to use the current `Frame` type instead of the removed `toUiLocation` property.

- [ ] **Step 5: Run focused and full package validation**

```powershell
npm run build
npm run test tests/McpContext.test.ts
npm run test tests/McpPage.test.ts
npm run test tests/formatters/ConsoleFormatter.test.ts
```

Expected: the build and focused tests pass. Do not proceed by excluding errors originating in `third_party/devtools-frontend`; if they remain after synchronization, report the upstream blocker. Run the full suite after Task 3 in Task 4.

### Task 3: Make metadata-version verification work on Windows

**Files:**
- Modify: `scripts/verify-server-json-version.ts`
- Test: `tests/verify-server-json-version.test.ts`

**Interfaces:**
- Consumes: the existing metadata-version source and platform-specific filesystem/process behavior.
- Produces: the same pass/fail result on Windows and Linux without changing the script's version-comparison contract.

- [ ] **Step 1: Add a regression test for Windows execution**

Add a test that exercises the verifier's Windows path/command selection and confirms that a matching package/server version succeeds. Add a mismatch case that confirms the verifier still fails with its existing actionable error.

- [ ] **Step 2: Run the focused test and confirm it fails on the current implementation**

```powershell
npm run test tests/verify-server-json-version.test.ts
```

Expected: the test reproduces the current unsupported-platform failure on `win32`.

- [ ] **Step 3: Implement Windows-compatible platform handling**

Update the verifier to support `win32` using Node's platform APIs and Windows-compatible paths/process invocation. Preserve the existing Linux behavior and error semantics; do not shell out to a Linux-only executable on Windows.

- [ ] **Step 4: Run Windows and package validation**

```powershell
npm run test tests/verify-server-json-version.test.ts
npm run verify-server-json-version
npm run build
npm run test
```

Expected: the focused test, Windows verifier, build, and all package tests pass.

### Task 4: Review the final change set

**Files:**
- Review: all modified files in this nested MCP repository.

- [ ] **Step 1: Run the package formatter and lint checks**

```powershell
npm run format
```

Expected: formatting and lint checks pass. Review any formatter changes and retain only changes related to this repair.

- [ ] **Step 2: Confirm the final diff stays within scope**

Verify that the change contains only MCP-owned source/tests and the repair plan/spec; no `third_party/devtools-frontend` source or pin change is included.

- [ ] **Step 3: Commit the implementation**

```powershell
git add src/index.ts src/McpContext.ts src/McpPage.ts tests/McpContext.test.ts tests/McpPage.test.ts tests/formatters/ConsoleFormatter.test.ts tests/mocks.ts scripts/verify-server-json-version.ts tests/verify-server-json-version.test.ts
git commit -m "fix: restore Chrome DevTools MCP validation" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
