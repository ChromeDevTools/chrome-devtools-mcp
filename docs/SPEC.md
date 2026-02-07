# chrome-ai-bridge Technical Specification

**Version**: v2.1.0
**Last Updated**: 2026-02-05

---

## Quick Start

### Before Starting Development

1. **Read this document** (mandatory) - Understand architecture, flows, and selectors
2. Verify build with `npm run build`
3. Install Chrome extension (from `src/extension/`)

### When Problems Occur

1. Check [Section 13 "Troubleshooting"](#13-troubleshooting)
2. Get snapshots with `npm run cdp:chatgpt` / `npm run cdp:gemini`
3. Check logs in `.local/chrome-ai-bridge/debug/`

### Code Change Flow

```bash
npm run build      # 1. Build
npm run typecheck  # 2. Type check
npm run test:smoke # 3. Basic operation check (recommended)
```

**When changing extension**: Always update version in `src/extension/manifest.json`

### Document Structure

| Section | Content | When to Read |
|---------|---------|--------------|
| 1. Architecture | Component structure | First read |
| 2. Connection Flow | getClient/createConnection | Connection issues |
| 3. ChatGPT Operation | Selectors, completion detection, Thinking mode | ChatGPT implementation |
| 4. Gemini Operation | Selectors, completion detection, Shadow DOM | Gemini implementation |
| 10. Testing | Test commands, scenarios | Test execution |
| 13. Troubleshooting | Problems and solutions | When issues occur |

---

## Project Overview

**chrome-ai-bridge** is an MCP server for controlling ChatGPT / Gemini Web UI from AI coding assistants like Claude Code.

### Package Information

- **npm package**: `chrome-ai-bridge`
- **Based on**: [Chrome DevTools MCP](https://github.com/anthropics/anthropic-quickstarts) concepts

### Key Features

- **ChatGPT/Gemini Operation**: Send questions and retrieve answers via Web UI
- **Network-Native Response Extraction**: Primary response capture via CDP Network domain (UI-change resistant)
- **Parallel Query**: Query ChatGPT and Gemini simultaneously (for multi-AI discussions)
- **Session Management**: Maintain chat sessions per project
- **Auto Retry**: Stuck state detection and automatic recovery
- **Chrome Extension**: Browser control via CDP (Chrome DevTools Protocol)

### Architecture Highlights

- **Extension-only Mode**: Works with Chrome extension only, no Puppeteer required
- **Direct CDP Communication**: Fast DOM and Network operations via extension
- **Network Interception**: Response extraction via CDP Network domain (UI-change resistant)
- **Shadow DOM Support**: Compatible with Gemini's Web Components

---

## Installation & Usage

### npm Package

```bash
# Global install
npm install -g chrome-ai-bridge

# Local install
npm install chrome-ai-bridge

# Direct execution
npx chrome-ai-bridge
```

### v2.0 Setup (Extension Mode)

> **⚠️ v2.0.0 Breaking Change**
>
> v2.0.0 switched to Chrome extension mode. CLI options from v1.x (`--headless`, `--loadExtension`, etc.) are **no longer supported**.

**Setup steps:**
1. Build and load the extension from `build/extension/` in Chrome
2. Open ChatGPT/Gemini tabs and log in
3. Configure MCP client (see README.md)

---

## Security Considerations

- Browser instance contents are exposed to MCP client
- Handle personal/confidential information with care
- **Session files**: Stored in `.local/chrome-ai-bridge/`
- **Extension communication**: Via localhost WebSocket (port 8766)

### Known Limitations

- Requires manual Chrome extension installation
- ChatGPT/Gemini must be logged in via browser
- Extension must be running for MCP tools to work

---

## Use Cases

### For AI Coding Assistants

- Consult ChatGPT/Gemini for second opinions
- Multi-AI discussions for architectural decisions
- Debug complex problems with multiple perspectives

### For QA Engineers

- E2E tests including extensions
- Performance tests considering extension impact
- Integration tests between extensions and web apps

---

## Development Workflow

### Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 22.12.0+
- **Build Tool**: TypeScript Compiler (tsc)
- **Key Dependencies**:
  - `@modelcontextprotocol/sdk`: MCP SDK

### Distribution vs Development Entry Points

This project uses different entry points for **user distribution** and **developer hot-reload**.

#### User Distribution - Simple

```bash
npx chrome-ai-bridge@latest
```

**Internal flow:**
```
scripts/cli.mjs
  ↓
node --import browser-globals-mock.mjs build/src/main.js
  ↓
MCP server starts (single process)
```

**Features:**
- `--import` flag used internally (transparent to user)
- `browser-globals-mock.mjs` ensures chrome-devtools-frontend Node.js compatibility
- Simple and fast

#### Developer Hot-Reload - Efficient

```bash
npm run dev
```

**Internal flow:**
```
scripts/mcp-wrapper.mjs (MCP_ENV=development)
  ↓
tsc -w (TypeScript auto-compile)
  ↓
chokidar (build/ directory watch)
  ↓
File change detected → build/src/main.js auto-restart
```

**Features:**
- TypeScript edit → 2-5 seconds to reflect
- No VSCode Reload Window needed
- 3-7x development speed improvement

### Build & Development Commands

```bash
npm run build        # Build
npm run dev          # Development mode (hot-reload)
npm run typecheck    # Type check
npm run format       # Format
npm test            # Run tests
npm run restart-mcp  # Restart MCP server
```

### browser-globals-mock Explained

**Problem:**
- chrome-devtools-frontend expects browser globals: `location`, `self`, `localStorage`
- Node.js environment lacks these
- Import error: `ReferenceError: location is not defined`

**Solution:**
- `scripts/browser-globals-mock.mjs` mocks browser globals
- `node --import browser-globals-mock.mjs` loads before main.js
- chrome-devtools-frontend import succeeds

**File:**
```javascript
// scripts/browser-globals-mock.mjs
globalThis.location = { search: '', href: '', ... };
globalThis.self = globalThis;
globalThis.localStorage = { getItem: () => null, ... };
```

**Integration:**
- Distribution: `scripts/cli.mjs` auto-invokes with `--import`
- Development: `scripts/mcp-wrapper.mjs` not needed (fallback built into build/src/main.js)
- Transparent to users

### Code Style

- **Linter**: ESLint + @typescript-eslint
- **Formatter**: Prettier
- **Indent**: 2 spaces
- **Semicolon**: Required
- **Quotes**: Single quotes preferred

### Testing Strategy

- Uses Node.js built-in test runner
- Test files: `build/tests/**/*.test.js`
- Snapshot testing supported
- Test suite: Run with `npm run test:suite`
- Extension loading test cases planned

### Contributing Guidelines

1. **Commit Convention**: Conventional Commits format
   - `feat:` New feature
   - `fix:` Bug fix
   - `chore:` Other changes
   - `docs:` Documentation update
   - `test:` Test additions/fixes

2. **Pull Requests**:
   - Create PRs to main branch
   - Tests, type check, format check required
   - Clear description of changes
   - Detailed explanation for extension-related changes

3. **Debugging**:
   - `DEBUG=mcp:*` environment variable enables debug logs
   - `--logFile` option for log file output
   - Extension logs visible in DevTools console

---

## 1. Architecture Overview

chrome-ai-bridge is a tool that uses MCP (Model Context Protocol) to automate ChatGPT / Gemini Web UI from AI coding assistants (Claude Code, etc.).

### Component Structure

```
┌─────────────────┐         MCP         ┌──────────────────┐
│  Claude Code    │ ◀──────────────────▶│   MCP Server     │
│  (MCP Client)   │                     │  (Node.js)       │
└─────────────────┘                     └────────┬─────────┘
                                                 │
                        ┌────────────────────────┼────────────────────────┐
                        │                        │                        │
                        ▼                        ▼                        ▼
              ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
              │ Discovery Server│     │   Relay Server   │     │  CDP Client     │
              │   (HTTP:8766)   │     │   (WebSocket)    │     │  (fast-cdp)     │
              └────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
                       │                       │                        │
                       └───────────────────────┼────────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │ Chrome Extension │
                                    │ (Service Worker) │
                                    └────────┬─────────┘
                                             │
                               ┌─────────────┴─────────────┐
                               ▼                           ▼
                    ┌─────────────────┐         ┌─────────────────┐
                    │  ChatGPT Tab    │         │  Gemini Tab     │
                    │ (chatgpt.com)   │         │ (gemini.google) │
                    └─────────────────┘         └─────────────────┘
```

### Main Components

| Component | File | Role |
|-----------|------|------|
| MCP Server | `src/main.ts` | Implements MCP protocol, handles tool calls |
| Discovery Server | `src/extension/relay-server.ts` | Notifies extension of connection info (port 8766) |
| Relay Server | `src/extension/relay-server.ts` | Mediates WebSocket communication with extension |
| CDP Client | `src/fast-cdp/cdp-client.ts` | Sends Chrome DevTools Protocol commands |
| Fast Chat | `src/fast-cdp/fast-chat.ts` | ChatGPT/Gemini operation logic |
| NetworkInterceptor | `src/fast-cdp/network-interceptor.ts` | Network response capture and protocol parsing |
| Chrome Extension | `src/extension/background.mjs` | Executes CDP commands in browser |

---

## 2. Connection Flow

**Related sections**: [Troubleshooting - Problem 3](#problem-3-session-reuse-fails), [Problem 6 - Extension not connected](#problem-6-extension-not-connected)

### 2.1 Overview

Connection is established in the following flow:

1. MCP server starts Discovery Server (port 8766)
2. Chrome extension detects Discovery Server via polling
3. Extension establishes WebSocket connection to Relay Server
4. CDP session is established, enabling tab operations

### 2.2 getClient() / createConnection()

**Function**: `getClient()` in `src/fast-cdp/fast-chat.ts`

```typescript
export async function getClient(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  // 1. Check health if existing connection exists
  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;
  if (existing) {
    const healthy = await isConnectionHealthy(existing, kind);
    if (healthy) return existing;  // Reuse
    // Clear if disconnected
  }

  // 2. Create new connection
  return await createConnection(kind);
}
```

### 2.3 createConnection() Strategy

**Function**: `createConnection()` in `src/fast-cdp/fast-chat.ts`

```
Common to ChatGPT/Gemini:
1. Get preferredUrl, preferredTabId from session file
2. Attempt to reuse existing tab (3s timeout)
3. If failed, create new tab (5s timeout, max 2 retries)
```

### 2.4 Connection Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ getClient() call                                                │
└─────────────────┬───────────────────────────────────────────────┘
                  ▼
        ┌─────────────────┐     Yes    ┌─────────────────┐
        │ Existing conn?  │ ─────────▶ │ Health check    │
        └────────┬────────┘            │ (4s timeout)    │
                 │ No                   └────────┬────────┘
                 ▼                               │
        ┌─────────────────┐                      │ OK
        │ Create new conn │ ◀────────────────────┘ NG
        └────────┬────────┘
                 ▼
        ┌─────────────────┐     Fail   ┌─────────────────┐
        │ Reuse existing  │ ─────────▶ │ Create new tab  │
        │ tab (3s timeout)│            │ (5s, max 2x)    │
        └─────────────────┘            └─────────────────┘
```

### 2.5 Discovery Server

**File**: `src/extension/relay-server.ts`

| Item | Value |
|------|-------|
| Port | 8766 (fixed) |
| Endpoint | `GET /mcp-discovery` |
| Role | Notifies extension of WebSocket URL and target tab info |

**Response example**:
```json
{
  "wsUrl": "ws://127.0.0.1:52431",
  "tabUrl": "https://chatgpt.com/",
  "tabId": 123,
  "newTab": false
}
```

### 2.6 Relay Server

**File**: `src/extension/relay-server.ts`

- WebSocket server (dynamic port)
- Mediates bidirectional communication with extension
- Sends/receives CDP commands

### 2.7 Focus Emulation

**Problem**: Chrome throttles DOM updates in background tabs. When users switch to another tab during AI response generation, the response extraction may fail or return incomplete/empty text.

**Root cause analysis**:
- Chrome's Page Visibility API marks background tabs as `hidden`
- `document.visibilityState === 'hidden'` triggers throttling
- `requestAnimationFrame` callbacks are paused
- DOM mutations may be batched or delayed

#### Approaches Considered

| Approach | Description | Verdict |
|----------|-------------|---------|
| `Emulation.setFocusEmulationEnabled` | CDP command to emulate focused page | **Adopted** |
| `Page.bringToFront` | Bring tab to foreground before extraction | Kept as fallback |
| JS injection (visibilityState override) | Override `document.visibilityState` via `defineProperty` | Rejected |
| JS injection (rAF polyfill) | Replace `requestAnimationFrame` with `setTimeout` | Rejected |

#### Decision Rationale (from ChatGPT/Gemini/Claude discussion)

**Summary**:

| Topic | ChatGPT | Gemini | Adopted |
|-------|---------|--------|---------|
| setFocusEmulationEnabled effect | Fixes visibilityState to visible (documented in DevTools) | No effect (incorrect) | ChatGPT |
| JS injection | High risk, not recommended | Recommended | ChatGPT |
| Final recommendation | Layered fallback approach | JS injection | ChatGPT |

**Key evidence**:
1. **Chrome DevTools documentation** explicitly states: "When Emulate a focused page is enabled, `document.visibilityState` is set to `visible`"
2. JS injection replacing rAF with setTimeout is ineffective because **setTimeout itself is throttled** in background tabs (max 1 call/second)
3. `document.visibilityState` is read-only; `defineProperty` may fail

#### Implementation

**File**: `src/fast-cdp/fast-chat.ts` (in `createConnection()`)

```typescript
// After Runtime.enable, DOM.enable, Page.enable
try {
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  logInfo('fast-chat', 'Focus emulation enabled');
} catch (e) {
  logWarn('fast-chat', 'setFocusEmulationEnabled failed (non-critical)', { error: String(e) });
}
```

**Locations**:
- Existing tab reuse path (line ~480)
- New tab creation path (line ~540)

#### Rejected Approaches

**1. JS injection - visibilityState override**
```javascript
// REJECTED: visibilityState is read-only, defineProperty may fail
Object.defineProperty(document, 'visibilityState', { value: 'visible' });
```

**2. JS injection - rAF polyfill**
```javascript
// REJECTED: setTimeout is also throttled in background (max 1/sec)
window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
```

**Rejection reasons**:
1. `document.visibilityState` is a read-only property on the Document prototype
2. `setTimeout` in background tabs is throttled to max 1 call per second by Chrome
3. Modifying global APIs (rAF) may break React or other framework internals

#### Fallback Strategy

**Note**: With v2.1 network extraction, background tab DOM throttling is largely bypassed since responses are captured at the network level. The focus emulation and `bringToFront` are only needed for the DOM fallback path.

Even with focus emulation enabled, `Page.bringToFront` is called before DOM-based text extraction as a defense-in-depth measure.

**Technical basis**:
- From Chrome DevTools Protocol documentation: "Emulation.setFocusEmulationEnabled - Enables or disables simulating a focused and active page."
- Reference: https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setFocusEmulationEnabled

---

## 3. ChatGPT Operation Flow

**Related sections**:
- [Selector List](#32-chatgpt-selector-list)
- [Response Completion Detection](#33-chatgpt-response-completion-detection)
- [Thinking Mode Details](#36-chatgpt-thinking-mode-details)
- [Troubleshooting - Input not reflected](#problem-2-chatgpt-input-not-reflected)
- [Troubleshooting - Background tab issue](#problem-4-chatgpt-response-text-becomes-empty-background-tab-issue)

### 3.1 askChatGPTFast() All Steps

**Function**: `askChatGPTFastInternal()` in `src/fast-cdp/fast-chat.ts`

```
1. Get/reuse connection via getClient('chatgpt')
2. Start network capture: interceptor.startCapture()
3. Wait for page load complete (readyState === 'complete', 30s)
4. Wait for SPA rendering stabilization (500ms fixed)
5. Wait for input field to appear (30s)
6. Wait for page load stability (waitForStableCount: stable if same value 2x)
7. Get initial message count (user + assistant)
8. Text input (3-phase fallback)
   - Phase 1: JavaScript evaluate (textarea.value / innerHTML)
   - Phase 2: CDP Input.insertText
   - Phase 3: CDP Input.dispatchKeyEvent (char by char)
9. Input verification (check if normalizedQuestion is included)
10. Search/wait for send button (60s, 500ms interval)
11. Click via JavaScript btn.click() (CDP fallback available)
12. Send button click → verify user message count increase
13. Wait for new assistant message DOM addition (30s)
14. Response completion detection (polling, **8min**, 1s interval)
15. Stop network capture: interceptor.stopCaptureAndWait()
16. Hybrid text selection: network text (primary) vs DOM text (fallback)
17. Save session and record history
```

**Preventing misidentification on existing chat reconnection** (added in v2.0.10):
- Steps 2-3 prevent misidentifying existing responses as new responses when reconnecting to existing chats
- Response detection starts only after accurately obtaining `initialAssistantCount`

### 3.2 ChatGPT Selector List

| Purpose | Selector | Notes |
|---------|----------|-------|
| Input field | `textarea#prompt-textarea` | Primary |
| Input field | `textarea[data-testid="prompt-textarea"]` | Fallback |
| Input field | `.ProseMirror[contenteditable="true"]` | contenteditable version |
| Send button | `button[data-testid="send-button"]` | Primary |
| Send button | `button[aria-label*="送信"]` | Japanese UI |
| Send button | `button[aria-label*="Send"]` | English UI |
| Stop button | text/aria-label contains "Stop generating" or "生成を停止" | - |
| User message | `[data-message-author-role="user"]` | - |
| Assistant message | `[data-message-author-role="assistant"]` | - |
| Response content | `.markdown`, `.prose`, `.markdown.prose` | - |

### 3.3 ChatGPT Response Completion Detection

**Method**: Polling (1s interval, max **8min**)

**Completion conditions (any true)**:

1. No stop button AND send button exists AND send button enabled AND assistantCount > initialAssistantCount
2. Stop button was seen then disappeared AND assistantCount > initialAssistantCount AND input empty
3. **5s** elapsed AND no stop button AND input empty AND !isStillGenerating AND assistantCount > initialAssistantCount (fallback)
4. **10s** elapsed AND !isStillGenerating AND !hasSkipThinkingButton AND assistantCount > initialAssistantCount AND input empty (Thinking mode fallback)

**Important**: `initialAssistantCount` is the initial count obtained before sending the question. This prevents misidentifying existing responses as new ones.

### 3.4 ChatGPT Response Text Filtering

**Background**: In ChatGPT Thinking mode, button text ("Thinking time XX seconds", etc.) may be mixed into the response.

**Filtering targets**:
- Text within `<button>` elements
- Patterns containing "思考時間", "秒" (Japanese time markers)

**Implementation**: `extractChatGPTResponse()` function in `src/fast-cdp/fast-chat.ts`

### 3.5 ChatGPT Network-based Extraction (Primary)

**Source**: `NetworkInterceptor` in `src/fast-cdp/network-interceptor.ts`

v2.1 introduces network-level response extraction as the primary path. This captures the raw SSE stream from ChatGPT's API, independent of DOM rendering.

**Protocol**: ChatGPT Web uses `delta_encoding v1` SSE format via `/backend-api/f/conversation` endpoint.

**SSE format**:
```
event: delta_encoding
data: "v1"

event: delta
data: {"p": "/message/content/parts/0", "o": "append", "v": "Hello"}

event: delta
data: {"v": " world"}

data: [DONE]
```

**Delta operations** (`extractDeltaText()`):
| Format | Meaning | Example |
|--------|---------|---------|
| `{"p": "/message/content/parts/0", "o": "append", "v": "text"}` | Append text to content | Standard text delta |
| `{"v": "text"}` | Shorthand append (no path/operation) | Most common in streaming |
| `{"p": "", "o": "patch", "v": [...]}` | Batch operations | Multiple appends in one message |

**Thinking mode handling**: Thinking content uses `content_type: "thoughts"` which has a different JSON path than `/content/parts/`. The `extractDeltaText()` function naturally filters this by only matching paths containing `/content/parts/`.

**Post-processing**: `stripFormatting()` removes Markdown formatting (`**bold**`, `*italic*`), LaTeX (`$...$`, `$$...$$`), and image references (`[Image of ...]`) to produce plain text.

**Hybrid selection**: After capture, the system compares network-extracted text with DOM-extracted text and selects the longer/more complete result. Network text is preferred when available.

### 3.6 ChatGPT DOM-based Extraction (Fallback)

> ⚠️ **DO NOT DELETE**: The logic described in this section is essential for ChatGPT Thinking mode support. Deleting it will cause response extraction to fail.

#### DOM Structure (Updated 2026-02)

Since ChatGPT 5.2, the DOM structure has changed. Regardless of Thinking mode, responses are stored in a single `.markdown` element.

**Common structure**:
```
article[data-turn="assistant"]
  └── div[data-message-author-role="assistant"]
        ├── button "Thinking time: Xs" (only shown in Thinking mode)
        └── div.markdown.prose
              └── p, h1-h6, li, pre, code... (response text)
```

> ⚠️ **Important changes**:
> - `data-message-author-role` is on the inner `div` element, not `article`
> - `.result-thinking` class is not used in current UI
> - Even in Thinking mode, there is only one `.markdown` (containing response text)

#### Extraction Priority

**Function**: `extractChatGPTResponse()` in `src/fast-cdp/fast-chat.ts`

| Priority | Step | Selector/Method | Reason |
|----------|------|-----------------|--------|
| 1 | `.markdown` | `article .markdown` | Main response text |
| 2 | `.prose`, `[class*="markdown"]` | Generic markdown selectors | Fallback for UI changes |
| 3 | `p` elements | `article p` | When markdown class is missing |
| 4 | `article.innerText` | Full element text | Fallback for DOM structure changes |
| 5 | `main` + `body.innerText` | Full page text | Final fallback |

> ⚠️ **body.innerText fallback note**: When truncating by end markers ("あなた:", "You:", etc.), ignore matches within first 10 characters (`idx > 10` condition). This prevents response text from being erroneously truncated at the beginning.

#### Text Rendering Wait

**Problem**: Even after the stop button disappears, response text may not be reflected in the DOM due to React's async rendering. Especially in Thinking mode, significant delays occur before the response is rendered after long thinking.

**Solution**: Poll for text appearance for up to **120 seconds** (2 min) after stop button disappears.

```typescript
// Inside extractChatGPTResponse()
const maxWaitForText = 120000;  // 120s (Thinking mode support)
const pollInterval = 200;       // 200ms interval

while (Date.now() - waitStart < maxWaitForText) {
  const checkResult = await checkForResponseText();
  if (checkResult.hasSkipButton) {
    // "Skip thinking" button exists = still thinking, continue waiting
    await sleep(pollInterval);
    continue;
  }
  if (checkResult.hasText && !checkResult.isStreaming) {
    return checkResult.text;
  }
  await sleep(pollInterval);
}
```

> ⚠️ **If deleted**: The issue of returning empty responses immediately after stop button disappears will recur.

### 3.7 ChatGPT Thinking Mode Details

#### Thinking Mode Activation Conditions

> ⚠️ **Important**: Thinking mode only activates with **complex questions**.

| Question Type | Activates | Example |
|---------------|-----------|---------|
| Simple questions | ❌ | "What's 2+2?", "What are the three primary colors?" |
| Complex questions | ✅ | "Design a shortest path algorithm for a graph", "Explain recursion in detail" |

**Testing note**: DOM structure differs when Thinking mode doesn't activate with simple questions. Always use complex questions when testing Thinking mode related features.

#### Thinking Mode Characteristics

| Item | Description |
|------|-------------|
| Display | "Thinking time: Xm Xs" button is shown |
| Thinking content | Expandable by clicking button (collapsed by default) |
| DOM structure | Same as normal mode (only one `.markdown`) |
| Response location | Stored in `.markdown.prose` element |

#### DOM Structure Diagram (Updated 2026-02)

```
【Non-Thinking Mode】
<article data-turn="assistant">
  <div data-message-author-role="assistant">
    <div class="markdown prose">
      <p>Response text...</p>
    </div>
  </div>
</article>

【Thinking Mode】
<article data-turn="assistant">
  <div data-message-author-role="assistant">
    <button>Thinking time: 17s</button>  ← Click to expand thinking content
    <div class="markdown prose">
      <p>Response text...</p>  ← Extract from here
    </div>
  </div>
</article>
```

> ⚠️ **`.result-thinking` is deprecated**: The `.result-thinking` class mentioned in previous documentation is not used in the current ChatGPT UI.

#### Thinking Mode In-Progress Detection

**Problem**: In Thinking mode, thinking may be in progress even when the stop button is not displayed.

**Detection method** (`isStillGenerating` flag):

```typescript
// Detect from body.innerText
const hasGeneratingText = bodyText.includes('回答を生成しています') ||
                         bodyText.includes('is still generating') ||
                         bodyText.includes('generating a response');

// Complete if "Thinking time: Xs" marker exists
const hasThinkingComplete = /思考時間[：:]\s*\d+s?/.test(bodyText) ||
                            /Thinking.*\d+s?/.test(bodyText);

// Thinking in progress if "Skip thinking" button exists
const hasSkipThinkingButton = bodyText.includes('今すぐ回答') ||
                              bodyText.includes('Skip thinking');

const isStillGenerating = (hasGeneratingText && !hasThinkingComplete) || hasSkipThinkingButton;
```

**Processing flow**:
1. `hasSkipThinkingButton` is true → Thinking in progress, continue waiting
2. `isStillGenerating` is true → Response generating, continue waiting
3. Both false AND `hasThinkingComplete` → Complete, proceed to text extraction

> ⚠️ **Important**: Skip completion check while `hasSkipThinkingButton` exists. Early completion detection would capture intermediate thinking state.

#### Thinking Expansion Button Click

**Caution**: The thinking expansion button may also exist next to the input field as "Expand thinking".

**Correct target**:
- Only buttons inside `article[data-message-author-role="assistant"]`
- Detect and click buttons with `aria-expanded="false"`

```javascript
// Detect thinking expansion button (limited to inside article)
const article = document.querySelector('article[data-message-author-role="assistant"]:last-of-type');
const expandButton = article?.querySelector('button[aria-expanded="false"]');
if (expandButton) {
  expandButton.click();
}
```

> ⚠️ **Prevent misclick**: Clicking buttons outside `article` causes unexpected behavior like changing input mode.

---

## 4. Gemini Operation Flow

**Related sections**:
- [Selector List (Language-independent)](#42-gemini-selector-list-language-independent)
- [Response Completion Detection](#43-gemini-response-completion-detection-5-conditions--fallback)
- [Shadow DOM Support](#53-shadow-dom-support)
- [Language-independent Selector Design](#54-language-independent-selector-design)
- [Troubleshooting - Response times out](#problem-1-gemini-response-times-out)

### 4.1 askGeminiFast() All Steps

**Function**: `askGeminiFastInternal()` in `src/fast-cdp/fast-chat.ts`

```
1. Get/reuse connection via getClient('gemini')
2. Start network capture: interceptor.startCapture()
3. Navigate if necessary (measure navigateMs)
4. Wait for page load complete (readyState === 'complete', 30s)
5. Wait for SPA rendering stabilization (500ms fixed)
6. Wait for input field to appear (15s)
7. Wait for page load stability (waitForStableCount: stable if same value 2x)
8. Get initial count (user-query, model-response) ← record initialModelResponseCount
9. Text input (2-phase fallback)
   - Phase 1: JavaScript evaluate (set innerText)
   - Phase 2: CDP Input.insertText
10. Input verification (check if questionPrefix 20 chars is included)
11. Verify text before sending
12. Search/wait for send button (60s, 500ms interval)
13. Click via JavaScript click() (CDP fallback available)
14. Verify user message count increase
15. Wait for new model response DOM addition (30s)
16. Response completion detection (polling, **8min**, 1s interval)
17. Stop network capture: interceptor.stopCaptureAndWait()
18. Hybrid text selection: network text (primary) vs DOM text (fallback)
19. Normalize via normalizeGeminiResponse()
20. Save session and record history
```

**Preventing misidentification on existing chat reconnection** (added in v2.0.10):
- Steps 3-4 prevent misidentifying existing responses as new responses when reconnecting to existing chats
- Response detection starts only after accurately obtaining `initialModelResponseCount`

### 4.2 Gemini Selector List (Language-independent)

| Purpose | Selector | Notes |
|---------|----------|-------|
| Input field | `[role="textbox"]` | Primary |
| Input field | `div[contenteditable="true"]` | Fallback |
| Input field | `textarea` | Fallback |
| Send button | `mat-icon[data-mat-icon-name="send"]` parent button | Primary |
| Send button | text contains "プロンプトを送信" / "送信" | Japanese UI |
| Send button | aria-label contains "送信" / "Send" | - |
| Stop button | text/aria-label contains "停止" / "Stop" | - |
| **Mic button** | `img[alt="mic"]` closest button | **Language-independent** |
| **Feedback** | `img[alt="thumb_up"]`, `img[alt="thumb_down"]` | **Language-independent, most important** |
| User message | `user-query`, `.user-query` | Inside Shadow DOM |
| Response | `model-response` | Inside Shadow DOM (not in direct DOM) |

### 4.3 Gemini Response Completion Detection (5 conditions + fallback)

**Method**: Polling (1s interval, max **8min**)

**State fields**:
- `hasStopButton`: Presence of stop button
- `hasMicButton`: Presence of mic button
- `hasFeedbackButtons`: Presence of feedback buttons (thumb_up/down)
- `sendButtonEnabled`: Whether send button is enabled
- `modelResponseCount`: Number of response elements
- `lastResponseTextLength`: Text length of last response
- `inputBoxEmpty`: Whether input field is empty

**Completion conditions (by priority)**:

| Condition | Description | Reliability |
|-----------|-------------|-------------|
| 0 | sawStopButton AND !hasStopButton AND hasFeedbackButtons AND modelResponseCount > initialModelResponseCount | ★★★ Most reliable |
| 1 | sawStopButton AND !hasStopButton AND hasMicButton AND modelResponseCount > initialModelResponseCount | ★★☆ |
| 2 | sawStopButton AND !hasStopButton AND sendButtonEnabled AND inputBoxEmpty AND modelResponseCount > initialModelResponseCount | ★★☆ |
| 3 | textStableCount >= 5 AND modelResponseCount > initialModelResponseCount AND !hasStopButton | ★☆☆ |
| FB | elapsed > 10s AND !sawStopButton AND modelResponseCount > initialModelResponseCount AND !hasStopButton | Fallback |

**Important**: `initialModelResponseCount` is the initial count obtained before sending the question. This prevents misidentifying existing responses as new ones.

### 4.4 Gemini Network-based Extraction (Primary)

**Source**: `NetworkInterceptor` in `src/fast-cdp/network-interceptor.ts`

v2.1 introduces network-level response extraction as the primary path for Gemini, capturing the raw streaming response independent of Shadow DOM rendering.

**Protocol**: Gemini Web uses StreamGenerate chunked format via `/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate` endpoint.

**Response format**:
```
)]}'

<byte_count>
[["wrb.fr",null,"<inner_json_string>"]]

<byte_count>
[["wrb.fr",null,"<inner_json_string>"]]
```

**Parsing flow** (`parseGeminiStreamBody()`):
1. Strip `)]}'` prefix
2. Skip byte count lines (lines matching `/^\d+$/`)
3. Parse outer JSON array: `outer[0][2]` is a JSON string
4. Parse inner JSON: `inner[4][0][1][0]` contains accumulated text

**Key characteristic**: Each streaming chunk contains the **full accumulated text** (not deltas). The parser keeps the longest text found across all chunks.

**Post-processing**:
- `stripFormatting()` removes LaTeX math notation, image references (`[Image of ...]`), and Markdown formatting
- `normalizeGeminiResponse()` is applied to the final text for consistency with DOM-extracted text

**Hybrid selection**: After capture, the system compares network-extracted text with DOM-extracted text and selects the longer/more complete result. Network text is preferred when available.

### 4.5 Gemini DOM-based Text Extraction (Fallback)

**Priority**:

1. **Feedback button based** (recommended)
   - Find `img[alt="thumb_up"]`
   - Locate response container via `closest('button')` → `parentElement` → `parentElement`
   - Collect text from p, h1-h6, li, td, th, pre, code elements

2. **Selector based** (fallback)
   - Search Shadow DOM with `collectDeep(['model-response', ...])`
   - Get innerText of last response element

3. **aria-live** (last resort)
   - Get text from `[aria-live="polite"]`

### 4.6 Input Verification Mechanism

```typescript
// Check if first 20 characters of question are included in input field
const questionPrefix = question.slice(0, 20).replace(/\s+/g, '');
let inputOk = inputResult.ok &&
  inputResult.actualText.replace(/\s+/g, '').includes(questionPrefix);
```

If failed:
1. Retry with `Input.insertText`
2. Re-verify

---

## 5. Text Input Implementation

### 5.1 3-Phase Fallback (ChatGPT)

**Function**: Inside `askChatGPTFastInternal()`

```
Phase 1: JavaScript evaluate
  - textarea.value = text + dispatchEvent('input')
  - contenteditable: set innerHTML or execCommand('insertText')

Phase 2: CDP Input.insertText (when Phase 1 fails)
  - await client.send('Input.insertText', {text: question});

Phase 3: CDP Input.dispatchKeyEvent (when Phase 2 fails)
  - Ctrl+A, Backspace to select all and delete
  - Send keyDown events character by character
```

### 5.2 2-Phase Fallback (Gemini)

**Function**: Inside `askGeminiFastInternal()`

```
Phase 1: JavaScript evaluate
  - Set innerText + dispatchEvent('input', 'change')

Phase 2: CDP Input.insertText (when Phase 1 verification fails)
  - execCommand('selectAll'), execCommand('delete')
  - await client.send('Input.insertText', {text: question});
```

---

## 5.3 Shadow DOM Support

### Background

Gemini heavily uses Web Components (Shadow DOM).
Standard `document.querySelector` cannot access internal elements.

### collectDeep() Function

Recursively searches inside Shadow DOM:

```javascript
const collectDeep = (selectorList) => {
  const results = [];
  const seen = new Set();
  const visit = (root) => {
    if (!root) return;
    for (const sel of selectorList) {
      root.querySelectorAll?.(sel)?.forEach(el => {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      });
    }
    const elements = Array.from(root.querySelectorAll('*') || []);
    for (const el of elements) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(document);
  return results;
};
```

### Usage Locations

- Send button search
- Input field search
- Response element search
- User message count

---

## 5.4 Language-independent Selector Design

### Background

Gemini's UI changes based on user's language setting:
- Japanese: "良い回答", "悪い回答", "マイク"
- English: "Good response", "Bad response", "Microphone"

Depending on `aria-label` or `textContent` requires language-specific branching.

### Solution: img alt Attribute

Gemini's icons are implemented as img elements, and alt attributes are language-independent:
- `img[alt="mic"]` - Mic icon
- `img[alt="thumb_up"]` - Good response icon
- `img[alt="thumb_down"]` - Bad response icon

### Implementation Pattern

```javascript
// Detect mic button
const micImg = document.querySelector('img[alt="mic"]');
const micButton = micImg?.closest('button');

// Detect feedback button
const hasFeedback = !!document.querySelector('img[alt="thumb_up"], img[alt="thumb_down"]');
```

---

## 6. Send Button Detection

### 6.1 Search Logic

```javascript
// 1. Collect all buttons with collectDeep (including Shadow DOM)
const buttons = collectDeep(['button', '[role="button"]'])
  .filter(isVisible)
  .filter(el => !isDisabled(el));

// 2. If stop button exists, treat as "generating" (disabled)
const hasStopButton = buttons.some(b =>
  b.textContent.includes('Stop generating') ||
  b.getAttribute('aria-label').includes('停止')
);

// 3. Search for send button by priority
let sendButton =
  buttons.find(b => b.getAttribute('data-testid') === 'send-button') ||
  buttons.find(b => b.getAttribute('aria-label')?.includes('送信'));
```

### 6.2 Click Execution

**Primary**: Direct click via JavaScript `btn.click()`

**Fallback**: CDP Input.dispatchMouseEvent

```typescript
// mousePressed
await client.send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: buttonInfo.x,
  y: buttonInfo.y,
  button: 'left',
  clickCount: 1
});

await new Promise(resolve => setTimeout(resolve, 50));

// mouseReleased
await client.send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: buttonInfo.x,
  y: buttonInfo.y,
  button: 'left',
  clickCount: 1
});
```

---

## 7. Response Completion Detection (Details)

For detailed response completion detection for ChatGPT and Gemini, see sections 3.3 and 4.3.

**Common design principles**:
- Polling method (1s interval)
- Max wait time: **8min** (480s) - supports long/complex responses
- Evaluate multiple completion conditions by priority
- Track "whether generation has started" with `sawStopButton` flag

---

## 7.1 ChatGPT vs Gemini Implementation Comparison

| Item | ChatGPT | Gemini |
|------|---------|--------|
| Input field wait | 30s | 15s |
| Response wait | **8min** | **8min** |
| Polling interval | 1s | 1s |
| Shadow DOM | Not needed | **Required** (uses collectDeep) |
| Main completion indicator | **Count increase detection** + stop button disappears | **Count increase detection** + feedback button appears |
| Count tracking method | `assistantCount > initialAssistantCount` | `modelResponseCount > initialModelResponseCount` |
| Text extraction method | Network (SSE delta parser) primary, DOM fallback | Network (chunked parser) primary, DOM fallback |
| Network protocol | delta_encoding v1 SSE | StreamGenerate chunked |
| DOM text extraction basis | `data-message-author-role` | **`img[alt="thumb_up"]`** |
| Navigation | Not needed (resolved at connection) | Sometimes needed (measure navigateMs) |
| Language support | aria-label branching | **img alt attribute (language-independent)** |

---

## 8. Session Management

### 8.1 sessions.json Structure (V2 - Agent-based)

**Path**: `.local/chrome-ai-bridge/sessions.json`

V2 format introduces agent-based session isolation for Agent Teams support.

```json
{
  "version": 2,
  "agents": {
    "agent-abc123": {
      "lastAccess": "2026-02-07T12:34:56.789Z",
      "chatgpt": {
        "url": "https://chatgpt.com/c/xxx-xxx",
        "tabId": 123,
        "lastUsed": "2026-02-07T12:34:56.789Z"
      },
      "gemini": null
    },
    "legacy-chrome-ai-bridge": {
      "lastAccess": "2026-02-07T12:30:00.000Z",
      "chatgpt": {
        "url": "https://chatgpt.com/c/yyy-yyy",
        "tabId": 456
      },
      "gemini": {
        "url": "https://gemini.google.com/app/xxx",
        "tabId": 789
      }
    }
  },
  "config": {
    "sessionTtlMinutes": 30,
    "maxAgents": 10
  }
}
```

**Migration**: V1 (project-based) format is automatically migrated to V2 on first access. Projects are converted to `legacy-{projectName}` agents.

### 8.2 Agent ID Generation

**File**: `src/fast-cdp/agent-context.ts`

Agent IDs are generated using a hybrid strategy:

| Source | Example | Priority |
|--------|---------|----------|
| `CAI_AGENT_ID` environment variable | `my-agent-12345` | 1 (highest) |
| MCP client name | `claude-code-12345` | 2 |
| Auto-generated | `agent-12345-1707123456789` | 3 (fallback) |

### 8.3 Session Configuration

**Environment Variables**:

| Variable | Default | Validation | Description |
|----------|---------|------------|-------------|
| `CAI_SESSION_TTL_MINUTES` | 30 | `> 0` or fallback to default | Session expiration time |
| `CAI_MAX_AGENTS` | 10 | `> 0` or fallback to default | Maximum concurrent agents |
| `CAI_CLEANUP_INTERVAL_MINUTES` | 5 | `> 0` or fallback to default | Stale session cleanup interval |

### 8.4 History Recording (history.jsonl)

**Path**: `.local/chrome-ai-bridge/history.jsonl`

```jsonl
{"ts":"2026-01-30T10:30:00.000Z","project":"chrome-ai-bridge","provider":"chatgpt","question":"...","answer":"...","url":"https://chatgpt.com/c/xxx","timings":{"connectMs":120,"waitInputMs":500,"inputMs":50,"sendMs":100,"waitResponseMs":5000,"totalMs":5770}}
```

### 8.5 Session Reuse Logic (V2)

**Function**: `getPreferredSessionV2()` in `src/fast-cdp/session-manager.ts`

```typescript
// Get preferred session for current agent
const {url, tabId} = await getPreferredSessionV2('chatgpt');

// Save session after successful connection
await saveAgentSession('chatgpt', url, tabId);

// Clear session on connection failure
await clearAgentSession('chatgpt');
```

Agent sessions are stored in V2 format (`sessions.json`):

```json
{
  "version": 2,
  "agents": {
    "claude-code-12345": {
      "lastAccess": "2026-02-07T10:00:00.000Z",
      "chatgpt": { "url": "https://chatgpt.com/c/xxx", "tabId": 123 },
      "gemini": null
    }
  },
  "config": { "sessionTtlMinutes": 30, "maxAgents": 10 }
}
```

V1 sessions (project-based) are automatically migrated to V2 on first load.

---

## 9. Error Handling

### 9.1 Timeout List

**Legend**:
- **Max**: Proceeds immediately on success. Timeout is the failure threshold
- **Fixed**: Always waits this duration

| Operation | ChatGPT | Gemini | Type | Description |
|-----------|---------|--------|------|-------------|
| Existing tab reuse | 3s | 3s | Max | Attempt connection with tabId from sessions.json. Reuse immediately if responsive, otherwise create new tab |
| New tab creation | 5s | 5s | Max | Create tab + establish CDP via extension. Proceed immediately on success. Retry after 1s on failure (max 2x) |
| Extension connection | 10s | 10s | Max | Discovery Server (port 8766) waits for extension connection. Usually connects in 2-3s |
| **Page load complete** | 30s | 30s | Max | Wait until `readyState === 'complete'`. Important for preventing misidentification on existing chat reconnection |
| **SPA rendering stabilization** | 500ms | 500ms | **Fixed** | Wait for SPA async rendering stabilization. Required before getting initial count |
| Input field wait | 30s | 15s | Max | Wait for input field (textarea/contenteditable) to appear. Longer for ChatGPT due to slow ProseMirror init |
| **Post-input wait** | 200ms | 200ms | **Fixed** | Wait for internal state update after input. Required before sending |
| Send button wait | 60s | 60s | Max | Poll at 500ms intervals until send button is enabled. Disabled while generating (stop button shown) |
| Message send confirmation | 15s | 8s | Max | Wait for user message element to appear after click. Send failed if not |
| **New response DOM addition** | 30s | 30s | Max | Wait for new assistant/model response element after sending. Used to distinguish from existing responses |
| **Response completion wait** | **8min** | **8min** | Max | Poll at 1s intervals until response completion detected. Supports long/complex responses |
| **Text extraction wait** | **120s** | - | Max | Poll at 200ms intervals until text is rendered in DOM after completion. Thinking mode support |
| Health check | 4s | 4s | Max | Verify existence with `client.evaluate('1')` before reusing existing connection |

### 9.2 Retry Logic

**Connection retry** (`createConnection()`):
- New tab creation: max 2x (1s interval)

**Send retry**:
- Enter key fallback (when mouse click fails)

**Gemini Stuck State retry**:
- Max 2 retries in MCP tools (`src/tools/gemini-web.ts`, `src/tools/chatgpt-gemini-web.ts`)
- Auto retry on `GEMINI_STUCK_*` error detection
- Cache cleared via `clearGeminiClient()` inside `fast-chat.ts`

### 9.3 Gemini Stuck State Detection

**Background**: Phenomenon where Gemini stops during response generation and UI updates halt. Occurs when previous session hangs.

**Detection method** (`checkGeminiStuckState()` in `src/fast-cdp/fast-chat.ts`):
```typescript
// Poll at 500ms intervals for max 5 seconds
// Check if stop button disappears
// Stop button still present after 5s → stuck state
```

**Detected errors**:
- `GEMINI_STUCK_STOP_BUTTON`: Stop button doesn't disappear
- `GEMINI_STUCK_NO_RESPONSE`: Response doesn't start

**Handling flow**:
1. Detect stuck state in `askGeminiFast()`
2. Clear connection cache with `clearGeminiClient()` (in `fast-chat.ts`)
3. Throw `GEMINI_STUCK_*` error
4. Catch in MCP tools (`gemini-web.ts`, `chatgpt-gemini-web.ts`)
5. Call `askGeminiFast()` again (max 2x)

### 9.4 Debug Files

**Path**: `.local/chrome-ai-bridge/debug/`

Auto-saved on anomalies:
- `chatgpt-{timestamp}.json`
- `gemini-{timestamp}.json`

**Saved cases**:
- User message send timeout
- Suspicious answer (`isSuspiciousAnswer()` returns true)

### 9.5 Main Debug Fields

State fields obtained in response completion detection loop:

| Field | Description | Purpose |
|-------|-------------|---------|
| `debug_assistantMsgsCount` | Assistant message count | Detect new responses |
| `debug_chatgptArticlesCount` | ChatGPT article count | Detect responses in new UI |
| `debug_markdownsInLast` | .markdown count in last article | Locate text extraction point |
| `debug_lastAssistantInnerTextLen` | Text length | Confirm response was obtained |
| `debug_bodySnippet` | First 200 chars of body.innerText | Page state overview |
| `debug_bodyLen` | Length of body.innerText | Confirm content amount |
| `debug_pageUrl` | Current URL | Verify correct page |
| `debug_pageTitle` | Page title | Verify login status |

---

## 10. Testing

### 10.1 Test Commands

```bash
# Individual tests
npm run test:chatgpt -- "question"
npm run test:gemini -- "question"
npm run test:both

# Network intercept test
npm run test:network -- chatgpt    # Network intercept test (ChatGPT)
npm run test:network -- gemini     # Network intercept test (Gemini)

# CDP snapshots (for debugging)
npm run cdp:chatgpt
npm run cdp:gemini

# Test suite
npm run test:smoke       # Basic operation check
npm run test:regression  # Check for past issue recurrence
npm run test:suite       # Run all scenarios

# Performance measurement
npm run measure:chatgpt  # Measure ChatGPT timings (5 runs)
npm run measure:gemini   # Measure Gemini timings (5 runs)

# Test suite options
npm run test:suite -- --list       # List scenarios
npm run test:suite -- --id=chatgpt-thinking-mode  # Specific scenario only
npm run test:suite -- --tag=chatgpt  # Filter by tag
npm run test:suite -- --debug      # With debug info
npm run test:suite -- --help       # Show help
```

### 10.2 Test Scenario List

| ID | Name | Tags | Description |
|----|------|------|-------------|
| `chatgpt-new-chat` | ChatGPT New Chat | smoke, chatgpt | Basic operation check with new chat |
| `chatgpt-existing-chat` | ChatGPT Existing Chat Reconnection | regression, chatgpt | Reconnect to existing chat and ask question |
| `chatgpt-thinking-mode` | ChatGPT Thinking Mode | regression, chatgpt, thinking | Verify Thinking behavior with complex question |
| `chatgpt-code-block` | ChatGPT Code Block Response | smoke, chatgpt, code | Verify code generation response extraction |
| `chatgpt-long-response` | ChatGPT Long Response | chatgpt | Verify timeout with long response |
| `gemini-new-chat` | Gemini New Chat | smoke, gemini | Basic operation check with new chat |
| `gemini-existing-chat` | Gemini Existing Chat Reconnection | regression, gemini | Stuck State detection and retry |
| `gemini-code-block` | Gemini Code Block Response | smoke, gemini, code | Verify code generation response extraction |
| `network-extraction` | Network Extraction | network, chatgpt, gemini | Verify network vs DOM text overlap |
| `parallel-query` | Parallel Query | smoke, parallel | ChatGPT+Gemini simultaneous query |

### 10.3 Test Suite Tag List

| Tag | Description | Usage |
|-----|-------------|-------|
| `smoke` | Basic operation check (new chat, parallel query, code block) | `--tag=smoke` |
| `regression` | Check for past issue recurrence (existing chat reconnection, Thinking mode) | `--tag=regression` |
| `chatgpt` | ChatGPT related only | `--tag=chatgpt` |
| `gemini` | Gemini related only | `--tag=gemini` |
| `thinking` | Thinking mode related | `--tag=thinking` |
| `parallel` | Parallel query related | `--tag=parallel` |
| `code` | Code block response related | `--tag=code` |
| `network` | Network extraction related | `--tag=network` |

**Scenario definition**: `scripts/test-scenarios.json`
**Report location**: `.local/chrome-ai-bridge/test-reports/`

### 10.4 Assertion Verification Features

Assertions available in `test-scenarios.json`:

| Assertion | Description | Example |
|-----------|-------------|---------|
| `bothMustSucceed` | Both must succeed in parallel query | `"bothMustSucceed": true` |
| `minAnswerLength` | Minimum answer character count | `"minAnswerLength": 50` |
| `relevanceThreshold` | Relevance score threshold (0-1) | `"relevanceThreshold": 0.5` |
| `maxTotalMs` | Maximum execution time (ms) | `"maxTotalMs": 60000` |
| `noFallback` | No fallback used | `"noFallback": true` |
| `noEmptyMarkdown` | Empty markdown check | `"noEmptyMarkdown": true` |

### 10.5 Relevance Check Feature

**Function**: `isSuspiciousAnswer()` in `src/fast-cdp/fast-chat.ts`

```typescript
function isSuspiciousAnswer(answer: string, question: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return true;
  if (question.trim() === 'OK') return false;
  // Question has numbers but answer doesn't
  if (/\d/.test(question) && !/\d/.test(trimmed)) return true;
  // Answer is just "ok"
  if (/^ok$/i.test(trimmed)) return true;
  return false;
}
```

### 10.6 Test Question Recommendations

**Forbidden** (AI detection/BAN targets):
- `What's 1+1?`
- `Connection test`
- `Hello` / `OK`

**Recommended** (natural technical questions):
- `Tell me one way to deep copy an object in JavaScript. Include a code example.`
- `How do I read files asynchronously in Python?`
- `Explain how to use generic types in TypeScript briefly.`

---

## 11. Chrome Extension

### 11.1 Extension ID

**Fixed value**: `ibjplbopgmcacpmfpnaeoloepdhenlbm`

Fixed ID generated from `key` in `manifest.json`.

### 11.2 Discovery Polling

**File**: `src/extension/background.mjs`

```javascript
// Polling interval: 3 seconds
// Port: 8766 (fixed)
// Endpoint: http://127.0.0.1:8766/mcp-discovery
```

### 11.3 connect.html Tab Control

**File**: `src/extension/background.mjs`

Controls when connect.html (connection UI) opens to prevent tab spam.

#### Opening Conditions

| Condition | connect.html |
|-----------|--------------|
| User clicks extension icon | Opens |
| **New** MCP server detected (`startedAt >= extensionStartTime`) | Opens |
| **Existing** MCP server on Chrome startup | Doesn't open |

#### Implementation

```javascript
// User action flag
let userTriggeredDiscovery = false;

// true only on icon click
chrome.action.onClicked.addListener(() => {
  userTriggeredDiscovery = true;
  scheduleDiscovery();
});

// Decision on auto-connect failure
if (!ok) {
  const isNewServer = serverStartedAt >= extensionStartTime;
  if (userTriggeredDiscovery || isNewServer) {
    await ensureConnectUiTab(...);  // Opens
  }
  // Existing servers don't open
}
```

#### Background

When multiple MCP servers were detected on Chrome restart, connect.html tabs would open for each. By comparing `startedAt` (MCP server start time) with `extensionStartTime` (extension load time), we distinguish existing servers from new ones.

### 11.4 Service Worker Keep-Alive

**Problem**: Chrome Manifest V3 Service Workers auto-sleep after 30s-5min.

**Solution**: Periodic wake-up via Chrome Alarms API.

| Item | Value |
|------|-------|
| Alarm interval | 30 seconds |
| Alarm name | `keepalive` |
| Additional handling | Auto-restart Discovery polling if stopped when alarm fires |

**File**: `src/extension/background.mjs`

### 11.5 Version Management

Update version in `src/extension/manifest.json` with every change:
- Always increment version when extension files change
- Example: `2.0.0` → `2.0.1`

### 11.6 Extension Version Query

**File**: `src/extension/background.mjs`

The extension supports a `getVersion` command via WebSocket relay.

**Request**:
```json
{"method": "getVersion", "id": 1}
```

**Response**:
```json
{"id": 1, "result": {"version": "2.0.15", "name": "chrome-ai-bridge Extension"}}
```

**Auto-logging on connection**:
When CDP connection is established, the MCP server automatically queries and logs the extension version:
```
[fast-cdp] Extension version: 2.0.15
```

**Implementation**: `src/fast-cdp/extension-raw.ts` (after `attachToTab`)

---

## 12. MCP Tools

### 12.1 Provided Tools (MCP)

| Tool Name | Description |
|-----------|-------------|
| `ask_chatgpt_web` | Send question to ChatGPT |
| `ask_gemini_web` | Send question to Gemini |
| `ask_chatgpt_gemini_web` | Send question to both in parallel (recommended) |
| `take_cdp_snapshot` | Snapshot of page CDP is viewing |
| `get_page_dom` | Get page DOM elements |

**Common Parameters for AI Tools**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | Question to ask |
| `debug` | boolean | No | Return detailed debug info (DOM structure, extraction attempts, timings) |

### 12.2 Internal Functions (for testing/debugging)

Functions available for direct import:

```typescript
// Exported from src/fast-cdp/fast-chat.ts

// Standard functions
askChatGPTFast(question: string): Promise<ChatResult>
askGeminiFast(question: string): Promise<ChatResult>

// With timing info (for testing/measurement)
askChatGPTFastWithTimings(question: string): Promise<ChatResultWithTimings>
askGeminiFastWithTimings(question: string): Promise<ChatResultWithTimings>

// CDP snapshot
takeCdpSnapshot(target: 'chatgpt' | 'gemini'): Promise<CdpSnapshot>
```

**ChatResultWithTimings structure**:
```typescript
interface ChatResultWithTimings {
  answer: string;
  url: string;
  timings: {
    connectMs: number;      // Connection establishment time
    waitInputMs: number;    // Input field wait time
    inputMs: number;        // Input processing time
    sendMs: number;         // Send processing time
    waitResponseMs: number; // Response wait time
    totalMs: number;        // Total time
  };
}
```

### 12.3 Recommended Usage

```
Default: ask_chatgpt_gemini_web (parallel query to both)
For specific AI only: ask_chatgpt_web or ask_gemini_web
```

---

## 13. Troubleshooting

### Problem 1: Gemini Response Times Out

**Symptom**:
```
Timed out waiting for Gemini response (8min). sawStopButton=true, textStableCount=XXX
```

**Cause**: Feedback button not detected

**Verification**:
```bash
npm run cdp:gemini  # Get snapshot
```

**Solution**:
1. Verify `img[alt="thumb_up"]` selector is correct
2. Check if DOM structure has changed with Playwright

### Problem 2: ChatGPT Input Not Reflected

**Symptom**: Empty response returned after sending

**Cause**: Input to ProseMirror contenteditable failed

**Verification**:
Check if "Input verification: OK" appears in logs

**Solution**:
1. Verify Input.insertText fallback is working
2. Verify focus setting (element.focus()) is executed

### Problem 3: Session Reuse Fails

**Symptom**: New tab opens every time

**Cause**: Health check failure (4s timeout)

**Verification**:
Check tabId in `.local/chrome-ai-bridge/sessions.json`

**Solution**:
1. Verify tab still exists
2. Verify extension is working properly

### Problem 4: ChatGPT Response Text Becomes Empty (Background Tab Issue)

> **Note**: With v2.1 network extraction, this issue is largely mitigated. Network extraction captures responses at the protocol level, unaffected by DOM throttling in background tabs. The issue below only affects the DOM fallback extraction path.

**Symptom**:
- ChatGPT response generation completes (stop button disappears)
- But `innerText` / `textContent` returns empty
- `innerHTML` has `<p>` tags but content is empty
- Debug output: `itLen:0, tcLen:0, html:"<p data-start=\"0\" data-end=\"X\"></p>"`

**Cause**:
ChatGPT's React app **doesn't render text in background tabs** (performance optimization).
When tab connected via CDP is in background, DOM nodes exist but text nodes are not rendered.

**Technical details**:
- `data-start="0" data-end="X"` indicates text range, but actual text node doesn't exist
- Exists in React's virtual DOM but not rendered in actual DOM
- Viewing the same page with Playwright shows text normally (Playwright operates in foreground)

**Solution**:
Bring tab to foreground with `Page.bringToFront` CDP command:
```javascript
await client.send('Page.enable');
await client.send('Page.bringToFront');
await new Promise(r => setTimeout(r, 500)); // Wait for React to complete rendering
```

**Implementation location**: Inside `extractChatGPTResponse()` function in `src/fast-cdp/fast-chat.ts`

**Timing**: **Immediately after** 8-min response completion wait loop completes, **before** text extraction loop (`maxWaitForText = 120000`) starts

```
Response completion detection (8min polling)
  ↓
Page.bringToFront ← here
  ↓
Text extraction loop (120s)
  ↓
Return response text
```

**Discovered**: 2026-02-02

### Problem 5: "Login required" Error

**Symptom**: Error saying login is required

**Cause**: Session has expired

**Solution**:
1. Manually log in via browser
2. Verify new session is saved to sessions.json

### Problem 6: Extension Not Connected

**Symptom**: "Extension not connected" error

**Cause**: Communication issue between Discovery Server and extension

**Verification**:
```bash
curl http://127.0.0.1:8766/mcp-discovery
```

**Solution**:
1. Verify extension is enabled in Chrome
2. Check if port 8766 is used by another process
3. Restart Chrome to reload extension

### Problem 7: Network Extraction Returns Empty

**Symptom**: Network interceptor captures frames but extracted text is empty, causing fallback to DOM extraction.

**Cause**: `Network.enable` was not called before capture started, or the API endpoint URL pattern has changed.

**Verification**:
```bash
npm run test:network -- chatgpt   # Check tracked requests and text extraction
npm run test:network -- gemini
```

Look for:
- `Tracked requests` section: verify API URLs are being captured
- `Extracted text` section: verify text is non-empty

**Solution**:
1. Ensure `Network.enable` is called in both tab reuse and new tab paths in `fast-chat.ts`
2. Check URL patterns in `network-interceptor.ts` (`CHATGPT_API_PATTERNS`, `GEMINI_API_PATTERNS`)
3. If ChatGPT endpoint changed from `/backend-api/f/conversation`, update the pattern

---

## Appendix A: File Structure

```
src/
├── fast-cdp/
│   ├── fast-chat.ts      # ChatGPT/Gemini operation logic (main)
│   ├── cdp-client.ts     # CDP command sending client
│   ├── network-interceptor.ts  # Network response capture and protocol parsing
│   ├── extension-raw.ts  # Extension connection handling
│   └── mcp-logger.ts     # Logging
├── tools/
│   ├── chatgpt-web.ts         # ask_chatgpt_web tool
│   ├── gemini-web.ts          # ask_gemini_web tool
│   ├── chatgpt-gemini-web.ts  # ask_chatgpt_gemini_web tool (parallel query)
│   ├── cdp-snapshot.ts        # take_cdp_snapshot tool
│   └── page-dom.ts            # get_page_dom tool
├── extension/
│   ├── background.mjs    # Extension Service Worker
│   ├── relay-server.ts   # Discovery/Relay server
│   ├── manifest.json     # Extension manifest
│   └── ui/
│       ├── connect.html  # Connection UI
│       └── connect.js    # Connection UI logic
├── main.ts              # Entry point
└── index.ts             # MCP server

scripts/
├── test-network-intercept.mjs  # Network extraction test
```

---

## 14. Process Lifecycle Management

### 14.1 Graceful Shutdown (added in v2.0.10)

**Problem**: MCP server processes remained as zombies after Claude Code sessions ended.

**Cause**: Missing cleanup for:
- stdin close/end events (most reliable on Windows)
- SIGTERM/SIGINT signals
- RelayServer connections

### 14.2 Shutdown Implementation

**File**: `src/main.ts`

```typescript
let isShuttingDown = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    timer.unref();  // Don't keep process alive
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

async function shutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Force exit timer (5s) - prevents zombie if cleanup hangs
  const forceExitTimer = setTimeout(() => {
    process.exit(1);
  }, 5000);
  forceExitTimer.unref();

  // Cleanup with 3s timeout
  await withTimeout(cleanupAllConnections(), 3000, 'cleanupAllConnections');

  clearTimeout(forceExitTimer);
  process.exit(0);
}

// Event handlers
process.stdin.on('end', () => shutdown('stdin ended'));
process.stdin.on('close', () => shutdown('stdin closed'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 14.3 Connection Cleanup

**File**: `src/fast-cdp/fast-chat.ts`

```typescript
export async function cleanupAllConnections(): Promise<void> {
  // ChatGPT
  if (chatgptRelay) {
    try { await chatgptRelay.stop(); } catch {}
    chatgptRelay = null;
  }
  chatgptClient = null;

  // Gemini
  if (geminiRelay) {
    try { await geminiRelay.stop(); } catch {}
    geminiRelay = null;
  }
  geminiClient = null;
}
```

### 14.4 Key Design Decisions

| Decision | Reason |
|----------|--------|
| `timer.unref()` | Prevents timers from keeping process alive |
| Force exit after 5s | Ensures process dies even if cleanup hangs |
| Cleanup timeout 3s | Gives enough time for graceful close, but not too long |
| stdin events primary | Most reliable on Windows (SIGTERM may not be sent) |
| Double-call prevention | `isShuttingDown` flag prevents race conditions |

### 14.5 Verification

```bash
# Check running processes
ps aux | grep chrome-ai-bridge
lsof -i :8765-8774 | grep LISTEN

# After /exit, processes should disappear within 5 seconds
```

---

## 15. Background Tab Verification

### 15.1 Purpose

Verify that DOM updates continue in background tabs. This is critical for response detection when users switch to other tabs during AI response generation.

**Hypothesis A**: Once `Page.bringToFront` is called at send time, DOM updates continue even when the tab goes to background.

**Hypothesis B**: Background tabs stop DOM updates (Chrome performance optimization).

### 15.2 Test Commands

```bash
# Gemini background test (default)
npm run test:bg

# Foreground comparison (baseline)
npm run test:bg -- --skip-background

# ChatGPT test
npm run test:bg -- --target=chatgpt

# Extended monitoring duration (20 seconds)
npm run test:bg -- --duration=20

# Combine options
npm run test:bg -- --target=chatgpt --skip-background --duration=30
```

### 15.3 Test Flow

1. Connect to target page via CDP
2. Call `Page.bringToFront` to ensure foreground
3. Send a question
4. Create new tab via `Target.createTarget` (tab becomes background)
5. Monitor DOM state at 1-second intervals
6. Record `textLen` changes and `visibilityState`
7. Determine result based on data

### 15.4 Result Interpretation

| Result | Condition | Conclusion |
|--------|-----------|------------|
| ✅ Hypothesis A correct | `hidden` state detected AND `textLen` increased 3+ times | Current implementation OK |
| ❌ Hypothesis B | `hidden` state detected AND `textLen` change < 3 times | Countermeasure needed |
| ⚠️ Inconclusive | `hidden` state not detected | Manual test required |

### 15.5 Implementation Details

**Background tab creation method**:

| Method | Reliability | Notes |
|--------|-------------|-------|
| `Target.createTarget` | High | CDP-level, bypasses popup blocker |
| `window.open` | Medium | May be blocked by popup blocker |

**Early exit**: Monitoring stops 2 samples after completion detection (feedback buttons appear).

**Script location**: `scripts/test-background-tab.mjs`

### 15.6 Test Results (2026-02-04)

**Environment**: Gemini (gemini.google.com)

**Test scenario**: Complex question (BST/AVL/Red-Black/B-Tree tutorial), delay=5s

| Phase | textLen | Notes |
|-------|---------|-------|
| Before background | 1009 | Growing normally in foreground |
| Background @15s | 349 | **Decreased** (-660) |
| After bringToFront | 1852 | **Jumped** (+1503) |

**Key Findings**:

1. **Generation continues in background**: The +1503 jump after focus recovery proves that generation continued during background state
2. **DOM updates stop**: textLen decreases or freezes when tab is in background
3. **Instant recovery**: `Page.bringToFront` immediately reflects accumulated content

**Conclusion**: **Hypothesis B confirmed with nuance** - Background tabs stop DOM **updates**, but generation continues. Content accumulates and is reflected when focus returns.

**Implications**:
- Calling `Page.bringToFront` at send time is NOT sufficient
- However, calling it before text extraction IS sufficient
- Generation runs independently of DOM visibility

**Recommendation**: No code changes needed. The existing implementation in `extractChatGPTResponse()` and `extractGeminiResponse()` already calls `Page.bringToFront` before polling for text, which correctly handles this behavior.

### 15.7 Extended Test Commands

```bash
# Long response (complex question)
npm run test:bg -- --long

# Delay before background (test timing hypothesis)
npm run test:bg -- --long --delay=5 --duration=60

# Wait for textLen threshold before background
npm run test:bg -- --long --min-textlen=2000 --duration=60

# Combine options
npm run test:bg -- --long --delay=10 --min-textlen=1000 --duration=90
```

---

## 16. FAQ - Frequently Asked Questions

### 16.1 Background Tab Issues

#### Q: Why does my response come back empty when I switch tabs during generation?

**A**: Chrome throttles DOM updates in background tabs. The AI generation continues, but the DOM doesn't reflect the new content until the tab is brought to foreground.

**Current behavior**:
- Generation continues in background (server-side)
- DOM updates are paused or batched
- Content appears instantly when tab regains focus

**How chrome-ai-bridge handles this**:
- **v2.1 network extraction**: Responses are captured at the network level, independent of DOM rendering. Background tab issues are largely mitigated.
- **DOM fallback**: `Page.bringToFront` is called before text extraction, forcing Chrome to render all accumulated content.
- No user action required - handled automatically

**If you still see empty responses**:
1. Check if the tab was closed during generation
2. Verify extension is running (`chrome://extensions`)
3. Run `npm run cdp:chatgpt` or `npm run cdp:gemini` to debug

---

### 16.2 Selector Stability

#### Q: Which selectors break most often?

**A**: UI updates from ChatGPT/Gemini can break selectors. Here's a stability ranking:

| Stability | ChatGPT Selectors | Notes |
|-----------|-------------------|-------|
| High | `[data-message-author-role]` | Semantic, rarely changes |
| High | `textarea#prompt-textarea` | ID-based, stable |
| Medium | `.markdown`, `.prose` | Class-based, may change |
| Medium | `button[data-testid="send-button"]` | Test ID, semi-stable |
| Low | `button[aria-label*="送信"]` | Language-dependent |

| Stability | Gemini Selectors | Notes |
|-----------|------------------|-------|
| High | `img[alt="thumb_up"]` | Image alt, language-independent |
| High | `img[alt="mic"]` | Image alt, language-independent |
| High | `[role="textbox"]` | ARIA role, stable |
| Medium | `model-response` | Custom element, may change |
| Low | Text-based selectors | Language-dependent |

**v2.1 impact**: With network extraction as the primary path, selector breakage is less impactful. Selectors are only used for input field interaction, send button detection, and as a fallback for response extraction. Network extraction does not depend on selectors at all.

**Best practices**:
1. Prefer `data-*` attributes and ARIA roles
2. Use `img[alt="..."]` for Gemini (language-independent)
3. Avoid text content matching when possible
4. Check SPEC.md Section 3.2 and 4.2 for current selectors

---

### 16.3 Diagnostic Procedures

#### Q: How do I diagnose connection issues?

**Step 1: Check extension status**
```bash
# Verify Discovery Server is running
curl http://127.0.0.1:8766/mcp-discovery
```

Expected response:
```json
{"wsUrl": "ws://127.0.0.1:XXXXX", ...}
```

**Step 2: Get CDP snapshot**
```bash
npm run cdp:chatgpt  # or npm run cdp:gemini
```

This saves a snapshot to `.local/chrome-ai-bridge/debug/`

**Step 3: Check session state**
```bash
cat .local/chrome-ai-bridge/sessions.json
```

Verify `tabId` exists and matches an open tab.

**Step 4: Run smoke test**
```bash
npm run test:smoke
```

#### Q: How do I diagnose response extraction issues?

**Step 1: Enable debug mode**
```typescript
// In MCP tool call
{ "question": "...", "debug": true }
```

**Step 2: Check debug output**
Look for:
- `debug_assistantMsgsCount` / `debug_modelResponseCount`
- `debug_lastAssistantInnerTextLen`
- `debug_markdownsInLast`

**Step 3: Manual DOM inspection**
1. Open DevTools in the ChatGPT/Gemini tab
2. Run: `document.querySelectorAll('[data-message-author-role="assistant"]')`
3. Check if elements exist and have content

---

### 16.4 Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Extension not connected` | Extension not running or port blocked | Check `chrome://extensions`, restart Chrome |
| `Timed out waiting for response` | Response took > 8 minutes | Increase timeout or simplify question |
| `GEMINI_STUCK_*` | Gemini session hung | Auto-retry (up to 2x), or clear session |
| `Input verification failed` | Text not entered correctly | Auto-fallback to `Input.insertText` |
| `Login required` | Session expired | Log in manually via browser |

---

### 16.5 Performance Tips

#### Q: How can I speed up responses?

1. **Reuse existing tabs**: Sessions are stored per project. Reusing tabs skips navigation.

2. **Use parallel queries wisely**: `ask_chatgpt_gemini_web` runs both in parallel, but doubles resource usage.

3. **Keep questions focused**: Shorter questions = faster responses = less chance of timeout.

4. **Check extension version**: Run `npm run cdp:chatgpt` and look for "Extension version" in output. Update if needed.

---

## 17. Selector Change Log

Track selector changes for debugging regressions.

### 17.1 ChatGPT

| Date | Selector / Feature | Change | Notes |
|------|----------|--------|-------|
| 2026-02 | Network interception | Added | Primary response extraction via CDP Network domain |
| 2026-02 | `.result-thinking` | Deprecated | No longer used in Thinking mode |
| 2026-02 | `article[data-turn]` | Added | New article structure |
| 2026-01 | `.ProseMirror` | Added | contenteditable input variant |

### 17.2 Gemini

| Date | Selector / Feature | Change | Notes |
|------|----------|--------|-------|
| 2026-02 | Network interception | Added | Primary response extraction via CDP Network domain |
| 2026-01 | `img[alt="thumb_up"]` | Adopted | Language-independent feedback detection |
| 2026-01 | `img[alt="mic"]` | Adopted | Language-independent mic button |

---

## 18. Test Scenario Tags Reference

Quick reference for test filtering:

| Tag | Description | Command |
|-----|-------------|---------|
| `smoke` | Basic operation (new chat, parallel) | `npm run test:suite -- --tag=smoke` |
| `regression` | Past issue prevention | `npm run test:suite -- --tag=regression` |
| `chatgpt` | ChatGPT only | `npm run test:suite -- --tag=chatgpt` |
| `gemini` | Gemini only | `npm run test:suite -- --tag=gemini` |
| `thinking` | Thinking mode | `npm run test:suite -- --tag=thinking` |
| `parallel` | Both AI parallel | `npm run test:suite -- --tag=parallel` |
| `code` | Code generation | `npm run test:suite -- --tag=code` |
| `sequential` | Consecutive prompts | `npm run test:suite -- --tag=sequential` |
| `extraction` | Text extraction | `npm run test:suite -- --tag=extraction` |
| `network` | Network extraction | `npm run test:suite -- --tag=network` |

**Recommended test sequences**:

```bash
# Before release
npm run test:smoke && npm run test:regression

# After selector changes
npm run test:suite -- --tag=extraction

# After timeout changes
npm run test:suite -- --tag=thinking

# Full validation
npm run test:suite
```
