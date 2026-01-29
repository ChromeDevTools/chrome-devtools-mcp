# Gemini送信ボタン問題の修正計画

## 📋 現状の整理

### 判明した問題
**症状**: Geminiで2回目以降の実行時、送信ボタンが押せない
- ✅ 1回目: 入力成功 → 送信成功 → 応答取得
- ✅ 2回目: 入力成功（テキスト表示あり）→ ボタンは有効に見える
- ❌ 2回目: **しかしclick()が効かず、送信されない**

### 方針
- **Geminiのみに集中**して、2回目以降も確実に動作するようにする
- 解決後、ChatGPTにも同じ修正を適用
- 単体TypeScript（fast-chat.ts）として動作確認

---

## 🎯 Phase 1: Gemini送信ボタンの修正（最優先）

### 1.1 問題の根本原因

**現在のコード**（fast-chat.ts: 1114-1136行）:
```typescript
// リトライロジック（6秒後）
const sendButton = buttons.find(b =>
  (b.textContent || '').includes('送信') ||
  (b.getAttribute('aria-label') || '').includes('送信') ||
  (b.getAttribute('aria-label') || '').includes('Send')
);
if (sendButton && !sendButton.disabled) sendButton.click(); // ← 2回目は効かない
```

**問題点**:
1. `document.querySelectorAll('button')` → Shadow DOM非対応
2. `sendButton.click()` → CDP Runtime.evaluateでのDOM操作が2回目は効かない
3. 入力直後すぐclick()すると、内部状態更新が間に合わない可能性

### 1.2 修正アプローチ

#### アプローチA: CDP Input.dispatchMouseEvent（推奨）

**理由**: DOM操作（click()）ではなく、実際のマウスイベントをシミュレート

**実装**（fast-chat.ts: 1010-1040行の送信処理を修正）:

```typescript
// 既存の送信ボタンクリック処理（1010-1040行あたり）を以下に置き換え

const initialGeminiUserCount = await client.evaluate<number>(geminiUserCountExpr);
const tSend = nowMs();

// Step 1: 送信ボタンを見つける（collectDeep使用）
const buttonInfo = await client.evaluate<{
  found: boolean;
  disabled: boolean;
  x: number;
  y: number;
  selector: string;
}>(`
  (() => {
    // collectDeep実装（Shadow DOM対応）
    const collectDeep = (selectorList) => {
      const results = [];
      const seen = new Set();
      const visit = (root) => {
        if (!root) return;
        for (const sel of selectorList) {
          try {
            root.querySelectorAll?.(sel)?.forEach(el => {
              if (!seen.has(el)) {
                seen.add(el);
                results.push(el);
              }
            });
          } catch {}
        }
        const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
        for (const el of elements) {
          if (el.shadowRoot) visit(el.shadowRoot);
        }
      };
      visit(document);
      return results;
    };

    const isDisabled = (el) =>
      !el || el.disabled ||
      el.getAttribute('disabled') === 'true' ||
      el.getAttribute('aria-disabled') === 'true';

    // ボタン検索
    const buttons = collectDeep(['button', '[role="button"]']);
    const sendButton = buttons.find(b =>
      (b.textContent || '').includes('送信') ||
      (b.getAttribute('aria-label') || '').includes('送信') ||
      (b.getAttribute('aria-label') || '').includes('Send') ||
      b.querySelector('mat-icon[data-mat-icon-name="send"]')
    );

    if (!sendButton) {
      return {found: false, disabled: false, x: 0, y: 0, selector: 'none'};
    }

    const rect = sendButton.getBoundingClientRect();
    return {
      found: true,
      disabled: isDisabled(sendButton),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      selector: sendButton.getAttribute('aria-label') || 'send-button'
    };
  })()
`);

console.error(`[Gemini] Send button: found=${buttonInfo.found}, disabled=${buttonInfo.disabled}, selector=${buttonInfo.selector}`);

if (!buttonInfo.found) {
  throw new Error('Gemini send button not found.');
}
if (buttonInfo.disabled) {
  throw new Error('Gemini send button is disabled.');
}

// Step 2: CDP Input.dispatchMouseEventでクリック
await client.send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: buttonInfo.x,
  y: buttonInfo.y,
  button: 'left',
  clickCount: 1
});

await new Promise(resolve => setTimeout(resolve, 50)); // 50ms待機

await client.send('Input.dispatchMouseEvent', {
  type: 'mouseReleased',
  x: buttonInfo.x,
  y: buttonInfo.y,
  button: 'left',
  clickCount: 1
});

console.error('[Gemini] Mouse click dispatched');
timings.sendMs = nowMs() - tSend;

// Step 3: メッセージ送信確認（既存のロジック）
try {
  await client.waitForFunction(`${geminiUserCountExpr} > ${initialGeminiUserCount}`, 8000);
} catch (error) {
  // フォールバック: Enterキーイベント
  console.error('[Gemini] Message not sent, trying Enter key fallback');
  await client.evaluate(`
    (() => {
      const textbox =
        document.querySelector('[role="textbox"]') ||
        document.querySelector('div[contenteditable="true"]');
      if (textbox) {
        textbox.focus();
        const eventInit = {bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13};
        textbox.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        textbox.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      }
    })()
  `);
  await client.waitForFunction(`${geminiUserCountExpr} > ${initialGeminiUserCount}`, 5000);
}
```

**修正箇所**: src/fast-cdp/fast-chat.ts: 1010-1040行あたり

#### アプローチB: 入力後の待機時間追加

