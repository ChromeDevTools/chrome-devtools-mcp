# 残存する古い名前の修正計画

## 概要

`chrome-devtools-mcp-for-extension` → `chrome-ai-bridge` への名前変更後、まだ古い名前が残っている箇所を全て修正する。

**完了済み**: npm公開、GitHub リポジトリ名変更、src/コード、package.json、README.md

---

## 修正対象ファイル一覧

### カテゴリA: プロジェクト内ファイル（高優先度）

#### 1. テストファイル
**`tests/cli.test.ts`** - 3箇所
```
Line 18: $0: 'npx chrome-devtools-mcp@latest'
Line 34: $0: 'npx chrome-devtools-mcp@latest'
Line 52: $0: 'npx chrome-devtools-mcp@latest'
```
→ `npx chrome-ai-bridge@latest` に変更

#### 2. スクリプト
**`scripts/cli.mjs`** - 3箇所（コメント）
```
Line 3: CLI Entry Point for chrome-devtools-mcp-for-extension
Line 6-7: コメント
```
→ `chrome-ai-bridge` に変更

**`scripts/restart-mcp.sh`** - 3箇所
```
Line 2: Restart chrome-devtools-mcp-for-extension MCP server
Line 5: Looking for chrome-devtools-mcp-for-extension processes...
Line 12: No chrome-devtools-mcp-for-extension processes found
```
→ `chrome-ai-bridge` に変更

#### 3. ローカル設定
**`.claude/settings.local.json`** - 26+ 箇所
- Line 29: `Bash(npx chrome-devtools-mcp-for-extension@latest:*)`
- Lines 27-102: `mcp__chrome-devtools-extension__*` ツール名（18+箇所）
- Lines 131-141: `~/.cache/chrome-devtools-mcp/` パス（6箇所）
- Line 149: `disabledMcpjsonServers: ["chrome-devtools"]`

#### 4. エージェント定義
**`.claude/agents/chatgpt-gemini-discussion/AGENT.md`** - 3箇所
```
Line 47: projectName: 'chrome-devtools-mcp'
Line 66: projectName: 'chrome-devtools-mcp'
Line 80: projectName: 'chrome-devtools-mcp'
```
→ `chrome-ai-bridge` に変更

---

### カテゴリB: ユーザーホーム設定（高優先度）

#### 1. MCP サーバー設定
**`~/.claude.json`**
```json
"chrome-devtools-extension": {
  "command": "node",
  "args": [".../chrome-devtools-mcp/scripts/cli.mjs", ...]
}
```
→ キー名を `chrome-ai-bridge` に、パスも更新

#### 2. グローバル許可設定
**`~/.claude/settings.json`** - 5箇所
```
mcp__chrome-devtools-extension__ask_chatgpt_web
mcp__chrome-devtools-extension__ask_gemini_web
mcp__chrome-devtools-extension__list_pages
mcp__chrome-devtools-extension__navigate_page
mcp__chrome-devtools-extension__take_screenshot
```
→ `mcp__chrome-ai-bridge__*` に変更

#### 3. スキル定義
**`~/.claude/skills/browser-navigator/SKILL.md`** - 複数箇所
```
Lines 14-16, 22-30, 53-57: chrome-devtools-extension
```
→ `chrome-ai-bridge` に変更

#### 4. Cursor MCP 設定
**`~/.cursor/mcp.json`** - Line 14-18
```json
"chrome-devtools-extension": {
  "command": "node",
  "args": [".../chrome-devtools-mcp/scripts/cli.mjs"]
}
```
→ `chrome-ai-bridge` に変更

#### 5. バックアップ設定
**`~/.claude/mcp-backup-chrome-context7.json`**
→ `chrome-ai-bridge` に変更（任意）

---

### カテゴリC: 履歴・メタデータ（低優先度）

以下は履歴的な情報のため、変更は任意：

- `docs/ask/chatgpt/.chat-sessions.json` - プロジェクト名メタデータ
- `docs/ask/gemini/.chat-sessions.json` - プロジェクト名メタデータ
- `CHANGELOG.md` - git タグの比較リンク（履歴）

---

## 作業手順

### Step 1: プロジェクト内ファイル修正

```bash
# tests/cli.test.ts
sed -i '' 's/chrome-devtools-mcp@latest/chrome-ai-bridge@latest/g' tests/cli.test.ts

# scripts/cli.mjs
sed -i '' 's/chrome-devtools-mcp-for-extension/chrome-ai-bridge/g' scripts/cli.mjs

# scripts/restart-mcp.sh
sed -i '' 's/chrome-devtools-mcp-for-extension/chrome-ai-bridge/g' scripts/restart-mcp.sh
```

### Step 2: .claude/settings.local.json 修正

```bash
# ツール名プレフィックス
sed -i '' 's/mcp__chrome-devtools-extension__/mcp__chrome-ai-bridge__/g' .claude/settings.local.json

# npx コマンド
sed -i '' 's/chrome-devtools-mcp-for-extension/chrome-ai-bridge/g' .claude/settings.local.json

# キャッシュパス
sed -i '' 's/chrome-devtools-mcp/chrome-ai-bridge/g' .claude/settings.local.json

# disabledMcpjsonServers
sed -i '' 's/"chrome-devtools"/"chrome-ai-bridge"/g' .claude/settings.local.json
```

