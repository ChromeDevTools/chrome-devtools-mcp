# グローバル設定への全ドキュメント更新

## 📅 作業情報
- **日時**: 2025-09-30 14:28:57 (Asia/Tokyo)
- **担当**: Claude 4.5
- **ブランチ**: main

## 📝 ユーザー指示
「マニュアルものこれに沿って、全面的に変えましょう。広範に渡る必要があると思います。並列で。ultrathink」

**背景:**
- `~/.claude.json`の設定をプロジェクト固有からグローバルに変更
- ドキュメント全体をこの変更に合わせて更新する必要がある

## 🎯 実施内容

### 1. 影響範囲の分析
全マークダウンファイルを検索し、MCP設定に関する記述があるファイルを特定：

**更新対象ファイル:**
- `README.md`
- `MCP_SETUP.md`
- `CONTRIBUTING.md`
- `docs/mcp-configuration-guide.md` （既に更新済み）
- `docs/bookmark-env-variable-issue-investigation.md`

**レビュー対象:**
- `CLAUDE.md`

### 2. 並列処理による更新（technical-writerエージェント×5）

#### エージェント1: README.md
- **7箇所の設定例を更新**
- Quick Startセクション: グローバル設定ファイルであることを明記
- Advanced Configurationセクション: 全例に「Add to `~/.claude.json`:」を追加
- Troubleshootingセクション: 不完全なスニペットを完全な設定例に変換
- 日本語セクション: `~/.claude.json`への追加指示を明記

#### エージェント2: MCP_SETUP.md
- **大規模な再構成を実施**
- MCP Configurationセクション:
  - 「Global Configuration (Recommended)」サブセクション追加
  - 「Project-Specific Configuration (Not Recommended)」サブセクション追加
  - グローバル設定の利点を明記（全プロジェクト適用、単一管理、保守容易）
- Usage Examplesセクション: 全例をグローバル設定に変更
- **新セクション追加**: "Configuration Scope"
  - グローバル設定の説明
  - プロジェクト固有設定の説明（上級者向けのみ）
  - `jq`による更新コマンド提供

#### エージェント3: CONTRIBUTING.md
- **開発者向け設定を明確化**
- グローバル`~/.claude.json`の使用を明記
- ローカルビルドの絶対パスを明確化
- 開発用設定と本番用設定の違いを説明

#### エージェント4: CLAUDE.md
- **レビュー完了、変更不要**
- MCP設定例が含まれていないことを確認
- プロジェクト固有のドキュメントとして適切な分離を維持

#### エージェント5: docs/bookmark-env-variable-issue-investigation.md
- **歴史的文書として保存**
- トップレベルに「Historical Notice」を追加
- 設定セクションに「Deprecated」警告を追加
- 現在の推奨設定（グローバル）を併記
- 最新ドキュメントへのリンクを提供

### 3. 設定変更の実施

#### `~/.claude.json`の変更

**変更前（プロジェクト固有）:**
```json
{
  "projects": {
    "/Users/usedhonda/projects/chrome-devtools-mcp": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest",
            "--loadExtensionsDir=/Users/usedhonda/projects/Chrome-Extension"
          ]
        }
      }
    }
  }
}
```

**変更後（グローバル）:**
```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtensionsDir=/Users/usedhonda/projects/Chrome-Extension"
      ]
    }
  }
}
```

