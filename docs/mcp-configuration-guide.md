# MCP Configuration Guide - Chrome DevTools MCP for Extension

このガイドでは、Claude Code で Chrome DevTools MCP を使用する際の設定方法を説明します。

## 目次
1. [基本設定](#基本設定)
2. [拡張機能のロード設定](#拡張機能のロード設定)
3. [設定ファイルの場所と構造](#設定ファイルの場所と構造)
4. [トラブルシューティング](#トラブルシューティング)

---

## 基本設定

### デフォルト設定（システム拡張機能を自動ロード）

Claude Code で MCP サーバーを使用する場合、`~/.claude.json` に設定が保存されます。

**最小限の設定:**
```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "type": "stdio",
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest"
          ],
          "env": {}
        }
      }
    }
  }
}
```

**この設定での動作:**
- ✅ システムChromeの拡張機能を自動検出・ロード
- ✅ 独立したChromeインスタンスを起動
- ✅ 既存のChromeブラウザと並行動作

---

## 拡張機能のロード設定

### オプション1: 特定のディレクトリ内の全拡張機能をロード

開発中の拡張機能が入ったフォルダを指定して、その中の全拡張機能をロードします。

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "type": "stdio",
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest",
            "--loadExtensionsDir=/Users/username/projects/Chrome-Extension"
          ],
          "env": {}
        }
      }
    }
  }
}
```

**ディレクトリ構造の例:**
```
/Users/username/projects/Chrome-Extension/
├── my-extension-1/
│   ├── manifest.json
│   ├── background.js
│   └── ...
├── my-extension-2/
│   ├── manifest.json
│   └── ...
└── another-extension/
    ├── extension/          ← manifest.jsonがあるディレクトリ
    │   ├── manifest.json
    │   └── ...
    └── src/
```

**注意点:**
- MCPサーバーは各サブディレクトリをスキャンし、`manifest.json` を持つディレクトリを自動検出
- `my-extension-1/manifest.json` と `another-extension/extension/manifest.json` の両方が検出される

### オプション2: 単一の拡張機能を指定

特定の1つの拡張機能のみをロードする場合：

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "type": "stdio",
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest",
            "--loadExtension=/Users/username/projects/my-extension"
          ],
          "env": {}
        }
      }
    }
  }
}
```

### オプション3: システム拡張機能を使わず、指定した拡張のみロード

システムChromeの拡張機能を読み込まず、開発中の拡張機能のみを使用：

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "type": "stdio",
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest",
            "--isolated",
            "--loadExtension=/Users/username/projects/my-extension"
          ],
          "env": {}
        }
      }
    }
  }
}
```

**`--isolated` フラグの効果:**
- システムChrome拡張機能を読み込まない
- 完全にクリーンな環境で拡張機能をテスト

### オプション4: 複数のオプションを組み合わせ

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "type": "stdio",
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest",
            "--loadExtension=/Users/username/projects/specific-extension",
            "--loadExtensionsDir=/Users/username/projects/more-extensions",
            "--channel=canary"
          ],
          "env": {}
        }
      }
    }
  }
}
```

---

## 設定ファイルの場所と構造

### 設定ファイルのパス

Claude Code の MCP 設定は以下に保存されます：
```
~/.claude.json
```

### ファイル構造

`~/.claude.json` は**2つのスコープで設定**を持つ構造です：

#### 1. グローバル設定（全プロジェクト共通）- 推奨

```json
{
  "numStartups": 335,
  "installMethod": "native",
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--loadExtensionsDir=/Users/username/projects/Chrome-Extension"
      ]
    }
  }
}
```

**利点:**
- ✅ 全プロジェクトで共通の設定を使用
- ✅ 設定の重複を避ける
- ✅ メンテナンスが容易

