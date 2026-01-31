# Chrome AI Bridge

## Session Startup Tasks

### Chrome Profile Cleanup Check

**Execute at session start:**

```bash
# Check profiles unused for 30+ days
find ~/.cache/chrome-ai-bridge/profiles -maxdepth 1 -type d -mtime +30 2>/dev/null | while read dir; do
  [ "$dir" != "$HOME/.cache/chrome-ai-bridge/profiles" ] && du -sh "$dir"
done
```

If targets exist: Show list, get user approval, then `rm -rf`.

### Work State Verification - Mandatory

**Execute immediately after context refresh:**

```bash
ls -t docs/log/claude/*.md | head -3
```

Read latest log, understand previous work, report "Resuming from: [summary]".

### Work Log Recording - Required

Create/update `docs/log/claude/[yymmdd_hhmmss-task.md]` at:
- Task start, milestone completion, errors, waiting for verification, task completion

**Log format:**
```markdown
# [Task Summary]

## Status
- Date: YYYY-MM-DD HH:MM
- Status: [in_progress / waiting / completed / error]

## Current Task
[Description]

## Progress
- [x] Done
- [ ] Not done <- here

## Recent Work
- What was done
- What to do next

## Blockers
- [if any]
```

### Git Commit Before Plan Execution - Mandatory

Before `EnterPlanMode -> ExitPlanMode`:
1. Check `git status` for uncommitted changes
2. If changes exist: Ask user "Uncommitted changes found. Commit first?"
3. Approved -> commit, Rejected -> continue with warning

---

## Strict Rules

### chrome-ai-bridge MCP Usage Restrictions - Mandatory

**This MCP server is for ChatGPT/Gemini queries only.**

**Allowed tools:**
- `ask_chatgpt_web` - Ask ChatGPT (default for simple questions)
- `ask_gemini_web` - Ask Gemini
- `ask_chatgpt_gemini_web` - Parallel query (for 三者議論 only)

**Forbidden tools:**
- `take_snapshot`, `take_screenshot` - Don't work
- `click`, `fill`, `hover`, etc. - Don't work
- All other browser operation tools

**Reason:** This MCP is designed for ChatGPT/Gemini connection only. Use Playwright MCP (`mcp__plugin_playwright_playwright__*`) for general browser automation.

---

### Deprecated Scripts - Mandatory

**Do not use:**
- `scripts/start-mcp-from-json.mjs` - Old MCP startup
- `scripts/configure-codex-mcp.mjs` - Codex only
- `scripts/codex-mcp-test.mjs` - Codex only

**Use instead:**
```bash
npm run test:chatgpt -- "question"
npm run test:gemini -- "question"
npm run cdp:chatgpt
npm run cdp:gemini
```

---

### Extension Version - Mandatory

**Bump `manifest.json` version after any `src/extension/` changes.**

```json
// src/extension/manifest.json
"version": "1.1.0",  // <- increment every time
```

Target files: All files under `src/extension/`

---

### Development Flow - Mandatory

**This dev environment uses local path reference, npm publish not needed for dev.**

```json
// ~/.config/claude-code/config.json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": ["/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs"]
    }
  }
}
```

**Standard dev flow:**
```bash
vim src/browser.ts       # 1. Edit
npm run build            # 2. Build
npm run typecheck        # 3. Type check only
git add -A && git commit -m "..." && git push  # 4. Push
```

**Before user verification:**
- If changes include `src/extension/**`: Run `npm run build` first
- Only request verification after build completion

**Testing:**
- `npm test` not needed (slow & existing issues)
- `npm run typecheck` only
- Manual verification after Claude Code restart

**npm publish (for user releases only):**
```bash
# 1. Update version in package.json
# 2. git push
git add -A && git commit -m "chore: bump version" && git push origin main
# 3. Create & push tag manually
git tag vX.X.X && git push origin vX.X.X
# 4. Verify (wait ~30s)
npm view chrome-ai-bridge version
```

**Forbidden:**
- Local `npm publish` (EOTP error - WebAuthn 2FA issue)
- Relying on auto-tag workflow

---

### Efficient Debugging Rules - Mandatory

**Avoid MCP server restarts** - Direct execution is faster.

| Situation | Method |
|-----------|--------|
| Single function debug | Direct execution script |
| E2E verification | MCP |
| UI element investigation | Manual browser check |
| Error identification | Logs + direct execution |

**Test questions - BAN avoidance:**

Forbidden:
- `1+1?` - Obviously a test
- `Connection test` - Automation trace
- `Hello` / `OK` - Meaningless

Recommended:
```
How do I deep copy an object in JavaScript? Include code example.
How to read files asynchronously in Python?
Explain generic types in TypeScript briefly.
```

**Direct execution scripts:**
```bash
npm run build
npm run test:chatgpt
npm run test:gemini
npm run test:both
```

**Log monitoring:**
```bash
tail -f .local/mcp-debug.log
```

---

### ChatGPT/Gemini Question Construction - Required

Include:
1. **Context**: Project, tech stack, situation
2. **Problem**: Symptoms, error messages
3. **Tried**: Solutions attempted and results
4. **Question**: Numbered, specific
5. **Expected format**: Code examples, steps, comparison table

**Good example:**
```
chrome-ai-bridge project: EOTP error during npm publish.

Environment:
- npm 11.3.0 / Node.js 24.2.0
- 2FA: WebAuthn (Touch ID) only

Tried:
1. npm login --auth-type=web -> Success
2. npm publish --auth-type=web -> EOTP error

Questions:
1. Why EOTP error even with auth-type=web?
2. Can I publish with Touch ID only?
3. Is Trusted Publishing (OIDC) a good alternative?

Provide code examples or specific steps.
```

### Timestamp Rule for Logs

Use: `date '+%y%m%d_%H%M%S'` (client local time)
Don't use: `TZ='Asia/Tokyo' date '...'` (no timezone forcing)

---

### AI Query Default Behavior

**Rule:** When user says "ask AI", use `ask_chatgpt_web` (single AI).

**Trigger patterns for single AI (ChatGPT):**
- "ask AI about..."
- "consult AI..."
- "get AI's opinion on..."

**Trigger patterns for multi-AI (三者議論):**
- "三者議論して"
- "深掘りして"
- "複数のAIに聞いて"

**Forbidden:**
- Asking "Which AI should I ask?"
- Using parallel query for simple questions

---

## References

- **Technical spec**: `docs/SPEC.md`
- **Project overview**: `docs/SPEC.md` (Project Overview section)
- **Development workflow details**: `docs/SPEC.md` (Development section)
