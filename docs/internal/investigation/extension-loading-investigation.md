# Chrome Extension Loading Investigation Document

## 🚨 Problem Summary

Chrome extensions specified via `--load-extension` flag are not being loaded when Chrome is launched through Puppeteer in the Chrome DevTools MCP project. The extensions appear in the command line arguments but do not function or appear in `chrome://extensions/`.

## 📋 Environment Details

### Software Versions
- **Chrome Version**: 140.0.7339.208 (Official Build) (arm64)
- **OS**: macOS Version 26.0 (Build 25A354)
- **Node.js**: Current version used by MCP
- **Puppeteer**: Latest version in chrome-ai-bridge
- **JavaScript Engine**: V8 14.0.365.10

### System Architecture
- **Platform**: darwin (macOS)
- **Architecture**: arm64 (Apple Silicon)

## 🔧 Technical Implementation

### Current MCP Configuration
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/chrome-ai-bridge/build/src/main.js",
        "--loadExtensionsDir",
        "/Users/usedhonda/projects/Chrome-Extension",
        "--userDataDir",
        "/Users/usedhonda/chrome-mcp-profile"
      ],
      "env": {
        "BOOKMARKS": "{...}"
      }
    }
  }
}
```

### Chrome Launch Arguments (Actual)
```bash
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
--allow-pre-commit-input
--disable-background-networking
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-breakpad
--disable-client-side-phishing-detection
--disable-component-extensions-with-background-pages
--disable-crash-reporter
--disable-default-apps
--disable-dev-shm-usage
--disable-hang-monitor
--disable-infobars
--disable-ipc-flooding-protection
--disable-popup-blocking
--disable-prompt-on-repost
--disable-renderer-backgrounding
--disable-search-engine-choice-screen
--disable-sync
--enable-automation
--export-tagged-pdf
--force-color-profile=srgb
--generate-pdf-document-outline
--metrics-recording-only
--no-first-run
--password-store=basic
--use-mock-keychain
--disable-features=Translate,AcceptCHFrame,MediaRouter,OptimizationHints,RenderDocument,ProcessPerSiteUpToMainFrameThreshold,IsolateSandboxedIframes
--enable-features=PdfOopif
--user-data-dir=/Users/usedhonda/chrome-mcp-profile
--hide-crash-restore-bubble
--load-extension=/Users/usedhonda/projects/Chrome-Extension/AdBlocker/extension,/Users/usedhonda/projects/Chrome-Extension/meet_moderator/dist,/Users/usedhonda/projects/Chrome-Extension/monolith,/Users/usedhonda/projects/Chrome-Extension/my-prompt/extension,/Users/usedhonda/projects/Chrome-Extension/sunoprompt/extension
--enable-experimental-extension-apis
--remote-debugging-pipe
```

### Profile Path Resolution
- **Command Line**: `--user-data-dir=/Users/usedhonda/chrome-mcp-profile`
- **Actual Profile**: `/Users/usedhonda/chrome-mcp-profile/Default`
- **Status**: ✅ **RESOLVED** - Paths are now consistent

## 📂 Extension Details

### Extensions Being Loaded
1. **AdBlocker** (`/Users/usedhonda/projects/Chrome-Extension/AdBlocker/extension`)
   - manifest_version: 3
   - Valid manifest.json
   - Target: YouTube

2. **meet_moderator** (`/Users/usedhonda/projects/Chrome-Extension/meet_moderator/dist`)
   - manifest_version: 3
   - Valid manifest.json

3. **monolith** (`/Users/usedhonda/projects/Chrome-Extension/monolith`)
   - manifest_version: 3
   - Valid manifest.json
   - AI discussion tool

4. **my-prompt** (`/Users/usedhonda/projects/Chrome-Extension/my-prompt/extension`)
   - manifest_version: 3
   - Valid manifest.json

5. **sunoprompt** (`/Users/usedhonda/projects/Chrome-Extension/sunoprompt/extension`)
   - manifest_version: 3
   - Valid manifest.json
   - Target: suno.com

### Sample Extension Manifest (monolith)
```json
{
  "manifest_version": 3,
  "name": "Monolith - AI議論観戦",
  "version": "2.7.1",
  "description": "Webページのコンテンツを元に4つのAI（GPT、Gemini、Claude、DeepSeek）が議論を行う拡張機能。ユーザーの明示的な操作でのみページ内容を読み取り、AI議論に活用します。",
  "permissions": [
    "storage", "activeTab", "scripting", "notifications"
  ],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "https://api.anthropic.com/*",
    "https://api.deepseek.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Monolith - AI議論観戦",
    "default_popup": "",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["modal.html", "modal.css", "modal.js", "user-config.js", "avatar-ui.html", "avatar-ui.css", "avatar-controller.js", "pricing/api-pricing-2025.json"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

## 🔍 Current Investigation Status

### ✅ Confirmed Working
1. **Extension paths exist and are valid**
2. **Manifest.json files are valid manifest_version 3**
3. **Profile path consistency resolved**
4. **Command line arguments correctly passed**
5. **`--disable-extensions` correctly excluded via `ignoreDefaultArgs`**

### ❌ Current Issues
1. **Extensions not visible in `chrome://extensions/`**
2. **Extension scripts not injected into pages**
3. **No extension icons in Chrome toolbar**
4. **Extensions completely non-functional**

### 🔧 Puppeteer Configuration
```typescript
const browser = await puppeteer.launch({
  executablePath: resolvedExecutablePath,
  userDataDir,
  pipe: true,
  headless,
  args,
  ignoreDefaultArgs:
    extensionPaths.length > 0 ? ['--disable-extensions'] : undefined,
});
```

### Extension Loading Implementation
```typescript
// In browser.ts
function scanExtensionsDirectory(extensionsDir: string): string[] {
  const extensionPaths: string[] = [];
  const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const extensionPath = path.join(extensionsDir, entry.name);
      const manifestPath = path.join(extensionPath, 'manifest.json');

      if (fs.existsSync(manifestPath)) {
        extensionPaths.push(extensionPath);
      } else {
        // Check common subdirectories
        const subDirs = ['extension', 'dist', 'dist-simple', 'build', 'src'];
        for (const subDir of subDirs) {
          const subPath = path.join(extensionPath, subDir);
          const subManifest = path.join(subPath, 'manifest.json');
          if (fs.existsSync(subManifest)) {
            extensionPaths.push(subPath);
            break;
          }
        }
      }
    }
  }
  return extensionPaths;
}
```

## 🐛 Debugging Evidence

### Console Logs
- No extension-related errors in browser console
- No manifest errors reported
- Only standard Suno.com website logs visible

### Extension Detection Tests
```javascript
// Executed in browser context
{
  "url": "https://suno.com/create",
  "extensionScripts": [],  // No extension scripts found
  "extensionScriptsCount": 0,
  "extensionButton": false,  // No extension UI elements
  "extensionGlobals": {
    "sunoExtension": false,
    "SUNO_EXTENSION_LOADED": false
  },
  "totalScripts": 116  // Only website scripts
}
```

### Profile Verification
- Command line: `--user-data-dir=/Users/usedhonda/chrome-mcp-profile`
- Profile path: `/Users/usedhonda/chrome-mcp-profile/Default`
- Status: ✅ **Consistent**

## 🚨 Suspected Root Causes

### 1. **Puppeteer Automation Mode Conflicts**
- `--enable-automation` flag may disable extension loading for security
- Chrome's automation mode might have restrictions on `--load-extension`
- Potential Chrome 140 behavioral changes in automation mode

### 2. **Security Policy Changes**
- Chrome may have tightened extension loading in automated contexts
- Manifest V3 extensions might have different loading requirements
- Remote debugging pipe might conflict with extension loading

### 3. **Flag Interaction Issues**
- Combination of `--enable-automation` and `--load-extension` may be problematic
- `--remote-debugging-pipe` might interfere with extension initialization
- Other Puppeteer flags might conflict with extension loading

### 4. **Chrome Version Compatibility**
- Chrome 140 might have breaking changes for extension loading
- Puppeteer version might not be compatible with Chrome 140
- Changes in extension loading sequence in newer Chrome versions

## 🔬 Testing Evidence

### User's Normal Chrome Profile
- **Extensions work normally** in user's regular Chrome profile
- **Same manifest.json files** work perfectly outside MCP context
- **No manifest validation issues** when loaded manually

### MCP Context
- **Command line shows correct --load-extension paths**
- **No visible errors during Chrome startup**
- **Extensions completely absent from chrome://extensions/**
- **No extension functionality on target websites**

## 🎯 Recommended Investigation Areas

### 1. Chrome Automation Mode Restrictions
- Research Chrome 140 changes to extension loading in automation mode
- Test if removing `--enable-automation` allows extension loading
- Investigate alternative browser launching methods

### 2. Puppeteer Configuration
- Test different Puppeteer launch configurations
- Investigate if pipe mode affects extension loading
- Test with different Chrome channels (canary, beta, dev)

### 3. Extension Loading Sequence
- Investigate Chrome's extension loading timeline in automation mode
- Test if extensions need additional initialization time
- Check if background scripts are being blocked

### 4. Security Context
- Research if Content Security Policy affects extension loading
- Investigate if automation context changes extension permissions
- Test if extension APIs are available in automation mode

## 📊 Comparison Analysis

### Working Context (User's Chrome)
```
✅ Extensions visible in chrome://extensions/
✅ Extension scripts injected into pages
✅ Extension UI elements present
✅ Background scripts active
✅ Content scripts executing
```

### MCP Context (Current Issue)
```
❌ Extensions not visible in chrome://extensions/
❌ No extension scripts in pages
❌ No extension UI elements
❌ Background scripts not running
❌ Content scripts not executing
```

## 🔧 Technical Implementation Details

### Browser Launch Configuration
```typescript
// Current implementation in browser.ts
export async function launch(options: LaunchOptions): Promise<Browser> {
  const extensionPaths = getExtensionPaths(options);

  if (extensionPaths.length > 0) {
    args.push(`--load-extension=${extensionPaths.join(',')}`);
    args.push('--enable-experimental-extension-apis');
  }

  const browser = await puppeteer.launch({
    executablePath: resolvedExecutablePath,
    userDataDir,
    pipe: true,
    headless,
    args,
    ignoreDefaultArgs: extensionPaths.length > 0 ? ['--disable-extensions'] : undefined,
  });

  return browser;
}
```

### Extension Path Discovery
```typescript
function getExtensionPaths(options: LaunchOptions): string[] {
  let extensionPaths: string[] = [];

  if (options.loadExtension) {
    extensionPaths.push(options.loadExtension);
  }

  if (options.loadExtensionsDir) {
    const dirPaths = scanExtensionsDirectory(options.loadExtensionsDir);
    extensionPaths.push(...dirPaths);
  }

  // Validate all paths
  extensionPaths = extensionPaths.filter(path => {
    const manifestPath = `${path}/manifest.json`;
    return fs.existsSync(manifestPath);
  });

  return extensionPaths;
}
```

## 📝 Additional Context

### Project Background
- **Chrome DevTools MCP**: Model Context Protocol server for Chrome automation
- **Purpose**: Enable AI assistants to control Chrome and extensions
- **Use Case**: Automated testing and interaction with web applications using extensions

### GitHub Repository Information
- **Original Repository**: https://github.com/ChromeDevTools/chrome-ai-bridge
- **Forked Repository**: https://github.com/usedhonda/chrome-ai-bridge (with extension loading features)
- **Current Branch**: `feature/load-extension-support`
- **Key Added Features**:
  - `--loadExtension` flag support
  - `--loadExtensionsDir` flag support
  - `--userDataDir` flag support
  - Extension validation and debugging capabilities

### Recent Commits
- `7457ca3` feat: add loadExtensionsDir option and Chrome extension development tools
- `74ecfdd` feat: add --loadExtension flag support for Chrome extensions
- Profile path unification and userDataDir support (current session)

### Code Modification Summary
**Files Modified for Extension Support**:
1. `src/cli.ts` - Added CLI options for extension loading
2. `src/main.ts` - Added userDataDir parameter passing
3. `src/browser.ts` - Implemented extension directory scanning and loading logic
4. Enhanced error logging and debugging capabilities

**Key Implementation**:
- Added `scanExtensionsDirectory()` function for bulk extension loading
- Enhanced Puppeteer launch configuration for extension support
- Added `ignoreDefaultArgs: ['--disable-extensions']` when extensions are present
- Implemented comprehensive extension path validation

### Extension Requirements
- All extensions use **Manifest V3**
- Extensions work perfectly in **normal Chrome usage**
- Extensions target various websites (YouTube, Suno.com, etc.)
- Extensions require **content script injection** and **background workers**

### Investigation Priority
This issue is blocking the core functionality of AI-assisted Chrome extension development and testing. The ability to load extensions in the MCP context is critical for the project's success.

## 🧪 Detailed Technical Analysis

### Puppeteer Configuration Deep Dive
```typescript
// Current launch configuration that SHOULD work but DOESN'T
const browser = await puppeteer.launch({
  executablePath: resolvedExecutablePath,
  userDataDir: '/Users/usedhonda/chrome-mcp-profile',
  pipe: true,
  headless: false,
  args: [
    '--allow-pre-commit-input',
    '--disable-background-networking',
    // ... 20+ other flags
    '--load-extension=/path1,/path2,/path3,/path4,/path5',
    '--enable-experimental-extension-apis',
    '--remote-debugging-pipe'
  ],
  ignoreDefaultArgs: ['--disable-extensions'] // This should enable extensions
});
```

### Chrome Process Inspection
**Process ID**: 29494
**Command Line Length**: ~2000 characters
**Extension Paths**: 5 valid extension directories
**Profile Consistency**: ✅ Command line and profile paths match

### Critical Debugging Information

#### Extension Path Validation
```bash
# All paths exist and contain valid manifest.json
/Users/usedhonda/projects/Chrome-Extension/AdBlocker/extension/manifest.json ✅
/Users/usedhonda/projects/Chrome-Extension/meet_moderator/dist/manifest.json ✅
/Users/usedhonda/projects/Chrome-Extension/monolith/manifest.json ✅
/Users/usedhonda/projects/Chrome-Extension/my-prompt/extension/manifest.json ✅
/Users/usedhonda/projects/Chrome-Extension/sunoprompt/extension/manifest.json ✅
```

#### JavaScript Runtime Detection
```javascript
// Executed in browser context - NO extension presence detected
{
  extensionScripts: [],           // Should contain chrome-extension:// URLs
  extensionGlobals: false,        // Should contain extension variables
  totalScripts: 116              // Only website scripts, no extension scripts
}
```

#### Chrome DevTools Console
- **No extension load errors reported**
- **No manifest parsing errors**
- **No permission denial messages**
- **Silent failure - extensions simply don't load**

### Working vs. Non-Working Comparison

#### ✅ Normal Chrome (Working)
```bash
# User manually loads extensions via chrome://extensions/
# Result: Extensions appear and function normally
google-chrome --load-extension=/same/paths
# ✅ Extensions visible in chrome://extensions/
# ✅ Content scripts inject
# ✅ Background scripts active
```

#### ❌ Puppeteer Chrome (Not Working)
```bash
# Same exact paths, same manifest files
puppeteer.launch({ args: ['--load-extension=/same/paths'] })
# ❌ Extensions NOT visible in chrome://extensions/
# ❌ Content scripts don't inject
# ❌ Background scripts don't start
```

### Key Differences Analysis

#### Puppeteer-Specific Flags
```bash
--enable-automation          # SUSPECT: May disable extensions
--remote-debugging-pipe      # SUSPECT: May conflict with extension loading
--disable-component-extensions-with-background-pages  # May affect Manifest V3
```

#### Flag Interaction Matrix
| Flag Combination | Extension Loading | Notes |
|------------------|-------------------|-------|
| `--load-extension` alone | ✅ Works | In normal Chrome |
| `--load-extension` + `--enable-automation` | ❌ Fails | Current issue |
| `--load-extension` + `--remote-debugging-pipe` | ❓ Unknown | Needs testing |

### Chrome 140 Behavioral Changes Research Required

#### Potential Chrome Updates
- **Extension loading in automation mode**
- **Manifest V3 security restrictions**
- **Service worker initialization timing**
- **Content script injection policies**

#### Version Compatibility Matrix
| Chrome Version | Puppeteer Version | Extension Loading | Status |
|----------------|-------------------|-------------------|--------|
| 140.0.7339.208 | Latest (current) | ❌ Broken | Current issue |
| < 140 | Previous | ❓ Unknown | Needs verification |

## 📋 Verification Checklist

### ✅ Confirmed Facts
- [ ] Extension manifest.json files are valid
- [ ] Extension directories exist and accessible
- [ ] Command line shows correct --load-extension paths
- [ ] Profile paths are consistent
- [ ] --disable-extensions is properly excluded
- [ ] Extensions work in normal Chrome context
- [ ] No visible error messages in console

### ❓ Unverified Hypotheses
- [ ] --enable-automation blocks extension loading
- [ ] Chrome 140 changed extension loading behavior
- [ ] --remote-debugging-pipe interferes with extensions
- [ ] Manifest V3 has different automation mode requirements
- [ ] Puppeteer version incompatibility with Chrome 140

### 🔬 Required Experiments
1. **Remove --enable-automation flag** and test extension loading
2. **Test with older Chrome versions** (< 140)
3. **Test with different Puppeteer launch modes** (non-pipe)
4. **Test single extension loading** vs multiple extensions
5. **Test with Manifest V2 extensions** (if available)

---

**Investigation Status**: 🔴 **CRITICAL** - Extensions not loading despite correct configuration
**Next Steps**: Research Chrome 140 automation mode restrictions and Puppeteer compatibility
**Timeline**: Urgent resolution needed for project functionality

**For External AI Analysis**: Please review the GitHub repositories and this investigation document to identify the root cause of why `--load-extension` works in normal Chrome but fails in Puppeteer automation mode with Chrome 140.

## 🤝 Investigation Scope & Preferences

### Chrome Version Testing
- ✅ **Open to testing older Chrome versions** (139, 138, etc.)
- **Reason**: Essential to determine if this is Chrome 140-specific regression
- **Available**: Can install multiple Chrome channels (stable, beta, canary)
- **Priority**: High - this could quickly isolate the issue

### Investigation Focus Areas
- 🎯 **Primary Focus**: Both Puppeteer-specific fixes AND Chrome 140+ changes
- **Rationale**: Problem likely stems from interaction between the two
- **Approach**:
  1. Test Chrome version regression (highest priority)
  2. Investigate Puppeteer launch flag modifications
  3. Research Chrome 140 automation mode policy changes
  4. Test alternative browser launching methods

### Extension Manifest Version
- 🔒 **Manifest V3 Only** - Do NOT test with Manifest V2
- **Reason**: All production extensions use Manifest V3
- **Context**: Manifest V2 is deprecated and will be removed
- **Goal**: Must work with modern extension architecture
- **Note**: Problem affects all 5 extensions, all are Manifest V3

### Testing Constraints
- **Environment**: macOS arm64 (Apple Silicon)
- **Production Requirement**: Solution must work in MCP automation context
- **User Extensions**: Must maintain compatibility with existing extension codebase
- **No Modifications**: Cannot modify extension manifest.json files (they work in normal Chrome)

### Success Criteria
- Extensions visible in `chrome://extensions/`
- Content scripts injecting into target pages
- Background service workers active
- Extension UI elements appearing in browser toolbar
- Full extension functionality in automated context