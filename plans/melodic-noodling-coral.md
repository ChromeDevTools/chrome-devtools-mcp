# パフォーマンス最適化計画

## 概要

ChatGPTへの質問投入までの待ち時間を重点的に削減する。

**ユーザー報告**: 「ブラウザを起動して、ChatGPTを出したのに、質問を投げるまでが時間がかかっている」

---

## 🎯 最優先: ChatGPT質問フローの高速化

### 現状の遅延（既存ChatGPTタブがある場合）

| ステップ | 処理 | 遅延 | 問題 |
|---------|------|------|------|
| セッションナビゲーション | 同じURLに再ナビゲーション | 3000ms | **不要** |
| ログイン確認 | Shadow DOM全検索 | 1500-3000ms | 重すぎる |
| 固定待機 | setTimeout(2000) 複数 | 2000ms+ | **不要** |
| ポーリング開始 | 最初の2秒待機 | 2000ms | 短縮可能 |

**合計: 7-15秒** → **目標: 3-4秒**

---

### 改善1: 同一URL時のナビゲーションスキップ（最重要）

**ファイル**: `src/tools/chatgpt-web.ts:406-414`

```typescript
// Before: 常にナビゲーション実行
await navigateWithRetry(page, latestSession.url, {
  waitUntil: 'networkidle2',
});
await new Promise(resolve => setTimeout(resolve, 2000));

// After: 同一URLならスキップ
const currentUrl = page.url();
if (!currentUrl.includes(latestSession.chatId)) {
  await navigateWithRetry(page, latestSession.url, {
    waitUntil: 'domcontentloaded',  // networkidle2 → domcontentloaded
  });
}
// 固定2秒待機を削除
```

**効果**: 3-5秒短縮

---

### 改善2: ポーリング開始の即座化

**ファイル**: `src/tools/chatgpt-web.ts:523`

```typescript
// Before: 最初に2秒待機
while (true) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  // ...
}

// After: 初回は即座に確認、2回目から500ms間隔
let isFirstCheck = true;
while (true) {
  if (!isFirstCheck) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  isFirstCheck = false;
  // ...
}
```

**効果**: 1.5-2秒短縮

---

### 改善3: 不要な固定待機の削除

**ファイル**: `src/tools/chatgpt-web.ts`

| 行 | 現在 | 変更後 | 効果 |
|----|------|--------|------|
| 340 | `setTimeout(2000)` | 削除 | 2秒 |
| 482 | `setTimeout(500)` | 削除 | 0.5秒 |
| 437 | `setTimeout(1000)` | `setTimeout(300)` | 0.7秒 |

**効果**: 合計3秒短縮

---

### 改善4: ログイン確認の効率化

**ファイル**: `src/tools/login-helper.ts`

```typescript
// probeChatGPTSession のタイムアウト短縮
// Before
setTimeout(() => controller.abort(), 5000);

// After
setTimeout(() => controller.abort(), 1500);
```

**効果**: タイムアウト時3.5秒短縮

---

## Phase 1: 即効性のある改善（1行変更）

### 1.1 wait_for デフォルトタイムアウト短縮

**ファイル**: `src/tools/snapshot.ts:39`

```typescript
// Before
const timeout = request.params.timeout ?? 30000;

// After
const timeout = request.params.timeout ?? 10000;
```

**効果**: タイムアウト時の待機が 30秒 → 10秒（20秒短縮）
**リスク**: 極低（明示的指定で従来動作可能）

---

### 1.2 DOM安定化タイムアウト短縮

**ファイル**: `src/WaitForHelper.ts:24-27`

```typescript
// Before
this.#stableDomTimeout = 3000 * cpuTimeoutMultiplier;
this.#stableDomFor = 500 * cpuTimeoutMultiplier;
this.#expectNavigationIn = 100 * cpuTimeoutMultiplier;

// After
this.#stableDomTimeout = 1500 * cpuTimeoutMultiplier;
this.#stableDomFor = 300 * cpuTimeoutMultiplier;
this.#expectNavigationIn = 50 * cpuTimeoutMultiplier;
```

**効果**: 各操作（click, fill, hover）で最大1.7秒短縮
**リスク**: 低（CPUスロットリング時は自動調整）

---

### 1.3 再接続の初期遅延短縮

**ファイル**: `src/browser-connection-manager.ts:36`

```typescript
// Before
initialRetryDelay: 1000,

// After
initialRetryDelay: 300,
```

**効果**: 再接続時の初期遅延 1秒 → 0.3秒（0.7秒短縮）
**リスク**: 極低（指数バックオフで自動調整）

---

## Phase 2: 構造的改善

### 2.1 fillForm のDOM安定化待ちを1回に

**ファイル**: `src/tools/input.ts:137-150`

```typescript
// Before: 各要素ごとにDOM安定化待ち
for (const element of request.params.elements) {
  await context.waitForEventsAfterAction(async () => {
    await handle.asLocator().fill(element.value);
  });
}

// After: 入力は順序実行、DOM安定化は最後に1回
for (const element of request.params.elements) {
  const handle = await context.getElementByUid(element.uid);
  try {
    await handle.asLocator().fill(element.value);
  } finally {
    void handle.dispose();
  }
}
await context.waitForEventsAfterAction(async () => {});
```

**効果**: 5フィールドのフォーム: 17.5秒 → 2秒（約88%短縮）
**リスク**: 中（フィールド間でバリデーションが走る場合に注意）

---

### 2.2 リモートツールのタイムアウト短縮

**ファイル**: `src/tools/gemini-web.ts`, `src/tools/chatgpt-web.ts`

```typescript
// Before
{timeout: 10000}

// After
{timeout: 5000}
```

**効果**: UI検出タイムアウト時に5秒短縮
**リスク**: 低（遅いネットワークで影響あり）

---

## 修正対象ファイル一覧

### ChatGPT高速化（最優先）

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/tools/chatgpt-web.ts` | 406-414 | 同一URLスキップ |
| `src/tools/chatgpt-web.ts` | 523 | ポーリング初回即座化 |
| `src/tools/chatgpt-web.ts` | 340, 437, 482 | 固定待機削除/短縮 |
| `src/tools/login-helper.ts` | 44-50 | タイムアウト5s→1.5s |

### 汎用改善

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/tools/snapshot.ts` | 39 | デフォルト30s→10s |
| `src/WaitForHelper.ts` | 24-27 | DOM安定化短縮 |
| `src/browser-connection-manager.ts` | 36 | 初期遅延1s→0.3s |

---

## 期待効果

| 操作 | Before | After | 短縮 |
|------|--------|-------|------|
| **ChatGPT質問（既存タブ）** | 7-15秒 | 3-4秒 | **60-70%** |
| ChatGPT質問（新規タブ） | 11-15秒 | 6-7秒 | 45-55% |
| click/fill/hover | 最大3.6秒 | 最大1.9秒 | 47% |
| 5フィールドフォーム | 17.5秒 | 2秒 | 88% |

---

## 検証方法

1. `npm run build && npm test` - テスト通過
2. MCPサーバー起動、ChatGPTタブを開く
3. **`ask_chatgpt_web` で質問を投げる**
   - 既存タブでの質問投入が3-4秒以内か確認
4. Chromeを閉じて再起動後も動作確認

---

## 実装順序

1. **ChatGPT高速化を最優先で実装**
   - 同一URLスキップ
   - 固定待機削除
   - ポーリング即座化
2. テスト実行
3. 汎用改善（Phase 1, 2）を順次実装
