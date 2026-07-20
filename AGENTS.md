This repository contains an MCP server and CLI for Chrome DevTools.

# Instructions

- Use only scripts from `package.json` to run commands.
- Use `npm run build` to run tsc and test build.
- Use `npm run test` to build and run tests, run all tests to verify correctness.
- Use `npm run test path-to-test.ts` to build and run a single test file, for example, `npm run test tests/McpContext.test.ts`.
- Use `npm run format` to fix formatting and get linting errors.

## Rules for TypeScript

- Do not use `any` type.
- Do not use `as` keyword for type casting.
- Do not use `!` operator for type assertion.
- Do not use `// @ts-ignore` comments.
- Do not use `// @ts-nocheck` comments.
- Do not use `// @ts-expect-error` comments.
- Prefer `for..of` instead of `forEach`.

## Testing Layering

When writing tests, follow this layered approach:

1. **Tool Tests (`tests/tools/*.test.ts`)**: Should test that tools correctly
   configure the `McpResponse` based on their inputs.
2. **Data Fetching Tests (`tests/McpResponse.test.ts`)**: Should test that data
   is correctly fetched from the browser based on the `McpResponse`
   configuration. These tests should use snapshots. Data fetching should happen
   in McpResponse ONLY if it is used by more than one tool.
3. **Formatter Tests (`tests/formatters/*.test.ts`)**: Should test that mock
   data is formatted and output correctly by the formatters. These tests should
   use snapshots.
