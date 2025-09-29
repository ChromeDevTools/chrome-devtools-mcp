# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

AI-powered Chrome extension development with automated testing, debugging, and Web Store submission.

**Built for:** Claude Code, Cursor, VS Code Copilot, Cline, and other MCP-compatible AI tools

## Quick Start

### 1. Add to Claude Code
```bash
claude mcp add chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

### 2. Restart Claude Code

### 3. Try it out
```
"Create a Chrome extension that blocks ads"
"List all my Chrome extensions"
"Submit my extension to Chrome Web Store"
```

## What You Can Do

- 🧩 **Extension Development**: Load, debug, and reload Chrome extensions during development
- 🏪 **Automated Web Store Submission**: Complete publishing workflow with form filling and screenshots
- 🔧 **Browser Testing**: Test extensions across real websites with full Chrome functionality
- 🐛 **Advanced Debugging**: Service worker inspection, console monitoring, error detection
- 📸 **Screenshot Generation**: Auto-create store listing images in all required formats

## Configuration Options

<details>
<summary>Manual MCP Configuration</summary>

**Configuration file locations:**
- **Cursor**: `~/.cursor/extensions_config.json`
- **VS Code Copilot**: `.vscode/settings.json`
- **Cline**: Follow Cline's MCP setup guide

**Basic configuration:**
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

**With extension auto-loading:**
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
</details>

---

## Technical Details

### What Makes This Different

This fork significantly restructures the original Chrome DevTools MCP for extension-focused development:

### Added Extension-Specific Tools
- **Extension Management**: 3 specialized tools for extension development workflow
- **Web Store Automation**: 2 tools for automated submission and screenshot generation
- **Focus**: Extension-specific operations added to comprehensive browser automation

### Chrome Security & Technical Challenges Solved

#### Extension Loading Security Restrictions
Chrome's security model makes automated extension loading complex for legitimate development:

- **Chrome 137+ Policy Changes**: Google disabled `--load-extension` by default in automation contexts
- **Solution**: Added `--disable-features=DisableLoadExtensionCommandLineSwitch` flag bypass
- **Automation Detection**: Chrome blocks many operations when detecting automated control
- **Solution**: `--disable-blink-features=AutomationControlled` for real-world testing scenarios

#### Puppeteer Integration Challenges
- **Default Args Conflict**: Puppeteer's `--disable-extensions` conflicts with extension loading
- **Solution**: Selective `ignoreDefaultArgs` removal only when extensions are present
- **Profile Management**: System profile access vs. temporary profile isolation
- **Solution**: Automatic fallback to temporary profiles when system profile conflicts occur

#### Manifest Discovery & Validation
- **Build System Variations**: Extensions may be in `/dist`, `/build`, `/extension` subdirectories
- **Solution**: Intelligent manifest.json discovery across common build patterns
- **Manifest V3 Compliance**: Strict validation for Web Store compatibility
- **Solution**: Comprehensive validation with actionable security warnings

### New Automation Tools
- `webstore-submission.ts`: Full Chrome Web Store submission automation
- `webstore-auto-screenshot.ts`: Multi-format screenshot generation for store listings
- Enhanced manifest validation with Web Store compliance checking

### Added Dependencies
- **archiver**: ZIP package creation for extension submission
- **Enhanced manifest parsing**: Validates Manifest V3 compliance and permissions

### MCP Server Coexistence
- **Server Name**: `chrome-devtools-extension` (vs original `chrome-devtools`)
- **Package Name**: `chrome-devtools-mcp-for-extension`
- **Purpose**: Allows both servers to run simultaneously for different use cases

## Implementation Details

### Architecture
```
Extension Development Flow:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ AI Assistant    │───▶│ MCP Server       │───▶│ Chrome Browser  │
│ (Claude/Cursor) │    │ (Extension Tools)│    │ + Extensions    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ Web Store        │
                       │ Automation       │
                       └──────────────────┘
```

### Extension Management Tools (3 Tools)

#### 1. `list_extensions` - Extension Inventory
- **Purpose**: Comprehensive extension status monitoring
- **Technical**: Accesses `chrome://extensions/` via shadow DOM manipulation
- **Output**: Extension metadata, enabled/disabled status, version, error detection
- **Use Case**: "List all my Chrome extensions" → Shows development and installed extensions

#### 2. `reload_extension` - Development Hot-Reload
- **Purpose**: Streamlined extension development workflow
- **Technical**: Finds extensions by name/partial match, triggers reload via Chrome extension API
- **Output**: Confirmation of reload success/failure with error details
- **Use Case**: "Reload my ad-blocker extension" → Instantly applies code changes

#### 3. `inspect_service_worker` - Debug Integration
- **Purpose**: Deep debugging of extension background processes
- **Technical**: Opens DevTools for service workers, supports Manifest V2/V3 architectures
- **Output**: Direct DevTools access to extension console, network, sources
- **Use Case**: "Debug why my content script isn't working" → Opens debugging interface

### Automation Tools

#### Web Store Submission (`submit_to_webstore`)
**Comprehensive submission automation including:**

