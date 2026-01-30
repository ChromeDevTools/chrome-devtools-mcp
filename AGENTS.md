# AGENTS.md (project local)

## Purpose
- Keep the default workflow and verification steps for this repo.
- Avoid misunderstanding about how Chrome is launched/used during checks.

## Default Assumptions
- Use the **already running** Chrome instance unless explicitly instructed otherwise.
- Do **not** launch a new Chrome profile unless the user asks.
- When loading the extension for local testing, default to `build/extension`.
- For Codex-driven checks, **assume** we should proceed without re-asking these basics.
- Only ask when blocked (missing config, missing tool, permission/GUI restriction, or conflicting explicit user instruction).

## Codex MCP Defaults
- Treat the goal as: **open an existing Chrome tab to ChatGPT and verify send/receive via MCP from Codex**.
- Before asking the user, **inspect local config** (`codex-config.toml`, `server.json`, `.mcp.json`) to find the MCP server name/args.
- If a ChatGPT tab is required, **open it in the existing Chrome** without asking again.
- If a required action cannot be performed from Codex (e.g., GUI permission), report the exact blocker and the minimal user action needed.
- When requesting an extension reload, **always include the extension version** from `src/extension/manifest.json` to avoid ambiguity.
- Never instruct the user to reload the extension **before** running `npm run build` and confirming the version is updated.
- When reporting extension status, **always state**: (1) build done, (2) manifest version, (3) reload required.
- If the task is unfinished and can be continued without user intervention, **keep iterating and re-running verification** until it succeeds or a concrete blocker is found.
- For any steps that do not require user input, **do not wait for permission**; proceed automatically and report outcomes.
- If progress stalls, explicitly propose switching to **Playwright-style transport/flow** once any of these are true:
  - Two successive fixes fail to improve `pages`/`snapshot`.
  - `browser.pages()` remains empty after target/attach fixes.
  - OOM or reconnect loops recur.

## Primary Verification Goal
- Confirm that ChatGPT can open in the browser and that a user can **send and receive** a message (interactive chat works).
- Scope focus: **only ChatGPT/Gemini browser chat I/O**, not full browser automation parity with Playwright.

## Standard Verification Steps (Default)
1. Ensure the MCP server is running (user-provided command or `npx chrome-ai-bridge@latest`).
2. In the **existing Chrome**, open a new tab to `https://chatgpt.com`.
3. Verify the extension can interact with the page (open, focus, send message, receive response).
4. Report the exact observed behavior and any errors.

## Reporting Format
- What was opened (Chrome instance / tab URL)
- What action was attempted (message sent)
- Result (success/failure + exact error text)

## Do Not
- Do not open a new Chrome profile without explicit instruction.
- Do not change user Chrome settings or extensions.
- Do not run destructive commands.

## Change Discipline (Regression Avoidance)
- Do not trade away existing working behavior unless explicitly approved.
- When resolving conflicts, prefer the option that **preserves current auto-connect paths** and avoids manual steps.
- If a change has potential regressions, clearly list the tradeoffs and get approval before proceeding.
## Competitive Baseline (Playwright)
- Do not propose designs that are knowingly weaker than Playwright’s extension2 baseline when the goal is speed/reliability.
- Treat Playwright’s auto-connect and fast CDP forwarding as the minimum bar; avoid “manual steps” fallbacks unless explicitly approved.
- When proposing any design, explicitly state **where it is superior to Playwright** (speed, stability, simplicity, or UX).
