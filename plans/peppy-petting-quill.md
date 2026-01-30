# Puppeteer完全削除プラン

## 概要

**目的**: chrome-ai-bridgeからPuppeteerを完全に削除し、拡張機能経由のChatGPT/Gemini質問機能のみを残す。

**理由**: 別プロファイルの問題（MCPツール呼び出し時にPuppeteerが新しいChromeプロファイルを起動してしまう）を根本解決。

## 現状の問題

```
[現状のMCPツール呼び出し]
ask_chatgpt_web 呼び出し
  ↓
main.ts: getContext() または fast-context
  ↓
resolveBrowser() ← ここでPuppeteerがChromeを起動（別プロファイル）
  ↓
別のChromeウィンドウが開く（ユーザーの既存Chromeではない）
```

## 削除方針

### 保持するもの（拡張機能経由）
| ツール | 用途 |
|--------|------|
| `ask_chatgpt_web` | ChatGPTに質問 |
| `ask_gemini_web` | Geminiに質問 |
| `ask_chatgpt_gemini_web` | 両方に並列質問 |
| `take_cdp_snapshot` | ページ状態デバッグ |
| `get_page_dom` | DOM構造調査 |
| `ask_gemini_image` | Gemini画像生成 |

### 削除するもの（Puppeteer依存）
- ブラウザ操作系ツール（click, fill, navigate, screenshot等 約15個）
- browser.ts（Puppeteer起動ロジック）
- McpContext.ts（Browser/Page管理）
- 関連ユーティリティ（WaitForHelper, PageCollector等）

---

## 実装計画

### Phase 1: main.tsの修正（ブラウザ起動スキップ）

**ファイル**: `src/main.ts`

**変更内容**:
1. `resolveBrowser()` 呼び出しを削除
2. `McpContext` の代わりに `FastContext` を使用
3. FAST_TOOLS以外のツールは登録しない（または呼び出し時にエラー）

```typescript
// Before
const browser = await resolveBrowser(browserOptions);
const context = await McpContext.from(browser, ...);

// After
// Puppeteer起動なし - 拡張機能モードのみ
const context = null; // または FastContext のスタブ
```

### Phase 2: ツール登録の整理

**ファイル**: `src/tools/optional-tools.ts`, `src/tools/core-tools.ts`

**変更内容**:
1. ChatGPT/Gemini関連ツールのみ登録
2. Puppeteer依存ツールの登録をスキップ

**保持するツール**:
```typescript
const EXTENSION_ONLY_TOOLS = [
  'ask_chatgpt_web',
  'ask_gemini_web',
  'ask_chatgpt_gemini_web',
  'take_cdp_snapshot',
  'get_page_dom',
  'ask_gemini_image',
];
```

### Phase 3: 不要ファイルの削除

**削除対象ファイル**:
```
src/browser.ts                    # Puppeteer起動
src/McpContext.ts                 # Browser/Page管理
src/browser-connection-manager.ts # 接続管理
src/PageCollector.ts              # Page監視
src/WaitForHelper.ts              # Page待機
src/login-helper.ts               # ブラウザログイン
src/download-manager.ts           # ダウンロード管理
src/startup-check.ts              # Chrome起動確認
src/formatters/networkFormatter.ts
src/formatters/consoleFormatter.ts
src/tools/emulation.ts
src/tools/performance.ts
src/tools/screenshot.ts
src/tools/snapshot.ts
src/tools/network.ts
src/tools/script.ts
src/tools/input.ts
src/tools/console.ts
src/tools/pages.ts
src/tools/iframe-popup-tools.ts
```

### Phase 4: package.json更新

```json
// 削除する依存
"puppeteer-core": "削除",

// 保持する依存
"ws": "^8.19.0",  // 拡張機能通信用
"@anthropic-ai/sdk": "保持",
"@modelcontextprotocol/sdk": "保持"
```

### Phase 5: 型定義の整理

**ファイル**: `src/tools/ToolDefinition.ts`

`Context` インターフェースを簡略化（Browser/Page関連メソッド削除）

---

## 修正ファイル一覧

| Phase | ファイル | 変更内容 |
|-------|---------|---------|
| 1 | `src/main.ts` | resolveBrowser削除、ツール登録絞り込み |
| 2 | `src/tools/optional-tools.ts` | 不要ツール登録削除 |
| 2 | `src/tools/core-tools.ts` | 不要ツール登録削除 |
| 3 | 上記削除対象ファイル | 削除 |
| 4 | `package.json` | puppeteer-core削除 |
| 5 | `src/tools/ToolDefinition.ts` | Context簡略化 |

---

## 検証手順

### ビルド確認
```bash
npm run build
# TypeScriptエラーなしでビルド完了
```

### 機能テスト
```bash
# ChatGPT質問テスト
npm run test:chatgpt -- "TypeScriptの型ガードを説明して"

# Gemini質問テスト
npm run test:gemini -- "Pythonのリスト内包表記の例"

# CDPスナップショット
npm run cdp:chatgpt
```

### MCPツール確認
```bash
# Claude Code再起動後
# MCPツール呼び出しで別Chromeが起動しないことを確認
```

---

## リスク

| リスク | 対策 |
|--------|------|
| 既存ユーザーがブラウザ操作ツールを使っている | CHANGELOG/READMEで明記、メジャーバージョンアップ |
| テストが壊れる | 不要テストも削除 |
| 拡張機能モードのバグが露呈 | 今回のテストで検出・修正 |

---

## バージョン

- 現在: v1.1.24
- 変更後: v2.0.0（破壊的変更のためメジャーバージョンアップ）
