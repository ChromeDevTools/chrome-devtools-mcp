# chrome-ai-bridge Technical Specification

**Version**: v2.0.0
**Last Updated**: 2026-01-31

---

## Project Overview

**chrome-ai-bridge** is a fork of the original Chrome DevTools MCP, adding powerful features for Chrome extension developers.

### Package Information

- **npm package**: `chrome-ai-bridge`
- **Forked from**: [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-ai-bridge) by Google LLC

### Original Features

- **Performance Analysis**: Trace recording and actionable insights via Chrome DevTools
- **Browser Automation**: Reliable Chrome automation with Puppeteer
- **Debug Tools**: Network request analysis, screenshots, console inspection
- **Emulation**: CPU, network, and window size emulation

### Features Added in This Fork

- **Dedicated Profile Architecture**: Isolated Chrome profile for safe extension testing
- **Bookmark Injection System**: Preserves user context while ensuring safety
- **Chrome Extension Loading**: Dynamically load extensions under development
- **Web Store Auto-Submit**: `submit_to_webstore` tool for automated form submission
- **Screenshot Generation**: `generate_extension_screenshots` for Store-ready images

### Why This Fork?

The original Chrome DevTools MCP is excellent but doesn't support Chrome extension testing/development. This fork enables AI-assisted extension development, testing, and debugging.

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

### Launch Options

**Standard options (same as original):**
```bash
npx chrome-ai-bridge@latest              # Basic
npx chrome-ai-bridge@latest --headless   # Headless mode
npx chrome-ai-bridge@latest --channel=canary  # Canary channel
npx chrome-ai-bridge@latest --isolated   # Isolated mode (temp profile)
```

**Extension support options (added in this fork):**
```bash
# Load Chrome extension
npx chrome-ai-bridge@latest --loadExtension=/path/to/extension

# Load multiple extensions
npx chrome-ai-bridge@latest --loadExtension=/path/to/ext1,/path/to/ext2

# Extension with headed mode (some extensions don't work headless)
npx chrome-ai-bridge@latest --loadExtension=/path/to/extension --headless=false
```

---

## Security Considerations

- Browser instance contents are exposed to MCP client
- Handle personal/confidential information with care
- **Dedicated Profile**: Stored in `~/.cache/chrome-ai-bridge/chrome-profile-$CHANNEL`
- **Bookmarks Only**: Only bookmarks are read from system profile (no passwords or history)
- `--isolated` option uses temporary profile
- **Extension Safety**: Ensure loaded extension code is trustworthy

### Known Limitations

**Original limitations:**
- Restrictions in macOS Seatbelt and Linux container sandbox environments
- `--connect-url` recommended for external Chrome instance in sandbox

**Extension support limitations:**
- Some extensions may not work correctly in headless mode
- Only development extensions supported (not Chrome Web Store installed)
- Extension manifest.json must be valid

---

## Use Cases

### For Chrome Extension Developers

- Automated testing of extensions under development
- Content script and web page interaction testing
- Extension performance analysis
- AI-assisted extension debugging

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
  - `puppeteer-core`: Chrome automation (with extension support)
  - `chrome-devtools-frontend`: DevTools integration
  - `yargs`: CLI argument parsing

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
- `npm run test:only` for specific tests
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

### コンポーネント構成

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

### 主要コンポーネント

| コンポーネント | ファイル | 役割 |
|---------------|---------|------|
| MCP Server | `src/main.ts` | MCP プロトコルを実装、ツール呼び出しを処理 |
| Discovery Server | `src/extension/relay-server.ts` | 拡張機能に接続情報を通知（ポート8766） |
| Relay Server | `src/extension/relay-server.ts` | 拡張機能との WebSocket 通信を仲介 |
| CDP Client | `src/fast-cdp/cdp-client.ts` | Chrome DevTools Protocol コマンドを送信 |
| Fast Chat | `src/fast-cdp/fast-chat.ts` | ChatGPT/Gemini 操作ロジック |
| Chrome Extension | `src/extension/background.mjs` | ブラウザ内で CDP コマンドを実行 |

---

## 2. 接続フロー

