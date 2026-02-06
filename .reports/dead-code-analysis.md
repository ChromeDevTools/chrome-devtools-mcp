# Dead Code Analysis Report

**Project:** chrome-devtools-mcp
**Date:** 2026-02-06
**Analysis Tools:** knip, depcheck, ts-prune

---

## Executive Summary

This report identifies unused code, dependencies, and exports in the chrome-devtools-mcp project. The analysis found several categories of items that can be potentially removed.

### Key Findings
- **3 Unused Files**
- **5 Unused devDependencies**
- **7 Unlisted Dependencies** (dependencies used but not in package.json)
- **5 Unused Exports**
- **2 Unused Exported Types**
- **2 Unresolved Imports**

---

## SAFE Category - Can be Removed

These items are safe to remove with minimal risk.

### 1. Unused devDependencies

| Package | Location | Reason | Risk Level |
|---------|----------|--------|------------|
| `@types/filesystem` | package.json:51:6 | Not imported anywhere | LOW |
| `@typescript-eslint/eslint-plugin` | package.json:55:6 | Replaced by typescript-eslint | LOW |
| `@typescript-eslint/parser` | (from depcheck) | Not used directly | LOW |
| `chrome-devtools-frontend` | (from depcheck) | Possibly unused devDependency | MEDIUM |
| `eslint-import-resolver-typescript` | (from depcheck) | Possibly unused | LOW |

**Estimated Size Savings:** ~200 MB (primarily from chrome-devtools-frontend)

### 2. Unused Files

| File | Size | Reason | Risk Level |
|------|------|--------|------------|
| `puppeteer.config.cjs` | Small | Puppeteer config not used in build | LOW |
| `tests/setup.ts` | Small | Test setup file not imported | MEDIUM |
| `src/third_party/devtools-formatter-worker.ts` | Small | Third-party worker file | MEDIUM |

**Action Required:** Verify tests still pass before removing `tests/setup.ts`.

### 3. Unused Exports (from src/ only)

| Export | Type | Location | Reason |
|--------|------|----------|--------|
| `getIssueDescription` | function | src/issue-descriptions.ts:47:17 | Not imported in project |

### 4. Unused Exported Types

| Type | Location | Reason |
|------|----------|--------|
| `ChromeChannel` | enum | src/telemetry/types.ts:66:13 | Not used in project |

---

## CAUTION Category - Review Before Removal

These items require manual verification before removal.

### 1. Unlisted Dependencies

These packages are used in the code but not listed in package.json. They should be **added**, not removed.

| Package | Usage Location | Action Required |
|---------|----------------|-----------------|
| `zod` | src/third_party/index.ts:24:25 | ADD to dependencies |
| `puppeteer-core` | Multiple locations in src/ and tests/ | ADD to dependencies |
| `@puppeteer/browsers` | src/third_party/index.ts:39:9 | ADD to dependencies |

**Note:** These are runtime dependencies that must be added to package.json for the bundled package to work correctly.

### 2. Unused Exports from Third Party

| Export | Type | Location | Note |
|--------|------|----------|------|
| `KnownDevices` | puppeteer | src/third_party/index.ts:28:3 | Re-exported from puppeteer |
| `resolveDefaultUserDataDir` | puppeteer | src/third_party/index.ts:35:3 | Re-exported from puppeteer |
| `detectBrowserPlatform` | puppeteer | src/third_party/index.ts:36:3 | Re-exported from puppeteer |
| `BrowserEnum` | puppeteer | src/third_party/index.ts:37:14 | Type from puppeteer |
| `BrowsersChromeReleaseChannel` | type | src/third_party/index.ts:38:32 | Type from puppeteer |

**Note:** These are re-exports from puppeteer. While not directly used in this project, they may be part of the public API. Remove only if sure they're not consumed externally.

### 3. Unresolved Imports

| Import | Location | Issue |
|--------|----------|-------|
| `/bundled/ui/legacy/legacy.js` | src/McpContext.ts:571:28 | Bundled file path |
| `/bundled/core/sdk/sdk.js` | src/McpContext.ts:573:29 | Bundled file path |

**Note:** These are bundled files that exist after the build process. This is expected behavior and not an issue.

---

## DANGER Category - Do NOT Remove

These items should be kept as-is.

### 1. Core Dependencies
- All dependencies used in src/ directory
- @modelcontextprotocol/sdk (critical MCP functionality)
- puppeteer (core browser automation)
- debug (logging)
- All @types packages for TypeScript support

### 2. Configuration Files
- `tsconfig.json` - TypeScript configuration
- `rollup.config.mjs` - Bundling configuration
- `eslint.config.mjs` - Linting configuration
- `.prettierrc.cjs` - Formatting configuration

---

## Recommendations

### Immediate Actions (SAFE)

1. **Remove unused devDependencies:**
   ```bash
   npm uninstall @types/filesystem @typescript-eslint/eslint-plugin
   ```

2. **Remove unused files:**
   ```bash
   rm puppeteer.config.cjs
   # Verify tests pass before removing tests/setup.ts
   ```

3. **Remove unused exports:**
   - Remove `getIssueDescription` from `src/issue-descriptions.ts`
   - Remove `ChromeChannel` enum from `src/telemetry/types.ts`

### Follow-up Actions (CAUTION)

1. **Add missing dependencies:**
   ```bash
   npm install --save zod puppeteer-core @puppeteer/browsers
   ```

2. **Review puppeteer re-exports:**
   - Determine if `KnownDevices`, `resolveDefaultUserDataDir`, `detectBrowserPlatform`, `BrowserEnum`, `BrowsersChromeReleaseChannel` are part of public API
   - Remove if not used externally

### Testing Checklist

Before applying any changes:
- [ ] Run full test suite: `npm test`
- [ ] Run type checking: `npm run typecheck`
- [ ] Run build: `npm run build`
- [ ] Run bundle: `npm run bundle`
- [ ] Verify MCP server starts correctly
- [ ] Test all MCP tools functionality

---

## Configuration Hints

The knip tool reported:
- `index.js` - Package entry file not found

**Resolution:** The package.json specifies `"main": "index.js"` but this file doesn't exist in the repository. Consider:
1. Creating the file, OR
2. Updating package.json to point to the correct entry point (`build/src/index.js`)

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Unused Files | 3 |
| Unused devDependencies | 5 |
| Unlisted Dependencies (to add) | 3 |
| Unused Exports | 5 |
| Unused Types | 2 |
| Unresolved Imports | 2 |

**Potential Package Size Reduction:** ~200 MB (mainly from chrome-devtools-frontend if unused)

---

## Next Steps

1. Review this report with the team
2. Create a feature branch for cleanup
3. Run tests to establish baseline
4. Apply SAFE category changes
5. Run tests again
6. Review CAUTION category items
7. Apply changes incrementally with testing

---

*Report generated by Refactor & Dead Code Cleaner agent*