#### 2. プロジェクト固有設定（非推奨）

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-for-extension@latest"]
    }
  },
  "projects": {
    "/Users/username/project-a": {
      "mcpServers": {
        "chrome-devtools-extension": {
          "command": "npx",
          "args": [
            "chrome-devtools-mcp-for-extension@latest",
            "--loadExtension=/Users/username/project-a/extension"
          ]
        }
      }
    }
  }
}
```

**注意点:**
- ⚠️ プロジェクト設定はグローバル設定を上書きする
- ⚠️ 設定が重複する可能性がある
- ⚠️ 通常はグローバル設定で十分

### 設定の更新方法

#### 方法1: `jq` コマンドで更新（推奨）

##### グローバル設定を更新

```bash
# バックアップを作成
cp ~/.claude.json ~/.claude.json.backup

# グローバル設定を更新
jq '.mcpServers."chrome-devtools-extension".args = [
  "chrome-devtools-mcp-for-extension@latest",
  "--loadExtensionsDir=/Users/username/projects/Chrome-Extension"
]' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

##### プロジェクト固有設定を更新（非推奨）

```bash
# バックアップを作成
cp ~/.claude.json ~/.claude.json.backup

# プロジェクト設定を更新
jq --arg project "/path/to/your/project" '
  .projects[$project].mcpServers."chrome-devtools-extension".args = [
    "chrome-devtools-mcp-for-extension@latest",
    "--loadExtensionsDir=/Users/username/projects/Chrome-Extension"
  ]
' ~/.claude.json > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json
```

#### 方法2: テキストエディタで手動編集

**⚠️ 注意:** `~/.claude.json` は巨大なファイル（数MB）になる可能性があります。編集には注意が必要です。

1. バックアップを作成
   ```bash
   cp ~/.claude.json ~/.claude.json.backup
   ```

2. エディタで開く
   ```bash
   code ~/.claude.json  # VS Code
   # または
   nano ~/.claude.json
   ```

3. 該当するプロジェクトの `mcpServers` セクションを見つけて編集

4. Claude Code を再起動して設定を反映

---

## 利用可能なオプション一覧

| オプション | 説明 | 例 |
|-----------|------|-----|
| `--loadExtension=<path>` | 単一の拡張機能を指定 | `--loadExtension=/path/to/ext` |
| `--loadExtensionsDir=<path>` | ディレクトリ内の全拡張をスキャン | `--loadExtensionsDir=/path/to/exts` |
| `--isolated` | システム拡張をロードしない | `--isolated` |
| `--channel=<channel>` | Chromeチャンネル指定 | `--channel=canary` |
| `--headless` | ヘッドレスモード | `--headless` |

---

## 動作確認

設定を更新したら、Claude Code を再起動（`/exit`）して動作を確認します：

### 1. 拡張機能がロードされているか確認

Claude Code で以下のコマンドを実行：

```
chrome://extensions/ を開いて
```

または MCP ツールを使用：

```javascript
// Claude Code内で
list_extensions
```

### 2. ページ内容の確認

```javascript
take_snapshot
```

拡張機能が正しくロードされていれば、スナップショットに拡張機能の一覧が表示されます。

---

## トラブルシューティング

### 問題1: 拡張機能がロードされない

**確認事項:**
1. 指定したディレクトリが存在するか
   ```bash
   ls -la /path/to/extensions/
   ```

2. `manifest.json` が存在するか
   ```bash
   find /path/to/extensions/ -name "manifest.json"
   ```

3. MCPサーバーのプロセスに引数が渡っているか
   ```bash
   ps aux | grep chrome-devtools-mcp | grep loadExtensions
   ```

### 問題2: Chrome起動時に `--load-extension` が渡されていない

Chromeプロセスを確認：
```bash
ps aux | grep "Google Chrome" | grep "load-extension"
```

期待される出力：
```
--load-extension=/path/to/ext1,/path/to/ext2,...
```

### 問題3: 設定が反映されない

1. `~/.claude.json` の内容を確認
   ```bash
   jq '.projects | to_entries[] | select(.key | contains("your-project")) | .value.mcpServers' ~/.claude.json
   ```

