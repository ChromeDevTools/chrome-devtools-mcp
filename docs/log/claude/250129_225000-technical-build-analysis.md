# Technical Build and Package Configuration Analysis

Date: 2025-01-29 22:50:00
Task: Analyze technical build and package configuration of Chrome DevTools MCP fork

## Package Changes from Original

### 1. Package Identity and Naming
- **Package name**: Changed from `chrome-devtools-mcp` to `chrome-devtools-mcp-for-extension`
- **Version**: Currently at `0.5.5`
- **Description**: Updated to reflect extension development focus: "MCP server for Chrome extension development with Web Store automation. Fork of chrome-devtools-mcp with extension-specific tools."
- **MCP Name**: Changed from default to `chrome-devtools-extension` (line 41 in package.json)
- **Repository**: Points to forked repository `https://github.com/usedhonda/chrome-devtools-mcp.git`

### 2. Keywords Enhancement
Added extension-specific keywords:
- `chrome-extension`
- `webstore`
- `browser-automation`
- `extension-development`

### 3. New Dependencies Added

#### Production Dependencies
- **archiver (^7.0.1)**: Used for creating ZIP files for Chrome Web Store submissions
  - Purpose: Automates the packaging of Chrome extensions into distributable ZIP files
  - Used in: `src/tools/webstore-submission.ts`

#### Development Dependencies
- **@types/archiver (^6.0.2)**: TypeScript type definitions for archiver package

### 4. Server Configuration Changes
In `src/main.ts` (lines 58-65):
```typescript
const server = new McpServer(
  {
    name: 'chrome-devtools-extension',
    title: 'Chrome DevTools MCP for Extension Development',
    version,
  },
  {capabilities: {logging: {}}},
);
```

## Build System Configuration

### TypeScript Configuration
- **Target**: ES2023
- **Module**: ESNext with bundler resolution
- **Output**: `./build` directory
- **Strict mode**: Enabled with additional strict flags
- **Chrome DevTools Integration**: Extensive type includes from chrome-devtools-frontend package

Key TypeScript features:
- Incremental compilation enabled
- JavaScript allowed for mixed codebases
- Modern ES features (ES2024.Promise, ESNext.Iterator, ESNext.Collection)

### Build Process
Enhanced build script with post-build processing:
```bash
"build": "tsc && node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/post-build.ts"
```

### Node.js Requirements
- **Minimum version**: Node.js 22.12.0+
- **Experimental features**: Uses `--experimental-strip-types` flag

## Extension-Specific Technical Enhancements

### 1. New Tool Categories
Added extension tools module:
```typescript
import * as extensionTools from './tools/extensions.js';
```

### 2. Browser Configuration Extension
Enhanced browser resolution with extension parameters:
```typescript
const browser = await resolveBrowser({
  // ... existing parameters
  loadExtension: args.loadExtension as string | undefined,
  loadExtensionsDir: args.loadExtensionsDir as string | undefined,
  loadSystemExtensions: args.loadSystemExtensions as boolean | undefined,
  userDataDir: args.userDataDir as string | undefined,
  // ...
});
```

### 3. CLI Enhancement
Extended command-line interface to support:
- `--loadExtension`: Load specific extension path
- `--loadExtensionsDir`: Auto-load extensions from directory
- `--loadSystemExtensions`: Include system extensions
- `--userDataDir`: Custom user data directory

## Coexistence Strategy

### Package Name Distinction
- Original: `chrome-devtools-mcp`
- Fork: `chrome-devtools-mcp-for-extension`

This naming strategy allows:
- Side-by-side installation with original package
- Clear differentiation in npm ecosystem
- No conflicts in global installations

### MCP Server Name
- Original server name: `chrome-devtools`
- Fork server name: `chrome-devtools-extension`

This prevents MCP server name conflicts when both versions are installed.

## Installation and Configuration

### NPM Installation
```bash
npm install -g chrome-devtools-mcp-for-extension
```

### Direct Execution
```bash
npx chrome-devtools-mcp-for-extension
```

### Build from Source
```bash
git clone https://github.com/usedhonda/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm install
npm run build
```

## Technical Specifications

### Engine Requirements
- Node.js 22.12.0 or higher
- TypeScript 5.9.2+
- ESM module support

### Dependencies Overview
- **Core MCP**: @modelcontextprotocol/sdk@1.18.1
- **Browser Control**: puppeteer-core@24.22.3
- **CLI**: yargs@18.0.0
- **Debugging**: debug@4.4.3
- **Extension Packaging**: archiver@7.0.1

### File Distribution
Package includes:
- Built source files (`build/src`)
- Bundled dependencies (`build/node_modules`)
- Documentation (`README.md`)
- License (`LICENSE`)

## Key Technical Differences from Original

1. **Extension Support**: Added comprehensive Chrome extension loading and management
2. **Web Store Automation**: Integrated archiver for automated extension packaging
3. **Enhanced CLI**: Extended command-line options for extension development workflows
4. **Specialized Tools**: Added extension-specific MCP tools
5. **Developer-Focused**: Optimized for extension development and testing workflows

This fork maintains full backward compatibility with the original while adding specialized extension development capabilities.