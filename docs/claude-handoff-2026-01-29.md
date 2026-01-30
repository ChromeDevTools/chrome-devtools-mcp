# ClaudeCode 引き継ぎ資料（chrome-ai-bridge）

作成日: 2026-01-29
作業者: Codex
プロジェクト: /Users/usedhonda/projects/mcp/chrome-ai-bridge

---

## 1. 目的 / ゴール
- 目的は **ChatGPT / Gemini のブラウザUI経由での高速な送受信**。
- Playwrightの extension2 と同等以上のUX/速度を目指す。
- Puppeteer時代に安定していたDOM操作の知見を活かすが、方式はCDP Fast Path（Extension Relay）を使う。
- 不要な機能（pages/list, snapshot 等）は後回しで、**送信ボタン押下とレスポンス取得の安定**が最優先。

---

## 2. 現状の実装方針（Fast CDP）
- Puppeteerを使わず、拡張のRelay経由でCDPを直接叩く「fast-cdp」実装。
- 主要ファイル:
  - `src/fast-cdp/fast-chat.ts`
  - `src/fast-cdp/cdp-client.ts`
  - `src/fast-cdp/extension-raw.ts`
- MCPツール:
  - `ask_chatgpt_web`（ChatGPT）
  - `ask_gemini_web`（Gemini）
  - `ask_chatgpt_gemini_web`（並列）
- 履歴/セッション保持:
  - `.local/chrome-ai-bridge/sessions.json`
  - `.local/chrome-ai-bridge/history.jsonl`
  - デバッグダンプ: `.local/chrome-ai-bridge/debug/chatgpt-*.json`

---

## 3. 現状の問題（クリティカル）
### ChatGPT 側が**送信できない**
- 送信後に `[data-message-author-role="user"]` が増えない。
- 入力欄 (`div#prompt-textarea.ProseMirror`) は存在するが、文字が反映されず空のまま。
- 送信ボタンが押せても、メッセージが増えない。

### デバッグ結果の共通点
- **URLが古いチャット（接続テスト）に固定**
- `document.title` が「接続テスト」
- `textareaValue` / `ProseMirror` が空

例: `.local/chrome-ai-bridge/debug/chatgpt-1769673880989.json`
```json
{
  "title": "接続テスト",
  "url": "https://chatgpt.com/c/697aebff-6f50-8321-a9a8-2684de130a0d",
  "textareaValue": "",
  "inputCandidates": [
    {"tag":"TEXTAREA","className":"wcDTda_fallbackTextarea"},
    {"tag":"DIV","id":"prompt-textarea","className":"ProseMirror"}
  ],
  "lastUserText": "接続テストです。OK とだけ返してください..."
}
```

---

## 4. ClaudeCode時代のDOM操作（旧Puppeteer実装）
過去の `src/tools/chatgpt-web.ts` (commit `28f84ada...`) から抽出:

### 入力DOM
```js
const prosemirror = document.querySelector('.ProseMirror[contenteditable="true"]');
prosemirror.innerHTML = '';
const p = document.createElement('p');
p.textContent = questionText;
prosemirror.appendChild(p);
prosemirror.dispatchEvent(new Event('input', {bubbles: true}));
```

### 送信ボタン
```js
const buttons = Array.from(document.querySelectorAll('button'));
const sendButton = buttons.find(btn => {
  const svg = btn.querySelector('svg');
  return svg && !btn.disabled && btn.offsetParent !== null;
});
if (sendButton) sendButton.click();
```

### ストリーミング判定
```js
buttons.some(btn => btn.textContent?.includes('ストリーミングの停止') || btn.textContent?.includes('停止'))
```

これらは **fast-chat.ts** にすでに反映済み（優先入力・停止判定）。

---

## 5. これまでの試行と結果
### 入力方法の試行
- ProseMirror直書き + inputイベント
- textarea.value + InputEvent
- CDP: `Input.insertText`
- CDP: `Input.dispatchKeyEvent` (Ctrl+A, Backspace, 1文字ずつ)

**すべて失敗**。結果は入力が反映されない/ユーザーメッセージ増えない。

### 送信方法の試行
- `button[data-testid="send-button"]`
- `button[aria-label*="送信"]`
- `form.requestSubmit()` / `form.submit()`
- Enterキーイベント

**送信ボタンの検知はできるが投稿が増えない**。

### ストリーミング判定
- stop-button
- 「停止」ボタン

判定自体は機能するが、そもそも応答が開始しない。

---

## 6. 追加のデバッグ措置
- 不一致/タイムアウト時に debug JSON を出力
  - `userMessageMismatch`, `userMessageTimeout`
  - inputCandidates / textareaValue / title / url など

---

## 7. ここから先の優先タスク（提案）
### A. **古い接続テストチャットから強制的に離脱**
- タイトル「接続テスト」、または最後のユーザーメッセージが接続テストなら、
  **既存セッションURLを無視して新規チャットに強制遷移**。
- 現在もこの判定は入れているが、**実際に遷移していない**疑い。

### B. **入力対象DOMの再特定**
- ProseMirrorの親または中継要素でイベントをハンドリングしている可能性がある。
- 既存の `div#prompt-textarea` が正しいのか再検証が必要。
- UIに「接続テスト」の文言が出る特殊状態では入力が無効になっている可能性。

### C. **強制フォーカス + クリック + タイピング**
- CDPの `DOM.getBoxModel` → `Input.dispatchMouseEvent` で正確にクリック → `Input.dispatchKeyEvent` で入力。
- これが Playwright 的に最も確実。

---

## 8. 関連ファイル一覧
- **ChatGPT / Gemini 実装**: `src/fast-cdp/fast-chat.ts`
- **CDP client**: `src/fast-cdp/cdp-client.ts`
- **Extension Relay 接続**: `src/fast-cdp/extension-raw.ts`
- **テストスクリプト**: `scripts/codex-mcp-test.mjs`
- **ログ/セッション**:
  - `.local/chrome-ai-bridge/sessions.json`
  - `.local/chrome-ai-bridge/history.jsonl`
  - `.local/chrome-ai-bridge/debug/chatgpt-*.json`

---

## 9. 直近の作業ログ
- `docs/log/codex/185.md` 〜 `docs/log/codex/212.md`

---

## 10. 現在の状況まとめ
- **Geminiは比較的成功率が高い**
- **ChatGPTは「接続テスト」チャットに固定され、入力が反映されない状態**
- 既存のDOM操作は古い手法も含めて導入済みだが、効果が出ていない

---

## 11. 期待するClaudeCodeでの対応
- ClaudeCodeからMCPサーバーを起動し、このCDP経路を再検証
- **入力DOMの再特定 + 強制クリック入力**
- 新規チャットへ確実に遷移させる操作の追加
- 必要に応じてPlaywright extension2の入力/送信ロジックを模倣

---

