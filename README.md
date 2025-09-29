# Chrome DevTools MCP for Extension Development

[![npm chrome-devtools-mcp-for-extension package](https://img.shields.io/npm/v/chrome-devtools-mcp-for-extension.svg)](https://npmjs.org/package/chrome-devtools-mcp-for-extension)

**An enhanced fork of [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) with Chrome extension development superpowers.**

This fork adds comprehensive Chrome extension development features to the original Chrome DevTools MCP by Google, enabling AI-powered extension development, testing, and automated Web Store submission.

---

**[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) を拡張したChrome拡張機能開発用フォークです。**

このフォークは、Google による元の Chrome DevTools MCP に Chrome 拡張機能の開発機能を追加し、AI 支援による拡張機能の開発、テスト、Web Store への自動申請を可能にします。

## 🚀 What's New in This Fork / このフォークの新機能

### Added Features / 追加された機能
- ✨ **Chrome Extension Support** - Load and debug unpacked extensions / 開発中の拡張機能のロードとデバッグ
- 🤖 **Web Store Automation** - Automated submission process / Web Store への自動申請
- 📸 **Screenshot Generation** - Auto-generate store screenshots / ストア用スクリーンショットの自動生成
- 🔄 **Hot Reload** - Instant extension reloading / 拡張機能の即時リロード
- 🐛 **Service Worker Debugging** - Direct background script access / バックグラウンドスクリプトへの直接アクセス

### Original Features (Preserved) / 元の機能（保持）
- 📊 Performance insights via Chrome DevTools / Chrome DevTools によるパフォーマンス分析
- 🔍 Advanced browser debugging / 高度なブラウザデバッグ
- 🤖 Reliable automation with Puppeteer / Puppeteer による自動化
- 🌐 Network analysis and screenshots / ネットワーク分析とスクリーンショット

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

## 🛠 Extension Development Tools / 拡張機能開発ツール

### Exclusive to this fork / このフォーク専用

| Tool / ツール | Description / 説明 |
|--------------|-------------------|
| `list_extensions` | List all installed extensions / インストール済み拡張機能一覧 |
| `reload_extension` | Reload extension after changes / 変更後の拡張機能リロード |
| `inspect_service_worker` | Debug background scripts / バックグラウンドスクリプトのデバッグ |
| `submit_to_webstore` | Automate Web Store submission / Web Store 申請の自動化 |
| `generate_extension_screenshots` | Create store screenshots / ストア用スクリーンショット生成 |

### From original project / 元プロジェクトから

- **Navigation**: navigate_page, new_page, close_page, list_pages
- **Interaction**: click, fill, fill_form, drag, hover
- **Debugging**: take_screenshot, evaluate_script, list_console_messages
- **Performance**: performance_start_trace, performance_analyze_insight
- **Network**: list_network_requests, get_network_request

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