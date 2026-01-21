# Gemini 回答取得失敗の修正プラン

## 問題

`ask_gemini_web` で「✅ ログイン確認完了」が表示された後、回答が正しく取得できない。

**症状:**
- ログイン検出は成功（「✅ ログイン確認完了」が表示される）
- 質問は送信されている
- しかし、回答待機中にタイムアウト、または空の回答を取得

**注意:** これはログイン検出の問題ではなく、**回答完了検出**の問題。

## 根本原因

**ChatGPTとGeminiの回答完了検出ロジックの違い：**

| 項目 | ChatGPT | Gemini | 問題点 |
|------|---------|--------|-------|
| 初期状態の記録 | `initialAssistantCount`を記録 | 記録なし | 新規メッセージ検出不可 |
| 完了判定 | ストップボタン消滅 **AND** メッセージ数増加 | ストップボタン消滅**のみ** | 誤判定リスク |
| 回答抽出 | 新規メッセージのみ | 最後の`model-response` | 古い応答を取得する可能性 |

**具体的な問題：**
1. Geminiはストップボタンが**一時的に消滅**することがある
2. その時に「完了」と誤判定してループを抜ける
3. 実際には回答がまだ生成されていない

## 修正方針

ChatGPTと同じ「カウント方式」に変更：

1. 質問送信**前**に `model-response` 要素数を記録
2. ストップボタン消滅 **かつ** `model-response` 要素数増加で完了判定
3. 新規の `model-response` 要素からテキスト抽出

## 変更ファイル

- `src/tools/gemini-web.ts`

## 変更箇所

### 1. 初期状態の記録を追加（質問送信前、約450行目付近）

```typescript
// 質問送信前に model-response 要素数を記録
const initialModelResponseCount = await page.evaluate(() => {
  return document.querySelectorAll('model-response').length;
});
```

### 2. 回答完了判定を変更（約548-571行目）

現在：
```typescript
if (!hasStopIndicator) {
  break;  // ストップボタン消滅のみで完了判定
}
```

変更後：
```typescript
if (!hasStopIndicator) {
  // 追加: model-response 要素数が増えたか確認
  const currentModelResponseCount = await page.evaluate(() => {
    return document.querySelectorAll('model-response').length;
  });

  if (currentModelResponseCount > initialModelResponseCount) {
    break;  // ストップボタン消滅 AND 新規メッセージ出現で完了
  }
  // メッセージ数が増えていなければ、まだ待機続行
}
```

### 3. 回答テキスト抽出を改善（約581-596行目）

現在：
```typescript
const lastResponse = modelResponses[modelResponses.length - 1];
```

変更後：
```typescript
// 新規に追加された model-response のみを取得
const newResponse = modelResponses[initialModelResponseCount];
```

## 検証方法

```bash
# ビルド
npm run build

# MCPサーバー再起動後、テスト
# 1. ask_gemini_web で質問を送信
# 2. 「ログイン確認完了」後にタイムアウトしないことを確認
# 3. 回答が正しく取得されることを確認
```

## ロールバック

```bash
git checkout src/tools/gemini-web.ts
```
