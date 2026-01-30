# fast-chat 応答検出の再設計

## 目標

**「fast」の意味**: 無駄な待ち時間なく、スムーズに会話できること

## 現在の問題

| 問題 | 影響 |
|------|------|
| 応答が空で返る | 会話が成立しない |
| カウント検出がタイミング依存 | 不安定 |
| 15秒タイムアウト待ち | 遅い |

---

## シンプルな解決策

**カウント比較は不要。ボタン状態で判断:**

```
【シンプルなフロー】

1. 送信前: 停止ボタンがないことを確認
   - あれば待つ（前の応答完了待ち）

2. 質問を送る
   - 入力 → 送信ボタンクリック

3. 送信成功確認（応答待ち中にDOMを見る）
   - [data-message-author-role="user"]:last-of-type に自分の質問の先頭部分があるか
   - 長文は途切れる可能性あるので、先頭N文字の一致でOK
   - 改行は正規化して比較（\n, \r\n, <br> → 統一）

4. 応答完了を待つ
   - 停止ボタン消失

5. 最後の回答を返す
   - [data-message-author-role="assistant"]:last-of-type のテキスト
```

**ボタン状態の意味:**
| ボタン | 状態 |
|--------|------|
| 停止ボタンあり | 応答生成中（待て） |
| 停止ボタンなし + 送信ボタンなし | アイドル（送信可能） |
| 停止ボタンなし + 送信ボタンあり | テキスト入力済み（送信可能） |

---

## 修正内容

### ファイル: `src/fast-cdp/fast-chat.ts`

**応答取得を単純化:**

```typescript
// Before: カウント比較して「新しいメッセージ」を探す
const initialCount = getAssistantCount();
await waitForResponse();
const newMessages = allMessages.slice(initialCount);
return newMessages[0] || '';  // ← ここで空になる

// After: 最後の回答を直接取得
await waitForStopButtonDisappear();
const lastMessage = document.querySelector(
  '[data-message-author-role="assistant"]:last-of-type'
);
return lastMessage?.textContent || '';
```

---

## 検証方法

```bash
npm run build && npm run test:chatgpt -- "1+1は？"
```

期待結果: 「2」などの回答が返る（空でない）