#### 実行コマンド
```bash
# グローバル設定を追加
jq '.mcpServers."chrome-devtools-extension".args = [
  "chrome-devtools-mcp-for-extension@latest",
  "--loadExtensionsDir=/Users/usedhonda/projects/Chrome-Extension"
]' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json

# プロジェクト固有設定を削除
jq 'del(.projects."/Users/usedhonda/projects/chrome-devtools-mcp".mcpServers)' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

## 📊 変更ファイル一覧

| ファイル | 変更箇所 | 変更内容 |
|---------|---------|----------|
| `README.md` | 7箇所 | グローバル設定への更新 |
| `MCP_SETUP.md` | 大規模 | 全面的な再構成、新セクション追加 |
| `CONTRIBUTING.md` | 1セクション | グローバル設定を明記 |
| `CLAUDE.md` | - | 変更不要（レビューのみ） |
| `docs/mcp-configuration-guide.md` | 3セクション | グローバル設定を推奨、実例更新 |
| `docs/bookmark-env-variable-issue-investigation.md` | 2箇所 | 歴史的文書として警告追加 |
| `~/.claude.json` | 2箇所 | グローバル設定に移行 |

## 🤔 設計判断

### 採用したアプローチ: グローバル設定を推奨

**理由:**
1. **ユーザー体験の向上**: 全プロジェクトで同じ拡張機能環境を使用できる
2. **メンテナンス性**: 設定が1箇所にまとまり、更新が容易
3. **学習コストの削減**: シンプルな設定方法で初心者に優しい
4. **実用性**: ほとんどのユースケースで十分

### プロジェクト固有設定の扱い

**判断:**
- 完全に削除せず、「非推奨」として文書に残す
- 上級者向けのユースケース（プロジェクトごとに異なる拡張機能）のために情報提供
- プロジェクト設定がグローバル設定を上書きすることを明記

### 歴史的文書の保存

**判断:**
- `docs/bookmark-env-variable-issue-investigation.md`を削除せず保存
- トラブルシューティング情報として価値がある
- 明確な警告を追加し、ユーザーを誤解させないようにする

## 📈 影響範囲

### ✅ ユーザーへの影響（ポジティブ）
- 設定がシンプルになり、初回セットアップが容易
- 全プロジェクトで一貫した環境
- ドキュメントが統一され、混乱が減少

### ⚠️ 互換性
- **破壊的変更なし**: プロジェクト固有設定は引き続き動作
- **移行推奨**: 新規ユーザーはグローバル設定を使用
- **既存ユーザー**: 必要に応じて移行可能

### 🔄 今後の保守性
- 設定例の更新が容易（1つのパターンのみ）
- ドキュメントの一貫性が保たれやすい
- サポート対応がシンプルになる

## ⚠️ 残課題・TODO

なし（全て完了）

## 💡 今後の検討事項

### 短期（v0.7.2）
- [ ] ユーザーフィードバックの収集
- [ ] グローバル設定への移行ガイドの追加（既存ユーザー向け）

### 中期（v0.8.0）
- [ ] `claude mcp` コマンドでグローバル設定を簡単に編集できる機能
- [ ] 設定の妥当性チェック機能

### 長期
- [ ] GUI設定ツールの検討
- [ ] 複数プロファイル対応（開発用/テスト用/本番用）

## 📝 ドキュメント整合性チェック

### 確認済み項目
✅ 全マークダウンファイルでグローバル設定を推奨
✅ プロジェクト固有設定の記述は「非推奨」または「歴史的」として明記
✅ jqコマンドの例は両方のパターンを提供
✅ 初心者向けと上級者向けの情報を明確に分離
✅ 全ドキュメント間で用語・表現の統一

### 検証コマンド
```bash
# プロジェクト固有設定の残存確認
grep -r "projects.*mcpServers" --include="*.md" . | grep -v "Historical" | grep -v "deprecated"

# 結果: jqコマンド内の参照のみ（問題なし）
```

## 🎉 成果

### 定量的成果
- **更新ファイル数**: 6ファイル
- **並列処理エージェント数**: 5エージェント
- **更新箇所**: 合計20箇所以上
- **新規セクション追加**: 2セクション

### 定性的成果
- ドキュメント全体の一貫性向上
- ユーザー体験の大幅改善
- 保守性の向上
- 初心者への配慮と上級者への対応の両立

## 🔧 使用した技術・ツール

- **並列処理**: Task tool × 5 (technical-writer agent)
- **検索**: Grep tool
- **編集**: Edit tool
- **設定更新**: jq コマンド
- **進捗管理**: TodoWrite tool

## 📚 関連ドキュメント

- [docs/mcp-configuration-guide.md](../mcp-configuration-guide.md) - 完全な設定ガイド
- [MCP_SETUP.md](../../MCP_SETUP.md) - セットアップガイド
- [README.md](../../README.md) - メインドキュメント

---

**作業完了時刻**: 2025-09-30 14:28:57 (Asia/Tokyo)