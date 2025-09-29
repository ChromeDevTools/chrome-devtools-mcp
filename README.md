# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

An MCP server that lets AI assistants control Chrome and develop Chrome extensions.

Based on [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) by Google.

---

**AI が Chrome を制御して Chrome 拡張機能を開発するための MCP サーバーです。**

Google の [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) をベースにした Chrome 拡張機能開発特化版です。

## 🎯 Quick Start / クイックスタート

Add this configuration to your MCP client / MCP クライアントに以下の設定を追加：

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```

**Claude Code users can also use / Claude Code ユーザーはコマンドも利用可能：**

```bash
claude mcp add chrome-devtools-extension npx chrome-devtools-mcp-for-extension@latest
```

<details>
<summary>Configuration file locations / 設定ファイルの場所</summary>

**Configuration file locations / 設定ファイルの場所:**

- **Cursor**: `~/.cursor/extensions_config.json`
- **VS Code Copilot**: `.vscode/settings.json`
- **Cline**: Follow Cline's MCP setup guide

**JSON configuration / JSON設定:**
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  }
}
```

**With extension loading / 拡張機能ロード付き:**
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtension=/path/to/your/extension"
      ]
    }
  }
}
```
</details>

### 2. Restart Claude Code / Claude Code を再起動

### 3. Try your first command / 最初のコマンドを試す

Tell your AI / AI に指示:
- English: "List all my Chrome extensions"
- 日本語: "Chrome の全拡張機能をリストして"

## Features

- **Extension Development**: Load, debug, and reload Chrome extensions
- **Web Store Automation**: Automated submission with screenshots
- **Browser Control**: Navigate, click, fill forms, take screenshots
- **Performance Analysis**: Chrome DevTools integration
- **Network Debugging**: Request monitoring and analysis

## 機能詳細

### Chrome 拡張機能開発
- 開発中の拡張機能のロードとリロード
- service worker（バックグラウンドスクリプト）のデバッグ
- 拡張機能のコンソールログとエラー確認
- ストレージAPIの読み書き確認

### Web Store 申請自動化
- manifest.json の自動検証
- ZIP パッケージの自動作成
- Web Store フォームの自動入力
- ストア用スクリーンショットの自動生成

### ブラウザ制御・デバッグ
- ページナビゲーションと要素操作
- スクリーンショット撮影
- ネットワークリクエスト分析
- パフォーマンス計測とトレース

## 💡 Use Cases / 使用例

### Extension Development / 拡張機能開発
```
"Create a Chrome extension that blocks ads"
"Chrome の広告ブロック拡張機能を作成して"

"Debug why my content script isn't working"
"コンテンツスクリプトが動かない原因をデバッグして"

"Submit my extension to Chrome Web Store"
"拡張機能を Chrome Web Store に申請して"
```

### Testing & QA / テストと品質保証
```
"Test my extension on Google.com"
"Google.com で拡張機能をテストして"

"Generate screenshots for store listing"
"ストア掲載用のスクリーンショットを生成して"

"Check console errors from my extension"
"拡張機能のコンソールエラーを確認して"
```

## 📋 Chrome Web Store Automation / Web Store 自動化

This fork automates the entire submission process:
このフォークは申請プロセス全体を自動化します：

1. **Manifest Validation** - Check V3 compliance / Manifest V3 準拠チェック
2. **Package Creation** - Optimized ZIP generation / 最適化された ZIP 生成
3. **Screenshot Generation** - All required sizes / 必要な全サイズ
4. **Form Filling** - Automated dashboard navigation / ダッシュボードの自動操作
5. **Submission** - Complete the process / プロセスの完了

### Generated Screenshots / 生成されるスクリーンショット
- 1280x800 - Main screenshots / メインスクリーンショット
- 440x280 - Small promotional tile / 小プロモーションタイル
- 920x680 - Large promotional tile / 大プロモーションタイル
- 1400x560 - Marquee image / マーキー画像

## ⚙️ Configuration Options / 設定オプション

### Extension-specific (New) / 拡張機能専用（新規）
- `--loadExtension` - Path to extension / 拡張機能のパス
- `--loadSystemExtensions` - Use system extensions / システムの拡張機能を使用

### Browser options (Original) / ブラウザオプション（元から）
- `--headless` - Headless mode / ヘッドレスモード
- `--channel` - Chrome channel (stable, canary, beta, dev)
- `--isolated` - Temporary profile / 一時プロファイル
- `--browserUrl` - Connect to existing Chrome / 既存の Chrome に接続

## 📖 Documentation / ドキュメント

- [MCP Setup Guide / MCP 設定ガイド](./MCP_SETUP.md)
- [Tool Reference / ツールリファレンス](./docs/tool-reference.md)
- [Original Documentation / 元のドキュメント](https://github.com/ChromeDevTools/chrome-devtools-mcp)

## 🤝 Compatibility / 互換性

Works with / 対応:
- **Claude Code** (recommended / 推奨)
- Cursor
- VS Code Copilot
- Cline
- Any MCP-compatible client / MCP 対応クライアント

## ⚠️ Important Notes / 重要な注意事項

1. **Security**: Extension code access is exposed to AI / セキュリティ: 拡張機能コードは AI に公開されます
2. **Headless limitations**: Some extensions require UI / ヘッドレス制限: 一部の拡張機能は UI が必要
3. **Manifest V3**: Required for Web Store / Manifest V3: Web Store に必要

## 🙏 Credits / クレジット

This is a fork of [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) by Google LLC.

このプロジェクトは Google LLC による [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) のフォークです。

### Original Project Team / 元プロジェクトチーム
Thank you to the Chrome DevTools team for creating the excellent foundation that made this extension-focused fork possible.

Chrome DevTools チームが作成した優れた基盤に感謝します。これにより、この拡張機能に特化したフォークが可能になりました。

### This Fork / このフォーク
Enhanced with Chrome extension development features by [usedhonda](https://github.com/usedhonda).

[usedhonda](https://github.com/usedhonda) により Chrome 拡張機能開発機能が追加されました。

## 📄 License / ライセンス

Apache-2.0 (Same as original / 元プロジェクトと同じ)

## 🔗 Links / リンク

- **This Fork / このフォーク**: [GitHub](https://github.com/usedhonda/chrome-devtools-mcp) | [npm](https://www.npmjs.com/package/chrome-devtools-mcp-for-extension)
- **Original / オリジナル**: [GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp) | [npm](https://www.npmjs.com/package/chrome-devtools-mcp)
- **Issues / 問題報告**: [Report here / こちらから](https://github.com/usedhonda/chrome-devtools-mcp/issues)

---

**For Chrome extension developers, by Chrome extension developers.**
**Chrome 拡張機能開発者のために、Chrome 拡張機能開発者によって作られました。**