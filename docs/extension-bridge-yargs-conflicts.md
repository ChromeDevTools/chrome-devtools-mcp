# Extension Bridge - yargs conflicts問題の根本原因

**作成日時**: 2026-01-28 13:40
**担当**: Claude 4.5 → Codex へ引き継ぎ

---

## 🔴 根本原因

**yargsのconflictsは、`default`値を持つboolean optionを「指定あり」と判定する**

### 問題の構造

```typescript
// src/cli.ts
{
  headless: {
    type: 'boolean',
    default: false,  // ← これが「指定あり」扱いになる
  },
  attachTabUrl: {
    type: 'string',
    conflicts: ['headless', ...]  // ← conflictエラー発生
  }
}
```

### 発生したエラーの変遷

1. **`headless` との衝突** → 修正済み（`default: false`を削除）
2. **`isolated` との衝突** → 修正済み（`default: false`を削除）
3. **`loadSystemExtensions` との衝突** → 未修正（現在ここ）
4. **その他のboolean optionsも同様の問題を抱えている可能性**

---

## 📋 conflictsに指定されているboolean options一覧

### attachTabUrl の conflicts配列

```typescript
conflicts: [
  'browserUrl',           // string (OK)
  'headless',             // ✅ boolean (修正済み: default削除)
  'executablePath',       // string (OK)
  'isolated',             // ✅ boolean (修正済み: default削除)
  'channel',              // string (OK)
  'loadExtension',        // string (OK)
  'loadExtensionsDir',    // string (OK)
  'loadSystemExtensions', // ❌ boolean + default: false → 衝突中
  'attachTab'             // number (OK)
]
```

### 修正が必要なoptions

| Option | 型 | default値 | 状態 | 必要な対応 |
|--------|---|-----------|------|-----------|
| `headless` | boolean | false | ✅ 修正済み | default削除済み |
| `isolated` | boolean | false | ✅ 修正済み | default削除済み |
| `loadSystemExtensions` | boolean | false | ❌ 未修正 | default削除が必要 |
| `focus` | boolean | false | ❓ 不明 | conflictsに含まれていないが念のため確認 |
| `attachTabNew` | boolean | false | ❓ 不明 | conflictsに含まれていないが念のため確認 |

---

## 🔧 修正方針（2つのアプローチ）

### アプローチA: 全boolean optionsからdefaultを削除（推奨）

**メリット:**
- 根本的な解決
- 今後同様の問題が発生しない

**デメリット:**
- 複数箇所の修正が必要
- 各option使用箇所でデフォルト値を設定する必要

**修正箇所:**
1. **src/cli.ts** - `loadSystemExtensions`の`default: false`を削除
2. **src/browser.ts** - `launch()`関数で分割代入時にデフォルト値設定
   ```typescript
   const {
     loadSystemExtensions = false,  // ← ここで設定
     ...
   } = options;
   ```

### アプローチB: conflictsから該当optionsを削除

**メリット:**
- 最小限の変更

**デメリット:**
- 論理的な排他制御が失われる
- 将来的なバグの原因になる可能性

**推奨しない理由:**
- `--attachTabUrl`と`--loadSystemExtensions`は本来排他的であるべき
- Extension Bridgeモードでは、システム拡張機能のロードは不要

---

## 📝 修正手順（アプローチA）

### 1. `loadSystemExtensions`の修正

#### src/cli.ts
```typescript
loadSystemExtensions: {
  type: 'boolean' as const,
  description: '...',
  // NOTE: No default value to avoid conflicts with attachTabUrl
  // When not specified, defaults to false in launch()
},
```

#### src/browser.ts (launch関数)
```typescript
const {
  loadSystemExtensions = false,  // デフォルト値をここで設定
  ...
} = options;
```

### 2. 念のため`focus`と`attachTabNew`も確認

conflictsには含まれていないが、一貫性のため確認推奨。

### 3. ビルド・テスト

```bash
npm run build
npm run typecheck
node scripts/cli.mjs --attachTabUrl=https://chatgpt.com/ --attachTabNew
```

**期待される結果**: エラーなく起動成功

---

## 🧪 テスト方法

### 成功判定

```bash
node scripts/cli.mjs --attachTabUrl=https://chatgpt.com/ --attachTabNew 2>&1 | grep "mutually exclusive"
```

→ **何も出力されなければ成功**

### 失敗時のエラーパターン

```
Arguments attachTabUrl and <option_name> are mutually exclusive
```

---

## 📊 修正済み vs 未修正

### ✅ 修正済み

- `headless: boolean` - `default: false`削除済み
- `isolated: boolean` - `default: false`削除済み

### ❌ 未修正

- `loadSystemExtensions: boolean` - `default: false`が残っている

---

## 💬 Codexへのお願い

**上記の「アプローチA」に従って、`loadSystemExtensions`の修正を実施してください。**

具体的には：

1. **src/cli.ts:64-70** あたりの`loadSystemExtensions`定義から`default: false`を削除
2. **src/browser.ts** の`launch()`関数で分割代入時に`loadSystemExtensions = false`を設定
3. ビルド・テスト実行
4. まだ他に衝突があれば、同様に修正

**最終的に以下のコマンドが成功すること:**

```bash
node scripts/cli.mjs --attachTabUrl=https://chatgpt.com/ --attachTabNew
```

→ エラーなしでMCPサーバーが起動し、RelayServerがポートをリッスンする状態になる

---

## 📚 参考資料

- [yargs conflicts documentation](https://yargs.js.org/docs/#api-reference-conflictsx-y)
- [Codexログ008](./log/codex/008.md) - 最初の`headless`問題の分析
