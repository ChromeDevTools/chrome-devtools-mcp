# プロジェクト名変更計画: chrome-ai-bridge

## 決定事項

- **新しい名前**: `chrome-ai-bridge`
- **Core機能**: 全て維持（名前だけ変更）
- **npmパッケージ**: `chrome-ai-bridge`（空き確認済み）

---

## 変更箇所一覧

### 1. package.json
```json
{
  "name": "chrome-ai-bridge",
  "description": "MCP server bridging Chrome browser and AI assistants (ChatGPT, Gemini). Browser automation + AI consultation.",
  "mcpName": "chrome-ai-bridge",
  "repository": {
    "url": "https://github.com/usedhonda/chrome-ai-bridge.git"
  }
}
```

### 2. src/ 内のコード（15箇所）

| ファイル | 行 | 変更内容 |
|---------|-----|---------|
| `src/main.ts` | 79 | `chrome-devtools-mcp-for-extension` → `chrome-ai-bridge` |
| `src/main.ts` | 95 | `chrome-devtools-extension` → `chrome-ai-bridge` |
| `src/main.ts` | 235 | エラーメッセージ内のプロジェクト名 |
| `src/cli.ts` | 98 | `npx chrome-devtools-mcp@latest` → `npx chrome-ai-bridge` |
| `src/index.ts` | 15 | エラーメッセージ内のプロジェクト名 |
| `src/profile-migration.ts` | 17 | `.cache/chrome-devtools-mcp` → `.cache/chrome-ai-bridge` |
| `src/profile-resolver.ts` | 60 | `.cache/chrome-devtools-mcp` → `.cache/chrome-ai-bridge` |
| `src/McpContext.ts` | 497 | `chrome-devtools-mcp-` → `chrome-ai-bridge-` (tmpdir) |
| `src/browser.ts` | 721, 730, 915 | プロファイルパス内のプロジェクト名 |
| `src/config.ts` | 8 | コメント内のプロジェクト名 |
| `src/plugin-api.ts` | 8 | コメント内のプロジェクト名 |
| `src/tools/optional-tools.ts` | 23 | コメント内のプロジェクト名 |

### 3. ドキュメント（19ファイル）

**主要ドキュメント**:
- `README.md` - タイトル、説明、コマンド例
- `CLAUDE.md` - プロジェクト説明、コマンド例
- `CHANGELOG.md` - プロジェクト名
- `CONTRIBUTING.md` - プロジェクト名

**ユーザードキュメント**:
- `docs/user/setup.md` - MCP設定例
- `docs/user/troubleshooting.md`

**開発ドキュメント**:
- `docs/dev/hot-reload.md`

**内部ドキュメント**:
- `docs/internal/design/*.md` (3ファイル)
- `docs/internal/investigation/*.md` (6ファイル)
- `docs/issues/*.md`
- `docs/ui-snapshots/README.md`
- `docs/answer/*.md`

### 4. GitHubリポジトリ
```
現在: usedhonda/chrome-devtools-mcp
新規: usedhonda/chrome-ai-bridge
```

### 5. CI/CD
- `.github/workflows/publish.yml` - 必要なら更新
- npm Trusted Publishing - 新パッケージ用に設定

### 6. MCPツール名（変更なし）
以下のツール名は**そのまま維持**:
- `ask_chatgpt_web`
- `ask_gemini_web`
- `diagnose_chatgpt_ui`
- その他Core 18ツール

---

## 作業手順

### Step 1: src/ 内のコード更新
```bash
# 一括置換
sed -i '' 's/chrome-devtools-mcp-for-extension/chrome-ai-bridge/g' src/*.ts src/**/*.ts
sed -i '' 's/chrome-devtools-extension/chrome-ai-bridge/g' src/*.ts src/**/*.ts
sed -i '' 's/chrome-devtools-mcp/chrome-ai-bridge/g' src/*.ts src/**/*.ts
```

### Step 2: package.json更新
- name, description, mcpName, repository.url を変更
- version を `1.0.0` にリセット

### Step 3: ドキュメント一括更新
```bash
# 主要ドキュメント
sed -i '' 's/chrome-devtools-mcp-for-extension/chrome-ai-bridge/g' README.md CLAUDE.md CHANGELOG.md CONTRIBUTING.md
sed -i '' 's/chrome-devtools-mcp/chrome-ai-bridge/g' README.md CLAUDE.md docs/**/*.md
```

### Step 4: ビルド・テスト
```bash
npm run build
npm test
```

### Step 5: GitHubリポジトリ名変更（手動）
1. GitHub → Settings → General → Repository name
2. `chrome-devtools-mcp` → `chrome-ai-bridge`
3. 自動リダイレクト有効

### Step 6: npm Trusted Publishing設定（手動）
1. npm → Settings → Publishing → Add new publishing config
2. Repository: `usedhonda/chrome-ai-bridge`
3. Workflow: `.github/workflows/publish.yml`

### Step 7: Git commit & push & tag
```bash
git add -A
git commit -m "chore: rename project to chrome-ai-bridge v1.0.0"
git push
git tag v1.0.0
git push origin v1.0.0
```

### Step 8: 旧パッケージをdeprecate
```bash
npm deprecate chrome-devtools-mcp-for-extension "Moved to chrome-ai-bridge. Run: npx chrome-ai-bridge"
```

### Step 9: ユーザー向け移行案内

**~/.claude.json 更新**:
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "npx",
      "args": ["chrome-ai-bridge@latest"]
    }
  }
}
```

---

## 検証方法

1. `npx chrome-ai-bridge` で起動確認
2. MCPサーバーとして正常に登録・動作
3. `ask_chatgpt_web` / `ask_gemini_web` が動作
4. Core機能（click, fill, screenshot等）が動作
5. 旧パッケージ名でdeprecation警告が表示
6. プロファイルパスが `~/.cache/chrome-ai-bridge/` に変更されている

---

## 注意点

- **バージョン**: v1.0.0 にリセット（新パッケージなので）
- **プロファイル移行**: 旧パス `~/.cache/chrome-devtools-mcp/` から新パスへの自動移行は**しない**（クリーンスタート）
- **GitHub Actions**: リポジトリ名変更後、Trusted Publishingの再設定が必要
- **既存ユーザー**: 旧パッケージは動作するがdeprecation警告を表示

---

## 影響範囲

| 項目 | 影響 |
|------|------|
| npmパッケージ名 | 新規作成 |
| GitHubリポジトリ | リネーム（リダイレクト有効） |
| MCP登録名 | `chrome-ai-bridge` に変更 |
| プロファイルパス | `~/.cache/chrome-ai-bridge/` に変更 |
| ツール名 | **変更なし** |
| 機能 | **変更なし** |