### 2.1 概要

接続は以下の流れで確立されます:

1. MCP サーバーが Discovery Server を起動（ポート 8766）
2. Chrome 拡張機能が Discovery Server をポーリングで検出
3. 拡張機能が Relay Server に WebSocket 接続
4. CDP セッションが確立され、タブ操作が可能に

### 2.2 getClient() / createConnection()

**ファイル**: `src/fast-cdp/fast-chat.ts:309-335`

```typescript
export async function getClient(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  // 1. 既存接続があれば健全性をチェック
  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;
  if (existing) {
    const healthy = await isConnectionHealthy(existing, kind);
    if (healthy) return existing;  // 再利用
    // 切れていればクリア
  }

  // 2. 新しい接続を作成
  return await createConnection(kind);
}
```

### 2.3 createConnection() の戦略

**ファイル**: `src/fast-cdp/fast-chat.ts:190-302`

```
ChatGPT/Gemini共通:
1. セッションファイルから preferredUrl, preferredTabId を取得
2. 既存タブの再利用を試行（3秒タイムアウト）
3. 失敗した場合、新規タブを作成（5秒タイムアウト、最大2回リトライ）
```

### 2.4 Discovery Server

**ファイル**: `src/extension/relay-server.ts`

| 項目 | 値 |
|------|-----|
| ポート | 8766（固定） |
| エンドポイント | `GET /mcp-discovery` |
| 役割 | 拡張機能に WebSocket URL と接続先タブ情報を通知 |

**レスポンス例**:
```json
{
  "wsUrl": "ws://127.0.0.1:52431",
  "tabUrl": "https://chatgpt.com/",
  "tabId": 123,
  "newTab": false
}
```

### 2.5 Relay Server

**ファイル**: `src/extension/relay-server.ts`

- WebSocket サーバー（動的ポート）
- 拡張機能との双方向通信を仲介
- CDP コマンドの送受信

---

## 3. ChatGPT 操作フロー

### 3.1 askChatGPTFast() の全ステップ

**ファイル**: `src/fast-cdp/fast-chat.ts:342-1067`

```
1. getClient('chatgpt') で接続取得
2. 入力欄の出現を待機（waitForFunction, 30秒）
3. テキスト入力（3段階フォールバック）
4. 入力検証（normalizedQuestion が含まれるか）
5. 送信ボタンの検索・待機（60秒、500ms間隔）
6. CDP Input.dispatchMouseEvent でクリック
7. ユーザーメッセージ送信確認
8. 回答完了検出（ポーリング方式、60秒）
9. 最後のアシスタントメッセージを抽出
10. セッション保存・履歴記録
```

### 3.2 ChatGPT セレクター一覧

| 用途 | セレクター | 優先度 |
|------|----------|--------|
| 入力欄（textarea） | `textarea#prompt-textarea` | 1 |
| 入力欄（textarea） | `textarea[data-testid="prompt-textarea"]` | 2 |
| 入力欄（contenteditable） | `.ProseMirror[contenteditable="true"]` | 3 |
| 送信ボタン | `button[data-testid="send-button"]` | 1 |
| 送信ボタン | `[aria-label*="送信"]`, `[aria-label*="Send"]` | 2 |
| 停止ボタン | `button[data-testid="stop-button"]` | - |
| ユーザーメッセージ | `[data-message-author-role="user"]` | - |
| アシスタントメッセージ | `[data-message-author-role="assistant"]` | - |
| 回答コンテンツ | `.markdown`, `.prose`, `.markdown.prose` | - |

### 3.3 タイムアウト設定

| 操作 | タイムアウト |
|------|------------|
| 入力欄待機 | 30秒 |
| 送信ボタン待機 | 60秒（500ms × 120回） |
| メッセージ送信確認 | 15秒 |
| 回答完了待機 | 60秒（1秒間隔ポーリング） |

---

## 4. Gemini 操作フロー

### 4.1 askGeminiFast() の全ステップ

**ファイル**: `src/fast-cdp/fast-chat.ts:1069-1876`

