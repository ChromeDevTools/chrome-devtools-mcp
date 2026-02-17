# codebase_map Tool Briefing

> A comprehensive reference for the `codebase_map` MCP tool — understanding its inputs, outputs, modes, and adaptive compression system.

---

## Purpose

`codebase_map` is the **single tool for understanding what EXISTS in a codebase**. It provides structural maps at any granularity — from a simple list of files to full API details with type signatures and JSDoc documentation.

---

## Operating Modes

The tool has **two distinct modes** determined by the `path` parameter:

| Path Value | Mode | Output |
|------------|------|--------|
| Omitted or directory | **Directory/Workspace Mode** | File tree with symbols |
| Points to a file | **File Mode** | Detailed exports with signatures |

### Directory/Workspace Mode
Returns a hierarchical view of the codebase structure with symbols at each file.

### File Mode
Returns detailed export analysis for a single file: function signatures, type definitions, JSDoc comments, and re-export chains.

---

## Input Parameters

### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string?` | `undefined` | File, directory, or glob to map. Omit for entire workspace. |
| `depth` | `number` | `1` | Detail level (0-6). See depth explanation below. |
| `filter` | `string?` | `undefined` | Glob pattern to include matching files (e.g., `"src/tools/**"`). |
| `kind` | `enum` | `'all'` | Filter symbols by kind. Options: `all`, `functions`, `classes`, `interfaces`, `types`, `constants`, `enums` |

### Depth Levels

```
depth: 0  → File tree only (directories and filenames)
depth: 1  → Top-level symbols per file (functions, classes, interfaces)
depth: 2  → Symbols with type signatures (class members, method params)
depth: 3+ → Full detail including JSDoc documentation
```

### Content Toggles

| Parameter | Type | Default | Effect |
|-----------|------|---------|--------|
| `includeTypes` | `boolean` | `true` | Include type signatures (at depth ≥ 2) |
| `includeJSDoc` | `boolean` | `true` | Include JSDoc descriptions (at depth ≥ 3) |
| `includeImports` | `boolean` | `false` | Include import specifiers per file |
| `includeStats` | `boolean` | `false` | Include line counts and diagnostic counts |
| `includeGraph` | `boolean` | `false` | Include module dependency graph with circular dependency detection |

### Pattern Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `includePatterns` | `string[]?` | Glob patterns to restrict to matching files only |
| `excludePatterns` | `string[]?` | Glob patterns to exclude files (applied on top of `.devtoolsignore`) |

---

## Output Formats

### Directory/Workspace Mode Output

```json
{
  "projectRoot": "C:/path/to/project",
  "files": [ ... ],
  "summary": {
    "totalFiles": 42,
    "totalDirectories": 10,
    "totalSymbols": 156
  },
  "graph": { ... },          // Only if includeGraph: true
  "outputScaling": { ... },  // Only if adaptive compression was applied
  "ignoredBy": { ... }       // Only if totalFiles == 0
}
```

#### `files` Array Formats

The `files` array can take **three different shapes** depending on compression level:

**1. Full Objects (with symbols)**
```json
{
  "path": "src/tools/codebase-map.ts",
  "symbols": [
    { "name": "estimateTokens", "kind": "function", "range": { "start": 30, "end": 32 } },
    { "name": "flattenTree", "kind": "function", "range": { "start": 48, "end": 63 } }
  ],
  "imports": ["./client-pipe.js", "zod"],
  "lines": 400
}
```

**2. Flat Path Strings (no symbols)**
```json
[
  "src/tools/codebase-map.ts",
  "src/tools/codebase-trace.ts",
  "src/services/CdpService.ts"
]
```

**3. Directory Summary (most compressed)**
```json
{
  "src/tools": 12,
  "src/services": 5,
  "src/tools/codebase": 4,
  "extension": 8
}
```

### File Mode Output

```json
{
  "module": "src/client-pipe.ts",
  "exports": [
    {
      "name": "runTerminal",
      "kind": "function",
      "signature": "(name: string, cwd: string, command: string, ...) => Promise<TerminalRunResult>",
      "jsdoc": "Run a command in the terminal and return the result.",
      "line": 245,
      "isDefault": false,
      "isReExport": false
    }
  ],
  "reExports": [
    { "name": "zod", "from": "./third_party/index.js" }
  ],
  "summary": "15 exports from src/client-pipe.ts"
}
```

---

## Adaptive Compression System

`codebase_map` includes a **6-level progressive compression system** to keep output within a 3,000 token budget while preserving maximum useful information.

### Compression Phases

**Phase 1: Depth Reduction Loop**
```
depth N → depth (N-1) → ... → depth 0
```
If the flattened file list exceeds the token budget, depth is progressively reduced until it fits or reaches 0.

