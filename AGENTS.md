This repository contains an MCP server and CLI for Chrome DevTools.

# Instructions

- Use only scripts from `package.json` to run commands.
- Use `npm run build` to run tsc and test build.
- Use `npm run test` to build and run tests, run all tests to verify correctness.
- Use `npm run test path-to-test.ts` to build and run a single test file, for example, `npm run test tests/McpContext.test.ts`.
- Use `npm run format` to fix formatting and get linting errors.
- Never modify `third_party/devtools-frontend` except for experimentation: it is a git submodule, a mirror of the actual codebase.

## Rules for TypeScript

- Do not use `any` type.
- Do not use `as` keyword for type casting.
- Do not use `!` operator for type assertion.
- Do not use `// @ts-ignore` comments.
- Do not use `// @ts-nocheck` comments.
- Do not use `// @ts-expect-error` comments.
- Prefer `for..of` instead of `forEach`.
- Never type-check types that are already type safe (e.g. redundant `typeof` checks on statically typed variables).

## Rules for Testing

### Structure and Separation of Concerns

- **Prefer mock-based unit tests over real-browser tests**: Do not use `withMcpContext` or launch a real browser unless the test genuinely requires real browser or DevTools protocol integration (e.g., live CDP events, browser lifecycle, secondary sessions). Puppeteer already tests browser behavior upstream; unit tests run faster and avoid browser overhead.
- **Tool handler tests (`tests/tools/*.test.ts`)**:
  - Test that the tool handler parses/validates parameters and invokes the corresponding methods on `page`, `context`, or `response` with the exact expected arguments.
  - Do **not** reimplement business logic or state tracking inside mocks (e.g., do not simulate state changes in mock methods).
- **Core class tests (e.g., `tests/McpPage.test.ts`)**:
  - Test business logic by instantiating the real class under test with mocked dependencies (e.g., instantiate `new McpPage(...)` with a mocked Puppeteer page from `createMockPuppeteerPage()`).
  - Assert that the class calls the underlying Puppeteer methods with the expected parameters.

### Mocking Guidelines (`tests/mocks.ts`)

- **Centralize mocks in `tests/mocks.ts`**: Keep all reusable mock factories in `tests/mocks.ts`. Import directly from `tests/mocks.ts` (do not re-export from `tests/utils.ts`).
- **Use `sinon.createStubInstance(Class)`**: Do not hand-roll mock objects or define custom mock interfaces. Use `sinon.createStubInstance()` so all prototype methods are automatically stubbed.
- **Typing**: Use `sinon.SinonStubbedInstance<Class>` for mock types (e.g., `MockMcpPage`, `MockMcpContext`, `MockMcpResponse`).
- **Handler mocks helper**: For tool handlers, use `const {page, context, response} = createHandlerMocks();` from `tests/mocks.ts` to set up all three mocks in one call.
- **Keep mocks generic**: Do not tailor mocks to a specific tool or test suite.
- **Naming conventions**: Use `mock` rather than `fake` in helper and variable names (e.g., `createMockPuppeteerPage`, `createMockMcpPage`). Name the mocked Puppeteer page instance `pptrPage`.

### Assertions and Sinon Best Practices

- **Use `sinon.assert` methods**: Do not use Node's `assert.ok(stub.calledOnce)` or `assert.deepStrictEqual(stub.firstCall.args[0], ...)` to verify stub calls.
- **Verify exact arguments**:
  - Use `sinon.assert.calledOnceWithExactly(stub, ...args)` for single calls with exact arguments.
  - Use `sinon.assert.calledWithExactly(stub.secondCall, ...args)` for subsequent calls.
  - Use `sinon.assert.notCalled(stub)` to assert a method was not invoked.
- **Clean up stubs**: Always include `afterEach(() => sinon.restore());` in test suites when using Sinon.

### Test Cleanliness

- Do not add redundant comments or verbose JSDoc for short, self-describing mock functions or tests.
- Only test real scenarios; avoid testing redundant or artificial calls that cannot happen in real usage.
- Use current year (2026) in copyright headers for new test files.

# Pre-submit checklist

Complete every item before you upload a PR or push a new revision. Each item
comes from a review finding or a landed bug fix in this repository.

## Scope and PR description

- [ ] The PR contains one change. Move unrelated renames, blank-line changes,
      build-pipeline changes, and compiler-option changes into their own PR.
- [ ] The PR title, the commit type (`fix:`, `feat:`, `chore:`), and the
      squash commit message describe the same change. A changed default value
      or a new output section is a `feat:` or a `fix:`, not a `chore:`.
