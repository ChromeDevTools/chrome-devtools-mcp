---
name: cookie-debugging
description: Uses Chrome DevTools MCP for inspecting, debugging, and testing cookies, session state, authentication issues, and cookie consent compliance. Use when diagnosing 401/403 errors, authentication redirects, session expiration, Cookie/Set-Cookie header issues, cookie banner consent conformance, or third-party cookie/SameSite/Partitioned cookie warnings.
---

## Core Concepts

**HttpOnly vs JavaScript Access**: Cookies marked with the `HttpOnly` flag are hidden from `document.cookie` and the JavaScript `cookieStore` API for security. To inspect `HttpOnly` cookies, you must examine HTTP network traffic:

- Use `list_network_requests` to identify relevant requests (e.g. initial document navigation, login/API endpoints, 401 responses).
- Use `get_network_request` to view incoming `Cookie` request headers and outgoing `Set-Cookie` response headers.

**Isolated Browser Contexts**: When testing cookie consent banners or diagnosing fresh user sessions, persistent browser profiles may retain old cookies. Use `new_page` with `isolatedContext: "<context_name>"` to spawn a completely fresh, isolated session with a clean cookie jar and storage.

**Cookie Lifecycle & Eviction**:

- Expired cookies (`Max-Age=0` or past `Expires` dates) are automatically purged by Chrome. They do not appear in the active cookie jar. To diagnose why a cookie vanished or failed, check the preceding response's `Set-Cookie` header in `get_network_request`.
- Missing `Secure` flag on HTTPS or missing `Domain`/`Path` scoping can cause cookies not to be attached to subsequent fetch/XHR requests.

## Workflow Patterns

### 1. Diagnosing Authentication Failures & Redirects (401 / 403)

When an authenticated page request fails or redirects to login:

1. **List Requests**: Call `list_network_requests` with `includePreservedRequests: true` to inspect the full navigation and redirect history.
2. **Find the Failing Request**: Locate the request returning a `401 Unauthorized`, `403 Forbidden`, or unexpected `302/307 Redirect`.
3. **Inspect Request Headers**: Call `get_network_request` with the `reqid` of the failing request.
   - Check if the `Cookie` header was sent.
   - Verify that required session/auth tokens (e.g. `SESSION_ID`, `auth_token`) are present.
4. **Trace the Setting Request**: If the cookie is missing or invalid:
   - Inspect earlier login or auth handshake requests with `get_network_request`.
   - Check the `Set-Cookie` response header:
     - Is `Path` too restrictive (e.g. `Path=/api` when the page is at `/`)?
     - Is `Domain` mismatched (e.g. `Domain=api.example.com` instead of `.example.com`)?
     - Is `Secure` missing on HTTPS, or present on HTTP?
     - Is `SameSite` set to `Strict` on top-level cross-site navigations?
     - Has `Expires` or `Max-Age` already elapsed?

### 2. Cookie Banner & Consent Conformance Testing

To verify that a site complies with privacy consent rules (e.g. zero tracking cookies set before consent or when declining):

1. **Start Clean**: Open a fresh isolated context:
   ```json
   {"url": "<PAGE_URL>", "isolatedContext": "consent-test"}
   ```
2. **Record Baseline Cookies**: Before interacting with the banner, run `evaluate_script` with the **"Parse document.cookie" snippet** from [references/cookie-snippets.md](references/cookie-snippets.md) to record pre-consent cookies.
3. **Inspect Cookie Issues & Network**:
   - Check `list_network_requests` to see if analytics/tracking scripts were triggered prematurely.
   - Check `list_console_messages` with `types: ["issue"]` for third-party cookie or tracking warnings.
4. **Interact with Consent Banner**:
   - Use `take_snapshot` to locate the "Decline" or "Reject All" button `uid`.
   - Call `click` on the decline button.
5. **Verify Cookie Difference**:
   - Run `evaluate_script` with the **"Cookie Diff / Comparison Helper" snippet** from [references/cookie-snippets.md](references/cookie-snippets.md).
   - Assert that only strictly necessary/consent-preference cookies were set, and no tracking/marketing cookies exist.

### 3. Auditing Cookie Security, SameSite & CHIPS (Partitioned Cookies)

Chrome flags cookie policy violations and deprecated behaviors via DevTools Issues.

1. **Check Native DevTools Issues**:
   - Call `list_console_messages` with:
     ```json
     {
       "types": ["issue"],
       "includePreservedMessages": true
     }
     ```
   - Look for `CookieIssue` entries in the returned issues, including:
     - `SameSiteNoneInsecure`: Cookie with `SameSite=None` without `Secure`.
     - `ThirdPartyCookiePhaseout`: Third-party cookie blocked or restricted.
     - `SchemefulSameSite`: Cross-scheme context issues.
     - `PartitionedCookies`: Partitioned attribute issues.
2. **Run Lighthouse Best Practices & Privacy Audit**:
   - Run `lighthouse_audit` with `mode: "navigation"`.
   - Inspect the `third-party-cookies` audit in the report to identify third-party tracking cookies that will be blocked in modern browsers.

### 4. Client-Side Cookie Inspection & Manipulation

For non-`HttpOnly` cookies (e.g. UI state, client feature flags, theme settings):

1. **Read Cookies**:
   - Use `evaluate_script` with the **"Parse document.cookie" snippet** from [references/cookie-snippets.md](references/cookie-snippets.md).
   - For modern Chromium environments supporting the Cookie Store API, use the **"Query Modern CookieStore API" snippet** to get structured metadata (domains, paths, expiration).
2. **Set / Modify Cookie**:
   - Use `evaluate_script` to update a client-accessible cookie:
     ```js
     document.cookie =
       'feature_flag=beta_ui; path=/; max-age=3600; SameSite=Lax';
     ```
3. **Delete Cookie**:
   - Expire the cookie immediately:
     ```js
     document.cookie = 'feature_flag=; path=/; max-age=0';
     ```

## Troubleshooting

- **Cookie not visible in `document.cookie`**: The cookie is almost certainly marked `HttpOnly`. Call `get_network_request` on the network call to verify it in the `Cookie` or `Set-Cookie` HTTP headers.
- **Cookie set in response but not sent in subsequent requests**:
  - Check if the page is on `http://` while the cookie has the `Secure` flag.
  - Check if the `Domain` attribute excludes subdomains.
  - Check if `SameSite=Strict` is blocking cross-origin requests.
  - Call `list_console_messages` with `types: ["issue"]` to see if Chrome rejected the cookie upon receipt.
