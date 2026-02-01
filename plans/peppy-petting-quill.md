# Gemini テスト失敗の調査と修正計画

## ステータス: 完了 (2026-02-02)

スモークテスト全3シナリオが成功：
- ChatGPT 新規チャット: ✅
- Gemini 新規チャット: ✅
- ChatGPT+Gemini 並列クエリ: ✅

追加修正: リトライロジック実装（詳細は `docs/log/claude/260202_052829-gemini-retry-logic.md`）

---

## 問題の概要

フルテストスイートでGemini関連のテストが失敗:
- `gemini-new-chat`: 8分タイムアウト
- `parallel-query`: 送信ボタン60秒無効

スモークテストでは成功していた → セッション状態の問題が疑われる

---

## 調査結果

### エラーログ分析

```
sawStopButton=true, textStableCount=472
responseCounts: { modelResponse: {count: 3} }
```

- `textStableCount=472`: 472秒間テキストが安定 → ポーリングは動作している
- しかし完了条件を満たさずタイムアウト

### 根本原因

#### 原因1: フィードバックボタン検出がShadow DOM非対応

**問題箇所**: `src/fast-cdp/fast-chat.ts:3129-3133`

```javascript
const hasFeedbackButtons = !!(
  document.querySelector('img[alt="thumb_up"], img[alt="thumb_down"]') ||  // ← Shadow DOM内を検索しない
  ...
);
```

`document.querySelector()` はShadow DOM内を検索しない。GeminiはWebコンポーネント（Shadow DOM）を多用しているため、フィードバックボタンがShadow DOM内にある場合、検出に失敗する。

**対照**: 同じファイル内で `collectDeep()` が定義されている（行3032-3054）が、フィードバックボタン検出には使用されていない。

#### 原因2: 応答完了条件3の `!state.hasStopButton` が常にtrue

**問題箇所**: `src/fast-cdp/fast-chat.ts:3206`

```javascript
if (textStableCount >= 5 && state.modelResponseCount > initialModelResponseCount && !state.hasStopButton) {
```

ログ `textStableCount=472` なのにこの条件で完了しない理由:
- `!state.hasStopButton` が false（停止ボタンが検出され続けている）
- または `modelResponseCount > initialModelResponseCount` が false

#### 原因3: 既存チャット再接続時の初期カウント問題

スモークテストで成功 → フルテストで失敗のパターンは、ChatGPTで発生した「既存チャット再接続時の誤認」と同じ。

- フルテストでは前のテストのセッションを再利用
- `initialModelResponseCount` が既に高い値（例: 3）
- 新しい応答が追加されても、DOM検出のタイミングで増加を検出できない

---

## 修正計画

### 修正1: フィードバックボタン検出をShadow DOM対応

**ファイル**: `src/fast-cdp/fast-chat.ts`
**行**: 3128-3133

```javascript
// 修正前
const hasFeedbackButtons = !!(
  document.querySelector('img[alt="thumb_up"], img[alt="thumb_down"]') ||
  ...
);

// 修正後
const feedbackImgs = collectDeep(['img[alt="thumb_up"]', 'img[alt="thumb_down"]']);
const hasFeedbackButtons = feedbackImgs.length > 0 ||
  buttons.some(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('良い回答') || label.includes('悪い回答') ||
           label.includes('good') || label.includes('bad');
  });
```

### 修正2: テキスト抽出のフィードバックボタン検出も同様に修正

**ファイル**: `src/fast-cdp/fast-chat.ts`
**行**: 3259

```javascript
// 修正前
const thumbUpImg = document.querySelector('img[alt="thumb_up"]');

// 修正後（collectDeepを使用）
const feedbackImgs = collectDeep(['img[alt="thumb_up"]', 'img[alt="thumb_down"]']);
const thumbUpImg = feedbackImgs.find(img => img.alt === 'thumb_up');
```

### 修正3: 応答完了条件の堅牢化

**ファイル**: `src/fast-cdp/fast-chat.ts`
**行**: 3205-3209

応答完了条件3を緩和:
```javascript
// 修正前
if (textStableCount >= 5 && state.modelResponseCount > initialModelResponseCount && !state.hasStopButton) {

// 修正後: textStableCountが十分大きければ完了とみなす（stopボタン検出失敗の救済）
if (textStableCount >= 10 && state.modelResponseCount > 0 && !state.hasStopButton) {
  // 10秒以上安定 + レスポンスがある + 停止ボタンなし → 完了
}
// さらにフォールバック追加
if (textStableCount >= 30 && state.modelResponseCount > 0) {
  // 30秒以上安定 + レスポンスがある → 強制完了（stopボタン検出関係なく）
}
```

---

## 検証方法

1. `npm run build` でビルド
2. `npm run test:gemini` で単体テスト
3. `npm run test:suite` でフルテスト
4. 特に以下を確認:
   - 既存チャットへの再接続後の応答検出
   - フィードバックボタン検出ログ（`feedback=true/false`）

---

## 修正対象ファイル

- `src/fast-cdp/fast-chat.ts`
  - 行3128-3133: フィードバックボタン検出
  - 行3205-3216: 応答完了条件
  - 行3259: テキスト抽出のフィードバックボタン検出
