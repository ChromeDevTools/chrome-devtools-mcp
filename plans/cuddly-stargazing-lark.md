# ask_chatgpt_web / ask_gemini_web のケース分類改善プラン

## 問題

`ask_chatgpt_web` と `ask_gemini_web` ツールで、**エラーケースの分類が不十分で、リトライすべきでないケースでもリトライを繰り返してしまう**。

具体例：「No page selected」エラーが発生しても、入力欄リトライなどの無意味なリトライが繰り返される。

## 調査結果

### 既存のリトライロジック
1. **navigateWithRetry** (27-61行目) - ネットワークエラー時に3回リトライ
2. **入力欄リトライ** (522-546行目) - 入力欄が見つからない場合に3回リトライ
3. **ログイン状態リトライ** (378-399行目) - ログイン処理中に3回リトライ

### 問題点
これらのリトライは「一時的なエラー」を想定しているが、**致命的なエラー**（ページなし、ブラウザ接続切れ）でも同じようにリトライしてしまう。

### 分類すべきケース

| ケース | リトライ可否 | 現状 |
|--------|------------|------|
| ネットワークエラー | ✅ リトライ | OK |
| UI遅延（入力欄待ち） | ✅ リトライ | OK |
| ログイン処理中 | ✅ リトライ | OK |
| **ページなし** | ❌ 即座にエラー | ⚠️ リトライしてしまう |
| **ブラウザ接続切れ** | ❌ 即座にエラー | ⚠️ リトライしてしまう |
| **セレクター変更** | ❌ 即座にエラー | ⚠️ リトライしてしまう |

## 修正方針（段階的アプローチ）

### Step 1: 最小限の変更（まずこれだけ）

既存コードはそのまま、**catchブロックにケース分類を追加するだけ**：

**chatgpt-web.ts:766-770** の既存catch:
```typescript
// 現状
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  response.appendResponseLine(`❌ エラー: ${errorMessage}`);
}
```

**変更後**:
```typescript
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);

  // ケース分類（エラーメッセージを改善するだけ）
  if (msg.includes('No page selected')) {
    response.appendResponseLine('❌ ブラウザタブがありません');
    response.appendResponseLine('→ MCPサーバーを再起動してブラウザを開いてください');
  } else if (msg.includes('Target closed') || msg.includes('Session closed')) {
    response.appendResponseLine('❌ ブラウザ接続が切れました');
    response.appendResponseLine('→ MCPサーバーを再起動してください');
  } else {
    response.appendResponseLine(`❌ エラー: ${msg}`);
  }
}
```

**変更量**: 約10行、既存ロジック変更なし

### Step 2: 動作確認後（オプション）

Step 1で問題なければ、リトライ箇所の最適化を検討。

## 変更ファイル

**Step 1のみ**:
- `src/tools/chatgpt-web.ts` - catchブロックのメッセージ改善（10行程度）
- `src/tools/gemini-web.ts` - 同様（10行程度）

## 検証方法

```bash
npm run build
npm test
```

## ロールバック

問題があれば `git checkout src/tools/chatgpt-web.ts src/tools/gemini-web.ts`