```
1. getClient('gemini') で接続取得
2. 必要に応じてナビゲーション
3. 入力欄の出現を待機（15秒）
4. テキスト入力（2段階フォールバック）
5. 入力検証（questionPrefix が含まれるか）
6. 送信前テキスト確認
7. 送信ボタンの検索・待機（60秒、500ms間隔）
8. CDP Input.dispatchMouseEvent でクリック
9. ユーザーメッセージカウント増加確認
10. 回答完了検出（送信ボタン有効化待機、60秒）
11. 最後のレスポンスを抽出
12. normalizeGeminiResponse() で正規化
13. セッション保存・履歴記録
```

### 4.2 Gemini セレクター一覧

| 用途 | セレクター | 優先度 |
|------|----------|--------|
| 入力欄 | `[role="textbox"]` | 1 |
| 入力欄 | `div[contenteditable="true"]` | 2 |
| 入力欄 | `textarea` | 3 |
| 送信ボタン | `[aria-label*="送信"]`, `[aria-label*="Send"]` | 1 |
| 送信ボタン | `[textContent*="プロンプトを送信"]` | 2 |
| 送信ボタン | `mat-icon[data-mat-icon-name="send"]` | 3 |
| 停止ボタン | `[textContent*="停止"]`, `[aria-label*="Stop"]` | - |
| ユーザーメッセージ | `user-query`, `.user-query` | 1 |
| ユーザーメッセージ | `[data-message-author-role="user"]` | 2 |
| レスポンス | `model-response` | 1 |
| レスポンス | `[data-test-id*="response"]`, `.markdown` | 2 |

### 4.3 入力検証の仕組み

**ファイル**: `src/fast-cdp/fast-chat.ts:1154-1157`

```typescript
// 質問の先頭20文字が入力欄に含まれているか確認
const questionPrefix = question.slice(0, 20).replace(/\s+/g, '');
let inputOk = inputResult.ok &&
  inputResult.actualText.replace(/\s+/g, '').includes(questionPrefix);
```

失敗した場合:
1. `Input.insertText` でリトライ
2. 再検証

---

## 5. テキスト入力の実装

### 5.1 3段階フォールバック（ChatGPT）

**ファイル**: `src/fast-cdp/fast-chat.ts:369-594`

```
Phase 1: JavaScript evaluate
  - textarea.value = text + dispatchEvent('input')
  - contenteditable: innerHTML 設定 または execCommand('insertText')

Phase 2: CDP Input.insertText（Phase 1 失敗時）
  - await client.send('Input.insertText', {text: question});

Phase 3: CDP Input.dispatchKeyEvent（Phase 2 失敗時）
  - Ctrl+A, Backspace で全選択削除
  - 1文字ずつ keyDown イベントを送信
```

### 5.2 2段階フォールバック（Gemini）

**ファイル**: `src/fast-cdp/fast-chat.ts:1098-1247`

```
Phase 1: JavaScript evaluate
  - innerText 設定 + dispatchEvent('input', 'change')

Phase 2: CDP Input.insertText（Phase 1 の検証失敗時）
  - execCommand('selectAll'), execCommand('delete')
  - await client.send('Input.insertText', {text: question});
```

### 5.3 Shadow DOM 対応

**collectDeep() 関数**: `src/fast-cdp/fast-chat.ts:619-643`

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
    // Shadow DOM を再帰的に探索
    const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
    for (const el of elements) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(document);
  return results;
};
```

この関数は以下の場面で使用:
- 送信ボタンの検索
- 入力欄の検索（Gemini）
- レスポンス要素の検索

---

## 6. 送信ボタン検出

### 6.1 検索ロジック

**ファイル**: `src/fast-cdp/fast-chat.ts:617-700`（ChatGPT）、`1486-1574`（Gemini）

```javascript
// 1. collectDeep で全ボタンを収集（Shadow DOM 含む）
const buttons = collectDeep(['button', '[role="button"]'])
  .filter(isVisible)
  .filter(el => !isDisabled(el));

// 2. 停止ボタンがあれば「生成中」として disabled 扱い
const hasStopButton = buttons.some(b =>
  b.textContent.includes('Stop generating') ||
  b.getAttribute('aria-label').includes('停止')
);

