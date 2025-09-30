# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

**Zero-config Chrome extension testing with your real browser environment**

AI-powered Chrome extension development with automated testing, debugging, and Web Store submission.

**Built for:** Claude Code, Cursor, VS Code Copilot, Cline, and other MCP-compatible AI tools

---

## 🎯 Why This Tool?

### The Problem
- **Puppeteer/Playwright**: Disable extensions by default, require complex configuration
- **Traditional Testing**: Hours of setup, maintaining separate test profiles
- **Extension Development**: Can't test in real user environments

### The Solution
- ✅ **Zero setup**: Uses your system Chrome profile automatically
- ✅ **Real environment**: Tests with your actual extensions and settings
- ✅ **No copying**: Direct profile access, instant sync
- ✅ **Always enabled**: Extensions work automatically, no configuration needed

---

## 🚀 Quick Start

### 1. Install (30 seconds)

**Claude Code users (recommended):**
```bash
claude mcp add --scope user chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

<summary>Other MCP clients (Cursor, VS Code Copilot, Cline)</summary>

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```


### 2. Restart your AI client

### 3. Verify installation
Ask your AI: **"List all my Chrome extensions"**
✅ You should see your installed extensions listed

### 4. Start developing
See [Common Workflows](#-common-workflows) below for typical use cases

---

## ✨ Core Capabilities

- 🧩 **Extension Development**: Load, debug, and reload Chrome extensions during development
- 🏪 **Automated Web Store Submission**: Complete publishing workflow with form filling and screenshots
- 🔧 **Browser Testing**: Test extensions across real websites with full Chrome functionality
- 🐛 **Advanced Debugging**: Service worker inspection, console monitoring, error detection
- 📸 **Screenshot Generation**: Auto-create store listing images in all required formats

---

## 📚 Common Workflows

### Create & Test Extension
```
1. "Create a Chrome extension that blocks ads on YouTube"
2. "List extensions to verify it loaded"
3. "Test the extension on youtube.com"
4. "Show any errors from the extension"
```

### Debug Extension Issues
```
1. "List extensions and show any errors"
2. "Inspect service worker for my-ad-blocker"
3. "Show console messages from the extension"
4. "Reload the extension with latest changes"
```

### Publish to Web Store
```
1. "Generate screenshots for my extension"
2. "Validate my manifest for Web Store compliance"
3. "Submit my extension to Chrome Web Store"
```

### Performance Testing
```
1. "Start performance trace on current page"
2. "Test the extension's impact on page load"
3. "Show performance insights"
```

---

## 🛠️ Extension Development Tools

Quick reference for the 3 core extension tools:

| Tool | Purpose | Example Command |
|------|---------|-----------------|
| `list_extensions` | View all extensions with status | "List all my Chrome extensions" |
| `reload_extension` | Hot-reload during development | "Reload my-extension" |
| `inspect_service_worker` | Debug background scripts | "Debug service worker for my-extension" |


---

## 📊 How It Compares

| Feature | This Tool | Puppeteer/Playwright | Original chrome-devtools-mcp |
|---------|-----------|----------------------|------------------------------|
| Extension Support | ✅ Always enabled | ❌ Disabled by default | ⚠️ Manual config required |
| Setup Required | ❌ None | ✅ Complex config files | ✅ Multiple flags needed |
| Real User Profile | ✅ Direct access | ❌ Temporary profiles | ⚠️ Optional |
| Profile Copying | ❌ No copying needed | ⚠️ Manual setup | ⚠️ Manual setup |
| Web Store Automation | ✅ Built-in | ❌ None | ❌ None |
| Extension Debugging | ✅ Service worker + console | ⚠️ Limited | ❌ None |

---
<details>
<summary>📖 Detailed Tool Documentation</summary>

### `list_extensions` - Extension Inventory
**Purpose**: Comprehensive extension status monitoring
**Technical**: Accesses `chrome://extensions/` via shadow DOM manipulation
**Output**: Extension metadata, enabled/disabled status, version, error detection
**Use Case**: "List all my Chrome extensions" → Shows development and installed extensions

### `reload_extension` - Development Hot-Reload
**Purpose**: Streamlined extension development workflow
**Technical**: Finds extensions by name/partial match, triggers reload via Chrome extension API
**Output**: Confirmation of reload success/failure with error details
**Use Case**: "Reload my ad-blocker extension" → Instantly applies code changes

### `inspect_service_worker` - Debug Integration
**Purpose**: Deep debugging of extension background processes
**Technical**: Opens DevTools for service workers, supports Manifest V2/V3 architectures
**Output**: Direct DevTools access to extension console, network, sources
**Use Case**: "Debug why my content script isn't working" → Opens debugging interface

</details>

---

<details>
<summary>⚙️ Advanced Configuration</summary>

## Auto-load Development Extension
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtension=/path/to/your/extension"
      ]
    }
  }
}
```

⚠️ **Note**: `--loadExtension` flag may be deprecated in Chrome 137+. Using system profile (default) is recommended.

## Debug Mode
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

## Custom Chrome Channel
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--channel=canary"
      ]
    }
  }
}
```

