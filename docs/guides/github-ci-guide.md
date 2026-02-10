# GitHub Workflow

Use the `gh` CLI to manage commits, PRs, issues, and Actions for this project.

## Setup

### Install gh CLI

**Windows (winget):**
```powershell
winget install GitHub.cli
```

**macOS:**
```bash
brew install gh
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install gh
```

### Authenticate

```powershell
gh auth login
```

Follow prompts (browser or token). Verify with:

```powershell
gh auth status
gh --version
```

When run from this repo, `gh` infers the repository from the current directory. For scripts or when not in the repo: `gh <cmd> --repo $(./scripts/gh-repo.sh)`.

---

## Commits

### Committer Script

Use the scoped commit helper to stage only specified files:

**PowerShell:**
```powershell
.\scripts\committer.ps1 "feat: add verbose flag" src\cli.py tools\check.py
```

**Bash / just:**
```bash
./scripts/committer.sh "feat: add verbose flag" src/cli.py tools/check.py
# or
just commit "feat: add verbose flag" src/cli.py tools/check.py
```

The script resets staging first so only the listed files are included.

### Conventional Commits

Use concise, action-oriented messages:

```
<type>: <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat: implement batch export`
- `fix: resolve null reference in parser`
- `docs: update API authentication guide`

### Grouping

- Group related changes in a single commit
- Each commit should be a logical unit
- Avoid bundling unrelated refactors

---

## Pull Requests

### Creating PRs

PRs should include:
1. **Scope summary**: What changes
2. **Testing**: How it was validated
3. **User-facing changes**: New flags, behavior changes, breaking changes

Example description:
```markdown
## Summary
Add verbose flag to CLI for debugging output.

## Testing
- Unit tests added
- Manual testing with `--verbose` on sample payloads

## User-Facing Changes
- New `--verbose` flag on send command
```

### Reviewing PRs

**Do NOT switch branches.** Use read-only commands:

```bash
gh pr view <number>
gh pr diff <number>
gh pr checks <number>
```

### Landing PRs

1. Ensure clean state: `git switch main` and `git pull`
2. Create temp branch: `git switch -c integrate-pr-<number>`
3. Fetch PR: `gh pr checkout <number> --detach`
4. Merge (squash or rebase depending on history)
5. Run gate check: `uv run python tools/check.py`
6. Merge to main, push, cleanup

When squashing, add co-author attribution:
```
feat: implement feature X (#123)

Co-authored-by: Contributor Name <contributor@email.com>
```

---

## Issues

```bash
gh issue list --state open
gh issue view <number>
gh issue create
```

---

## Actions (CI/CD)

```bash
gh run list --limit 10
gh run view <run-id>
gh run view <run-id> --log-failed
gh run watch
```

---

## Sync Workflow

1. If dirty: commit first with a sensible message
2. Pull with rebase: `git pull --rebase`
3. Resolve conflicts if any; do not force push
4. Push: `git push`

Or use: `just gh-sync`

---

## Changelog

- Keep latest released version at top
- Entry format: `- feat: description (#123) - thanks @contributor`
- Reference issues: `fixes #456`

---

## Quick Reference

| Task | Command |
|------|---------|
| Auth status | `gh auth status` or `just gh-status` |
| List open PRs | `gh pr list` or `just gh-pr-list` |
| View PR | `gh pr view <N>` or `just gh-pr-view <N>` |
| PR CI checks | `gh pr checks <N>` or `just gh-pr-checks <N>` |
| List issues | `gh issue list` or `just gh-issue-list` |
| Workflow runs | `gh run list` or `just gh-run-list` |
| Sync (rebase + push) | `just gh-sync` |
| Scoped commit | `just commit "msg" file1 file2` |

---

## Review vs Land

| Aspect | Review | Land |
|--------|--------|------|
| Switch branches | NO | YES (temp branch) |
| Modify code | NO | YES |
| Tools | `gh pr view`, `gh pr diff` | `git merge`, `git rebase` |
| End state | Stay on current branch | Return to main |
