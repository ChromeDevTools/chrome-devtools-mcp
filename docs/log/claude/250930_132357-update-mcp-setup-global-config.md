# Update MCP_SETUP.md to Use Global Configuration

## 📅 作業情報
- **日時**: 2025-09-30 13:23:57 (ローカル時刻)
- **担当**: Claude 4.5
- **ブランチ**: main

## 📝 ユーザー指示
Update MCP_SETUP.md to use global mcpServers configuration instead of project-specific configuration.

Context: We've changed from project-specific MCP configuration to global configuration in `~/.claude.json`.

## 🎯 実施内容

### 変更ファイル一覧
- `/Users/usedhonda/projects/chrome-devtools-mcp/MCP_SETUP.md` - 全面的にグローバル設定中心の構成に変更

### 主要な変更点

#### 1. MCP Configuration セクションの改善 (lines 11-76)
**変更前:**
- シンプルな設定例のみ
- `env: {}` フィールドが含まれていた
- グローバル vs プロジェクト固有の説明がなかった

**変更後:**
- **Global Configuration (Recommended)** セクションを追加
  - ルートレベルの mcpServers 設定を明示
  - グローバル設定の利点を4つリスト化
  - 設定ファイルの場所を明記（Claude Code: `~/.claude.json`）
- **Project-Specific Configuration (Not Recommended)** セクションを追加
  - プロジェクト固有設定の構造を説明
  - オーバーライドの挙動を説明
  - 使用を推奨しない旨を明記
- `env: {}` フィールドを削除（不要なため）

#### 2. Usage Examples セクションの改善 (lines 106-167)
**変更前:**
- グローバル/プロジェクト固有の区別がなかった
- `env: {}` が含まれていた

**変更後:**
- セクションタイトルに「(Global Configuration)」を追加
- 「All examples below use global configuration in `~/.claude.json`」という説明を追加
- 全ての例から `env: {}` を削除
- 新しい例を追加: **Load Multiple Extensions from Directory**

#### 3. 新セクション: Configuration Scope: Global vs Project-Specific (lines 169-255)
完全に新しいセクションを追加:

**Global Configuration (Recommended)**
- Location: Root level of `~/.claude.json`
- When to use: 4つのユースケースを説明
- ほとんどのユーザーに推奨

**Project-Specific Configuration (Advanced)**
- Location: Inside `projects` section
- When to use: 3つのユースケースを説明
- プロジェクト固有設定がグローバル設定をオーバーライドすることを明記

**Updating Configuration**
- グローバル設定の更新方法（jqコマンド）
- プロジェクト固有設定の更新方法（jqコマンド）
- バックアップ作成を推奨

### 実行したコマンド
```bash
# ファイル読み取り
Read MCP_SETUP.md
Read docs/mcp-configuration-guide.md

# 編集操作（Edit tool使用）
Edit MCP_SETUP.md (3回の編集)

# ログ作成
mkdir -p docs/log/claude
date "+%y%m%d_%H%M%S"
```

## 🤔 設計判断

### 採用したアプローチ
1. **グローバル設定を推奨する方針**
   - ほとんどのユースケースでグローバル設定が適切
   - メンテナンスが容易
   - docs/mcp-configuration-guide.md と一貫性を保つ

2. **プロジェクト固有設定は「Advanced」扱い**
   - 完全に削除せず、Advanced ユーザー向けに残す
   - オーバーライドの挙動を明確に説明
   - 使用を推奨しない旨を明記

3. **段階的な説明構成**
   - 最初に基本的なグローバル設定を紹介
   - 次にオプション付きの設定を紹介
   - 最後に詳細な比較セクションを配置

### 却下した代替案
1. **プロジェクト固有設定を完全削除**
   - 却下理由: 一部のユーザーは複数プロジェクトで異なる設定が必要な可能性
   - Advanced ユーザー向けに情報として残すべき

2. **グローバルとプロジェクト固有を同等に扱う**
   - 却下理由: ユーザーを混乱させる可能性
   - 明確に「推奨」を示すべき

## 📊 影響範囲

### ドキュメントの整合性
- ✅ docs/mcp-configuration-guide.md との一貫性を確保
- ✅ 日本語ドキュメントの構造を英語版に適用
- ✅ グローバル設定推奨の方針を統一

### ユーザーへの影響
- ✅ 既存ユーザー: 情報追加のみ、破壊的変更なし
- ✅ 新規ユーザー: より明確なガイダンスで混乱を減少
- ✅ 設定の更新方法（jqコマンド）を提供

### 技術的変更
- ✅ 破壊的変更: なし（ドキュメントのみの変更）
- ✅ 設定フォーマット: 既存の設定と互換性あり

## ⚠️ 課題・TODO
なし（タスク完了）

## 💡 今後の検討事項

### ドキュメントの改善
- README.md の Configuration セクションも同様に更新すべきか検討
- 設定例に実際のパス（例: /Users/yourname/...）を含めるべきか検討

### 自動化の可能性
- `claude mcp add` コマンドで自動的にグローバル設定が作成されることを確認
- グローバル設定への移行スクリプトの提供を検討

## 📝 変更のまとめ

### Before (旧構成)
- プロジェクト固有設定とグローバル設定の区別が不明確
- 利点の説明がなく、ユーザーがどちらを選ぶべきか不明
- `env: {}` フィールドが含まれていた（不要）

### After (新構成)
- **グローバル設定を明確に推奨**
- 利点を4つ明記（全プロジェクト適用、シングルソース、メンテナンス容易、設定不要）
- プロジェクト固有設定は Advanced ユーザー向けに残す
- 設定の更新方法（jqコマンド）を提供
- docs/mcp-configuration-guide.md との一貫性を確保
- `env: {}` を削除してシンプル化

### 主要な追加内容
1. Global Configuration (Recommended) セクション
2. Project-Specific Configuration (Not Recommended) セクション
3. Configuration Scope: Global vs Project-Specific セクション
4. 設定更新方法（jqコマンド）
5. Load Multiple Extensions from Directory の例

## 🎓 学び
- ドキュメントは「推奨」を明確にすることでユーザーの意思決定を助ける
- 既存の日本語ドキュメント（docs/mcp-configuration-guide.md）の構造が優れていた
- グローバル設定とプロジェクト固有設定の比較表は有用