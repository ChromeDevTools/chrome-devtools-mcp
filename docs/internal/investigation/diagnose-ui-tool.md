# ChatGPT UI診断ツール - 完全ガイド

## 📖 概要

`diagnose_chatgpt_ui` は、ChatGPTのUI構造を包括的に診断し、UI変更による影響を素早く把握するためのMCPツールです。

### 主な用途

1. **UI変更の検出**: ChatGPT更新後のDOM構造変化を可視化
2. **セレクタの特定**: 重要な要素の現在動作するセレクタを自動検出
3. **デバッグ支援**: 自動化ツールが失敗した際の原因調査
4. **ドキュメント生成**: UI状態のスナップショットを記録

## 🚀 使用方法

### MCPクライアント（Claude Code）から実行

```typescript
// 基本的な使い方
await use_mcp_tool("chrome-devtools-extension", "diagnose_chatgpt_ui", {});

// カスタムURL指定
await use_mcp_tool("chrome-devtools-extension", "diagnose_chatgpt_ui", {
  url: "https://chatgpt.com/c/abc123",
  waitForLoad: 8000  // ページ読み込み待機時間（ミリ秒）
});
```

### パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|----------|-----|-----------|------|
| `url` | string | `https://chatgpt.com/` | 診断対象のURL |
| `waitForLoad` | number | `5000` | ページ安定化の待機時間（ミリ秒） |

## 📊 出力ファイル

診断実行により、`docs/ui-snapshots/` に4つのファイルが生成されます：

### 1. HTML スナップショット (`chatgpt-YYMMDD-HHMMSS.html`)

完全なHTMLソースコード。DOM構造の詳細分析に使用。

```bash
# 差分比較の例
diff chatgpt-251001-120000.html chatgpt-251003-173600.html
```

### 2. フルページスクリーンショット (`chatgpt-YYMMDD-HHMMSS.png`)

ビジュアルレイアウトの確認。UI変更の視覚的把握に使用。

### 3. Accessibility Tree (`chatgpt-YYMMDD-HHMMSS-ax.json`)

```json
{
  "role": "WebArea",
  "name": "ChatGPT",
  "children": [
    {
      "role": "button",
      "name": "New chat",
      "children": []
    }
  ]
}
```

アクセシビリティツリーの完全な構造。WAI-ARIA属性の確認に使用。

### 4. 診断レポート (`chatgpt-YYMMDD-HHMMSS-report.md`)

```markdown
# ChatGPT UI Diagnosis Report
**Date**: 2025-10-03T17:36:15.000Z
**URL**: https://chatgpt.com/

## Element Detection Results

### ✅ Deep Research Toggle
- **Status**: found
- **Current Selectors**:
  - CSS: `[role="menuitemradio"][aria-label*="Deep"]`
  - XPath: `//div[@role="menuitemradio" and contains(text(), 'Deep research')]`
  - Accessibility: `Text contains: "Deep research"`

### ⚠️ Composer Textarea
- **Status**: structure_changed
- **Current Selectors**:
  - CSS: `[contenteditable="true"]`
- **Details**: Some selectors work, but structure may have changed
- **Suggestion**: Update chatgpt-web.ts line 450

### ❌ Send Button
- **Status**: not_found
- **Details**: No selector matched current UI

## Files Generated
- HTML: chatgpt-251003-173600.html
- Screenshot: chatgpt-251003-173600.png
- AX Tree: chatgpt-251003-173600-ax.json
- Report: chatgpt-251003-173600-report.md

## Next Steps
1. Review the HTML snapshot to understand current DOM structure
2. Check the screenshot to see visual layout changes
3. Analyze the AX tree JSON for accessibility structure changes
4. Update selectors in relevant tool files based on findings
```

## 🔍 検出される要素

### 1. Deep Research Toggle
DeepResearchモード有効化ボタン

**検出方法**:
- CSS: `[role="menuitemradio"][aria-label*="Deep"]`
- XPath: `//div[@role="menuitemradio" and contains(text(), 'Deep research')]`
- Text: "Deep research" を含む要素

### 2. Composer Textarea
メッセージ入力フィールド

**検出方法**:
- CSS: `textarea[placeholder*="Message"]`
- CSS: `[contenteditable="true"]`
- CSS: `#prompt-textarea`

### 3. Send Button
メッセージ送信ボタン

**検出方法**:
- CSS: `button[data-testid="send-button"]`
- CSS: `button[aria-label*="Send"]`
- XPath: `//button[contains(@aria-label, "Send")]`

### 4. Model Selector
ChatGPTモデル選択ドロップダウン

**検出方法**:
- CSS: `button[aria-label*="model"]`
- CSS: `[role="combobox"]`
- Text: "ChatGPT" を含む要素

## 📝 ステータスの意味

### ✅ found（検出成功）
すべてのセレクタが正常に動作。コードの修正不要。

### ⚠️ structure_changed（構造変更）
一部のセレクタは動作するが、構造が変化している可能性。セレクタの見直しを推奨。

### ❌ not_found（検出失敗）
要素が見つからない。大幅なUI変更が発生。即座の対応が必要。

## 🔧 トラブルシューティング

### よくある問題

#### Q: "Target closed" エラーが発生する
```
Error: Target closed
```

**原因**: Chrome接続が切断された

