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
- **Clean up stubs**: `tests/setup.ts` runs `sinon.restore()` after every test. Do not add `afterEach(() => sinon.restore());` to test suites.

### Test Cleanliness

- Do not add redundant comments or verbose JSDoc for short, self-describing mock functions or tests.
- Only test real scenarios; avoid testing redundant or artificial calls that cannot happen in real usage.
- Use current year (2026) in copyright headers for new test files.

# Pre-submit checklist

Complete every item before you upload a PR or push a new revision.

## Scope and PR description

- [ ] The PR contains one change. Move unrelated refactors, renames,
      formatting changes, and build or compiler changes into their own PR.
- [ ] The PR title, the commit type (`fix:`, `feat:`, `chore:`), and the
      squash commit message describe the same change. A change to a default
      value or to tool output is a `fix:` or a `feat:`, not a `chore:`.
- [ ] The PR description lists every user-visible behavior change, including
      changes to other tools that share the changed code path.
- [ ] The PR description matches the shipped behavior. Remove claims about
      fixes that the diff does not contain.
- [ ] The PR description names new functions that have no production caller
      yet, or the PR removes them.
- [ ] The branch is rebased onto `main` and has no merge conflicts.
- [ ] `npm run gen` ran after a change to a tool schema, a tool description,
      or a CLI option. The generated files are committed.
- [ ] `npm run format` ran. No line is longer than 80 columns.
- [ ] `npm run test` passed locally. CI failures on all platforms are your
      responsibility.

## Design

- [ ] The change lives in the lowest layer that owns the data: page logic in
      `McpPage`, context logic in `McpContext`, formatting in
      `src/formatters/*`. `McpResponse` does not resolve pages or workers.
- [ ] If Puppeteer or devtools-frontend owns the bug, fix it there first. Do
      not copy or re-implement upstream code in this repository.
- [ ] Puppeteer internals are imported only through `src/third_party/index.ts`.
- [ ] Repeated code is one helper. Extract a helper when the same block
      appears two or more times. Prefer an existing helper or a Puppeteer
      utility (for example `Deferred`) over a new one.
- [ ] A new formatter class exposes `toJSON()` and `toString()`, and
      `toString()` uses the `toJSON()` output.
- [ ] A function with three or more optional parameters takes one options
      object. Do not pass positional `undefined` placeholders.
- [ ] Each default value is declared in one place.
- [ ] A new behavior is opt-in by default when a wrong classification fails
      silently (for example a config option is restart-required unless the
      author marks it reloadable).
- [ ] An invalid combination of flags or options is rejected by the type
      system where possible, not only by a comment.
- [ ] No public method exists only to serve a test. Put shared helpers in
      `src/utils/*`.
- [ ] Parameter validation lives in the Zod schema (`refine`, `coerce`), not
      in the handler. Validation runs before the handler changes any state.
- [ ] Numeric validation matches what the consumer accepts. Use
      `Number.isInteger` and a range check where CDP expects integers.

## Correctness and edge cases

- [ ] A failed external call does not leave stale state. Restore the previous
      value when a call rejects.
- [ ] An error path still produces the artifacts and partial results the
      agent needs before it throws.
- [ ] An async operation that a timeout can abandon checks that its target
      (browser, page, config) is still current when it resumes.
- [ ] A lock or guard is acquired and released exactly once. A helper that
      releases a guard throws when the guard is already released.
- [ ] Concurrent callbacks (watchers, reloads, event handlers) are
      serialized. A transient failure does not trigger a callback.
- [ ] A filesystem operation that races with another process tolerates the
      race (`fs.rmSync(path, {force: true})` or `try/catch`), not
      `existsSync` + an unguarded call.
- [ ] A failed lookup falls back to the previous behavior. It does not turn
      a healthy state into an error state.
- [ ] No synchronous process spawn or blocking call runs in a polling loop
      or in a hot function.
- [ ] `dispose()` releases every resource the object created, and runs for
      objects that are already closed.
- [ ] Event listeners added for one action are removed when the action ends.
- [ ] Cached page-side state is refreshed before use. The page can reload
      between tool calls.
