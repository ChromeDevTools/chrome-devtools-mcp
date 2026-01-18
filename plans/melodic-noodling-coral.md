# リポジトリ構成整理プラン

## 三者議論サマリー

| 項目 | ChatGPT | Gemini | Claude（統合見解） |
|------|---------|--------|-------------------|
| トップ構成 | 最小化（入口を小さく） | 40項目は多すぎ（成長痛） | **ゴミ削除で20項目以下に** |
| README | 入口に徹する、詳細はdocs/ | 512行は警告レベル→300行以内 | **300行目標、ツール一覧は残す** |
| docs/ | user/dev/reference/ 3分類 | 同意 | **採用** |
| モノレポ | packages/分離推奨 | 未整備ならノイズ、削除検討 | **packages/削除、将来再検討** |
| MCP特有 | 言及なし | ツール発見容易性が最重要 | **ツールサマリーテーブル必須** |
| CLAUDE.md | 要約+docs分割 | AI効率のため情報集約 | **.gitignoreで非公開（現状維持）** |

### Geminiの重要指摘（MCP特有）
> MCPサーバーの場合、AIがリポジトリを読み取ってツールを理解する。
> 情報をdocs/の奥深くに隠すと、トークン効率が悪くなる。
> → **READMEにツールのサマリーテーブルは必須**

---

## Phase 1: 即時実行（ゴミ掃除・設定整理）

### 1.1 不要ファイル削除

```bash
# 即削除
rm firebase-debug.log
rm test.txt
rm .release-please-manifest.json
rm release-please-config.json
rm gemini-extension.json     # 使用箇所なし（調査済み）
rm -rf packages/             # 未整備でノイズ（調査済み：src/index.tsのみ、中身空）
# test-extensions/ は .gitignore に含まれているためGitHubには存在しない（削除不要）
```

### 調査結果メモ
- `test-extensions/`: .gitignoreに含まれている → GitHubに存在しない
- `gemini-extension.json`: Gemini CLI用サンプル → コード内で参照なし
- `packages/web-llm/`: 将来のモノレポ準備 → 現時点では未使用

### 1.2 トップからdocs/へ移動

```bash
mv MCP_SETUP.md docs/user/setup.md
mv TEST_SCENARIOS.md docs/dev/testing-scenarios.md
```

### 1.2 .gitignore 追加

```gitignore
# OS / Editor
.DS_Store
Thumbs.db

# Logs
*.log
firebase-debug.log*
npm-debug.log*

# Cache
.eslintcache
.cache/
*.tsbuildinfo

# Build
build/
dist/
coverage/

# Env
.env
.env.*
```

### 1.3 トップディレクトリ目標構成

```
chrome-devtools-mcp/
├── README.md           # カタログ（スリム化）
├── CLAUDE.md           # ルーター（最小化）
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── server.json
├── .gitignore
├── .nvmrc
├── .prettierrc.cjs
├── .prettierignore
├── .github/
├── docs/
├── src/
├── tests/
├── scripts/
└── data/
```

**削減**: 40項目 → 20項目以下

---

## Phase 2: docs/ 再構成

### 現在のdocs/構成

```
docs/
├── 251004_184541-mcp-hot-reload-implementation-plan.md
├── auto-detection-issues-detailed.md
├── auto-detection-issues.md
├── chatgpt-question-project-detection.md
├── dedicated-profile-design.md
├── deepresearch-procedure.json
├── diagnose-ui-tool.md
├── extension-loading-investigation.md
├── google-login-issue-investigation.md
├── hot-reload-setup-guide.md
├── refactoring-plan.md
├── tool-reference.md
├── ask/           # AI会話ログ
└── log/           # 作業ログ
```

### 新構成

```
docs/
├── index.md              # 目次
├── user/                 # ユーザー向け
│   ├── quickstart.md
│   ├── configuration.md
│   ├── troubleshooting.md
│   └── faq.md
├── reference/            # リファレンス
│   ├── tools.md          # ← tool-reference.md 移動
│   ├── cli-options.md
│   └── plugin-api.md
├── dev/                  # 開発者向け
│   ├── architecture.md
│   ├── hot-reload.md     # ← hot-reload-setup-guide.md 移動
│   ├── testing.md
│   ├── release.md
│   └── claude/           # CLAUDE.md 分割先
│       ├── overview.md
│       ├── coding-rules.md
│       └── mcp-workflow.md
├── internal/             # 内部ドキュメント（アーカイブ）
│   ├── investigation/    # 調査ログ
│   └── design/           # 設計メモ
├── ask/                  # AI会話ログ（維持）
└── log/                  # 作業ログ（維持）
```