Options: `stable` (default), `beta`, `dev`, `canary`

## Isolated Profile Mode
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--isolated"
      ]
    }
  }
}
```

Forces temporary profile instead of system profile.

</details>

---

<details>
<summary>🏗️ Technical Architecture & Implementation</summary>

## What Makes This Different

This fork significantly restructures the original Chrome DevTools MCP for extension-focused development:

### System Profile Architecture (v0.6.0+)

**Zero-Config Design:**
```typescript
// Automatically detects and uses system Chrome profile
if (!isolated && !userDataDir) {
  const systemProfile = detectSystemChromeProfile(channel) || detectAnySystemChromeProfile();

  if (systemProfile) {
    userDataDir = systemProfile.path;  // Direct access, no copying
    usingSystemProfile = true;
  }
}
```

**Profile Paths:**
- macOS: `~/Library/Application Support/Google/Chrome`
- Windows: `%LOCALAPPDATA%\Google\Chrome\User Data`
- Linux: `~/.config/google-chrome`

**Detection Priority:**
1. Specified channel (via `--channel` flag)
2. Fallback: stable → beta → dev → canary
3. Last resort: Creates temporary isolated profile

### Extension Loading Architecture

**Unconditional Extension Enablement (v0.6.1+):**
```typescript
// Always remove --disable-extensions flag
ignoreDefaultArgs: ['--disable-extensions', '--enable-automation']
```

**Why this design:**
- Puppeteer's default `--disable-extensions` conflicts with extension development
- Previous versions used conditional logic (buggy, removed in v0.6.1)
- Current approach: **Always enable all extensions** for predictable behavior

### Chrome Security Challenges Solved

#### Chrome 137+ Breaking Changes
- **Problem**: Chrome 137+ disabled `--load-extension` in automation contexts
- **Solution**: Added `--disable-features=DisableLoadExtensionCommandLineSwitch` bypass
- **Impact**: Development extensions can still be loaded via CLI flags

#### Automation Detection Bypass
- **Problem**: Chrome blocks many operations when detecting automated control
- **Solution**: `--disable-blink-features=AutomationControlled` for real-world testing
- **Use Case**: Google login, OAuth flows, Web Store submission

#### Profile Management Strategy
- **Default**: Direct system profile access (no copying, instant sync)
- **Fallback**: Temporary profile with bookmarks copy (when Chrome is already running)
- **Override**: `--isolated` flag for completely separate profile

### Architecture Diagram

```
Extension Development Flow:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ AI Assistant    │───▶│ MCP Server       │───▶│ Chrome Browser  │
│ (Claude/Cursor) │    │ (Extension Tools)│    │ + Extensions    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Web Store        │    │ System Profile  │
                       │ Automation       │    │ (Direct Access) │
                       └──────────────────┘    └─────────────────┘
