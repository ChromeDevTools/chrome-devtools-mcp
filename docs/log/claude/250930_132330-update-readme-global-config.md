# README.md Configuration Update - Global mcpServers Approach

## 📅 作業情報
- **日時**: 2025-09-30 13:23:30 (ローカル時刻)
- **担当**: Claude 4.5
- **ブランチ**: main

## 📝 ユーザー指示
README.md を更新して、プロジェクト固有の MCP 設定から、グローバル設定（`~/.claude.json` の直下 `mcpServers`）に変更する。

**変更前（プロジェクト固有 - 非推奨）:**
```json
{
  "projects": {
    "/path/to/project": {
      "mcpServers": {
        "chrome-devtools-extension": { ... }
      }
    }
  }
}
```

**変更後（グローバル - 推奨）:**
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

## 🎯 実施内容

### 変更ファイル一覧
- `/Users/usedhonda/projects/chrome-devtools-mcp/README.md` - 7箇所の設定例を更新

### 主要な変更点

#### 1. Quick Start セクション (Line 39)
**変更前:**
```
Add to your MCP configuration file:
```

**変更後:**
```
Add to your global MCP configuration file (`~/.claude.json` or equivalent):
```

#### 2. Advanced Configuration - Auto-load Development Extension (Line 161-177)
**追加内容:**
```
## Auto-load Development Extension

Add to `~/.claude.json`:

{JSON configuration example}
```

#### 3. Advanced Configuration - Debug Mode (Line 181-197)
**追加内容:**
```
## Debug Mode

Add to `~/.claude.json`:

{JSON configuration example}
```

#### 4. Advanced Configuration - Custom Chrome Channel (Line 199-215)
**追加内容:**
```
## Custom Chrome Channel

Add to `~/.claude.json`:

{JSON configuration example}
```

#### 5. Advanced Configuration - Isolated Profile Mode (Line 219-235)
**追加内容:**
```
## Isolated Profile Mode

Add to `~/.claude.json`:

{JSON configuration example}
```

#### 6. Troubleshooting - Extension Not Loading Solution (Line 422-437)
**変更前:**
```json
// Use --loadExtension with correct path
"args": ["chrome-devtools-mcp-for-extension@latest", "--loadExtension=/correct/path"]
```

**変更後:**
```
Update `~/.claude.json`:
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtension=/correct/path"
      ]
    }
  }
}
```

#### 7. 日本語セクション - その他のMCPクライアント (Line 517-530)
**追加内容:**
```
**その他のMCPクライアント:**

`~/.claude.json` に以下を追加:

{JSON configuration example}
```

### 実行したコマンド
```bash
# 変更差分の確認
git diff README.md | head -100
```

### 変更の一貫性確認
- ✅ 全ての設定例に `~/.claude.json` への言及を追加
- ✅ グローバル設定の構造で統一
- ✅ プロジェクト固有設定（`projects` キー）への言及を削除
- ✅ docs/mcp-configuration-guide.md との整合性を確保

## 🤔 設計判断

### 採用したアプローチ
**グローバル設定（`~/.claude.json` 直下の `mcpServers`）を推奨する理由:**

1. **設定の一元管理**: 全プロジェクトで共通の設定を使用し、重複を避ける
2. **メンテナンス性**: 1箇所の変更で全プロジェクトに適用される
3. **Claude Code の推奨**: `claude mcp add --scope user` コマンドもグローバル設定を使用
4. **docs/mcp-configuration-guide.md との整合**: 設定ガイドでグローバル設定を推奨している

### 却下した代替案
1. **プロジェクト固有設定を併記する**: 混乱を招く可能性があり、グローバル設定の推奨が不明確になる
2. **設定ファイルパスを明記しない**: ユーザーが設定場所を把握できない

## 📊 影響範囲
- **破壊的変更**: なし（既存の設定方法も引き続き動作する）
- **パフォーマンス影響**: なし
- **セキュリティ影響**: なし
- **ユーザー体験**: 改善（設定場所が明確になる）

## ⚠️ 注意事項
- 既存のプロジェクト固有設定を使用しているユーザーは、引き続き動作する
- グローバル設定とプロジェクト設定が両方存在する場合、プロジェクト設定が優先される（Claude の仕様）
- ユーザーは必要に応じてプロジェクト固有設定を使用することも可能

## 💡 今後の検討事項
- ユーザーからのフィードバックを基に、グローバル設定とプロジェクト設定の使い分けガイドを追加
- `claude mcp` コマンドの詳細な使用方法をドキュメント化

## 📝 変更ファイルパス
- `/Users/usedhonda/projects/chrome-devtools-mcp/README.md`

## 🔍 変更差分サマリー
```diff
- Add to your MCP configuration file:
+ Add to your global MCP configuration file (`~/.claude.json` or equivalent):

- ## Auto-load Development Extension
+ ## Auto-load Development Extension
+
+ Add to `~/.claude.json`:

- ## Debug Mode
+ ## Debug Mode
+
+ Add to `~/.claude.json`:

- ## Custom Chrome Channel
+ ## Custom Chrome Channel
+
+ Add to `~/.claude.json`:

- ## Isolated Profile Mode
+ ## Isolated Profile Mode
+
+ Add to `~/.claude.json`:

- **Solution:**
- ```json
- // Use --loadExtension with correct path
- "args": ["chrome-devtools-mcp-for-extension@latest", "--loadExtension=/correct/path"]
- ```
+ **Solution:**
+
+ Update `~/.claude.json`:
+ ```json
+ {
+   "mcpServers": {
+     "chrome-devtools-extension": {
+       "command": "npx",
+       "args": [
+         "chrome-devtools-mcp-for-extension@latest",
+         "--loadExtension=/correct/path"
+       ]
+     }
+   }
+ }
+ ```

- **その他のMCPクライアント:**
+ **その他のMCPクライアント:**
+
+ `~/.claude.json` に以下を追加:
```