---

## Phase 3: CLAUDE.md の扱い

### 現状
- **30KB (約1000行)** - 開発者向けの詳細ルール
- **.gitignoreに含まれている** → GitHubには非公開
- ローカル開発時のみClaude Codeが読み込む

### 結論: 現状維持（変更不要）

理由:
1. GitHubに公開されていないので、リポジトリの見た目に影響なし
2. Claude Codeが自動読み込みするため、分割するとトークン効率が下がる（Gemini指摘）
3. 開発者専用のドキュメントとして機能している

### 将来的な改善（オプション）
- 情報の重複を削除して20KB以下に
- 古くなった情報の削除

---

## Phase 4: README.md スリム化

### 現在: 512行（長すぎ - Gemini「警告レベル」）

### 目標: 300行以内

### 新README構成（ChatGPT + Gemini統合案）

```markdown
# Chrome DevTools MCP for Extension Development
(badges)

> AI-powered Chrome extension development via MCP

## Quick Start (5分)
- npx chrome-devtools-mcp-for-extension@latest
- MCP設定例（Claude Code）
- 動作確認方法

## What You Can Do (60秒で把握)
- 拡張機能のロード・テスト
- スクリーンショット・DOM解析
- パフォーマンストレース
- Web Store自動申請（オプション）

## Tools Reference（★重要：MCP特有）
| ツール名 | 説明 | 主要パラメータ |
|---------|------|---------------|
| take_snapshot | ページ解析 | - |
| ask_chatgpt_web | ChatGPT連携 | question |
| ... | ... | ... |

※ 詳細は docs/reference/tools.md

## For Developers
- ローカル開発: docs/dev/setup.md
- ホットリロード: docs/dev/hot-reload.md
- テスト: npm test

## Plugin Architecture (v0.26.0)
- Core Tools (18) vs Optional Tools (2)
- 外部プラグイン読み込み
※ 詳細は docs/reference/plugin-api.md

## Links
- [Troubleshooting](docs/user/troubleshooting.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License
Apache-2.0
```

### docs/に移動する内容
- Hot-reload詳細手順 → docs/dev/hot-reload.md
- Publishing手順 → docs/dev/release.md
- Troubleshooting詳細 → docs/user/troubleshooting.md
- Plugin API詳細 → docs/reference/plugin-api.md
- Common Workflows → docs/user/workflows.md

---

## Phase 5: packages/ の扱い

**削除する**（Gemini提案）

理由:
- 中身が未整備（web-llm/README.mdのみ）
- ユーザーにはノイズ
- モノレポ化は将来の検討事項

---

## 実行順序

| Step | 内容 | リスク |
|------|------|--------|
| 1 | 不要ファイル削除（ゴミ掃除） | 低 |
| 2 | packages/, test-extensions/ 削除 | 低 |
| 3 | .gitignore更新 | 低 |
| 4 | MCP_SETUP.md, TEST_SCENARIOS.md → docs/へ移動 | 低 |
| 5 | docs/ ディレクトリ再構成 | 中（リンク切れ注意） |
| 6 | README.md スリム化（512行→300行） | 中 |
| 7 | コミット・プッシュ | 低 |

---

## 検証方法

1. `npm run build && npm test` - ビルド・テスト通過
2. `npm run docs` - ドキュメント生成成功
3. GitHubでREADME表示確認
4. `ls` でトップディレクトリが20項目以下か確認

---

## 変更対象ファイル

### 削除
- `firebase-debug.log`
- `test.txt`
- `.release-please-manifest.json`
- `release-please-config.json`
- `gemini-extension.json`
- `packages/` (ディレクトリ)
- `test-extensions/` (ディレクトリ)

### 移動
- `MCP_SETUP.md` → `docs/user/setup.md`
- `TEST_SCENARIOS.md` → `docs/dev/testing-scenarios.md`

### 編集
- `.gitignore` - *.log, test.txt 等を追加
- `README.md` - 512行→300行にスリム化
- `docs/` - user/, dev/, reference/ 構成に再編

### 変更なし
- `CLAUDE.md` - .gitignoreで非公開のため現状維持
- `server.json` - MCP設定として必要
