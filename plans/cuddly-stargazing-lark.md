# ログイン待機UX改善計画

## 課題
ChatGPT/Geminiで未ログイン時、ユーザーが焦って手動ログインしている。
二段階認証などで数分かかることを考慮し、より良いUXでログイン待機を実現したい。

## 現状の実装

### 既存のログイン待機機能（login-helper.ts:254-286）
- タイムアウト: 2分（120秒）← **短すぎる（二段階認証に対応できない）**
- 自動ポーリング: あり（指数バックオフ、500ms→最大3秒）
- 進捗表示: 10秒ごと

### 課題点
1. **タイムアウトが短い** - 二段階認証で数分かかる場合に対応できない
2. **ブラウザが背面にある場合、ユーザーが気づかない**
3. **進捗表示が10秒ごとで粗い**
4. **残り時間が分からない**
5. **ログイン完了検出時のフィードバックが弱い**

## 改善案

### 1. タイムアウト延長（2分→5分）
- 二段階認証・SMS認証・Authenticatorアプリ対応
- デフォルト: 5分（300秒）

### 2. ブラウザを前面に出す
- `page.bringToFront()` を呼び出し
- ログイン画面を確実にユーザーに見せる

### 3. 残り時間付き進捗表示
- 「⏳ ログイン待機中... 残り X分XX秒」形式
- 15秒ごとの更新（長時間待機を考慮）

### 4. ログイン成功時の明確なフィードバック
- 「✅ ログイン検出！処理を続行します」

### 5. 初回メッセージの改善
- 現状: `❌ ChatGPTへのログインが必要です`
- 改善: `🔐 ログインが必要です。ブラウザでログインしてください`
- 追加: `⏳ ログイン完了を自動検出します（最大5分待機）`
- 追加: `💡 二段階認証もゆっくり対応できます`

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/login-helper.ts:254-286` | waitForLoginStatus改善 |
| `src/tools/chatgpt-web.ts:384-411` | ログイン待機メッセージ改善 |
| `src/tools/gemini-web.ts:340-365` | ログイン待機メッセージ改善 |
| `src/tools/gemini-image.ts:196-210` | ログイン待機メッセージ改善 |

## 実装詳細

### login-helper.ts 修正

```typescript
// タイムアウト定数
const LOGIN_TIMEOUT_MS = 300000; // 5分（二段階認証対応）

export async function waitForLoginStatus(
  page: Page,
  service: 'chatgpt' | 'gemini',
  response: McpToolResponse,
  timeoutMs: number = LOGIN_TIMEOUT_MS,
): Promise<LoginStatus> {
  const startTime = Date.now();
  let delay = 500;
  let lastProgressReport = 0;

  // ブラウザを前面に出す
  await page.bringToFront();

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, delay));

    const status = await (service === 'chatgpt'
      ? probeChatGPTSession(page)
      : getGeminiStatus(page));

    if (status === LoginStatus.LOGGED_IN) {
      response.appendResponseLine('✅ ログイン検出！処理を続行します');
      return status;
    }

    // 15秒ごとに残り時間付き進捗表示（分:秒形式）
    const elapsed = Date.now() - startTime;
    if (elapsed - lastProgressReport >= 15000) {
      const remainingMs = timeoutMs - elapsed;
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.ceil((remainingMs % 60000) / 1000);
      const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
      response.appendResponseLine(`⏳ ログイン待機中... 残り ${timeStr}`);
      lastProgressReport = elapsed;
    }

    // 指数バックオフ
    const jitter = 0.9 + Math.random() * 0.2;
    delay = Math.min(3000, Math.floor(delay * 1.5 * jitter));
  }

  response.appendResponseLine('❌ ログインタイムアウト（5分）');
  return LoginStatus.NEEDS_LOGIN;
}
```

### 各ツールのメッセージ改善

**Before:**
```
❌ ChatGPTへのログインが必要です
📱 ブラウザでChatGPTにログインしてください
⏳ ログイン待機中（最大120秒）...
```

**After:**
```
🔐 ログインが必要です
📱 ブラウザウィンドウを開きました。ログインしてください
⏳ ログイン完了を自動検出します（最大5分待機）
💡 二段階認証もゆっくり対応できます
```

## 検証方法

1. ChatGPT/Geminiからログアウト
2. `ask_chatgpt_web`または`ask_gemini_web`を実行
3. 確認項目:
   - [ ] ブラウザが前面に表示される
   - [ ] 残り時間が15秒ごとに更新される（分:秒形式）
   - [ ] 二段階認証を含むログインを余裕を持って完了できる
   - [ ] ログイン完了時に「✅ ログイン検出！」が表示される
   - [ ] 処理が自動的に続行される

## 期待される出力

```
🔐 ログインが必要です
📱 ブラウザウィンドウを開きました。ログインしてください
⏳ ログイン完了を自動検出します（最大5分待機）
💡 二段階認証もゆっくり対応できます
⏳ ログイン待機中... 残り 4分45秒
⏳ ログイン待機中... 残り 4分30秒
⏳ ログイン待機中... 残り 4分15秒
（ユーザーが二段階認証を完了）
✅ ログイン検出！処理を続行します
[通常の処理が続行]
```