// 3. 送信ボタンを優先度順に検索
let sendButton =
  buttons.find(b => b.getAttribute('data-testid') === 'send-button') ||
  buttons.find(b => b.getAttribute('aria-label')?.includes('送信'));
```

### 6.2 クリック実行

**CDP Input.dispatchMouseEvent を使用**:

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

## 7. 回答完了検出

### 7.1 ChatGPT: ポーリング方式

**ファイル**: `src/fast-cdp/fast-chat.ts:859-990`

```
ポーリング間隔: 1秒
最大待機時間: 60秒

完了条件（いずれかが true）:

条件1: stopボタンなし AND 送信ボタンあり AND 送信ボタン有効 AND 新アシスタントメッセージ
条件2: stopボタンを見た後に消えた AND 新アシスタントメッセージ AND 入力欄空
条件3: 15秒経過 AND stopボタンなし AND 入力欄空（フォールバック）
条件4: stopボタンを見た後に消えた AND 送信ボタン有効 AND 入力欄空
```

### 7.2 Gemini: waitForFunction

**ファイル**: `src/fast-cdp/fast-chat.ts:1707-1774`

```javascript
await client.waitForFunction(`
  (() => {
    // 停止ボタンがある場合はまだ生成中
    const hasStopButton = buttons.some(b =>
      b.textContent.includes('停止') || b.getAttribute('aria-label').includes('Stop')
    );
    if (hasStopButton) return false;

    // 送信ボタンを探す
    const sendBtn = buttons.find(b =>
      b.textContent.includes('送信') ||
      b.getAttribute('aria-label').includes('Send')
    );

    if (!sendBtn) return false;

    // 送信ボタンが有効 = 応答完了
    return !isDisabled(sendBtn);
  })()
`, 60000);
```

---

## 8. セッション管理

### 8.1 sessions.json の構造

**パス**: `.local/chrome-ai-bridge/sessions.json`

```json
{
  "projects": {
    "chrome-ai-bridge": {
      "chatgpt": {
        "url": "https://chatgpt.com/c/xxx-xxx",
        "tabId": 123,
        "lastUsed": "2026-01-30T10:30:00.000Z"
      },
      "gemini": {
        "url": "https://gemini.google.com/app/xxx",
        "tabId": 456,
        "lastUsed": "2026-01-30T10:25:00.000Z"
      }
    }
  }
}
```

### 8.2 履歴記録 (history.jsonl)

**パス**: `.local/chrome-ai-bridge/history.jsonl`

```jsonl
{"ts":"2026-01-30T10:30:00.000Z","project":"chrome-ai-bridge","provider":"chatgpt","question":"...","answer":"...","url":"https://chatgpt.com/c/xxx","timings":{"connectMs":120,"waitInputMs":500,"inputMs":50,"sendMs":100,"waitResponseMs":5000,"totalMs":5770}}
```

### 8.3 セッション再利用ロジック

**ファイル**: `src/fast-cdp/fast-chat.ts:135-143`

```typescript
async function getPreferredSession(kind: 'chatgpt' | 'gemini'): Promise<PreferredSession> {
  const project = getProjectName();  // path.basename(process.cwd())
  const sessions = await loadSessions();
  const entry = sessions.projects[project]?.[kind];
  return {
    url: entry?.url || null,
    tabId: entry?.tabId,
  };
}
```

---

## 9. エラーハンドリング

### 9.1 タイムアウト一覧

| 操作 | タイムアウト | 備考 |
|------|------------|------|
| 既存タブ再利用 | 3秒 | 失敗時は新規タブ作成 |
| 新規タブ作成 | 5秒 | 最大2回リトライ |
| 拡張機能接続 | 10秒（デフォルト） | - |
| 入力欄待機（ChatGPT） | 30秒 | - |
| 入力欄待機（Gemini） | 15秒 | - |
| 送信ボタン待機 | 60秒 | 500ms間隔 |
| メッセージ送信確認 | 8-15秒 | - |
| 回答完了待機 | 60秒 | - |
| 健全性チェック | 2秒 | - |

### 9.2 リトライロジック

**接続リトライ**: `src/fast-cdp/fast-chat.ts:261-299`
- 新規タブ作成: 最大2回（1秒間隔）

**送信リトライ**: `src/fast-cdp/fast-chat.ts:787-845`
- Enter キーフォールバック（マウスクリック失敗時）

### 9.3 デバッグファイル

**パス**: `.local/chrome-ai-bridge/debug/`

異常時に自動保存:
- `chatgpt-{timestamp}.json`
- `gemini-{timestamp}.json`

**保存されるケース**:
- ユーザーメッセージ送信タイムアウト
- 疑わしい回答（`isSuspiciousAnswer()` が true）

---

## 10. テスト

### 10.1 テストコマンド

```bash
# ChatGPT テスト
npm run test:chatgpt -- "質問文"