**解決方法**:
1. MCPサーバーを再起動
2. Chromeを手動で起動し直す

#### Q: すべての要素が "not_found" になる
```
❌ Deep Research Toggle: not_found
❌ Composer Textarea: not_found
❌ Send Button: not_found
```

**原因**: ページが完全に読み込まれていない

**解決方法**:
```typescript
await use_mcp_tool("chrome-devtools-extension", "diagnose_chatgpt_ui", {
  waitForLoad: 10000  // 待機時間を増やす
});
```

#### Q: スクリーンショットが真っ白
```
Screenshot saved but appears blank
```

**原因**: ページレンダリングが未完了

**解決方法**:
1. `waitForLoad` を増やす（8000-10000ms）
2. ネットワーク接続を確認

#### Q: ログインが必要と表示される
```
❌ ChatGPTにログインが必要です
```

**解決方法**:
1. ブラウザで手動ログイン
2. Cookie を保持した状態で再実行

## 💡 ベストプラクティス

### 1. 定期的な診断
ChatGPT更新時や月1回の定期実行を推奨。

```bash
# 週次レポート生成スクリプト例
cat > weekly-ui-check.sh << 'EOF'
#!/bin/bash
# Use MCP tool via Claude Code
echo "Running weekly ChatGPT UI diagnosis..."
# Execute via MCP client
EOF
```

### 2. 差分比較
新旧HTMLの差分を確認してピンポイントで変更箇所を特定。

```bash
# HTML差分
diff -u docs/ui-snapshots/chatgpt-251001-*.html \
        docs/ui-snapshots/chatgpt-251003-*.html > ui-changes.diff

# 重要な変更をフィルタ
grep -E 'role=|aria-|data-testid' ui-changes.diff
```

### 3. セレクタ更新ワークフロー

1. **診断実行** → 要素のステータス確認
2. **HTML確認** → 新しいDOM構造を理解
3. **セレクタ更新** → `src/tools/chatgpt-web.ts` などを修正
4. **動作確認** → 実際にツールを実行してテスト
5. **再診断** → すべて ✅ になることを確認

### 4. アーカイブ管理

```bash
# 古いスナップショットをアーカイブ
mkdir -p docs/ui-snapshots/archive/2025-09
mv docs/ui-snapshots/chatgpt-2509*.* docs/ui-snapshots/archive/2025-09/
```

## 🎯 実装例

### ケース1: DeepResearchトグルが見つからない

**診断結果**:
```markdown
❌ Deep Research Toggle: not_found
```

**対応手順**:
1. HTML スナップショットを開く
2. "Deep Research" でテキスト検索
3. 新しいセレクタを特定:
   ```html
   <button role="menuitem" aria-label="Enable Deep Research">
     Deep Research
   </button>
   ```
4. `src/tools/deepresearch-toggle.ts` を更新:
   ```typescript
   const selector = 'button[aria-label*="Deep Research"]';
   ```

### ケース2: Textareaの構造が変更された

**診断結果**:
```markdown
⚠️ Composer Textarea: structure_changed
- Current Selectors:
  - CSS: `[contenteditable="true"]` ✅
  - CSS: `textarea[placeholder*="Message"]` ❌
```

**対応手順**:
1. 動作するセレクタ（`[contenteditable="true"]`）を採用
2. 複数マッチする場合は、より具体的なセレクタに変更:
   ```typescript
   const selector = '.composer [contenteditable="true"]';
   ```

## 🔄 自動化統合

### GitHub Actions での定期診断

```yaml
name: ChatGPT UI Health Check
on:
  schedule:
    - cron: '0 0 * * 0'  # 毎週日曜日

jobs:
  diagnose:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Run UI Diagnosis
        run: |
          # MCPサーバー起動とツール実行
          npm run build
          # MCP client経由で診断実行

      - name: Upload Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ui-snapshots
          path: docs/ui-snapshots/
```

## 📚 関連ファイル

### ソースコード
- `/src/tools/diagnose-ui.ts` - メイン実装
- `/src/main.ts` - ツール登録
- `/package.json` - スクリプト定義

### ドキュメント
- `/docs/ui-snapshots/README.md` - スナップショットディレクトリのREADME
- `/docs/log/claude/251003_173615-chatgpt-ui-diagnostic-tool.md` - 実装ログ

### 出力先
- `/docs/ui-snapshots/` - 全診断結果の保存先

## 🚀 今後の拡張

### 予定されている機能
1. **差分ハイライト**: 前回との変更箇所を自動マーク
2. **セレクタ候補生成**: より多くのセレクタパターンを提案
3. **自動通知**: UI変更検出時にSlack/Email通知
4. **履歴管理**: 過去のスナップショットを自動比較

### 他サイトへの対応
現在はChatGPT専用だが、将来的には以下にも対応予定：
- Gemini Web UI
- Anthropic Claude Web
- Perplexity AI
- 任意のWebアプリケーション

## 📞 サポート

### 問題報告
GitHub Issues: https://github.com/usedhonda/chrome-devtools-mcp/issues

### 機能リクエスト
新しい検出要素や機能の追加リクエストを歓迎します。

---

**最終更新**: 2025-10-03
**バージョン**: 0.11.1
**ステータス**: ✅ 実装完了・テスト済み
