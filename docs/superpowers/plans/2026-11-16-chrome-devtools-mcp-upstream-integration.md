# Chrome DevTools MCP Upstream Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the approved official Chrome DevTools MCP upstream revision into the isolated repair branch, preserving local work and restoring a reproducible build and flag telemetry test.

**Architecture:** Create a normal merge commit from the exact approved upstream commit `dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a` into `fix/devtools-mcp-flags-errors`. Keep upstream's GN/Ninja build system and DevTools gitlink, preserve local retry/catalog work and history, then validate with the package's existing sync, build, and test scripts.

**Tech Stack:** Git, Git submodules, Node.js 24, npm, TypeScript, GN/Ninja, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-upstream-integration-design.md`

## Global Constraints

- Merge the exact official MCP commit `dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a`.
- Preserve all local feature commits and their history; do not rebase, reset, or replace the branch.
- Do not push to GitHub or merge into a shared branch.
- Do not edit files inside `third_party/devtools-frontend`; the submodule may move only to the gitlink selected by upstream.
- Retain the official upstream GN/Ninja build pipeline and its supported DevTools pin.
- Do not change Vercel flags or storefront behavior.
- Do not add Windows support to `verify-server-json-version`, which is intentionally Linux-only.
- Do not weaken type checks, suppress diagnostics, or perform unrelated refactors.
- If a conflict cannot be resolved without guessing the intended local behavior, stop and report it.

## Review Focus

- A changed upstream ref must not silently replace the approved commit; verify the exact commit object before merging.
- Local retries for transient `puppeteer.connect` failures must survive upstream changes; retain the bounded three-attempt behavior with 500 ms linear backoff and run `tests/browser.test.ts`.
- Upstream `ServerConfig` and browser test changes must remain intact alongside the retry regression test; run the complete browser test file and full suite.
- The submodule index and checkout must match upstream's exact `08f67fe94eef8c632a069c37b82d08606386c86f` pin without nested source edits; verify after sync.
- Telemetry tests must run only after generated build artifacts exist; build first, then run `tests/telemetry/flagUtils.test.ts`.

---

### Task 1: Finalize and commit the approved integration documents

**Files:**

- Modify: `docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-repair-design.md`
- Modify: `docs/superpowers/plans/2026-11-16-chrome-devtools-mcp-repair.md`
- Modify: `docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-upstream-integration-design.md`
- Create: `docs/superpowers/plans/2026-11-16-chrome-devtools-mcp-upstream-integration.md`

**Interfaces:**

- Consumes: the approved upstream-integration spec and the completed pin-repair findings.
- Produces: a clean, committed documentation state before the merge; the old pin-only repair artifacts clearly identify their status and successor.

- [ ] **Step 1: Verify branch, approved upstream object, and the known documentation-only worktree**

Run from the MCP repository root:

```powershell
git status --short
git branch --show-current
git rev-parse origin/main
git cat-file -e 'dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a^{commit}'
```

Expected: branch is `fix/devtools-mcp-flags-errors`; `origin/main` resolves to `dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a`; the exact commit object exists; the three previously modified repair/integration documents are the only pre-existing modified paths, and this plan is the only new documentation file.

- [ ] **Step 2: Mark the pin-only repair artifacts as superseded by this integration**

The repair design and plan must state that commit `86cf6b8d` restored the reachable pin and `npm run sync` passed, while the corrected-pin build and telemetry validation remained blocked. The integration design must retain its approved direction and frozen upstream SHA.

- [ ] **Step 3: Check whitespace and confirm that no source or submodule files are staged**

```powershell
git diff --check
git status --short
git diff --name-only
```

Expected: no whitespace errors; only the four listed documentation files are modified or untracked.

- [ ] **Step 4: Commit the approved plan and documentation updates**

```powershell
git add docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-repair-design.md docs/superpowers/plans/2026-11-16-chrome-devtools-mcp-repair.md docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-upstream-integration-design.md docs/superpowers/plans/2026-11-16-chrome-devtools-mcp-upstream-integration.md
git commit -m "docs: plan Chrome DevTools MCP upstream integration" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: one documentation-only commit and a clean worktree.

### Task 2: Merge the approved upstream commit and preserve local behavior

**Files:**

- Merge: all paths changed by upstream commit `dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a`
- Resolve only if needed: `src/BrowserManager.ts`, `tests/browser.test.ts`, and `third_party/devtools-frontend`

**Interfaces:**

- Consumes: Task 1's clean branch and exact upstream commit.
- Produces: one non-fast-forward merge commit with the Task 1 branch head as first parent and the approved upstream SHA as second parent.

- [ ] **Step 1: Capture the first parent and verify the frozen upstream SHA**

```powershell
$localParent = (git rev-parse HEAD).Trim()
$upstream = 'dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a'
if ((git rev-parse origin/main).Trim() -ne $upstream) { throw 'origin/main no longer matches the approved frozen SHA; merge only the recorded SHA.' }
git status --short
```

Expected: the worktree is clean. `$localParent` records the exact branch head that must remain the merge's first parent.

- [ ] **Step 2: Merge only the approved commit**

```powershell
git merge --no-ff --no-edit $upstream
```

Expected: Git creates a merge commit or reports conflicts for explicit resolution; do not substitute another upstream revision.

