---
name: cookie-debugging
description: Uses Chrome DevTools MCP for inspecting, debugging, and testing cookies, session state, authentication issues, and cookie consent compliance. Use when diagnosing 401/403 errors, authentication redirects, session expiration, Cookie/Set-Cookie header issues, cookie banner consent conformance, or third-party cookie/SameSite/Partitioned cookie warnings.
---

## Core Concepts

### HttpOnly vs JavaScript Access

Cookies marked `HttpOnly` cannot be accessed or modified by client-side JavaScript (`document.cookie` or `cookieStore`). However, the browser **automatically attaches active HttpOnly cookies to outgoing HTTP request headers (`Cookie`)**.

- To inspect current `HttpOnly` values: Look at the `Cookie` request header of any outgoing HTTP request via `get_network_request`.
- To inspect how cookies were created or configured: Look at the `Set-Cookie` response header of login/auth responses.
- To inspect non-`HttpOnly` cookies: Use `evaluate_script` with snippets from [references/cookie-snippets.md](references/cookie-snippets.md).

### Session Strategy: Live Tab vs Isolated Context

Choose the right session environment to avoid state contamination (e.g., residual analytics or auth tokens):

| Strategy                            | When to Use                                                                   | Setup / Teardown                                                                                              |
| :---------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **Live Tab (Active Page)**          | Diagnosing an active user session, live 401/403 error, or current state.      | Operates directly on the currently selected page.                                                             |
| **Clean-Slate (`isolatedContext`)** | Testing cookie consent banners, first-time visits, or zero-cookie guarantees. | Call `new_page` with a unique `isolatedContext` (e.g. `"consent-audit-1"`). When finished, call `close_page`. |

### Client-Side Capabilities & Limitations

| Action                                                           | JavaScript (`document.cookie` / `cookieStore`)        | DevTools Network & Context Tools                        |
| :--------------------------------------------------------------- | :---------------------------------------------------- | :------------------------------------------------------ |
| **Read Non-HttpOnly**                                            | ✅ `document.cookie` / `cookieStore.getAll()`         | ✅ `get_network_request` (Request `Cookie`)             |
| **Read HttpOnly**                                                | ❌ Blocked by browser security                        | ✅ `get_network_request` (Request `Cookie`)             |
| **Inspect Attributes** (`Domain`, `Path`, `SameSite`, `Expires`) | ⚠️ `cookieStore.getAll()` (Chrome only, non-HttpOnly) | ✅ `get_network_request` (Response `Set-Cookie`)        |
| **Modify / Delete Non-HttpOnly**                                 | ✅ `document.cookie = "name=; max-age=0"`             | N/A                                                     |
| **Modify / Delete HttpOnly**                                     | ❌ **Silent failure** in JavaScript                   | ✅ Use `new_page(isolatedContext: ...)` for clean state |

> [!WARNING]
> Attempting to clear an `HttpOnly` cookie via `document.cookie = "SESSION_ID=; max-age=0"` will silently fail. To test in an unauthenticated or fresh state, always spawn a new isolated context using `new_page` with `isolatedContext`.

---

## Workflow Patterns

### 1. Diagnosing Authentication Failures & Redirects (401 / 403)

When an authenticated page request fails, returns 401/403, or redirects to login:

1. **List Recent Requests**: Call `list_network_requests` with `includePreservedRequests: true`.
2. **Find the Target Request**: Locate the failing request (401/403) or redirect (302/307).
3. **Inspect Outgoing `Cookie` Header**: Call `get_network_request` with the `reqid`.
   - Verify if the `Cookie` header was attached and whether required tokens (e.g. `SESSION_ID`, `auth_token`) were sent.
4. **Trigger Active Inspection (If no recent request exists)**:
   - If the cookie was set in a previous session and no network call is listed, trigger a request:
     - Use `navigate_page` with `reload: true`, OR
     - Call `evaluate_script` with `() => fetch(window.location.href)`
   - Then call `get_network_request` on the new request to inspect the active `Cookie` header.
5. **Trace the Setting Request**: If the cookie is missing or rejected:
   - Check earlier login/handshake responses for `Set-Cookie` directives:
     - **Path mismatch**: e.g., `Path=/api` when the request is to `/`.
     - **Domain mismatch**: e.g., `Domain=api.example.com` preventing cookies on `sub.example.com`.
     - **Secure flag on HTTP**: `Secure` cookies are never sent over unencrypted `http://`.
     - **SameSite blocking**: `SameSite=Strict` cookies are omitted on cross-site navigations.
     - **Expiration**: Check if `Expires` or `Max-Age` elapsed.

