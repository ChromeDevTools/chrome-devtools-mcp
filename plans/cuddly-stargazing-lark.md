# Chromeバックグラウンド起動の段階的改善プラン

## 現状の問題

**v1.0.18で実装した方式が機能していない**
- 「起動前にアプリ記憶 → 起動後に戻す」方式
- 結果：Chromeが一瞬でも前面に出てしまう
- 原因：Chromeの起動時にOSがウィンドウを最前面に持ってくる挙動

## AI の回答まとめ

### ChatGPT の推奨順位
1. **headless: 'new'** - 最強（ウィンドウを表示しない）
2. **open -gj + connect** - 次善（`-j`で隠して起動）
3. **--no-startup-window** - 簡単な改善（起動時にウィンドウを開かない）

### Gemini の推奨順位
1. **open -g + connect** - 最も確実（`-g`でバックグラウンド起動）
2. **ウィンドウを画面外に配置**:
   - `--window-position=-2000,-2000`
   - `--window-size=400,400`
3. **AppleScriptで隠す**:
   ```applescript
   set visible of process "Google Chrome" to false
   ```

---

## 段階的改善プラン

### Phase 1: `--no-startup-window` 追加（最も簡単）

**変更箇所**: `src/browser.ts:905付近`

```typescript
// Windows/Linux: Add --start-minimized for background mode
if (!focus && !effectiveHeadless && os.platform() !== 'darwin') {
  args.push('--start-minimized');
  console.error('📋 Added --start-minimized for background mode');
}

// All platforms: Add --no-startup-window for background mode
if (!focus && !effectiveHeadless) {
  args.push('--no-startup-window');
  console.error('📋 Added --no-startup-window for background mode');
}
```

**検証方法**:
1. v1.0.19としてビルド・npm publish
2. `npx chrome-ai-bridge@latest` で起動
3. `ask_gemini_web` でテスト → Chromeが前面に出ないか確認

**期待される効果**:
- Chrome起動時に自動的にウィンドウを開かない
- ユーザーが `browser.newPage()` するまでウィンドウが表示されない

---

### Phase 2: ウィンドウ位置を画面外に配置（Phase 1で効果なしの場合）

**変更箇所**: `src/browser.ts:905付近`

```typescript
if (!focus && !effectiveHeadless) {
  args.push('--no-startup-window');
  args.push('--window-position=-2000,-2000'); // 画面外
  args.push('--window-size=400,400'); // 最小限のサイズ
  console.error('📋 Added background mode flags');
}
```

**検証方法**: Phase 1と同じ

**期待される効果**:
- たとえウィンドウが表示されても、画面外なので見えない

---

### Phase 3: AppleScriptでプロセスを隠す（Phase 2で効果なしの場合）

**変更箇所**: `src/browser.ts:1002付近`（起動直後）

```typescript
// Hide Chrome process on macOS (background mode)
if (!focus && !effectiveHeadless && os.platform() === 'darwin') {
  try {
    const hideScript = `
      tell application "System Events"
        repeat 10 times
          if exists process "Google Chrome" then
            set visible of process "Google Chrome" to false
            exit repeat
          end if
          delay 0.2
        end repeat
      end tell
    `;
    execSync(`osascript -e '${hideScript}'`, {timeout: 5000});
    console.error('✅ Chrome process hidden via AppleScript');
  } catch (error) {
    console.warn('⚠️  Could not hide Chrome process');
  }
}
```

**検証方法**: Phase 1と同じ

**期待される効果**:
- Chromeプロセス全体が非表示になる
- Dockにも表示されない

---

### Phase 4: `open -g` + `puppeteer.connect()` 方式（最終手段）

**大規模なアーキテクチャ変更が必要**

**変更箇所**: `src/browser.ts:launch()` 関数全体

```typescript
// macOSでは open -g を使って起動
if (os.platform() === 'darwin' && !focus) {
  const port = 9222;
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...args,
  ].join(' ');

  await execAsync(`open -g -a "${effectiveExecutablePath}" --args ${chromeArgs}`);

  // ポート待機＆接続
  browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: null,
  });
} else {
  // 通常のlaunch方式（Windows/Linux）
  browser = await puppeteer.launch({ ... });
}
```

**影響範囲**:
- `pipe: true` が使えなくなる → remote debugging portに変更
- プロセス管理が変わる（disconnectで終了しない）
- セキュリティ考慮（localhostに閉じる必要）

**検証方法**:
- 既存のすべてのMCPツールが動作するか確認
- プロセス終了処理が正しいか確認

---

## 実装順序の方針

1. **Phase 1から順番に試す**
2. **各Phaseで効果を確認してから次へ**
3. **Phase 3までで解決することを期待**
4. **Phase 4は最後の手段**（大きな変更のため）

---

## 対象ファイル

| Phase | ファイル | 変更内容 |
|-------|---------|---------|
| 1 | `src/browser.ts:905` | `--no-startup-window` 追加 |
| 2 | `src/browser.ts:905` | ウィンドウ位置フラグ追加 |
| 3 | `src/browser.ts:1002` | AppleScript hide処理追加 |
| 4 | `src/browser.ts:launch()` | 全体的な構造変更 |

---

## 次のステップ

**Phase 1（`--no-startup-window`）の実装から開始します。**