1. **Manifest Validation**
   - Manifest V3 compliance checking
   - Permission validation and security warnings
   - File structure verification

2. **Package Creation**
   - Automated ZIP generation with optimal compression
   - Exclusion of development files (`node_modules`, `.git`, tests)
   - Size optimization for Web Store limits

3. **Store Listing Generation**
   - Auto-generated descriptions based on manifest permissions
   - Category suggestions based on functionality
   - SEO-optimized content structure

4. **Browser Automation**
   - Automated login flow handling
   - Form field population from manifest data
   - File upload automation
   - Error detection and reporting

#### Screenshot Generation (`generate_extension_screenshots`)
**Multi-format screenshot creation:**

- **Primary Screenshots**: 1280x800 (Web Store requirement)
- **Promotional Tiles**:
  - Small: 440x280
  - Large: 920x680
  - Marquee: 1400x560
- **Automated Capture**: Extension popup, options page, in-context usage
- **Smart Navigation**: Tests extension across multiple websites

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
- Icon size recommendations
- Service worker file verification
- Host permission optimization suggestions

## Quick Start

### 1. Add to your MCP client

**Claude Code users:**
```bash
claude mcp add chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

**Manual configuration:**
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

<details>
<summary>Configuration file locations & advanced options</summary>

**Configuration file locations:**
- **Cursor**: `~/.cursor/extensions_config.json`
- **VS Code Copilot**: `.vscode/settings.json`
- **Cline**: Follow Cline's MCP setup guide

**With extension auto-loading:**
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

**Debug mode:**
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
</details>

### 2. Restart your AI client

### 3. Try your first command

Try: `"List all my Chrome extensions"` or `"Create a simple Chrome extension"`

## Features

### 🧩 Extension Development
- **Live Development**: Load and reload extensions during development
- **Debug Integration**: Service worker and background script debugging
- **Manifest Analysis**: V3 compliance checking and optimization
- **Error Detection**: Real-time extension error monitoring

### 🏪 Web Store Automation
- **Automated Submission**: End-to-end publishing workflow
- **Screenshot Generation**: Multi-size promotional images
- **Listing Optimization**: AI-generated store descriptions
- **Compliance Checking**: Web Store policy validation

### 🔧 Browser Control
- **Extension-Aware Navigation**: Understands extension contexts
- **Permission Testing**: Validate extension permissions in real scenarios
- **Cross-Origin Testing**: Test extensions across different domains
- **Performance Analysis**: Extension impact measurement

### 🔍 Advanced Debugging
- **Console Integration**: Extension console log aggregation
- **Network Monitoring**: Extension-specific request tracking
- **Storage Analysis**: Extension storage (local, sync, session) inspection
- **Message Passing**: Inter-component communication debugging

## Developer Information

### Supported Extension Types
- **Manifest V3**: Full support (recommended)
- **Service Workers**: Background script debugging
- **Content Scripts**: Page interaction testing
- **Popup Extensions**: UI testing and screenshots
- **Options Pages**: Settings interface validation

### Browser Compatibility
- **Chrome**: Primary target (latest stable)
- **Chrome Canary**: Development testing
- **Chromium**: Community builds
- **Edge**: Chromium-based versions

### Development Workflow Integration
```bash
# Typical AI-assisted development flow:
1. "Create a Chrome extension that blocks ads"
2. "Test the extension on youtube.com"
3. "Debug why the content script isn't working"
4. "Generate screenshots for the Web Store"
5. "Submit the extension to Chrome Web Store"
```

### Technical Requirements
- **Node.js**: 22.12.0+ (for latest Chrome DevTools Protocol)
- **Chrome**: Any version with extension support
- **Storage**: ~50MB for dependencies and Chrome profile
- **Network**: Required for Web Store automation

### Extension Loading Capabilities
- **Development Extensions**: Unpacked extensions from filesystem
- **Dynamic Loading**: Runtime extension installation
- **Hot Reloading**: Instant updates during development
- **Multi-Extension**: Support for multiple extensions simultaneously

### Security Considerations
- **Isolated Profiles**: Optional temporary Chrome profiles
- **Permission Scoping**: Extension permissions are sandboxed
- **Secure Storage**: No sensitive data persistence
- **Web Store Auth**: Uses standard Google OAuth flow

---

# 日本語 / Japanese

**Chrome 拡張機能開発用の MCP サーバー**

## クイックスタート

MCP クライアントに設定を追加：

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

## 機能

- **拡張機能開発**: ロード、デバッグ、リロード
- **Web Store 自動申請**: スクリーンショット生成付き
- **ブラウザ制御**: ナビゲーション、フォーム操作、スクリーンショット
- **パフォーマンス分析**: Chrome DevTools 統合

## Use Cases

```
"Create a Chrome extension that blocks ads"
"Debug why my content script isn't working"
"Submit my extension to Chrome Web Store"
"Generate screenshots for store listing"
```

## 使用例

```
"広告ブロック拡張機能を作成して"
"コンテンツスクリプトが動かない原因をデバッグして"
"Web Store に拡張機能を申請して"
```