### 2. Cookie Banner & Consent Conformance Testing

To verify that no non-essential or tracking cookies are set before consent or when declining:

1. **Start Clean**: Open a fresh isolated context with a dedicated name:
   ```json
   {"url": "<PAGE_URL>", "isolatedContext": "consent-test-1"}
   ```
2. **Record Baseline Cookies**: Before interacting with the banner, run `evaluate_script` with the **"Parse document.cookie" snippet** from [references/cookie-snippets.md](references/cookie-snippets.md).
3. **Inspect Premature Network Requests & Issues**:
   - Call `list_network_requests` to ensure no third-party tracking beacons fired before consent.
   - Call `list_console_messages` with `types: ["issue"]` to check for tracking warnings.
4. **Interact with Consent Banner**:
   - Capture snapshot with `take_snapshot` to locate the "Decline" or "Reject All" button `uid`.
   - Click the button with `click`.
5. **Verify Cookie Difference**:
   - Run `evaluate_script` with the **"Cookie Diff / Comparison Helper" snippet** from [references/cookie-snippets.md](references/cookie-snippets.md), passing the baseline cookie map.
   - Assert that only strictly necessary or consent-state cookies exist.
6. **Teardown Context**: Call `close_page` when the audit is complete to prevent leftover cookies from affecting subsequent tasks.

### 3. Auditing Cookie Security, SameSite & CHIPS (Partitioned Cookies)

1. **Fast-Track: Native DevTools Issues (Recommended)**:
   - Call `list_console_messages` with:
     ```json
     {
       "types": ["issue"],
       "includePreservedMessages": true
     }
     ```
   - Check for `CookieIssue` entries, such as:
     - `SameSiteNoneInsecure`: `SameSite=None` without `Secure`.
     - `ThirdPartyCookiePhaseout`: Third-party cookie blocked or restricted.
     - `SchemefulSameSite`: Cross-scheme cookie issues.
     - `PartitionedCookies`: Invalid CHIPS partitioning attributes.
2. **Deep Audit: Lighthouse Third-Party Cookies**:
   - Run `lighthouse_audit` with `mode: "navigation"` and `outputDirPath: "/tmp/lh-report"`.
   - **Extract the specific cookie audit** without loading the full report into context:
     ```bash
     node -e "const r=require('/tmp/lh-report/report.json'); const a=r.audits['third-party-cookies']; console.log(JSON.stringify({score: a?.score, displayValue: a?.displayValue, items: a?.details?.items}))"
     ```

### 4. Client-Side Cookie Inspection & Manipulation

For client-accessible, non-`HttpOnly` cookies (e.g., UI preferences, non-sensitive feature flags):

1. **Read Cookies**:
   - Use `evaluate_script` with the **"Parse document.cookie" snippet** from [references/cookie-snippets.md](references/cookie-snippets.md).
   - Use the **"Query Modern CookieStore API" snippet** to inspect metadata (paths, domains, expiration) where supported.
2. **Set / Modify Cookie**:
   - Update client-accessible cookie via `evaluate_script`:
     ```js
     document.cookie = 'theme=dark; path=/; max-age=86400; SameSite=Lax';
     ```
3. **Delete Cookie**:
   - Clear client cookie by setting max-age to 0:
     ```js
     document.cookie = 'theme=; path=/; max-age=0';
     ```

---

## Troubleshooting

- **Cookie not visible in `document.cookie`**: The cookie is marked `HttpOnly`. Trigger a network request and call `get_network_request` to view it in the `Cookie` request header.
- **`document.cookie` deletion did not work**: The cookie is `HttpOnly` or requires matching `Path` and `Domain` parameters. Use a fresh `isolatedContext` with `new_page` for a clean slate.
- **Cookie set in response but not sent in requests**:
  - Verify if page is `http://` while cookie specifies `Secure`.
  - Check if `Domain` restricts subdomains.
  - Check `list_console_messages(types: ["issue"])` for browser rejection reasons.
- **Residual cookies contaminating audits**: Always use `new_page` with a unique `isolatedContext` when running compliance tests, and call `close_page` when done.
