# test.txt 残留問題の修正

## 問題

`npm test` 実行後に `test.txt` がプロジェクトルートに残留する。
これがgitに誤ってコミットされる原因になっている。

## 原因

`tests/tools/input.test.ts` の `uploadFile` テストで一時ファイルを作成しているが、
テスト失敗時にクリーンアップされない。

### 該当コード

**ファイル**: `tests/tools/input.test.ts`

```typescript
// テスト1 (301-330行)
const testFilePath = path.join(process.cwd(), 'test.txt');
await fs.writeFile(testFilePath, 'test file content');  // 作成
// ... テスト実行 ...
await fs.unlink(testFilePath);  // テスト成功時のみ削除

// テスト2 (332-370行) - 同様のパターン
// テスト3 (372-403行) - 同様のパターン
```

**問題**: テストが失敗すると `fs.unlink()` に到達せず、ファイルが残る。

---

## 修正方針

### try-finally でクリーンアップを保証

```typescript
// Before
const testFilePath = path.join(process.cwd(), 'test.txt');
await fs.writeFile(testFilePath, 'test file content');
await withBrowser(async (response, context) => {
  // ... test ...
});
await fs.unlink(testFilePath);

// After
const testFilePath = path.join(process.cwd(), 'test.txt');
await fs.writeFile(testFilePath, 'test file content');
try {
  await withBrowser(async (response, context) => {
    // ... test ...
  });
} finally {
  await fs.unlink(testFilePath).catch(() => {});
}
```

---

## 修正対象

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `tests/tools/input.test.ts` | 301-330 | try-finally 追加 |
| `tests/tools/input.test.ts` | 332-370 | try-finally 追加 |
| `tests/tools/input.test.ts` | 372-403 | try-finally 追加 |

---

## 検証方法

1. `npm run build`
2. `npm test` を実行
3. テスト完了後、`ls test.txt` で確認 → ファイルが存在しないこと
4. 意図的にテストを失敗させても `test.txt` が残らないことを確認
