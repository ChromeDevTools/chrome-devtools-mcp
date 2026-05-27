# Contributing

This is a fork of [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp). It is not the upstream project. The upstream project's CLA-based contribution process does not apply here.

## Where to send your contribution

- **If your change is broadly useful** (bug fix, generally applicable feature), please open a PR against [the upstream repository](https://github.com/ChromeDevTools/chrome-devtools-mcp/pulls) directly. That benefits more people than this fork.
- **If your change is specific to this fork's additions** (per-page mutex, HTTP transport — see [FORK.md](./FORK.md)), open a PR here.

## Workflow

1. Fork this repo and create a feature branch.
2. Make your changes. Match the existing style (run `npm run format`).
3. Add or update tests under `tests/`. Run `npm test` locally and ensure it passes.
4. Open a PR against `main` here.
5. CI runs on the PR. The maintainer reviews and merges.

`main` is protected — no direct pushes, no force pushes, no deletion. All changes go through PRs. The single maintainer ([@cejor6](https://github.com/cejor6)) reviews and merges.

## Development

```sh
git clone https://github.com/cejor6/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm ci
npm run build
npm test
```

To skip the heavy Puppeteer Chrome download during install (you can still run the server against your system Chrome):

```sh
PUPPETEER_SKIP_DOWNLOAD=true npm install
```

## TypeScript rules

Per the upstream conventions, maintained here too:

- Do not use `any`, `as`, `!`, `// @ts-ignore`, `// @ts-nocheck`, or `// @ts-expect-error`.
- Prefer `for..of` over `forEach`.

## Modifying upstream files

Per Apache 2.0 §4(b), any file you modify that originated upstream must carry a "Modifications Copyright" notice. Add it right below the existing `Copyright Google` block. See `src/Mutex.ts` for the established style. New files you create are entirely yours and need only your own copyright.

## Keeping in sync with upstream

```sh
git fetch upstream
git checkout main
git merge upstream/main
# resolve conflicts; opens as a PR via your fork-of-this-fork workflow
git push origin main
```

(Note: only the maintainer can push to `main` — they'll handle upstream merges.)