- [ ] The PR description lists every user-visible behavior change, including
      changes to tools that share the changed code path (for example
      `list_pages` when `McpResponse` output changes).
- [ ] The PR description matches the shipped behavior. Remove claims about
      fixes that the diff does not contain.
- [ ] The PR description names new functions that have no production caller
      yet, or the PR removes them.
- [ ] The branch is rebased onto `main` and has no merge conflicts.
- [ ] `npm run gen` ran after a change to a tool schema, a tool description,
      or a CLI option. `src/config/cli-options.ts` and
      `docs/tool-reference.md` are committed.
- [ ] `npm run format` ran. No line is longer than 80 columns.
- [ ] `npm run test` passed locally. CI failures on Windows are also your
      responsibility.

## Design

- [ ] The fix lives in the lowest layer that owns the data. Put page logic in
      `McpPage`, context logic in `McpContext`, and formatting in
      `src/formatters/*`. Do not resolve workers or pages in `McpResponse`.
- [ ] If Puppeteer or devtools-frontend owns the bug, fix it there first. Do
      not copy or re-implement `fetchPostData`, `RemoteObjectPreviewFormatter`,
      or similar upstream code in this repository.
- [ ] Puppeteer internals are imported only through `src/third_party/index.ts`.
- [ ] Repeated code is one helper. Extract a helper when the same block
      appears two or more times (for example `parseDecimal`, `getErrorMessage`,
      a truncate helper, a race/timeout helper). Prefer Puppeteer's `Deferred`
      for race and timeout logic.
- [ ] A new formatter class exposes both `toJSON()` and `toString()`, and
      `toString()` uses the `toJSON()` output.
- [ ] Functions with three or more optional parameters take one options
      object. Do not call `fn(undefined, undefined, value)`.
- [ ] A value is declared once. Do not declare the same default in a class
      constant and in `src/config/*-options.ts`.
- [ ] A new option is restart-required unless the author opts it in. A
      reloadable option changes a value that running code reads.
- [ ] New feature flags that can be mistyped are rejected by the type system
      (for example narrow the type to a literal `false` on the variant where
      the flag has no effect).
- [ ] No new public static method exists only to serve a test. Put logging or
      redaction helpers in `src/utils/logger.ts`.
- [ ] Parameter validation lives in the Zod schema (`refine`, `coerce`), not
      in the handler. Validation runs before the handler changes page state.
- [ ] Numeric input validation uses `Number.isInteger` and a positive check
      where CDP expects integers. `Number.isFinite` is not sufficient.

## Correctness and edge cases

- [ ] A failed external call does not leave stale state. Example: when
      `setViewport()` rejects, restore the previous emulation settings.
- [ ] An error path still writes artifacts the agent needs (for example the
      Lighthouse `report.json` and `report.html`) before it throws.
- [ ] An async operation that a timeout can abandon checks that its target
      (browser, page, config) is still current when it resumes.
- [ ] A mutex guard is acquired and released exactly once. A helper that
      releases a guard throws if the guard is already released.
- [ ] Concurrent callbacks (file watcher, `onChange`, reload) are serialized.
      A transient unreadable file does not trigger a callback.
- [ ] File removal that races with another process uses
      `fs.rmSync(path, {force: true})` or a `try/catch`, not
      `existsSync` + `unlinkSync`.
- [ ] A lookup failure (missing `ps`, blocked `powershell.exe`) falls back to
      the previous behavior. It does not report a live process as dead.
- [ ] No synchronous process spawn runs inside a polling loop or on every
      call of a hot function.
- [ ] `dispose()` releases every resource the object created: screencast,
      comment bridge, DevTools session, listeners. `dispose()` also runs for
      a selected page that is already closed.
- [ ] Event listeners added for one action are removed when the action ends.
- [ ] Cached page-side state (for example discovered third-party tools) is
      refreshed before use. The page can reload between tool calls.
- [ ] Code that runs for `definePageTool` tools also runs for `defineTool`
      tools that operate on the selected page (dialog check, page on
      `McpResponse`).
- [ ] String parsing handles userinfo, escaped colons, ports, `{}` and `*`
      groups, and empty or whitespace-only input. Hostname and URL checks use
      the full authority, not a `^\d|\d$` heuristic.
- [ ] Truncation uses `Intl.Segmenter` graphemes, not `string.slice`, so
      surrogate pairs and emoji sequences stay whole.