**Phase 2: Format Compression**
```
[{path, symbols}] → ["path", "path"] → {directory: count}
```
1. If no symbols remain (depth 0), switch from objects to flat path strings
2. If paths still exceed budget, collapse to directory summary

### Output Scaling Metadata

When compression is applied, the output includes:

```json
"outputScaling": {
  "requestedDepth": 3,
  "effectiveDepth": 0,
  "reductionsApplied": ["depth-3-to-2", "depth-2-to-1", "depth-1-to-0", "flat-paths", "directory-summary"],
  "estimatedTokens": 1116,
  "tokenLimit": 3000,
  "suggestions": [
    "Use filter or path to narrow scope for depth 3",
    "Use kind param to reduce symbol count",
    "Use includePatterns to select specific files"
  ]
}
```

### Token Estimation

Tokens are estimated using: `Math.ceil(JSON.stringify(result).length / 4)`

---

## Best Practices for Efficient Queries

### Get Full Detail on Small Scope
```json
{ "path": "src/tools/codebase", "depth": 3 }
```
Narrow the path, increase the depth.

### Quick Overview of Large Codebase
```json
{ "depth": 0 }
```
Returns file tree only — fast and compact.

### Find Specific Symbol Types
```json
{ "kind": "functions", "depth": 1 }
```
Filter to only functions across the workspace.

### Check API Surface of a Module
```json
{ "path": "src/client-pipe.ts" }
```
File mode returns all exports with signatures.

### Include Dependency Graph
```json
{ "includeGraph": true, "path": "src/services" }
```
See module dependencies and circular imports (only if output has room).

---

## Symbol Kinds Reference

| `kind` Value | Matches |
|--------------|---------|
| `functions` | function declarations |
| `classes` | class declarations |
| `interfaces` | interface declarations |
| `types` | type aliases |
| `constants` | const declarations, variables |
| `enums` | enum declarations |
| `all` | everything (default) |

---

## Edge Cases

### Empty Results
If `totalFiles == 0`, the output includes an `ignoredBy` object explaining which patterns excluded all files:

```json
"ignoredBy": {
  "rootDir": "C:/path/to/project",
  "ignoreFilePath": "C:/path/to/project/.devtoolsignore",
  "ignoreFileExists": true,
  "activePatterns": ["node_modules/**", "dist/**", "*.test.ts"]
}
```

### File Not Found (File Mode)
```json
{
  "error": "File not found",
  "path": "src/nonexistent.ts",
  "suggestions": [
    "Check the file path for typos",
    "Use codebase_map with no path to see all files",
    "Use filter param to search by pattern"
  ]
}
```

### Import Graph Skipped
If `includeGraph: true` but output already uses >50% of token budget, the graph is silently skipped to avoid exceeding limits.

---

## Internal Architecture

```
┌─────────────────────────┐
│     codebase_map        │
│     (MCP tool)          │
└───────────┬─────────────┘
            │ RPC via client-pipe
            ▼
┌─────────────────────────┐
│  Extension Host         │
│  client-handlers.ts     │
└───────────┬─────────────┘
            │ Uses ts-morph / VS Code APIs
            ▼
┌─────────────────────────┐
│  Codebase Service       │
│  (TypeScript analysis)  │
└─────────────────────────┘
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `flattenTree()` | Convert nested tree to flat file list |
| `makePathsRelative()` | Strip projectRoot prefix for compact paths |
| `buildDirectorySummary()` | Collapse files to `{dir: count}` pairs |
| `filterSymbolsByKind()` | Apply kind filter to symbol arrays |
| `estimateTokens()` | Estimate output token count |

---

## Configuration

### Timeout
- Tool-level timeout: **120 seconds** (2 minutes)
- Sufficient for large codebases with deep analysis

### Token Budget
- `OUTPUT_TOKEN_LIMIT`: **3,000 tokens**
- `CHARS_PER_TOKEN`: **4** (estimation constant)

---

## Example Queries

```json
// 1. Full workspace overview (depth 1)
{}

// 2. Narrow scope with full detail
{ "path": "src/services", "depth": 3 }

// 3. File tree only
{ "depth": 0 }

// 4. Functions in tools directory
{ "path": "src/tools", "kind": "functions", "depth": 2 }

// 5. With import graph
{ "includeGraph": true, "path": "src" }

// 6. TypeScript files only
{ "filter": "**/*.ts" }

// 7. Exclude tests
{ "excludePatterns": ["**/*.test.ts", "**/__tests__/**"] }

// 8. Single file exports
{ "path": "src/main.ts" }
```

---

## Comparison with Other Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `codebase_map` | What EXISTS | Discover files, symbols, APIs |
| `codebase_trace` | How symbols CONNECT | Track references, calls, type flows |
| `codebase_lint` | What's WRONG | Find dead code, errors, duplicates |

---

*Last updated: Session where 6-level compression system was implemented*