- [ ] Behavior shared by all tools that act on the selected page also runs
      for tools defined with `defineTool`, not only `definePageTool`.
- [ ] String and URL parsing handles userinfo, escaped delimiters, ports,
      pattern groups, and empty or whitespace-only input. Use the full
      authority, not a heuristic on the first or last character.
- [ ] Truncation uses `Intl.Segmenter` graphemes, not `string.slice`.
- [ ] Secrets never reach logs. Redact headers, URL userinfo, and query
      strings in every log line, including process startup arguments.
- [ ] A filesystem path parameter is validated with `validatePath()` even
      when the value parses as a URL. The error says what the parameter
      expects.
- [ ] A value that crosses a process boundary (daemon IPC, CLI) is
      serialized with `JSON.stringify` when it is not a primitive.
- [ ] An identifier is issued only for items that a tool can resolve later.
- [ ] A dedup key never collapses for items without identifying fields.
      Use a counter or skip such items.
- [ ] An error message names the exact condition that failed, with the
      relevant values (pid, timeout, URL, parameter name).
- [ ] A thrown non-`Error` value keeps its content in the error message.
      Treat objects with a string `message` like `Error`.
- [ ] Optional chaining and `?? default` are not applied to values whose
      type is non-optional.
- [ ] Version-dependent behavior (Node, Chrome, OS) is tested on every
      version the `engines` field allows, or the test does not depend on it.

## Tests

- [ ] Every new or changed function has a test that calls it. A function
      with no caller in `src/` and no test is removed from the PR.
- [ ] Every review request of the form "add a test for X" has a test whose
      name includes X.
- [ ] A new test for a bug fails on `main` without the fix. Remove
      assertions that pass with and without the fix.
- [ ] A `notCalled` assertion targets the first method the handler calls
      after the step under test, not a method inside a callback that a stub
      never runs.
- [ ] A test for a selected branch also asserts that the other branch was
      not taken.
- [ ] Assertions use `calledOnceWithExactly` or
      `calledWithExactly(stub.nthCall, ...)`. Use `calledOnceWithMatch` only
      for arguments that cannot be exact (for example an `AbortSignal`) or
      when an overloaded signature forces `sinon.match.same`.
- [ ] Options that the handler derives from its input are asserted, not
      only the call count.
- [ ] Test names describe the asserted behavior. Rename the test when the
      assertion changes.
- [ ] `if (value) { assert... }` does not appear in tests. Use
      `assert.ok(value)` before the dependent assertions.
- [ ] Real-browser tests exist only for behavior that mocks cannot observe.
      A test file contains at most one slow end-to-end run per scenario.
- [ ] A real-browser test that counts requests filters `favicon.ico`.
- [ ] A real-browser test that waits for CDP events waits on the session or
      result of the code under test, not on a new `createCDPSession()`.
- [ ] Every awaited event in a test has a bounded timeout. Positive-path
      tests poll for the condition instead of a fixed sleep.
- [ ] New reusable stubs and fixtures live in `tests/mocks.ts` and build on
      `sinon.createStubInstance`. No hand-rolled fixture uses `as unknown as`.
- [ ] Mock options that equal the default value are not passed.
- [ ] Temporary directories use `using dir = createTempDir(...)` from
      `tests/utils.ts`, not `fs.mkdtemp`.
- [ ] A test never reads the developer's home directory and never calls
      `process.exit`. Stub locators and pass `exitProcess = false`.
- [ ] When a real-browser test is replaced with mocks, each branch the old
      test covered still has a test.
- [ ] A test does not repeat a round-trip that another test already covers.
      Stop after the first assertion that proves the change.

## Documentation and output

- [ ] A tool description states the exact behavior, including when a
      parameter is ignored or depends on another parameter.
- [ ] Skills stay generic. Add one short note in the tool-selection section
      instead of a feature-specific workflow.
- [ ] Inline comments are one sentence. Remove comments that repeat an
      existing TSDoc.
- [ ] Response text that depends on a condition prints only when the
      condition is true.
