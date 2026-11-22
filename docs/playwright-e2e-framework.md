# Playwright E2E framework

The repository includes an opt-in Playwright framework under `playwright/`
and `e2e/playwright/`.

## Setup

Install browser binaries once:

```bash
npx playwright install chromium
```

Copy `.env.example` to `.env.test` and fill only the values used by the target
QA environment. Do not commit credentials or authentication state. The
framework does not disable TLS validation or browser security warnings.

Run the framework with:

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
```

The default target is `https://example.invalid`; set `QA_BASE_URL` to the
authorized QA environment before running tests.

## Persistent authentication

Set `QA_LOGIN_URL`, `QA_USERNAME`, and `QA_PASSWORD`, then run
`e2e/playwright/auth.setup.ts` with Playwright. The setup stores only the
browser storage state under `PLAYWRIGHT_STORAGE_STATE` (by default
`.auth/storage-state.json`). Use test accounts and rotate or revoke test
credentials normally.

The login selectors can be overridden with `QA_USERNAME_SELECTOR`,
`QA_PASSWORD_SELECTOR`, and `QA_LOGIN_SUBMIT_SELECTOR`.

Bitwarden can supply a test password instead of an environment variable:

```ts
const password = await getBitwardenPassword({
  itemIdOrName: 'QA smoke test account',
});
```

Set `BW_SESSION` by authenticating the Bitwarden CLI separately. The helper
passes the session to the CLI process but never prints or logs the secret.

## Jira metadata and bug tickets

Tests can add Jira metadata with the `jiraMetadata()` annotation:

```ts
test(
  'scenario',
  {
    annotation: jiraMetadata({
      projectKey: 'QA',
      issueType: 'Bug',
      labels: ['e2e', 'smoke'],
    }),
  },
  async ({page}) => {
    // Test implementation.
  },
);
```

Set `JIRA_CREATE_BUGS=true`, `JIRA_BASE_URL`, `JIRA_EMAIL`,
`JIRA_API_TOKEN`, and `JIRA_PROJECT_KEY` to opt in to automatic bug-ticket
creation for failed tests. API credentials are read from environment variables
and are not written to reporter output.

## Apollo runtime monitoring

Call `attachApolloRuntimeMonitor(page)` in a test. The helper records GraphQL
HTTP failures and GraphQL `errors` responses. `APOLLO_GRAPHQL_PATH` narrows
response matching; without it, matching uses JSON GraphQL responses from the
page. Call `apollo.assertNoGraphQLErrors()` when GraphQL errors should fail the
test.

Apollo cache snapshot integration is intentionally explicit: applications may
expose cache state in incompatible globals or extensions. Capture cache state
through a page fixture only for an approved QA application and never log or
serialize authentication fields.
