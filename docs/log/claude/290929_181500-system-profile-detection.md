# Chrome DevTools MCP - システムChromeプロファイル自動検出機能実装

## 実装日時
2025年09月29日 18:15:00

## 実装概要
Chrome DevTools MCPプロジェクトに、ユーザーのシステムChromeプロファイルを自動検出する機能を実装しました。これにより、`--userDataDir`引数が未指定の場合、自動的にシステムのChromeプロファイルを検出・使用し、ユーザーの既存Chrome環境を活用できるようになります。

## 実装したファイル

### 1. `/src/system-profile.ts` (新規作成)
**目的**: プラットフォーム別のChromeプロファイル検出ロジック

**主要機能**:
- `detectSystemChromeProfile(channel)`: 指定チャンネルのプロファイル検出
- `detectAnySystemChromeProfile()`: 利用可能な任意のプロファイル検出（優先度: stable > beta > dev > canary）
- `getAllSystemChromeProfiles()`: 全プロファイルの一覧取得
- `isSandboxedEnvironment()`: サンドボックス環境の検出
- `logSystemProfileInfo()`: デバッグ用の検出情報表示

**プラットフォーム別対応**:
- **macOS**: `~/Library/Application Support/Google/Chrome[Variant]`
- **Windows**: `%LOCALAPPDATA%/Google/Chrome[Variant]/User Data`
- **Linux**: `~/.config/google-chrome[variant]`

### 2. `/src/browser.ts`の修正
**変更箇所**: `launch()`関数内のuserDataDir設定ロジック

**変更内容**:
```typescript
// 変更前
let userDataDir = options.userDataDir;
if (!isolated && !userDataDir) {
  userDataDir = path.join(os.homedir(), '.cache', 'chrome-devtools-mcp', profileDirName);
  await fs.promises.mkdir(userDataDir, { recursive: true });
}

// 変更後
let userDataDir = options.userDataDir;
let usingSystemProfile = false;

if (!isolated && !userDataDir) {
  // システムChromeプロファイル検出を試行
  const systemProfile = detectSystemChromeProfile(channel) || detectAnySystemChromeProfile();

  if (systemProfile && !isSandboxedEnvironment()) {
    userDataDir = systemProfile.path;
    usingSystemProfile = true;
    console.error(`✅ Using system Chrome profile: ${systemProfile.channel} (${userDataDir})`);
  } else {
    // カスタムプロファイルディレクトリにフォールバック
    userDataDir = path.join(os.homedir(), '.cache', 'chrome-devtools-mcp', profileDirName);
    await fs.promises.mkdir(userDataDir, { recursive: true });
    console.error(`📁 Using custom profile directory: ${userDataDir}`);
  }
}
```

## アーキテクチャ設計

### フォールバック戦略
1. **第一優先**: 指定チャンネルのシステムプロファイル
2. **第二優先**: 任意の利用可能なシステムプロファイル（安定版優先）
3. **フォールバック**: 従来の独立プロファイル

### セキュリティ考慮事項
- **サンドボックス環境検出**: macOS Seatbelt、Linux コンテナ環境でのシステムプロファイル使用を回避
- **プロファイル検証**: 必須ファイル（`Default`ディレクトリ、`Local State`）の存在確認
- **エラーハンドリング**: システムプロファイル失敗時の安全なフォールバック

### ログ出力の改善
- システムプロファイル検出状況の詳細表示
- 使用中のプロファイルタイプの明示
- サンドボックス環境やプロファイル未検出時の警告

## テスト結果

### macOSでの動作確認
```bash
$ node -e "import('./build/src/system-profile.js').then(module => { ... })"

System Chrome Profile Detection:
  Platform: darwin
  Sandboxed Environment: false
  Available Profiles:
    1. stable: /Users/usedhonda/Library/Application Support/Google/Chrome (exists)
    2. canary: /Users/usedhonda/Library/Application Support/Google/Chrome Canary (not found)
    3. beta: /Users/usedhonda/Library/Application Support/Google/Chrome Beta (not found)
    4. dev: /Users/usedhonda/Library/Application Support/Google/Chrome Dev (not found)

✅ Stable profile found: {
  path: '/Users/usedhonda/Library/Application Support/Google/Chrome',
  exists: true,
  platform: 'darwin',
  channel: 'stable'
}
```

## ユーザーへの影響

### 新しい動作
- `--userDataDir`未指定時にシステムChromeプロファイルを自動使用
- ユーザーの既存ブックマーク、設定、拡張機能が利用可能
- よりネイティブなChrome環境でのテスト・開発が可能

### 従来の動作の維持
- `--isolated`フラグ使用時は従来通り一時プロファイル作成
- `--userDataDir`明示指定時は指定パスを優先
- エラー時は安全に独立モードにフォールバック

## 今後の拡張可能性

### 追加実装予定
1. **プロファイル選択機能**: 複数プロファイルからの選択UI
2. **プロファイル設定のバックアップ**: 実験的変更からの保護
3. **拡張機能の互換性チェック**: システム拡張機能とMCP機能の相互作用確認

### プラットフォーム対応の拡張
- Chromiumベースブラウザ（Edge、Brave等）のプロファイル検出
- 企業環境でのプロファイルポリシー対応

## 課題・制限事項

### 既知の制限
1. **同時実行**: システムプロファイル使用時のブラウザ重複起動制限
2. **権限問題**: 一部の企業環境でのプロファイルアクセス制限
3. **プロファイルロック**: 既にChromeが起動中の場合のエラーハンドリング

### 解決策
- エラーメッセージの改善（実装済み）
- `--isolated`フラグでの回避方法の案内（実装済み）
- 将来的なプロファイル共有モードの検討

## 実装完了確認

### ✅ 完了項目
- [x] プラットフォーム別プロファイル検出関数
- [x] browser.tsへの統合
- [x] サンドボックス環境対応
- [x] フォールバック機能
- [x] TypeScriptビルド確認
- [x] 基本動作テスト

### 📝 ドキュメント更新
この実装により、Chrome DevTools MCPはより使いやすく、ユーザーの既存Chrome環境と自然に統合されるツールとなりました。