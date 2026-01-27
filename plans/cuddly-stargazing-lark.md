# Chromeウィンドウ フォーカス制御

## 問題
chrome-ai-bridgeがChromeを操作する時、ウィンドウが前面に出てきて作業の邪魔になる。

## 調査結果

### プラットフォーム別の制限

| OS | 方法 | 効果 |
|----|------|------|
| **macOS** | `--start-minimized` | ❌ 無効（無視される） |
| **macOS** | Apple Script / `open -g` | ✅ 有効 |
| **Windows/Linux** | `--start-minimized` | ✅ 有効 |

**結論**: macOSではPuppeteerの起動引数だけでは不可能。Apple Script が必要。

---

## 実装方針

### 方法A: 起動後に Apple Script でバックグラウンド化（推奨）

```typescript
if (os.platform() === 'darwin') {
  execSync(`osascript -e 'tell application "System Events" to set visible of process "Google Chrome" to false'`);
}
```

**メリット**: 既存のPuppeteer起動フローを変更しない
**デメリット**: 一瞬フォーカスを奪う（起動直後に非表示化）

### 方法B: Windows/Linux は `--start-minimized`

```typescript
if (os.platform() !== 'darwin') {
  args.push('--start-minimized');
}
```

---

## 実装方針（確定）

**デフォルトでバックグラウンド起動**

- 通常: Chromeはバックグラウンドで起動（フォーカスを奪わない）
- `--focus` オプション: 明示的に指定した場合のみ前面表示

---

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/cli.ts` | `--focus` オプション追加（デフォルト false） |
| `src/browser.ts:893付近` | 起動後のフォーカス制御ロジック追加 |
| `src/main.ts` | オプションを browser に渡す |

---

## 実装詳細

### 1. src/cli.ts
```typescript
focus: {
  type: 'boolean',
  description: 'Bring Chrome window to foreground (default: background)',
  default: false,
}
```

### 2. src/browser.ts（起動後処理）
```typescript
// Chrome起動前に現在のフォアグラウンドアプリを記憶
let previousApp: string | null = null;
if (!options.focus && os.platform() === 'darwin') {
  try {
    previousApp = execSync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      {encoding: 'utf-8'}
    ).trim();
  } catch {}
}

// ... Puppeteer起動 ...

// Chrome起動後、フォーカスを元のアプリに戻す
if (!options.focus) {
  if (os.platform() === 'darwin' && previousApp) {
    // macOS: 元のアプリをアクティブに戻す
    execSync(`osascript -e 'tell application "${previousApp}" to activate'`);
  }
  // Windows/Linux: --start-minimized は起動引数で設定済み
}
```

---

## 検証方法

1. `npx chrome-ai-bridge` で起動 → Chromeがバックグラウンドで起動
2. `npx chrome-ai-bridge --focus` で起動 → Chromeが前面に表示
3. `ask_gemini_web` / `ask_chatgpt_web` が正常動作することを確認
