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
