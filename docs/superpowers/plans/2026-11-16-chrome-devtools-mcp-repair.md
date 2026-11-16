# Chrome DevTools MCP Dependency Pin and Flag Telemetry Repair Plan

> **Status:** Task 1's pin correction is complete in commit `86cf6b8d`, and dependency sync passed. Task 2's build/telemetry validation was blocked by compiler diagnostics and missing generated output. This plan is superseded for further recovery by `docs/superpowers/plans/2026-11-16-chrome-devtools-mcp-upstream-integration.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreproducible DevTools submodule pin and validate the MCP package build and flag telemetry test against the corrected upstream dependency.

**Architecture:** Change only the superproject gitlink to the reachable parent of the local-only DevTools commit. Synchronize using the package's own scripts, then run the build and telemetry tests; do not modify vendored DevTools source or infer additional fixes until the corrected baseline is known.

**Tech Stack:** Node.js 24, npm, TypeScript 6, Chrome DevTools MCP package scripts, Git submodules.

**Spec:** `docs/superpowers/specs/2026-11-16-chrome-devtools-mcp-repair-design.md`

## Global Constraints

- The `third_party/devtools-frontend` gitlink must be `1e16983d27a40f1e449fe73503e6fdbb797c31d4`.
- Do not edit files under `third_party/devtools-frontend`.
- Do not advance to an arbitrary latest DevTools revision.
- Do not weaken compiler settings or suppress diagnostics.
- Do not change the Vercel project or the Linux-only metadata verifier contract.
- Use package scripts for dependency synchronization, build, and tests.

## Review Focus

- The index and checked-out submodule must agree on the exact approved SHA after synchronization.
- Dependency installation and `prepare` must not rewrite tracked files under the DevTools mirror.
- The telemetry test must be run only after a successful build so generated modules exist.
- Windows refusal by `verify-server-json-version` is intentional; CI gates that command to Linux.
- Any remaining compiler errors must be classified from the corrected pin's output, not copied from the old broken-pin report.

---

### Task 1: Restore the reachable upstream DevTools pin

**Files:**

- Modify: `third_party/devtools-frontend` (superproject gitlink only)
- No DevTools source files may change.

**Interfaces:**

- Consumes: the verified upstream commit `1e16983d27a40f1e449fe73503e6fdbb797c31d4`.
- Produces: a reproducible DevTools submodule state that `npm run sync` can fetch from the configured official remote.

- [ ] **Step 1: Check the submodule working tree and pin before changing it**

Run from the MCP repository root:

```powershell
git status --short
git -C third_party\devtools-frontend rev-parse HEAD
git ls-tree HEAD third_party/devtools-frontend
```

Expected: the only pre-existing modified files are the revised repair plan and spec; the current submodule HEAD and gitlink are `2f4e5dd4098fec1711f54de67c3597d10409a269`.

- [ ] **Step 2: Check out the approved upstream parent**

```powershell
git -C third_party\devtools-frontend checkout --detach 1e16983d27a40f1e449fe73503e6fdbb797c31d4
git add third_party/devtools-frontend
```

Expected: only the submodule gitlink is staged; leave the revised repair plan and spec unstaged, and do not modify source files inside the submodule.

- [ ] **Step 3: Synchronize dependencies with the repository script**

```powershell
npm run sync
```

Expected: npm installation and submodule initialization complete without a missing-object or `not our ref` error.

- [ ] **Step 4: Verify the exact pin and source cleanliness**

```powershell
git -C third_party\devtools-frontend rev-parse HEAD
git diff --name-only -- third_party/devtools-frontend
git -C third_party\devtools-frontend status --short
git diff --cached --submodule=log -- third_party/devtools-frontend
```

Expected: submodule HEAD is `1e16983d27a40f1e449fe73503e6fdbb797c31d4`; the only staged change is the gitlink; the nested DevTools worktree is clean.

- [ ] **Step 5: Commit the dependency correction**

```powershell
git commit -m "fix: restore reachable DevTools frontend pin" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: one commit changing only the superproject gitlink.

### Task 2: Validate the corrected MCP build and flag telemetry

**Files:**

- No source files should change in this validation task.
- Test: `tests/telemetry/flagUtils.test.ts` (existing regression coverage)

**Interfaces:**

- Consumes: Task 1's synchronized dependency tree and the existing npm scripts.
- Produces: a verified build and telemetry test result that establishes whether further source work is needed.

- [ ] **Step 1: Run the package prepare script**

```powershell
npm run prepare
```

Expected: `devtools-frontend submodule is ready.` and no tracked source changes.

- [ ] **Step 2: Run the package build**

```powershell
npm run build
```

Expected: TypeScript compilation and post-build complete without errors.

- [ ] **Step 3: Run the focused telemetry flag test**

```powershell
npm run test:no-build -- tests/telemetry/flagUtils.test.ts
```

Expected: the test file loads and all assertions pass.

- [ ] **Step 4: Run the full package test suite**

```powershell
npm run test
```

Expected: the package build and complete test suite pass.

- [ ] **Step 5: Report any remaining independent failure without widening this pin repair**

If a command fails, record its full diagnostic and whether it originates in MCP-owned source, generated output, or the unchanged DevTools mirror. Do not edit source, advance the pin, or suppress checks under this task; create a focused follow-up plan from that corrected-baseline evidence.

### Task 3: Review the final change set

**Files:**

- Review: the nested MCP repository's complete diff.

- [ ] **Step 1: Confirm the diff contains only the approved pin and repair documents**

```powershell
git status --short
git diff --stat
git diff --submodule=log -- third_party/devtools-frontend
```

Expected: no DevTools source edits, no Vercel changes, and no unrelated files.

- [ ] **Step 2: Commit any remaining repair-document updates**

If the spec or plan was revised during execution, commit only those documents with a descriptive message and the required co-author trailer. Do not create an empty commit.