- [ ] Secrets never reach logs. Redact `wsHeaders`, URL userinfo, and query
      strings in every log line, including daemon startup arguments.
- [ ] Filesystem path parameters are validated with `validatePath()` even
      when the value parses as an `http:`/`ws:` URL. Return an actionable
      error such as `This parameter expects a file path, not a URL.`
- [ ] Object-valued CLI options are serialized with `JSON.stringify`, not
      `String(value)`, when they cross the daemon IPC boundary.
- [ ] Accessibility nodes without `backendNodeId` get no `uid`. A tool cannot
      resolve them.
- [ ] Dedup keys never collapse to `undefined|undefined`. Use a counter or
      skip items that have no identifying fields.
- [ ] Error messages name the exact condition that is awaited or failed (for
      example `daemon (pid N) did not exit within Nms`, not `file not
    removed`).
- [ ] Error messages from throws of non-`Error` values include the thrown
      value. Treat objects with a string `message` like `Error`.
- [ ] Optional chaining and `?? default` are not applied to values whose
      type is non-optional. See "Rules for TypeScript".
- [ ] A version-dependent behavior (Node 22 vs Node 24 URLPattern, Chrome
      minimum window size) is tested on the version the `engines` field
      allows, or the test does not depend on it.

## Tests

- [ ] Every new or changed function has a test that calls it. A function
      with no caller in `src/` and no test is removed from the PR.
- [ ] Every item in a review that says "add a test for X" has a test whose
      name includes X.
- [ ] A new test for a bug fails on `main` without the fix. Check that the
      assertion is not vacuous (for example `redirectChain()` already returns
      a copy, so an "is not mutated" assertion proves nothing).
- [ ] A `notCalled` assertion targets the first method the handler calls
      after the validation under test, not a method inside a callback that a
      stub never runs (`page.waitForEventsAfterAction`, not
      `page.pptrPage.goto`).
- [ ] Branch-selection tests assert the other branch was not taken (for
      example `sinon.assert.notCalled(page.pptrPage.screenshot)` in the
      element-screenshot test).
- [ ] Assertions use `calledOnceWithExactly` or `calledWithExactly(stub.nthCall, ...)`.
      Use `calledOnceWithMatch` only for arguments that cannot be exact
      (`sinon.match.instanceOf(AbortSignal)`) or when an overloaded Puppeteer
      signature forces `sinon.match.same`.
- [ ] Options derived by the handler (for example `count` from `dblClick`,
      `{signal}`) are asserted, not only the call count.
- [ ] Test names describe the asserted behavior. Rename the test when the
      assertion changes.
- [ ] `if (value) { assert... }` does not appear in tests. Use
      `assert.ok(value)` before the dependent assertions.
- [ ] Real-browser tests exist only for behavior that is not observable with
      mocks (for example a `drag` → sleep → `drop` sequence). Each test file
      contains at most one full Lighthouse navigation run.
- [ ] A real-browser test that counts requests filters `favicon.ico`.
- [ ] A real-browser test that waits for CDP events waits on the collector's
      session or result, not on a new `createCDPSession()`.
- [ ] Every awaited event in a test has a bounded timeout. Positive-path
      tests poll for `stub.called` with a timeout instead of a fixed sleep.
- [ ] New reusable stubs (`accessibility`, `mouse`, `createMockAXNode`,
      `createMockConsoleMessage`) live in `tests/mocks.ts` and build on
      `sinon.createStubInstance`. Hand-rolled fixtures with `as unknown as`
      do not exist.
- [ ] Mock options that equal the default value are not passed
      (`experimentalDevtools: false`).
- [ ] Temporary directories use `using dir = createTempDir(...)` from
      `tests/utils.ts`, not `fs.mkdtemp`.
- [ ] Config tests stub the locator and pass `exitProcess = false`. A test
      never reads `~/.config` and never calls `process.exit`.
- [ ] Tests for a removed real-browser test still cover each branch the old
      test covered (for example JPEG without `quality`).
- [ ] Tests do not duplicate an e2e round-trip that another test already
      covers. Stop after the first assertion that proves the fix.

## Documentation and output

- [ ] Tool descriptions state the exact behavior, including when a parameter
      is ignored (for example `pageIdx` without `pageSize`).
- [ ] Skills stay generic. Add one short note in the tool-selection section
      instead of a feature-specific workflow.
- [ ] Inline comments are one sentence. Remove comments that repeat a TSDoc
      that already exists.
- [ ] Response text that depends on a condition prints only when the
      condition is true (for example `Waited Nms` only when the wait reached
      the deadline).