2. Claude Code を完全に再起動
   ```
   /exit
   # Claude Code を再度起動
   ```

3. バックアップから復元
   ```bash
   cp ~/.claude.json.backup ~/.claude.json
   ```

---

## 実例: 実際の設定

### 実例1: グローバル設定（推奨）

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

**ロードされる拡張機能:**
- `/Users/usedhonda/projects/Chrome-Extension/AdBlocker/extension/`
- `/Users/usedhonda/projects/Chrome-Extension/meet_moderator/dist/`
- `/Users/usedhonda/projects/Chrome-Extension/monolith/`
- `/Users/usedhonda/projects/Chrome-Extension/my-prompt/extension/`
- `/Users/usedhonda/projects/Chrome-Extension/sunoprompt/extension/`
- システムChromeの全拡張機能（自動）

**利点:**
- ✅ 全プロジェクトで同じ拡張機能環境を使用
- ✅ 設定が1箇所にまとまり管理が容易

### 実例2: 特定の拡張機能のみテスト（グローバル設定）

```json
{
  "mcpServers": {
    "chrome-devtools-extension": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp-for-extension@latest",
        "--isolated",
        "--loadExtension=/Users/username/my-extension-project/extension"
      ]
    }
  }
}
```

**動作:**
- システム拡張機能は読み込まない（`--isolated`）
- 指定した1つの拡張機能のみロード
- クリーンな環境でテスト
- 全プロジェクトでこの設定を使用

---

## セキュリティとプライバシー

### プロファイルの独立性

- MCP サーバーは `~/.cache/chrome-devtools-mcp/chrome-profile/` に独立したプロファイルを使用
- システムChromeのCookies, Login Dataは共有されない
- 初回起動時にGoogleログインが必要（セキュリティのため）
- 2回目以降はログイン状態が保持される

### ブックマーク

- ブラウザUIにはブックマークは表示されない
- MCP ツール（`list_bookmarks`, `navigate_bookmark`）からのみアクセス可能
- システムChromeのブックマークファイルは読み取り専用でアクセス

---

## 参考情報

### v0.7.1 の主要機能

1. **isolated プロファイル + `--load-extension` 方式**
   - システムプロファイルと完全に独立
   - 拡張機能は動的ロード

2. **システム拡張機能の自動検出**
   - デフォルトでシステムChromeの拡張機能をロード
   - `--isolated` フラグで無効化可能

3. **並行動作**
   - 既存のChromeブラウザと同時に動作
   - プロファイルロックの競合なし

### 関連ドキュメント

- [README.md](../README.md) - 全体的な機能説明
- [CLAUDE.md](../CLAUDE.md) - 開発者向けプロジェクト情報
- [docs/ask/dedicated-profile-symlink-issue.md](./ask/dedicated-profile-symlink-issue.md) - v0.7.0 の問題と v0.7.1 への移行理由

### バージョン履歴

- **v0.7.1** (2025-09-30): `--load-extension` 方式に変更
- **v0.7.0** (2025-09-30): 専用プロファイル + シンボリックリンク方式（動作せず）
- **v0.6.5** (2025-09-30): 並行起動許可（動作せず）
- **v0.6.4** (2025-09-30): プロファイル検出修正

---

## サポート

問題が発生した場合は、以下のコマンドで診断情報を収集してください：

```bash
# MCPサーバープロセス確認
ps aux | grep chrome-devtools-mcp | grep -v grep

# Chrome起動引数確認
ps aux | grep "Google Chrome" | grep "load-extension"

# 設定確認
jq '.projects | keys' ~/.claude.json

# 拡張機能ディレクトリ確認
ls -la /path/to/your/extensions/
find /path/to/your/extensions/ -name "manifest.json"
```

GitHub Issues: https://github.com/usedhonda/chrome-devtools-mcp/issues
npm: https://www.npmjs.com/package/chrome-devtools-mcp-for-extension