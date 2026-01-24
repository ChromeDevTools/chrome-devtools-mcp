# WebAuthn MCP Tools Implementation Plan

## Overview

Adding WebAuthn CDP domain support to chrome-devtools-mcp using strict outside-in behavior- and test-driven development.

**Branch**: `feat/webauthn-support`
**Fork**: `git@github.com:ed-lepedus-thenvoi/chrome-devtools-mcp.git`

## Goal (Definition of Done)

A user can:
1. Enable WebAuthn virtual authenticator environment via MCP tool
2. Add a virtual authenticator (CTAP2/U2F, internal/USB/BLE/NFC)
3. Use WebAuthn on a webpage (e.g., webauthn.io) with the virtual authenticator responding
4. Optionally: add pre-seeded credentials, get/remove credentials

## Key Architecture Findings

### How Tools Are Structured

- **Tool Registry**: `src/tools/tools.ts` - exports all tools as array
- **Tool Definition**: Use `defineTool()` helper from `src/tools/ToolDefinition.ts`
- **Categories**: Defined in `src/tools/categories.ts` (use `EMULATION` for WebAuthn)

### How to Access CDP Session

```typescript
const page = context.getSelectedPage();
const session = page._client() as CDPSession;
await session.send('WebAuthn.enable');
```

This pattern is used in `src/PageCollector.ts` for `Audits.enable`.

### Test Pattern

Tests use `withMcpContext()` helper from `tests/utils.ts`:

```typescript
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {withMcpContext} from '../utils.js';
import {enableWebAuthn} from '../../src/tools/webauthn.js';

describe('webauthn', () => {
  it('enables WebAuthn CDP domain', async () => {
    await withMcpContext(async (response, context) => {
      await enableWebAuthn.handler({params: {}}, response, context);
      // Verify by checking response or trying CDP operations
    });
  });
});
```

### WebAuthn CDP Commands Available

- `WebAuthn.enable` / `WebAuthn.disable`
- `WebAuthn.addVirtualAuthenticator` → returns `{authenticatorId: string}`
- `WebAuthn.removeVirtualAuthenticator`
- `WebAuthn.addCredential`
- `WebAuthn.getCredentials`
- `WebAuthn.removeCredential`
- `WebAuthn.clearCredentials`
- `WebAuthn.setUserVerified`

## Implementation Steps (Outside-In TDD)

### Phase 1: Minimal Vertical Slice

#### Step 1.1: Observe Missing Functionality
- [x] Verify no `webauthn_*` tools exist in MCP
- [x] Navigate to webauthn.io, confirm we can't do WebAuthn without virtual authenticator

#### Step 1.2: Failing Test - Tool Exists
Create `tests/tools/webauthn.test.ts`:
```typescript
it('webauthn_enable tool can be called')
```
Run: `npm run test -- --test-name-pattern="webauthn"`
Expected: FAIL (module not found)

#### Step 1.3: Implement - Minimal Tool Skeleton
- Create `src/tools/webauthn.ts` with `enableWebAuthn` tool (no-op handler)
- Export from `src/tools/tools.ts`
- Run test: Should PASS
- Commit: `feat(webauthn): add webauthn_enable tool skeleton`

#### Step 1.4: Verify Tool Appears in MCP
- Rebuild: `npm run build`
- Check if MCP picks up changes (may need restart)
- Verify tool appears

#### Step 1.5: Failing Test - Enable Actually Works
```typescript
it('enables WebAuthn so addVirtualAuthenticator succeeds', async () => {
  await withMcpContext(async (response, context) => {
    await enableWebAuthn.handler({params: {}}, response, context);
    const session = context.getSelectedPage()._client();
    // This should succeed only if WebAuthn.enable was called
    const result = await session.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal' }
    });
    assert.ok(result.authenticatorId);
  });
});
```
Run: FAIL (WebAuthn not enabled)