- [ ] **Step 3: Resolve any conflict while keeping both upstream compatibility and local behavior**

The known overlapping paths are `src/BrowserManager.ts`, `tests/browser.test.ts`, and the DevTools submodule gitlink. In the TypeScript files, retain upstream's current APIs and build-compatible changes while keeping local `connectWithRetry` behavior: at most three calls to `puppeteer.connect`, with 500 ms multiplied by the attempt number between retries, and rethrow the final error. Keep the retry regression assertion and upstream `ServerConfig`/browser tests. For the submodule conflict, resolve to upstream's exact `08f67fe94eef8c632a069c37b82d08606386c86f` gitlink; do not edit the nested checkout's source. If a conflict requires guessing, stop without committing and report the path and competing behavior.

If a behavior or interface must change to resolve a conflict, first add or update the focused test in the owning test file, run it to demonstrate the missing behavior, then make the smallest resolution and rerun it.

- [ ] **Step 4: Verify the two merge parents and local history**

```powershell
$parents = (git rev-list --parents -n 1 HEAD).Trim().Split(' ')
if ($parents.Length -ne 3 -or $parents[1] -ne $localParent -or $parents[2] -ne $upstream) { throw 'Merge commit does not have the approved parents in the expected order.' }
git merge-base --is-ancestor $localParent HEAD
if ($LASTEXITCODE -ne 0) { throw 'Pre-merge local history is not an ancestor of the merge commit.' }
git merge-base --is-ancestor $upstream HEAD
if ($LASTEXITCODE -ne 0) { throw 'Approved upstream history is not an ancestor of the merge commit.' }
```

Expected: the merge has exactly the captured local parent and approved upstream commit as parents, and both histories remain reachable.

- [ ] **Step 5: Verify the upstream submodule gitlink**

```powershell
git ls-tree HEAD third_party/devtools-frontend
git -C third_party\devtools-frontend rev-parse HEAD
git -C third_party\devtools-frontend status --short
```

Expected: both the superproject gitlink and checked-out submodule resolve to `08f67fe94eef8c632a069c37b82d08606386c86f`; the nested working tree has no source changes.

### Task 3: Synchronize, build, and run regression tests

**Files:**

- Test: `tests/browser.test.ts`
- Test: `tests/telemetry/flagUtils.test.ts`
- No source changes are expected unless a merge conflict exposed a behavior change covered by Task 2's test-first rule.

**Interfaces:**

- Consumes: Task 2's merge commit and its upstream GN/Ninja scripts.
- Produces: sync, build, focused regression, and complete package test results for the merged tree.

- [ ] **Step 1: Synchronize dependencies with the official package script**

```powershell
npm run sync
```

Expected: dependency install, submodule update, and `gclient-sync.ts` complete successfully.

- [ ] **Step 2: Confirm sync did not edit tracked DevTools source**

```powershell
git -C third_party\devtools-frontend rev-parse HEAD
git -C third_party\devtools-frontend status --short
git status --short
```

Expected: nested HEAD remains `08f67fe94eef8c632a069c37b82d08606386c86f`; no source files are modified by synchronization.

- [ ] **Step 3: Run the merged GN/Ninja build**

```powershell
npm run build
```

Expected: `scripts/ninja.ts` completes without TypeScript or generated-protocol errors.

- [ ] **Step 4: Run the local browser retry regression test**

```powershell
npm run test:no-build -- tests/browser.test.ts
```

Expected: the browser tests pass, including successful connection after a transient first `puppeteer.connect` failure.

- [ ] **Step 5: Run the flag telemetry regression test**

```powershell
npm run test:no-build -- tests/telemetry/flagUtils.test.ts
```

Expected: the telemetry test file loads its generated dependencies and all assertions pass.

- [ ] **Step 6: Run the complete package test suite**

```powershell
npm run test
```

Expected: the build and complete Node.js test suite pass. If any step fails, retain the exact diagnostic and classify it as dependency sync, build generation/type checking, local conflict resolution, test assertion, or environment failure; do not suppress it or modify DevTools mirror source.

### Task 4: Review the final integration state

**Files:**

- Review: the complete MCP repository diff and merge history.

**Interfaces:**

- Consumes: Tasks 1-3's committed documentation, merge commit, and validation results.
- Produces: a clean and auditable branch state ready for the user to decide how to integrate it; no push is performed.

- [ ] **Step 1: Confirm the branch, merge history, submodule, and worktree state**

```powershell
git branch --show-current
git status --short
git log -1 --oneline --decorate
git rev-list --parents -n 1 HEAD
git ls-tree HEAD third_party/devtools-frontend
git -C third_party\devtools-frontend status --short
```

Expected: branch remains `fix/devtools-mcp-flags-errors`; worktree and nested submodule are clean; the merge parents and `08f67fe94eef8c632a069c37b82d08606386c86f` pin are correct.

- [ ] **Step 2: Review the change summary for forbidden scope**

```powershell
git diff --stat dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a..HEAD
git diff --submodule=log dc0055828a9fcdcf8c3e65f7ecd1847c53fd972a..HEAD -- third_party/devtools-frontend
```

Expected: the branch preserves the local history and changes; the only DevTools change is the approved gitlink, with no Vercel or storefront changes and no edits inside the mirror.