### Step 3: エージェント定義修正

```bash
sed -i '' "s/projectName: 'chrome-devtools-mcp'/projectName: 'chrome-ai-bridge'/g" .claude/agents/chatgpt-gemini-discussion/AGENT.md
```

### Step 4: ユーザーホーム設定修正（手動）

**~/.claude.json**:
- キー `chrome-devtools-extension` → `chrome-ai-bridge`
- パス内の `chrome-devtools-mcp` → `chrome-ai-bridge`

**~/.claude/settings.json**:
- `mcp__chrome-devtools-extension__*` → `mcp__chrome-ai-bridge__*`

**~/.claude/skills/browser-navigator/SKILL.md**:
- `chrome-devtools-extension` → `chrome-ai-bridge`

**~/.cursor/mcp.json**:
- キー `chrome-devtools-extension` → `chrome-ai-bridge`
- パス内の `chrome-devtools-mcp` → `chrome-ai-bridge`

### Step 5: ビルド・テスト

```bash
npm run build
npm test
```

### Step 6: Git コミット & タグ

```bash
git add -A
git commit -m "chore: fix remaining old name references"
git push
git tag v1.0.2
git push origin v1.0.2
```

---

## 検証方法

1. `npm test` - テストが新しい名前で通る
2. `npx chrome-ai-bridge@latest` - 起動確認
3. Claude Code 再起動 - MCP ツールが `mcp__chrome-ai-bridge__*` で認識される
4. `ask_chatgpt_web` / `ask_gemini_web` が動作
5. `scripts/restart-mcp.sh` が正しいプロセスを検索する

---

---

### カテゴリD: 他プロジェクトの設定（中優先度）

`~/projects/` 内の他プロジェクトにも古い参照が残っている：

#### 1. Chrome-Extension/sunoprompt
**`.claude/settings.local.json`** - 36+箇所
- `mcp__chrome-devtools__*` (古い形式) - 28個
- `mcp__chrome-devtools-extension__*` - 8個
- Chrome DevTools MCP 公式リポジトリURL参照
- `Bash(npx chrome-devtools-mcp:*)`

#### 2. GAS/slide_gen
**`.claude/settings.local.json`** - 22箇所
- `mcp__chrome-devtools-extension__*` ツール

**`CLAUDE.md`** - MCP使用フロー記載

#### 3. GAS/bellman
**`.claude/settings.local.json`** - 12箇所
- `mcp__chrome-devtools-extension__*` ツール

#### 4. Chrome-Extension/adLogger
**`.claude/settings.local.json`** - 10箇所
**`CLAUDE.md`** - 推奨ツール記載

#### 5. claude/agentskills/browser-navigator
**`.claude/skills/browser-navigator/SKILL.md`** - 複数箇所
**`CLAUDE.md`** - MCP選択ガイド

#### 6. その他プロジェクト（各1-3箇所）
- `temp/test2.1.1/.claude/settings.local.json`
- `GPTs/scenario/.claude/settings.local.json`
- `GPTs/notebooklm_designer/.claude/settings.local.json`
- `claude/agentskills/claude-skills/.claude/settings.local.json`
- `r1/.claude/settings.local.json`

---

## 変更ファイル数

| カテゴリ | ファイル数 | 変更箇所 |
|---------|-----------|----------|
| プロジェクト内 | 5 | ~35箇所 |
| ユーザーホーム | 4 | ~15箇所 |
| 他プロジェクト | 12+ | ~100箇所 |
| **合計** | **21+** | **~150箇所** |

---

## 実行順序

### Phase 1: chrome-ai-bridge プロジェクト内
1. `tests/cli.test.ts`
2. `scripts/cli.mjs`
3. `scripts/restart-mcp.sh`
4. `.claude/settings.local.json`
5. `.claude/agents/chatgpt-gemini-discussion/AGENT.md`
6. ビルド・テスト
7. Git コミット & タグ v1.0.2

### Phase 2: ユーザーホーム設定
1. `~/.claude.json` - MCPサーバー設定
2. `~/.claude/settings.json` - グローバル許可
3. `~/.claude/skills/browser-navigator/SKILL.md`
4. `~/.cursor/mcp.json`

### Phase 3: 他プロジェクト（一括）
```bash
# 全プロジェクトの settings.local.json を一括更新
find ~/projects -name "settings.local.json" -path "*/.claude/*" -exec \
  sed -i '' 's/mcp__chrome-devtools-extension__/mcp__chrome-ai-bridge__/g' {} \;

find ~/projects -name "settings.local.json" -path "*/.claude/*" -exec \
  sed -i '' 's/mcp__chrome-devtools__/mcp__chrome-ai-bridge__/g' {} \;

# CLAUDE.md も更新
find ~/projects -name "CLAUDE.md" -exec \
  sed -i '' 's/chrome-devtools-extension/chrome-ai-bridge/g' {} \;
```

### Phase 4: Claude Code 再起動

```bash
# Claude Code を再起動して新しい設定を読み込む
```
