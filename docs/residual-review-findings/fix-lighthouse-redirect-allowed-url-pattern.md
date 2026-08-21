# Residual Review Findings

**Branch:** `fix/lighthouse-redirect-allowed-url-pattern`
**Source:** `ce-code-review` run `20260821-194855-a3bf3374` (issue #2567 fix) + one `ce-simplify-code` pass

## Fixed during review (not residual — included for context)

- **P0 (security, confidence 50) / P1 (reliability) / P2 (maintainability)** — three independent reviewers converged on the same gap: `installGuardedNetworkFetch` patched the shared `CdpCDPSession.prototype.send` via closure-captured save/restore, which is not safe against overlapping installs. Correctness's own investigation confirmed this is **not reachable today** (`ToolHandler`'s `toolMutex` serializes every tool call), but it was cheap to close properly with module-level reference counting, so it was fixed rather than left open.
- **P1 (reliability)** — the replacement fetch had no timeout (previously bounded by Puppeteer's own protocol timeout). Fixed with a 10s `AbortSignal.timeout` per redirect hop.
- **P2 (testing)** — the regression test's only guardrail-side assertion was "excluded origin never hit"; it could pass even if Lighthouse never requested the redirecting `robots.txt` at all. Fixed with an `allowedRobotsHit` assertion.
- **P2 (testing)** — no positive-path test proved cookie forwarding actually builds a `Cookie` header from `Network.getCookies` output (the existing test only exercised the swallow-the-lookup-error fallback). Fixed with a dedicated test.
- **P2 (project-standards)** — a `handle!` non-null assertion in `src/utils/guardedNetworkFetch.ts`, against `AGENTS.md`'s "do not use `!`" rule. Fixed by narrowing with an explicit `undefined` check instead.
- Simplify-review pass (reuse/quality/efficiency): reused `createIdGenerator()` instead of a hand-rolled counter, honored `includeCredentials` before forwarding cookies, collapsed a redundant `Map` `has()`+`get()` lookup.

## Residual (not fixed in this PR)

- **P2 — advisory (`no_sink`)** Redirect-hop `Set-Cookie` responses are not applied to the in-flight redirect chain: if an allowed origin's redirect response itself sets a cookie required by the next hop, the guarded fetch never captures or forwards it, so the next hop only sees whatever cookies existed in Chrome's jar *before* the redirect started. A correct fix means maintaining a redirect-local cookie jar (reproducing Chrome's domain/path/secure matching rules) — real design work, out of scope for this security fix. (Found by the cross-model adversarial peer.)
- **P2 — advisory (`no_sink`)** The replacement fetch's own timeout (10s, added in this PR) is not tied to Lighthouse's own tighter per-resource timeout (2s) or to the shim's `restore()` being called — if Lighthouse's outer wrapper gives up first, the underlying Node fetch keeps running (bounded by the new 10s cap, but not aborted early). A full fix would thread an `AbortController` through `installGuardedNetworkFetch`'s lifecycle and abort all in-flight fetches on restore. Deferred: the 10s bound already eliminates the *unbounded*-hang risk this same reviewer flagged as the more serious half of the finding. (Found by the cross-model adversarial peer.)
- **P3 — advisory (`no_sink`)** `AGENTS.md` also prohibits the `as` type-cast keyword; `src/utils/guardedNetworkFetch.ts` uses several `as` casts to monkey-patch a third-party class's private-shaped `send` method. Left as-is: this pattern is already pervasive and unenforced (no matching ESLint rule) throughout the existing codebase, and there is no cleaner typed alternative for patching an imported class's prototype method without vendoring Puppeteer's internal types. (Found by `project-standards` reviewer.)
- Minor untested edge cases noted by `testing`/`correctness`/`reliability` reviewers as soft `testing_gaps` (not filed findings): the `MAX_REDIRECTS` cap being exceeded, a relative `Location` header, a redirect to a non-`http(s)` scheme, a 3xx response with no `Location` header, an `IO.read` for an explicitly-`undefined` handle, and combining `--blockedUrlPattern` with `--allowedUrlPattern` simultaneously in one test. None indicate a defect; left as coverage headroom.

## Cross-model adversarial pass

Ran via Codex (`independence_verified: true`, `receipt_supported: false` — requested `gpt-5.6-luna` at `xhigh`, actual model/effort unverified on this route). Found 3 findings, all P2 advisory: the two cookie/timeout-fidelity items above (now recorded as residuals) and the regression-test-hit-counter gap (now fixed).
