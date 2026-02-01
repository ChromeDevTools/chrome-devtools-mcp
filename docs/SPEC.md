# chrome-ai-bridge Technical Specification

**Version**: v2.0.11
**Last Updated**: 2026-02-02

---

## Quick Start - これを読む前に

### 開発を始める前に

1. **このドキュメントを読む**（必須）- アーキテクチャ、フロー、セレクターを理解
2. `npm run build` でビルド確認
3. Chrome拡張機能をインストール（`src/extension/` から）

### 問題が発生したら

1. [Section 13「トラブルシューティング」](#13-トラブルシューティング)を確認
2. `npm run cdp:chatgpt` / `npm run cdp:gemini` でスナップショット取得
3. `.local/chrome-ai-bridge/debug/` のログを確認

### コード変更時のフロー

```bash
npm run build      # 1. ビルド
npm run typecheck  # 2. 型チェック
npm run test:smoke # 3. 基本動作確認（推奨）
```

**拡張機能変更時**: `src/extension/manifest.json` のバージョンを必ず更新

### ドキュメント構成

| セクション | 内容 | いつ読むか |
|-----------|------|-----------|
| 1. Architecture | コンポーネント構成 | 最初に一読 |
| 2. 接続フロー | getClient/createConnection | 接続問題時 |
| 3. ChatGPT操作 | セレクター、完了検出、Thinkingモード | ChatGPT関連実装時 |
| 4. Gemini操作 | セレクター、完了検出、Shadow DOM | Gemini関連実装時 |
| 10. テスト | テストコマンド、シナリオ | テスト実行時 |
| 13. トラブルシューティング | 問題と解決策 | 問題発生時 |

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
- テストスイート: `npm run test:suite` で実行
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

**関連セクション**: [トラブルシューティング - 問題3](#問題3-セッション再利用が失敗する), [問題5 - 拡張機能が接続されない](#問題5-拡張機能が接続されない)

### 2.1 概要

接続は以下の流れで確立されます:

1. MCP サーバーが Discovery Server を起動（ポート 8766）
2. Chrome 拡張機能が Discovery Server をポーリングで検出
3. 拡張機能が Relay Server に WebSocket 接続
4. CDP セッションが確立され、タブ操作が可能に

### 2.2 getClient() / createConnection()

**関数**: `getClient()` in `src/fast-cdp/fast-chat.ts`

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

**関数**: `createConnection()` in `src/fast-cdp/fast-chat.ts`

```
ChatGPT/Gemini共通:
1. セッションファイルから preferredUrl, preferredTabId を取得
2. 既存タブの再利用を試行（3秒タイムアウト）
3. 失敗した場合、新規タブを作成（5秒タイムアウト、最大2回リトライ）
```

### 2.4 接続フロー図

```
┌─────────────────────────────────────────────────────────────────┐
│ getClient() 呼び出し                                             │
└─────────────────┬───────────────────────────────────────────────┘
                  ▼
        ┌─────────────────┐     Yes    ┌─────────────────┐
        │ 既存接続あり？   │ ─────────▶ │ 健全性チェック   │
        └────────┬────────┘            │ (4秒タイムアウト) │
                 │ No                   └────────┬────────┘
                 ▼                               │
        ┌─────────────────┐                      │ OK
        │ 新規接続作成     │ ◀────────────────────┘ NG
        └────────┬────────┘
                 ▼
        ┌─────────────────┐     失敗    ┌─────────────────┐
        │ 既存タブ再利用   │ ─────────▶ │ 新規タブ作成     │
        │ (3秒タイムアウト) │            │ (5秒、最大2回)   │
        └─────────────────┘            └─────────────────┘
```

### 2.5 Discovery Server

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

### 2.6 Relay Server

**ファイル**: `src/extension/relay-server.ts`

- WebSocket サーバー（動的ポート）
- 拡張機能との双方向通信を仲介
- CDP コマンドの送受信

---

## 3. ChatGPT 操作フロー

**関連セクション**:
- [セレクター一覧](#32-chatgpt-セレクター一覧)
- [回答完了検出](#33-chatgpt-回答完了検出)
- [Thinkingモード詳細](#36-chatgpt-thinkingモード詳細)
- [トラブルシューティング - 入力が反映されない](#問題2-chatgpt入力が反映されない)
- [トラブルシューティング - バックグラウンドタブ問題](#問題5-chatgpt応答テキストが空になるバックグラウンドタブ問題)

### 3.1 askChatGPTFast() の全ステップ

**関数**: `askChatGPTFastInternal()` in `src/fast-cdp/fast-chat.ts`

```
1. getClient('chatgpt') で接続取得/再利用
2. ページロード完了を待機（readyState === 'complete'、30秒）
3. SPA描画安定化待機（500ms固定）
4. 入力欄の出現を待機（30秒）
5. ページ読み込み安定待機（waitForStableCount: 2回連続で同じ値なら安定と判定）
6. 初期メッセージカウント取得（user + assistant）
7. テキスト入力（3段階フォールバック）
   - Phase 1: JavaScript evaluate (textarea.value / innerHTML)
   - Phase 2: CDP Input.insertText
   - Phase 3: CDP Input.dispatchKeyEvent (1文字ずつ)
8. 入力検証（normalizedQuestion が含まれるか）
9. 送信ボタンの検索・待機（60秒、500ms間隔）
10. JavaScript btn.click() でクリック（CDPフォールバック有）
11. 送信ボタンクリック → ユーザーメッセージカウント増加確認
12. 新しいアシスタントメッセージDOM追加待機（30秒）
13. 回答完了検出（ポーリング方式、**8分**、1秒間隔）
14. 最後のアシスタントメッセージを抽出
15. セッション保存・履歴記録
```

**既存チャット再接続時の誤認防止**（v2.0.10で追加）:
- ステップ2-3により、既存チャットに再接続した際に既存の回答を新しい回答と誤認することを防止
- `initialAssistantCount` を正確に取得した後にのみ応答検出を開始

### 3.2 ChatGPT セレクター一覧

| 用途 | セレクター | 備考 |
|------|----------|------|
| 入力欄 | `textarea#prompt-textarea` | 優先 |
| 入力欄 | `textarea[data-testid="prompt-textarea"]` | フォールバック |
| 入力欄 | `.ProseMirror[contenteditable="true"]` | contenteditable版 |
| 送信ボタン | `button[data-testid="send-button"]` | 優先 |
| 送信ボタン | `button[aria-label*="送信"]` | 日本語UI |
| 送信ボタン | `button[aria-label*="Send"]` | 英語UI |
| 停止ボタン | text/aria-label に "Stop generating" or "生成を停止" | - |
| ユーザーメッセージ | `[data-message-author-role="user"]` | - |
| アシスタントメッセージ | `[data-message-author-role="assistant"]` | - |
| 回答コンテンツ | `.markdown`, `.prose`, `.markdown.prose` | - |

### 3.3 ChatGPT 回答完了検出

**方式**: ポーリング（1秒間隔、最大**8分**）

**完了条件（いずれかが true）**:

1. stopボタンなし AND 送信ボタンあり AND 送信ボタン有効 AND assistantCount > initialAssistantCount
2. stopボタンを見た後に消えた AND assistantCount > initialAssistantCount AND 入力欄空
3. **5秒**経過 AND stopボタンなし AND 入力欄空 AND !isStillGenerating AND assistantCount > initialAssistantCount（フォールバック）
4. **10秒**経過 AND !isStillGenerating AND !hasSkipThinkingButton AND assistantCount > initialAssistantCount AND 入力欄空（Thinkingモード専用フォールバック）

**重要**: `initialAssistantCount` は質問送信前に取得した初期カウント。これにより、既存の回答を新しい回答と誤認することを防止。

### 3.4 ChatGPT 回答テキストフィルタリング

**背景**: ChatGPT Thinkingモードでは、回答にボタンテキスト（「思考時間 XX秒」等）が混入する可能性がある。

**フィルタリング対象**:
- `<button>` 要素内のテキスト
- 「思考時間」「秒」を含むパターン

**実装**: `src/fast-cdp/fast-chat.ts` の `extractChatGPTResponse()` 関数

### 3.5 ChatGPT 回答抽出ロジック

> ⚠️ **削除禁止**: このセクションに記載されているロジックは、ChatGPTのThinkingモード対応に必須です。削除すると回答抽出が失敗します。

#### DOM構造（2026-02更新）

ChatGPT 5.2以降、DOM構造が変更されました。Thinkingモードの有無に関わらず、回答は単一の `.markdown` 要素に格納されます。

**共通構造**:
```
article[data-turn="assistant"]
  └── div[data-message-author-role="assistant"]
        ├── button "思考時間: Xs" (Thinkingモード時のみ表示)
        └── div.markdown.prose
              └── p, h1-h6, li, pre, code... (回答テキスト)
```

> ⚠️ **重要な変更点**:
> - `data-message-author-role` は `article` ではなく内部の `div` 要素に付与
> - `.result-thinking` クラスは現在のUIでは使用されていない
> - Thinkingモードでも `.markdown` は1つのみ（回答テキストを含む）

#### 抽出優先順位

**関数**: `extractChatGPTResponse()` in `src/fast-cdp/fast-chat.ts`

| 優先度 | ステップ | セレクター/方法 | 理由 |
|--------|----------|-----------------|------|
| 1 | `.markdown` | `article .markdown` | メインの回答テキスト |
| 2 | `.prose`, `[class*="markdown"]` | 汎用マークダウンセレクター | UI変更時のフォールバック |
| 3 | `p` 要素 | `article p` | マークダウンクラスがない場合 |
| 4 | `article.innerText` | 要素全体のテキスト | DOM構造変更時のフォールバック |
| 5 | `main` + `body.innerText` | ページ全体のテキスト | 最終フォールバック |

> ⚠️ **body.innerText フォールバックの注意**: 終端マーカー（「あなた:」「You:」等）で切り詰める際、先頭10文字以内のマッチは無視する（`idx > 10`条件）。これにより、回答テキストが先頭で誤って切り詰められることを防止。

#### テキストレンダリング待機

**問題**: 停止ボタンが消失しても、Reactの非同期レンダリングにより回答テキストがDOMに反映されていないことがある。特にThinkingモードでは、長い思考の後に回答がレンダリングされるまで大幅な遅延が発生する。

**解決策**: 停止ボタン消失後も最大**120秒**（2分）間ポーリングでテキスト出現を待機。

```typescript
// extractChatGPTResponse() 内
const maxWaitForText = 120000;  // 120秒（Thinkingモード対応）
const pollInterval = 200;       // 200ms間隔

while (Date.now() - waitStart < maxWaitForText) {
  const checkResult = await checkForResponseText();
  if (checkResult.hasSkipButton) {
    // 「今すぐ回答」ボタンがある間はThinking中なので待機継続
    await sleep(pollInterval);
    continue;
  }
  if (checkResult.hasText && !checkResult.isStreaming) {
    return checkResult.text;
  }
  await sleep(pollInterval);
}
```

> ⚠️ **削除すると**: 停止ボタン消失直後に空の回答を返す問題が再発します。

### 3.6 ChatGPT Thinkingモード詳細

#### Thinkingモードの発動条件

> ⚠️ **重要**: Thinkingモードは**複雑な質問**を与えないと発動しません。

| 質問タイプ | 発動 | 例 |
|-----------|------|-----|
| 単純な質問 | ❌ | 「2+2は？」「3つの原色は？」 |
| 複雑な質問 | ✅ | 「グラフの最短経路アルゴリズムを設計して」「再帰の仕組みを詳細に説明して」 |

**テスト時の注意**: 単純な質問ではThinkingモードが発動しないため、DOM構造が異なります。Thinkingモード関連のテストを行う場合は、必ず複雑な質問を使用してください。

#### Thinkingモードの特徴

| 項目 | 説明 |
|------|------|
| 表示 | 「思考時間: Xm Xs」ボタンが表示される |
| 思考内容 | ボタンをクリックで展開可能（通常は折りたたまれている） |
| DOM構造 | 通常モードと同じ（`.markdown` 1つのみ） |
| 回答位置 | `.markdown.prose` 要素に格納 |

#### DOM構造図（2026-02更新）

```
【Non-Thinkingモード】
<article data-turn="assistant">
  <div data-message-author-role="assistant">
    <div class="markdown prose">
      <p>回答テキスト...</p>
    </div>
  </div>
</article>

【Thinkingモード】
<article data-turn="assistant">
  <div data-message-author-role="assistant">
    <button>思考時間: 17s</button>  ← クリックで思考内容を展開
    <div class="markdown prose">
      <p>回答テキスト...</p>  ← ここから抽出
    </div>
  </div>
</article>
```

> ⚠️ **`.result-thinking` は廃止**: 以前のドキュメントで言及されていた `.result-thinking` クラスは、現在のChatGPT UIでは使用されていません。

#### Thinkingモードの進行中検出

**問題**: Thinkingモードでは、stopボタンが表示されない場合でも思考が進行中のことがある。

**検出方法** (`isStillGenerating` フラグ):

```typescript
// body.innerTextから検出
const hasGeneratingText = bodyText.includes('回答を生成しています') ||
                         bodyText.includes('is still generating') ||
                         bodyText.includes('generating a response');

// 「思考時間: Xs」マーカーがあれば完了
const hasThinkingComplete = /思考時間[：:]\s*\d+s?/.test(bodyText) ||
                            /Thinking.*\d+s?/.test(bodyText);

// 「今すぐ回答」「Skip thinking」ボタンがあればThinking進行中
const hasSkipThinkingButton = bodyText.includes('今すぐ回答') ||
                              bodyText.includes('Skip thinking');

const isStillGenerating = (hasGeneratingText && !hasThinkingComplete) || hasSkipThinkingButton;
```

**処理フロー**:
1. `hasSkipThinkingButton` が true → Thinking進行中、待機継続
2. `isStillGenerating` が true → 回答生成中、待機継続
3. 両方 false AND `hasThinkingComplete` → 完了、テキスト抽出へ

> ⚠️ **重要**: `hasSkipThinkingButton` がある間は完了判定をスキップすること。早期に完了と判定すると、Thinking中の中間状態を取得してしまう。

#### 思考展開ボタンのクリック

**注意点**: 思考展開ボタンは入力欄横にも「思考の拡張」として存在する場合がある。

**正しい対象**:
- `article[data-message-author-role="assistant"]` 内のボタンのみを対象
- `aria-expanded="false"` のボタンを検出してクリック

```javascript
// 思考展開ボタンの検出（article内限定）
const article = document.querySelector('article[data-message-author-role="assistant"]:last-of-type');
const expandButton = article?.querySelector('button[aria-expanded="false"]');
if (expandButton) {
  expandButton.click();
}
```

> ⚠️ **誤クリック防止**: `article` 外のボタンをクリックすると、入力モードが変わるなど予期しない動作を引き起こします。

---

## 4. Gemini 操作フロー

**関連セクション**:
- [セレクター一覧（言語非依存版）](#42-gemini-セレクター一覧言語非依存版)
- [回答完了検出](#43-gemini-回答完了検出5条件--フォールバック)
- [Shadow DOM対応](#53-shadow-dom-対応)
- [言語非依存セレクター設計](#54-言語非依存セレクター設計)
- [トラブルシューティング - 応答がタイムアウト](#問題1-gemini応答がタイムアウトする)

### 4.1 askGeminiFast() の全ステップ

**関数**: `askGeminiFastInternal()` in `src/fast-cdp/fast-chat.ts`

```
1. getClient('gemini') で接続取得/再利用
2. 必要に応じてナビゲーション（navigateMs計測）
3. ページロード完了を待機（readyState === 'complete'、30秒）
4. SPA描画安定化待機（500ms固定）
5. 入力欄の出現を待機（15秒）
6. ページ読み込み安定待機（waitForStableCount: 2回連続で同じ値なら安定と判定）
7. 初期カウント取得（user-query, model-response）← initialModelResponseCount を記録
8. テキスト入力（2段階フォールバック）
   - Phase 1: JavaScript evaluate (innerText設定)
   - Phase 2: CDP Input.insertText
9. 入力検証（questionPrefix 20文字が含まれるか）
10. 送信前テキスト確認
11. 送信ボタンの検索・待機（60秒、500ms間隔）
12. JavaScript click() でクリック（CDPフォールバック有）
13. ユーザーメッセージカウント増加確認
14. 新しいモデル応答DOM追加待機（30秒）
15. 回答完了検出（ポーリング方式、**8分**、1秒間隔）
16. フィードバックボタン基準でテキスト抽出
17. normalizeGeminiResponse() で正規化
18. セッション保存・履歴記録
```

**既存チャット再接続時の誤認防止**（v2.0.10で追加）:
- ステップ3-4により、既存チャットに再接続した際に既存の回答を新しい回答と誤認することを防止
- `initialModelResponseCount` を正確に取得した後にのみ応答検出を開始

### 4.2 Gemini セレクター一覧（言語非依存版）

| 用途 | セレクター | 備考 |
|------|----------|------|
| 入力欄 | `[role="textbox"]` | 優先 |
| 入力欄 | `div[contenteditable="true"]` | フォールバック |
| 入力欄 | `textarea` | フォールバック |
| 送信ボタン | `mat-icon[data-mat-icon-name="send"]` parent button | 優先 |
| 送信ボタン | text に "プロンプトを送信" / "送信" | 日本語UI |
| 送信ボタン | aria-label に "送信" / "Send" | - |
| 停止ボタン | text/aria-label に "停止" / "Stop" | - |
| **マイクボタン** | `img[alt="mic"]` closest button | **言語非依存** |
| **フィードバック** | `img[alt="thumb_up"]`, `img[alt="thumb_down"]` | **言語非依存・最重要** |
| ユーザーメッセージ | `user-query`, `.user-query` | Shadow DOM内 |
| レスポンス | `model-response` | Shadow DOM内（直接DOMには存在しない） |

### 4.3 Gemini 回答完了検出（5条件 + フォールバック）

**方式**: ポーリング（1秒間隔、最大**8分**）

**状態フィールド**:
- `hasStopButton`: 停止ボタンの有無
- `hasMicButton`: マイクボタンの有無
- `hasFeedbackButtons`: フィードバックボタン（thumb_up/down）の有無
- `sendButtonEnabled`: 送信ボタンが有効か
- `modelResponseCount`: レスポンス要素数
- `lastResponseTextLength`: 最後のレスポンスのテキスト長
- `inputBoxEmpty`: 入力欄が空か

**完了条件（優先順）**:

| 条件 | 説明 | 信頼度 |
|------|------|--------|
| 0 | sawStopButton AND !hasStopButton AND hasFeedbackButtons AND modelResponseCount > initialModelResponseCount | ★★★ 最も確実 |
| 1 | sawStopButton AND !hasStopButton AND hasMicButton AND modelResponseCount > initialModelResponseCount | ★★☆ |
| 2 | sawStopButton AND !hasStopButton AND sendButtonEnabled AND inputBoxEmpty AND modelResponseCount > initialModelResponseCount | ★★☆ |
| 3 | textStableCount >= 5 AND modelResponseCount > initialModelResponseCount AND !hasStopButton | ★☆☆ |
| FB | elapsed > 10s AND !sawStopButton AND modelResponseCount > initialModelResponseCount AND !hasStopButton | フォールバック |

**重要**: `initialModelResponseCount` は質問送信前に取得した初期カウント。これにより、既存の回答を新しい回答と誤認することを防止。

### 4.4 Gemini テキスト抽出

**優先順位**:

1. **フィードバックボタン基準**（推奨）
   - `img[alt="thumb_up"]` を探す
   - `closest('button')` → `parentElement` → `parentElement` で応答コンテナを特定
   - p, h1-h6, li, td, th, pre, code 要素からテキスト収集

2. **セレクターベース**（フォールバック）
   - `collectDeep(['model-response', ...])` で Shadow DOM 内を探索
   - 最後のレスポンス要素の innerText を取得

3. **aria-live**（最終手段）
   - `[aria-live="polite"]` からテキスト取得

### 4.5 入力検証の仕組み

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

**関数**: `askChatGPTFastInternal()` 内

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

**関数**: `askGeminiFastInternal()` 内

```
Phase 1: JavaScript evaluate
  - innerText 設定 + dispatchEvent('input', 'change')

Phase 2: CDP Input.insertText（Phase 1 の検証失敗時）
  - execCommand('selectAll'), execCommand('delete')
  - await client.send('Input.insertText', {text: question});
```

---

## 5.3 Shadow DOM 対応

### 背景

GeminiはWebコンポーネント（Shadow DOM）を多用している。
通常の `document.querySelector` では内部要素にアクセスできない。

### collectDeep() 関数

再帰的に Shadow DOM 内を探索する:

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

### 使用箇所

- 送信ボタン検索
- 入力欄検索
- レスポンス要素検索
- ユーザーメッセージカウント

---

## 5.4 言語非依存セレクター設計

### 背景

GeminiのUIはユーザーの言語設定に応じて変化する:
- 日本語: "良い回答", "悪い回答", "マイク"
- 英語: "Good response", "Bad response", "Microphone"

`aria-label` や `textContent` に依存すると、言語ごとに分岐が必要になる。

### 解決策: img alt属性

Geminiのアイコンは img 要素で実装されており、alt 属性は言語に依存しない:
- `img[alt="mic"]` - マイクアイコン
- `img[alt="thumb_up"]` - 良い回答アイコン
- `img[alt="thumb_down"]` - 悪い回答アイコン

### 実装パターン

```javascript
// マイクボタン検出
const micImg = document.querySelector('img[alt="mic"]');
const micButton = micImg?.closest('button');

// フィードバックボタン検出
const hasFeedback = !!document.querySelector('img[alt="thumb_up"], img[alt="thumb_down"]');
```

---

## 6. 送信ボタン検出

### 6.1 検索ロジック

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

**優先**: JavaScript `btn.click()` で直接クリック

**フォールバック**: CDP Input.dispatchMouseEvent

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

## 7. 回答完了検出（詳細）

ChatGPT と Gemini の回答完了検出の詳細は各セクション（3.3、4.3）を参照。

**共通の設計方針**:
- ポーリング方式（1秒間隔）を採用
- 最大待機時間: **8分**（480秒）- 長文・複雑な回答に対応
- 複数の完了条件を優先順に評価
- `sawStopButton` フラグで「生成が始まったかどうか」を追跡

---

## 7.1 ChatGPT vs Gemini 実装比較

| 項目 | ChatGPT | Gemini |
|------|---------|--------|
| 入力欄待機 | 30秒 | 15秒 |
| 応答待機 | **8分** | **8分** |
| ポーリング間隔 | 1秒 | 1秒 |
| Shadow DOM | 不要 | **必須**（collectDeep使用） |
| 完了検出の主要指標 | **カウント増加検出** + stopボタン消失 | **カウント増加検出** + フィードバックボタン表示 |
| カウント追跡方式 | `assistantCount > initialAssistantCount` | `modelResponseCount > initialModelResponseCount` |
| テキスト抽出基準 | `data-message-author-role` | **`img[alt="thumb_up"]`** |
| ナビゲーション | 不要（接続時に解決） | 必要時あり（navigateMs計測） |
| 言語対応 | aria-label分岐 | **img alt属性（言語非依存）** |

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

**関数**: `getPreferredSession()` in `src/fast-cdp/fast-chat.ts`

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

**凡例**:
- **最大**: 成功すれば即座に次へ進む。タイムアウトは失敗判定のしきい値
- **固定**: 常にこの時間待つ

| 操作 | ChatGPT | Gemini | 種類 | 説明 |
|------|---------|--------|------|------|
| 既存タブ再利用 | 3秒 | 3秒 | 最大 | sessions.jsonのタブIDで接続試行。応答があれば即座に再利用、なければ新規タブ作成へ |
| 新規タブ作成 | 5秒 | 5秒 | 最大 | 拡張機能経由でタブ作成+CDP確立。成功すれば即座に次へ。失敗時は1秒後に再試行（最大2回） |
| 拡張機能接続 | 10秒 | 10秒 | 最大 | Discovery Server (port 8766) が拡張機能からの接続を待つ。通常2-3秒で接続される |
| **ページロード完了** | 30秒 | 30秒 | 最大 | `readyState === 'complete'` になるまで待機。既存チャット再接続時の誤認防止に重要 |
| **SPA描画安定化** | 500ms | 500ms | **固定** | SPA非同期描画の安定化待機。初期カウント取得前に必須 |
| 入力欄待機 | 30秒 | 15秒 | 最大 | 入力欄（textarea/contenteditable）が出現するまで。ChatGPTはProseMirror初期化が遅いため長め |
| **入力後待機** | 200ms | 200ms | **固定** | 入力完了後、内部状態更新を待機。送信前に必須 |
| 送信ボタン待機 | 60秒 | 60秒 | 最大 | 送信ボタンが有効になるまで500ms間隔でポーリング。生成中（stopボタン表示中）は無効状態 |
| メッセージ送信確認 | 15秒 | 8秒 | 最大 | クリック後、ユーザーメッセージ要素が画面に出現するまで。出なければ送信失敗 |
| **新規応答DOM追加** | 30秒 | 30秒 | 最大 | 送信後、新しいアシスタント/モデル応答要素が追加されるまで。既存回答との区別に使用 |
| **回答完了待機** | **8分** | **8分** | 最大 | 応答完了を検出するまで1秒間隔でポーリング。長文や複雑な回答に対応 |
| **テキスト抽出待機** | **120秒** | - | 最大 | 回答完了後、テキストがDOMにレンダリングされるまで200ms間隔でポーリング。Thinkingモード対応 |
| 健全性チェック | 4秒 | 4秒 | 最大 | 既存接続を再利用する前に `client.evaluate('1')` で生存確認 |

### 9.2 リトライロジック

**接続リトライ** (`createConnection()`):
- 新規タブ作成: 最大2回（1秒間隔）

**送信リトライ**:
- Enter キーフォールバック（マウスクリック失敗時）

### 9.3 デバッグファイル

**パス**: `.local/chrome-ai-bridge/debug/`

異常時に自動保存:
- `chatgpt-{timestamp}.json`
- `gemini-{timestamp}.json`

**保存されるケース**:
- ユーザーメッセージ送信タイムアウト
- 疑わしい回答（`isSuspiciousAnswer()` が true）

### 9.4 主要デバッグフィールド

回答完了検出ループで取得される状態フィールド:

| フィールド | 説明 | 用途 |
|-----------|------|------|
| `debug_assistantMsgsCount` | アシスタントメッセージ数 | 新規回答の検出 |
| `debug_chatgptArticlesCount` | ChatGPT articleの数 | 新UIでの回答検出 |
| `debug_markdownsInLast` | 最後のarticle内の.markdown数 | テキスト抽出位置の特定 |
| `debug_lastAssistantInnerTextLen` | テキスト長 | 回答が取得できたかの確認 |
| `debug_bodySnippet` | body.innerTextの先頭200文字 | ページ状態の概要 |
| `debug_bodyLen` | body.innerTextの長さ | コンテンツ量の確認 |
| `debug_pageUrl` | 現在のURL | 正しいページか確認 |
| `debug_pageTitle` | ページタイトル | ログイン状態の確認 |

---

## 10. テスト

### 10.1 テストコマンド

```bash
# 個別テスト
npm run test:chatgpt -- "質問文"
npm run test:gemini -- "質問文"
npm run test:both

# CDP スナップショット（デバッグ用）
npm run cdp:chatgpt
npm run cdp:gemini

# テストスイート
npm run test:smoke       # 基本動作確認
npm run test:regression  # 過去問題の再発確認
npm run test:suite       # 全シナリオ実行

# テストスイートオプション
npm run test:suite -- --list       # シナリオ一覧表示
npm run test:suite -- --id=chatgpt-thinking-mode  # 特定シナリオのみ
npm run test:suite -- --tag=chatgpt  # タグでフィルタ
npm run test:suite -- --debug      # デバッグ情報付き
npm run test:suite -- --help       # ヘルプ表示
```

### 10.2 テストスイートのタグ一覧

| タグ | 説明 | 使用例 |
|------|------|--------|
| `smoke` | 基本動作確認（新規チャット、並列クエリ） | `--tag=smoke` |
| `regression` | 過去問題の再発確認（既存チャット再接続、Thinkingモード） | `--tag=regression` |
| `chatgpt` | ChatGPT関連のみ | `--tag=chatgpt` |
| `gemini` | Gemini関連のみ | `--tag=gemini` |
| `thinking` | Thinkingモード関連 | `--tag=thinking` |
| `parallel` | 並列クエリ関連 | `--tag=parallel` |

**シナリオ定義**: `scripts/test-scenarios.json`
**レポート保存先**: `.local/chrome-ai-bridge/test-reports/`

### 10.3 アサーション検証機能

`test-scenarios.json` で使用可能なアサーション:

| アサーション | 説明 | 例 |
|-------------|------|-----|
| `bothMustSucceed` | 並列クエリ時、両方成功必須 | `"bothMustSucceed": true` |
| `minAnswerLength` | 最小回答文字数 | `"minAnswerLength": 50` |
| `relevanceThreshold` | 関連性スコア閾値（0-1） | `"relevanceThreshold": 0.5` |
| `maxTotalMs` | 最大実行時間（ms） | `"maxTotalMs": 60000` |
| `noFallback` | フォールバック未使用 | `"noFallback": true` |
| `noEmptyMarkdown` | 空Markdownチェック | `"noEmptyMarkdown": true` |

### 10.4 関連性チェック機能

**関数**: `isSuspiciousAnswer()` in `src/fast-cdp/fast-chat.ts`

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

### 10.5 テスト質問の推奨事項

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

### 11.3 Service Worker Keep-Alive

**問題**: Chrome Manifest V3のService Workerは30秒〜5分で自動スリープする。

**解決策**: Chrome Alarms APIで定期的にwake up。

| 項目 | 値 |
|------|-----|
| Alarm間隔 | 30秒 |
| Alarm名 | `keepalive` |
| 追加処理 | Alarm発火時にDiscovery pollingが停止していたら自動再開 |

**ファイル**: `src/extension/background.mjs`

### 11.4 バージョン管理

`src/extension/manifest.json` の `version` を変更するたびに更新:
- 拡張機能ファイル変更時は必ずバージョンを上げる
- 例: `2.0.0` → `2.0.1`

---

## 12. MCP ツール

### 12.1 提供ツール（MCP）

| ツール名 | 説明 |
|---------|------|
| `ask_chatgpt_web` | ChatGPT に質問を送信 |
| `ask_gemini_web` | Gemini に質問を送信 |
| `ask_chatgpt_gemini_web` | 両方に並列で質問を送信（推奨） |
| `take_cdp_snapshot` | CDP が見ているページのスナップショット |
| `get_page_dom` | ページの DOM 要素を取得 |

### 12.2 内部関数（テスト・デバッグ用）

直接インポートして使用可能な関数:

```typescript
// src/fast-cdp/fast-chat.ts からエクスポート

// 通常の関数
askChatGPTFast(question: string): Promise<ChatResult>
askGeminiFast(question: string): Promise<ChatResult>

// タイミング情報付き（テスト・計測用）
askChatGPTFastWithTimings(question: string): Promise<ChatResultWithTimings>
askGeminiFastWithTimings(question: string): Promise<ChatResultWithTimings>

// CDPスナップショット取得
takeCdpSnapshot(target: 'chatgpt' | 'gemini'): Promise<CdpSnapshot>
```

**ChatResultWithTimings の構造**:
```typescript
interface ChatResultWithTimings {
  answer: string;
  url: string;
  timings: {
    connectMs: number;      // 接続確立時間
    waitInputMs: number;    // 入力欄待機時間
    inputMs: number;        // 入力処理時間
    sendMs: number;         // 送信処理時間
    waitResponseMs: number; // 応答待機時間
    totalMs: number;        // 合計時間
  };
}
```

### 12.3 推奨使用方法

```
デフォルト: ask_chatgpt_gemini_web（両方に並列クエリ）
個別指定時のみ: ask_chatgpt_web または ask_gemini_web
```

---

## 13. トラブルシューティング

### 問題1: Gemini応答がタイムアウトする

**症状**:
```
Timed out waiting for Gemini response (8min). sawStopButton=true, textStableCount=XXX
```

**原因**: フィードバックボタンが検出されていない

**確認方法**:
```bash
npm run cdp:gemini  # スナップショット取得
```

**解決策**:
1. `img[alt="thumb_up"]` セレクターが正しいか確認
2. DOM構造が変わっていないか Playwright で確認

### 問題2: ChatGPT入力が反映されない

**症状**: 送信後に空の応答が返る

**原因**: ProseMirror contenteditable への入力失敗

**確認方法**:
ログで "Input verification: OK" が出ているか確認

**解決策**:
1. Input.insertText フォールバックが動作しているか確認
2. フォーカス設定（element.focus()）が実行されているか確認

### 問題3: セッション再利用が失敗する

**症状**: 毎回新しいタブが開く

**原因**: 健全性チェック失敗（4秒タイムアウト）

**確認方法**:
`.local/chrome-ai-bridge/sessions.json` の tabId を確認

**解決策**:
1. タブがまだ存在するか確認
2. 拡張機能が正常に動作しているか確認

### 問題5: ChatGPT応答テキストが空になる（バックグラウンドタブ問題）

**症状**:
- ChatGPTの応答生成は完了する（停止ボタンが消える）
- しかし `innerText` / `textContent` が空を返す
- `innerHTML` には `<p>` タグがあるが中身が空
- デバッグ出力: `itLen:0, tcLen:0, html:"<p data-start=\"0\" data-end=\"X\"></p>"`

**原因**:
ChatGPTのReactアプリは**バックグラウンドタブではテキストをレンダリングしない**（パフォーマンス最適化）。
CDP経由で接続したタブがバックグラウンドにある場合、DOMノードは存在するが、テキストノードがレンダリングされない。

**技術的詳細**:
- `data-start="0" data-end="X"` はテキスト範囲を示すが、実際のテキストノードは存在しない
- Reactの仮想DOMには存在するが、実DOMにはレンダリングされていない
- Playwrightで同じページを見ると正常にテキストが表示される（Playwrightはフォアグラウンドで動作するため）

**解決策**:
`Page.bringToFront` CDPコマンドでタブをフォアグラウンドに持ってくる：
```javascript
await client.send('Page.enable');
await client.send('Page.bringToFront');
await new Promise(r => setTimeout(r, 500)); // Reactがレンダリングを完了するまで待機
```

**実装場所**: `src/fast-cdp/fast-chat.ts` の `extractChatGPTResponse()` 関数内

**タイミング**: 8分の応答完了待機ループ**完了直後**、テキスト抽出ループ（`maxWaitForText = 120000`）の**開始前**

```
応答完了検出 (8分ポーリング)
  ↓
Page.bringToFront ← ここ
  ↓
テキスト抽出ループ (120秒)
  ↓
回答テキスト返却
```

**発見日**: 2026-02-02

### 問題4: "Login required" エラー

**症状**: ログインが必要というエラー

**原因**: セッションが切れている

**解決策**:
1. ブラウザで手動ログイン
2. 新しいセッションが sessions.json に保存されることを確認

### 問題5: 拡張機能が接続されない

**症状**: "Extension not connected" エラー

**原因**: Discovery Server と拡張機能の通信問題

**確認方法**:
```bash
curl http://127.0.0.1:8766/mcp-discovery
```

**解決策**:
1. Chrome で拡張機能が有効か確認
2. ポート 8766 が他のプロセスに使われていないか確認
3. Chrome を再起動して拡張機能を再読み込み

---

## 付録A: ファイル構成

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