#### Step 1.6: Implement - CDP Call
Add to handler:
```typescript
await context.getSelectedPage()._client().send('WebAuthn.enable');
```
Run test: PASS
Commit: `feat(webauthn): implement WebAuthn.enable CDP call`

#### Step 1.7: Verify via MCP
- Call `webauthn_enable` tool
- Confirm no error

#### Step 1.8: Failing Test - Add Authenticator Tool
```typescript
it('adds virtual authenticator and returns ID')
```
Run: FAIL (tool doesn't exist)

#### Step 1.9: Implement - Add Authenticator
- Add `addVirtualAuthenticator` tool with params: protocol, transport, hasResidentKey, hasUserVerification, isUserVerified
- Run test: PASS
- Commit: `feat(webauthn): add webauthn_add_authenticator tool`

#### Step 1.10: E2E Verification
1. Navigate to webauthn.io
2. Call `webauthn_enable`
3. Call `webauthn_add_authenticator` with ctap2/internal/userVerified
4. Fill username, click Register
5. Verify registration succeeds

Commit: `test(webauthn): verify e2e with webauthn.io`

### Phase 2: Expand Coverage

After vertical slice works:
- `webauthn_disable`
- `webauthn_remove_authenticator`
- `webauthn_get_credentials`
- `webauthn_add_credential`
- `webauthn_remove_credential`
- `webauthn_clear_credentials`
- `webauthn_set_user_verified`

### Phase 3: Polish
- Error handling tests
- Run `npm run docs` to update documentation
- Run `npm run check-format` and fix any issues
- Full test suite pass

## Local Development Setup

```bash
# MCP is configured to use local build:
# claude mcp add-json chrome-devtools '{"command": "node", "args": ["/tmp/chrome-devtools-mcp-investigation/build/src/index.js"]}'

# Build after changes:
cd /tmp/chrome-devtools-mcp-investigation && npm run build

# Run specific tests:
npm run test -- --test-name-pattern="webauthn"

# Run all tests:
npm run test

# Check formatting:
npm run check-format
```

## Notes

- Node version: v24.9.0 (compatible)
- Baseline: 288/288 tests passing
- License header required on new files (see existing files for format)
- MCP may need restart after rebuild to pick up changes (TBD - need to verify)

## Files to Create/Modify

1. **Create**: `src/tools/webauthn.ts` - Tool definitions
2. **Modify**: `src/tools/tools.ts` - Add exports
3. **Create**: `tests/tools/webauthn.test.ts` - Tests

## Reference: Emulation Tool Pattern

From `src/tools/emulation.ts`:
```typescript
export const emulate = defineTool({
  name: 'emulate',
  description: '...',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    param1: zod.string().optional().describe('Description'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    // ... implementation
    response.appendResponseLine('Status message');
  },
});
```

## Reference: Test Utilities

From `tests/utils.ts`:

- `withMcpContext(callback)` - Spawns browser, creates McpContext, calls callback
- `McpResponse` - Mock response object with `appendResponseLine()`, etc.
- Access CDP via: `context.getSelectedPage()._client()` returns CDPSession

```typescript
import assert from 'node:assert';
import {describe, it} from 'node:test';
import {withMcpContext} from '../utils.js';
import {myTool} from '../../src/tools/myTool.js';

describe('myTool', () => {
  it('does something', async () => {
    await withMcpContext(async (response, context) => {
      await myTool.handler({params: {...}}, response, context);
      // Assert on response or context state
    });
  });
});
```

## Progress Log

Track each step completion here:

- [ ] Step 1.1: Observe missing functionality
- [ ] Step 1.2: Failing test - tool exists
- [ ] Step 1.3: Implement tool skeleton
- [ ] Step 1.4: Verify tool appears in MCP
- [ ] Step 1.5: Failing test - enable works
- [ ] Step 1.6: Implement CDP call
- [ ] Step 1.7: Verify via MCP
- [ ] Step 1.8: Failing test - add authenticator
- [ ] Step 1.9: Implement add authenticator
- [ ] Step 1.10: E2E verification