```

### Web Store Automation Tools

#### Submission Workflow (`submit_to_webstore`)
1. **Manifest Validation**: Manifest V3 compliance, permission security analysis
2. **Package Creation**: ZIP generation with optimized compression, development file exclusion
3. **Store Listing**: Auto-generated descriptions based on manifest permissions
4. **Browser Automation**: Login flow, form population, file upload, error detection

#### Screenshot Generation (`generate_extension_screenshots`)
- **Primary**: 1280x800 (Web Store requirement)
- **Promotional Tiles**: Small (440x280), Large (920x680), Marquee (1400x560)
- **Smart Capture**: Extension popup, options page, in-context usage

### Manifest Validation System

```typescript
interface ManifestValidation {
  required: string[];      // name, version, manifest_version
  warnings: string[];      // description length, icon sizes
  security: string[];      // dangerous permissions analysis
  suggestions: string[];   // optimization recommendations
}
```

**Validation Features:**
- Manifest V3 compliance enforcement
- Permission analysis with security implications
- Icon size recommendations (16x16, 48x48, 128x128)
- Service worker file verification
- Host permission optimization suggestions

### Added Dependencies
- **archiver** (7.0.1): ZIP package creation for extension submission
- **puppeteer-core** (24.22.3): Chrome automation with extension support
- **@modelcontextprotocol/sdk** (1.18.1): MCP server implementation

### MCP Server Coexistence
- **Server Name**: `chrome-devtools-extension` (vs original `chrome-devtools`)
- **Package Name**: `chrome-devtools-mcp-for-extension`
- **Purpose**: Allows both servers to run simultaneously for different use cases

</details>

---

<details>
<summary>👨‍💻 Developer Reference</summary>

## Supported Extension Types
- **Manifest V3**: Full support (recommended)
- **Service Workers**: Background script debugging
- **Content Scripts**: Page interaction testing
- **Popup Extensions**: UI testing and screenshots
- **Options Pages**: Settings interface validation

## Browser Compatibility
- **Chrome**: Primary target (latest stable)
- **Chrome Canary**: Development testing
- **Chromium**: Community builds
- **Edge**: Chromium-based versions

## Technical Requirements
- **Node.js**: 22.12.0+ (for latest Chrome DevTools Protocol)
- **Chrome**: Any version with extension support
- **Storage**: ~50MB for dependencies
- **Network**: Required for Web Store automation

## Extension Loading Capabilities
- **Startup Loading**: Extensions loaded at Chrome startup via `--loadExtension`
- **System Extensions**: Auto-loads all extensions from Chrome profile (default)
- **Manual Reloading**: Update extensions via `reload_extension` MCP tool
- **Multi-Extension**: Support for multiple extensions simultaneously

⚠️ **Note**: Runtime extension installation not supported. Extensions must be loaded at startup.

## Security & Privacy Considerations
- **System Profile Access**: Uses system Chrome profile by default (includes cookies, sessions, history, bookmarks)
- **Profile Isolation**: Use `--isolated` flag for temporary profile without personal data
- **Extension Sandboxing**: Extension permissions are sandboxed per Chrome security model
- **Web Store Auth**: Uses standard Google OAuth flow (no credentials stored)

⚠️ **Warning**: When using system profile, the MCP server has access to all data in your Chrome profile. Use `--isolated` mode for testing sensitive operations.

</details>

---

<details>
<summary>❓ Troubleshooting</summary>

## Extension Not Loading

**Check manifest.json:**
```
"List extensions and show any errors"
```

**Verify extension is in correct directory:**
- Manifest must be at root: `/your-extension/manifest.json`
- Not: `/your-extension/dist/manifest.json`

**Solution:**
```json
// Use --loadExtension with correct path
"args": ["chrome-devtools-mcp-for-extension@latest", "--loadExtension=/correct/path"]
```

## Service Worker Not Inspecting

**Extension may not be active:**
```
"List extensions"  // Check if enabled
"Reload my-extension"  // Restart extension
```

**DevTools window not appearing:**
- Service worker only runs when needed
- Trigger extension action first (click popup, run content script)

## Web Store Submission Fails

**Manifest V3 compliance:**
```
"Validate my manifest for Web Store compliance"
```

**Common issues:**
- Missing required icons (16x16, 48x48, 128x128)
- Invalid permissions (host_permissions format)
- Service worker not specified

## Extensions Disabled After Chrome Update

**Chrome 137+ breaking change:**
- `--load-extension` may be restricted in newer Chrome versions
- **Solution**: Use system profile (default) instead of `--loadExtension` flag

## Profile Lock Conflicts

**Error: "Chrome is already using this profile"**

This error occurs when Chrome is already running with the system profile. The MCP server detects profile lock files and fails immediately to prevent conflicts.

**Solution:**
1. **Close all Chrome windows** - The simplest solution is to completely quit Chrome before starting the MCP server
2. **Use isolated profile** - Run with `--isolated` flag to use a temporary profile:
   ```bash
   npx chrome-devtools-mcp-for-extension@latest --isolated
   ```
3. **Use custom profile** - Specify a custom profile directory:
   ```bash
   npx chrome-devtools-mcp-for-extension@latest --userDataDir=/path/to/custom/profile
   ```

**Why This Happens:**
- Chrome creates lock files (`SingletonLock`, `SingletonCookie`, `SingletonSocket`) when a profile is in use
- Multiple Chrome instances cannot share the same profile simultaneously
- The MCP server now detects these locks early and fails fast with a clear error message

**Note:** Previous versions silently fell back to a temporary profile, which caused confusion. Version 0.6.4+ fails immediately with a clear error instead.

</details>

---

# 日本語 / Japanese

**Chrome拡張機能開発用のAI支援MCPサーバー**

ゼロコンフィグで実環境テストが可能なChrome拡張機能開発ツール

## インストール

**Claude Code ユーザー:**
```bash
claude mcp add --scope user chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

**その他のMCPクライアント:**
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```

## 主な機能

- 🧩 **拡張機能の開発・デバッグ・リロード**: ライブ開発環境
- 🏪 **Chrome Web Store への自動申請**: スクリーンショット生成付き
- 🔧 **実環境でのブラウザテスト**: 既存の拡張機能と共存
- 🐛 **高度なデバッグ**: サービスワーカー検査、コンソール監視
- 📸 **ストア用画像の自動生成**: 複数サイズ対応

## 使用例

```
「広告ブロック拡張機能を作成して」
「拡張機能のエラーを確認して」
「サービスワーカーをデバッグして」
「Web Storeに申請して」
```

## なぜこのツールか？

- ✅ **設定不要**: システムのChromeプロファイルを自動使用
- ✅ **実環境テスト**: 実際の拡張機能・設定でテスト可能
- ✅ **コピー不要**: プロファイルの直接アクセス、即座に同期
- ✅ **常時有効**: 拡張機能が自動的に有効化

詳細は英語セクションを参照してください。

---

**Version**: 0.6.2
**Repository**: https://github.com/usedhonda/chrome-devtools-mcp
**License**: Apache-2.0
**Original**: Chrome DevTools MCP by Google LLC