**入力完了直後（行1009あたり）**:
```typescript
if (geminiInputMatched) {
  // 内部状態更新を待つ
  await new Promise(resolve => setTimeout(resolve, 200));
  console.error('[Gemini] Input matched, waited 200ms before send');
}
```

**修正箇所**: src/fast-cdp/fast-chat.ts: 1009行以降

#### アプローチC: リトライロジックの削除

**現在の6秒リトライ（1114-1136行）を削除**:
- 理由: CDP Input.dispatchMouseEventが確実なら不要
- リトライは失敗時のフォールバックのみ（上記Step 3）

**修正箇所**: src/fast-cdp/fast-chat.ts: 1114-1136行を削除

### 1.3 デバッグログ強化

```typescript
// 送信前
const userCountBefore = await client.evaluate<number>(geminiUserCountExpr);
console.error(`[Gemini] User message count before send: ${userCountBefore}`);

// 送信後
const userCountAfter = await client.evaluate<number>(geminiUserCountExpr);
console.error(`[Gemini] User message count after send: ${userCountAfter}`);

if (userCountAfter <= userCountBefore) {
  console.error('[Gemini] WARNING: Message count did not increase');
}
```

---

## 🧪 テスト方法

### 1. ビルド
```bash
cd /Users/usedhonda/projects/mcp/chrome-ai-bridge
npm run build
```

### 2. Extension Relay起動確認
```bash
# tmuxセッションで既に起動済み
curl -I http://localhost:8765 2>&1 | grep -i upgrade || echo "Relay not ready"
```

### 3. Geminiテスト（1回目）
```bash
node --input-type=module -e "
import('./build/src/fast-cdp/fast-chat.js')
  .then(m => m.askGeminiFast('日本の首都は？'))
  .then(response => {
    console.log('=== 1回目の応答 ===');
    console.log(response);
  })
  .catch(console.error);
"
```

### 4. Geminiテスト（2回目 - 重要）
```bash
# 即座に2回目実行
node --input-type=module -e "
import('./build/src/fast-cdp/fast-chat.js')
  .then(m => m.askGeminiFast('日本の人口は？'))
  .then(response => {
    console.log('=== 2回目の応答 ===');
    console.log(response);
  })
  .catch(console.error);
"
```

### 5. 連続テスト
```bash
# 3回連続実行で安定性確認
for i in 1 2 3; do
  echo "=== Test $i ==="
  node --input-type=module -e "
    import('./build/src/fast-cdp/fast-chat.js')
      .then(m => m.askGeminiFast('テスト質問$i'))
      .then(response => console.log('OK: ' + response.slice(0, 50)))
      .catch(error => console.error('FAIL: ' + error.message));
  "
  sleep 2
done
```

### 成功基準

**Phase 1完了時**:
- ✅ 1回目: 正常に動作
- ✅ 2回目: 正常に動作（送信ボタンクリック成功）
- ✅ 3回目以降: 同じチャットスレッドで会話継続
- ✅ デバッグログに "Mouse click dispatched" と "User message count" 増加が表示
- ✅ エラーなし、フォールバック不要

---

## 📊 実装スケジュール

### 即座に実施
1. fast-chat.ts: Gemini送信ボタン処理の修正（1010-1040行）
   - collectDeep実装
   - CDP Input.dispatchMouseEvent
   - デバッグログ追加
   **所要時間**: 1-1.5時間

2. fast-chat.ts: 入力後の待機時間追加（1009行）
   **所要時間**: 10分

3. fast-chat.ts: 古いリトライロジック削除（1114-1136行）
   **所要時間**: 5分

4. テスト実行（1回目、2回目、連続）
   **所要時間**: 30分

**Phase 1合計**: 約2時間

### 次のステップ（Phase 1成功後）
- ChatGPTにも同じ修正を適用
- SPAナビゲーション安定化（必要なら）

---

## 📁 重要ファイル

**実装対象**:
- **src/fast-cdp/fast-chat.ts** (1229行)
  - askGeminiFast()関数: 行740-1200あたり
  - 送信ボタン処理: 1010-1040行（主要修正箇所）
  - リトライロジック: 1114-1136行（削除対象）
  - 入力処理: 900-1009行（待機時間追加）

**参照**:
- src/fast-cdp/cdp-client.ts - send()メソッド（CDP呼び出し）

---

## ⚠️ リスクと対策

| リスク | 対策 |
|--------|------|
| CDP Input.dispatchMouseEventが効かない | Enterキーフォールバック（Step 3） |
| ボタンの座標取得失敗 | getBoundingClientRect()のエラーハンドリング |
| Shadow DOM階層が複雑 | collectDeep()で完全走査 |
| 待機時間200msが不足 | デバッグログで検証、必要なら300-500msに調整 |

---

## 💡 設計判断

### 採用したアプローチ
- **CDP Input.dispatchMouseEvent**: DOM操作ではなく実際のマウスイベント
- **Gemini集中**: 1つのプラットフォームで完全解決してから展開
- **デバッグログ充実**: 失敗原因を即座に特定可能

### 却下した代替案
1. **Puppeteer page.click()**: 単体TypeScriptの方針に反する、依存関係複雑
2. **常に新規チャット作成**: 会話コンテキスト喪失
3. **6秒リトライ継続**: 根本解決ではなく、レイテンシ増加

---

## 次のアクション

**今すぐ実施**:
1. プランモード終了（ExitPlanMode）
2. fast-chat.ts修正開始
3. ビルド & テスト
