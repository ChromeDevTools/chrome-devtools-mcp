# ChatGPT質問送信の確認ロジック問題

## 症状
- 最初にページを開いたとき、質問をうまく投げられていない
- 前の回答を見て、答えが来たと勘違いしている
- 質問を確実に投げたと理解できていない

## 根本原因

**「新しい応答を取得する」のではなく、「最後の応答を取得する」ロジックになっている**

---

### 問題1: 送信確認が不十分

**場所**: `src/tools/chatgpt-web.ts:557-566`

```typescript
// 現在: 「ユーザーメッセージが存在する」だけを確認
await page.waitForFunction(() => {
  const messages = document.querySelectorAll('[data-message-author-role="user"]');
  return messages.length > 0;  // ← 既存チャットでは常にtrue
}, {timeout: 10000});
```

**問題**: 既存チャットには古いメッセージが既にあるため、すぐに通過してしまう

---

### 問題2: 回答検出で前の回答と混同

**場所**: `src/tools/chatgpt-web.ts:596-633`

```typescript
// 現在: 常に「最後の」メッセージを取得
const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
const latestMessage = assistantMessages[assistantMessages.length - 1];
// ↑ 前回の回答を返してしまう
```

---

## 修正方針

### 1. 送信前のメッセージ数をキャプチャ

```typescript
// 送信前
const initialUserMsgCount = await page.evaluate(() =>
  document.querySelectorAll('[data-message-author-role="user"]').length
);
const initialAssistantMsgCount = await page.evaluate(() =>
  document.querySelectorAll('[data-message-author-role="assistant"]').length
);
```

### 2. 送信後「メッセージ数が増えた」ことを確認

```typescript
// 送信後
await page.waitForFunction(
  (initialCount) => {
    const messages = document.querySelectorAll('[data-message-author-role="user"]');
    return messages.length > initialCount;  // ← 増えたことを確認
  },
  {timeout: 10000},
  initialUserMsgCount
);
```

### 3. 回答検出で「新しい」アシスタントメッセージのみを対象

```typescript
// 新しいアシスタントメッセージ＝initialAssistantMsgCountより後のインデックス
const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
if (assistantMessages.length > initialAssistantMsgCount) {
  const newMessage = assistantMessages[initialAssistantMsgCount]; // 新規の最初のメッセージ
  // ...
}
```

---

## 変更ファイル

| ファイル | 変更箇所 |
|---------|----------|
| `src/tools/chatgpt-web.ts` | L550付近（送信前キャプチャ）、L557-566（送信確認）、L596-633（回答検出） |

---

## 検証方法

1. 既存チャットがある状態で `ask_chatgpt_web` を実行
2. 新しい質問を送信
3. **前の回答ではなく、新しい回答が返されることを確認**
