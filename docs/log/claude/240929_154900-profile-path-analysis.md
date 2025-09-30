# Chrome Extension Loading Profile Path Analysis

## 問題概要
Chrome拡張機能が `--load-extension` フラグで正しく読み込まれない問題。具体的には：
- コマンドライン表示: `--user-data-dir=/Users/usedhonda/.cache/chrome-devtools-mcp/chrome-profile`
- chrome://version表示: `プロフィール パス: /Users/usedhonda/chrome-mcp-profile/Default`

## 発見された問題

### 1. プロファイルパスの不一致の真の原因
調査の結果、プロファイルパスの表示が異なる理由が判明：

```bash
# MCPサーバーが指定するパス
~/.cache/chrome-devtools-mcp/chrome-profile

# 実際のパス（シンボリックリンク）
~/.cache/chrome-devtools-mcp/chrome-profile -> /Users/usedhonda/chrome-mcp-profile
```

**重要な発見**: プロファイル自体は正しく参照されている。問題は別の箇所にある。

### 2. 拡張機能ロード処理の分析

#### `src/browser.ts`の実装確認
- `--load-extension` フラグは正しく設定されている (line 191)
- `--enable-experimental-extension-apis` も追加されている (line 192)
- `ignoreDefaultArgs: ['--disable-extensions']` で拡張機能無効化を回避 (line 214)

#### プロファイル内拡張機能の状況
```
/Users/usedhonda/chrome-mcp-profile/Default/Extensions/
└── ghbmnnjooekpmoecnnnilnnbdlolhkhi/  # Google製の内部拡張機能のみ
```

### 3. 拡張機能が表示されない可能性のある原因

#### A. 拡張機能パスの問題
`--load-extension` で指定されたパスが：
- 存在しない
- manifest.jsonが無効
- パーミッションエラー

#### B. Chrome起動時の引数順序
拡張機能関連の引数がChrome起動時に正しく適用されていない可能性

#### C. 開発者モードの設定
chrome://extensions/ で開発者モードが有効になっていない

## 推奨する検証ステップ

### 1. 拡張機能パスの検証
```typescript
// 実際に指定される拡張機能パスをログ出力
console.error(`Extension paths: ${extensionPaths.join(', ')}`);
```

### 2. Chrome起動引数の完全ログ
```typescript
// Puppeteer launch時の全引数をログ出力
console.error(`Chrome launch args: ${JSON.stringify(args, null, 2)}`);
```

### 3. 拡張機能読み込み状況の確認
- chrome://extensions/ での確認
- 開発者モードの有効化確認
- エラーログの確認

### 4. プロファイルの整合性確認
現在のプロファイル設定に問題がないか確認

## 次のアクション項目

1. **デバッグ情報の追加**: 拡張機能読み込み処理に詳細なログを追加
2. **Chrome引数の検証**: 実際に渡される引数を確認
3. **テスト用拡張機能の作成**: 最小限のmanifest.jsonで動作確認
4. **プロファイルリセットテスト**: 新しいプロファイルでの動作確認

## 技術的詳細

### プロファイル管理メカニズム
- MCP server: `~/.cache/chrome-devtools-mcp/chrome-profile`
- 実際のプロファイル: `/Users/usedhonda/chrome-mcp-profile/`
- シンボリックリンクにより両者は同一

### 拡張機能ツールの実装状況
`src/tools/extensions.ts` には以下のツールが実装済み：
- `list_extensions`: 拡張機能一覧取得
- `reload_extension`: 拡張機能リロード
- `inspect_service_worker`: サービスワーカー検査
- その他拡張機能関連デバッグツール

## 結論
プロファイルパスの不一致は表示上の問題であり、実際の拡張機能ロード失敗の根本原因ではない。真の原因は：
1. 拡張機能パスの指定ミス
2. Chrome起動引数の不備
3. 開発者モードの設定不備

のいずれかと推測される。詳細なデバッグログの追加により原因特定が必要。