# Gemini テスト
npm run test:gemini -- "質問文"

# 両方テスト
npm run test:both

# CDP スナップショット（デバッグ用）
npm run cdp:chatgpt
npm run cdp:gemini
```

### 10.2 関連性チェック機能

**ファイル**: `src/fast-cdp/fast-chat.ts:175-182`

```typescript
function isSuspiciousAnswer(answer: string, question: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return true;
  if (question.trim() === 'OK') return false;
  // 質問に数字があるのに回答にない
  if (/\d/.test(question) && !/\d/.test(trimmed)) return true;
  // 回答が "ok" のみ
  if (/^ok$/i.test(trimmed)) return true;
  return false;
}
```

### 10.3 テスト質問の推奨事項

**禁止**（AI検出・BAN対象）:
- `1+1は？`
- `接続テスト`
- `Hello` / `OK`

**推奨**（自然な技術質問）:
- `JavaScriptでオブジェクトをディープコピーする方法を1つ教えて。コード例付きで。`
- `Pythonでファイルを非同期で読み込む方法は？`
- `TypeScriptでジェネリック型の使い方を簡潔に説明して。`

---

## 11. Chrome 拡張機能

### 11.1 拡張機能 ID

**固定値**: `ibjplbopgmcacpmfpnaeoloepdhenlbm`

`manifest.json` の `key` から生成される固定 ID。

### 11.2 Discovery ポーリング

**ファイル**: `src/extension/background.mjs`

```javascript
// ポーリング間隔: 3秒
// ポート: 8766（固定）
// エンドポイント: http://127.0.0.1:8766/mcp-discovery
```

### 11.3 バージョン管理

`src/extension/manifest.json` の `version` を変更するたびに更新:
- 拡張機能ファイル変更時は必ずバージョンを上げる
- 例: `2.0.0` → `2.0.1`

---

## 12. MCP ツール

### 12.1 提供ツール

| ツール名 | 説明 |
|---------|------|
| `ask_chatgpt_web` | ChatGPT に質問を送信 |
| `ask_gemini_web` | Gemini に質問を送信 |
| `ask_chatgpt_gemini_web` | 両方に並列で質問を送信（推奨） |
| `take_cdp_snapshot` | CDP が見ているページのスナップショット |
| `get_page_dom` | ページの DOM 要素を取得 |

### 12.2 推奨使用方法

```
デフォルト: ask_chatgpt_gemini_web（両方に並列クエリ）
個別指定時のみ: ask_chatgpt_web または ask_gemini_web
```

---

## 付録: ファイル構成

```
src/
├── fast-cdp/
│   ├── fast-chat.ts      # ChatGPT/Gemini 操作ロジック（メイン）
│   ├── cdp-client.ts     # CDP コマンド送信クライアント
│   ├── extension-raw.ts  # 拡張機能接続処理
│   └── mcp-logger.ts     # ロギング
├── extension/
│   ├── background.mjs    # 拡張機能 Service Worker
│   ├── relay-server.ts   # Discovery/Relay サーバー
│   ├── manifest.json     # 拡張機能マニフェスト
│   └── ui/
│       ├── connect.html  # 接続 UI
│       └── connect.js    # 接続 UI ロジック
├── main.ts              # エントリーポイント
└── index.ts             # MCP サーバー
```
