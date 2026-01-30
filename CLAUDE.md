# Chrome AI Bridge

## セッション開始時タスク

### Chromeプロファイル クリーンアップ確認

**セッション開始時に必ず実行:**

```bash
# 30日以上未使用のプロファイルを確認
find ~/.cache/chrome-ai-bridge/profiles -maxdepth 1 -type d -mtime +30 2>/dev/null | while read dir; do
  [ "$dir" != "$HOME/.cache/chrome-ai-bridge/profiles" ] && du -sh "$dir"
done
```

**削除対象があれば:**
1. ユーザーに一覧を表示
2. 削除してよいか確認を取る
3. 承認されたら `rm -rf` で削除

### 作業状態の確認 - 絶対厳守

**コンテキストリフレッシュ直後、必ず最初に実行:**

```bash
# 最新の作業ログを確認
ls -t docs/log/claude/*.md | head -3
```

最新のログファイルを読んで:
1. 前回何をしていたか把握
2. 進捗状況を確認
3. ユーザーに「前回の続きから再開します: [要約]」と報告

**これを怠ると、同じ作業を繰り返すことになる。**

### 作業ログの記録 - 必須

以下のタイミングで `docs/log/claude/[yymmdd_hhmmss-作業内容.md]` を作成/更新:

- タスク開始時: 何をやるか
- マイルストーン達成時: 何が完了したか
- エラー発生時: 何が起きたか、試したこと
- 検証待ち時: 何を待っているか
- タスク完了時: 結果のサマリー

### ログの書き方

```markdown
# [作業内容の要約]

## 状態
- 日時: YYYY-MM-DD HH:MM
- 状態: [進行中 / 検証待ち / 完了 / エラー]

## 現在のタスク
[タスクの説明]

## 進捗
- [x] 完了項目
- [ ] 未完了項目 ← 今ここ

## 直近の作業
- 何をしたか
- 次に何をするか

## ブロッカー / 検証待ち
- [あれば]
```

### プラン実行前の Git コミット - 絶対厳守

**プラン（EnterPlanMode → ExitPlanMode）実行開始前に必ず:**

1. `git status` で未コミットの変更を確認
2. 変更がある場合:
   - ユーザーに「未コミットの変更があります。先にコミットしますか？」と確認
   - 承認されたらコミット実行
   - 拒否されたら作業続行（ただし警告表示）
3. 変更がない場合: そのままプラン実行開始

**理由:**
- プランによる変更と既存変更が混ざらない
- 問題発生時に `git checkout` で簡単にロールバック可能
- 変更の追跡が明確になる

---

## 徹底事項

### chrome-ai-bridge MCP の使用制限 - 絶対厳守

**このMCPサーバー（mcp__chrome-ai-bridge-dev__*）は、ChatGPT/Geminiへの質問送信専用。**

**使用可能なツール:**
- `ask_chatgpt_web` - ChatGPTに質問
- `ask_gemini_web` - Geminiに質問
- `ask_chatgpt_gemini_web` - 両方に並列質問（推奨）

**使用禁止（絶対に使わない）:**
- `take_snapshot` - 動作しない
- `take_screenshot` - 動作しない
- `click`, `fill`, `hover` 等 - 動作しない
- `list_console_messages` - 動作しない
- その他のブラウザ操作系ツール全て

**理由:**
- このMCPはChatGPT/Gemini接続専用に設計されている
- 汎用ブラウザ操作はPlaywright MCP（mcp__plugin_playwright_playwright__*）を使用すること
- デバッグ目的でこのMCPのツールを呼ぶと無駄な時間がかかるだけ

---

### 使用禁止スクリプト（非推奨）- 絶対厳守

以下は古いスクリプトで、**使用しないでください**:
- `scripts/start-mcp-from-json.mjs` - 古いMCP起動方式
- `scripts/configure-codex-mcp.mjs` - Codex専用、使用頻度なし
- `scripts/codex-mcp-test.mjs` - Codex専用、使用頻度なし

**代わりに使用するコマンド:**
```bash
# ChatGPTテスト
npm run test:chatgpt -- "質問"

# Geminiテスト
npm run test:gemini -- "質問"

# CDPスナップショット
npm run cdp:chatgpt
npm run cdp:gemini
```

---

### 拡張機能バージョン - 絶対厳守

**`src/extension/` 配下のファイルを変更したら、必ず `manifest.json` のバージョンを上げる。**

```json
// src/extension/manifest.json
"version": "1.1.0",  // ← 毎回上げる
```

**理由:**
- ユーザーが chrome://extensions/ で更新を確認しやすい
- 変更が反映されたかどうか一目でわかる
- 細かい変更でも必ず上げる（例: 1.1.0 → 1.1.1）

**対象ファイル:**
- `src/extension/manifest.json`
- `src/extension/background.mjs`
- `src/extension/ui/connect.html`
- `src/extension/ui/connect.js`
- その他 `src/extension/` 配下すべて

---

### 開発フロー - 絶対厳守

**この開発環境ではローカルパスを参照しているため、npm publishは不要**

```json
// ~/.config/claude-code/config.json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/mcp/chrome-ai-bridge/scripts/cli.mjs"
      ]
    }
  }
}
```

**開発フロー（通常）:**
```bash
# 1. コード修正
vim src/browser.ts

# 2. ビルド
npm run build

# 3. テスト（簡易チェック - 型エラーのみ確認）
npm run typecheck

# 4. git push
git add -A && git commit -m "..." && git push
```

**ユーザー確認前の必須ルール（絶対厳守）:**
- 変更が `src/extension/**` / `src/extension/manifest.json` / `src/extension/ui/**` を含む場合は、**必ず**先に `npm run build` を実行する。
- `npm run build` 実行後でなければ、**ユーザーに確認/検証を依頼しない**。
- 反映が必要な場合は、**「拡張機能の更新」実施を案内した後**に確認を依頼する。

**テストについて:**
- `npm test` は実行不要（時間がかかる & 既存の問題が多い）
- `npm run typecheck` のみ実行（TypeScriptの型エラー確認）
- 実際の動作確認はClaude Code再起動後に手動で確認

**npm publishが必要な場合（他のユーザー向けリリース時のみ）:**
```bash
# 1. バージョン更新
# package.json の version を更新（例: "2.0.2" → "2.0.3"）

# 2. git push
git add -A && git commit -m "chore: bump version to 2.0.3" && git push origin main

# 3. 手動でタグを作成してプッシュ（重要！）
git tag v2.0.3 && git push origin v2.0.3

# 4. 確認（30秒ほど待ってから）
npm view chrome-ai-bridge version
```

**仕組み（GitHub Actions）:**
1. `.github/workflows/auto-tag-and-publish.yml`: package.json変更時にタグ自動作成
2. `.github/workflows/npm-publish.yml`: タグ作成時にnpm publish実行
3. `.github/workflows/publish-to-npm-on-tag.yml`: タグ作成時にnpm publish実行（バックアップ）

**⚠️ 重要: タグは手動でプッシュする必要がある**
- `auto-tag-and-publish.yml`がGITHUB_TOKENでタグを作成しても、別のワークフローはトリガーされない（GitHub仕様）
- **必ずローカルから `git tag vX.X.X && git push origin vX.X.X` を実行すること**

**禁止事項（時間の無駄）:**
- ❌ 開発中に `npm publish` を気にする
- ❌ GitHub Actionsの自動タグ作成に頼る（別ワークフローがトリガーされない）
- ❌ **ローカルから `npm publish` を実行する（EOTP エラーになる）**
- ❌ `npm login` を何度も試す
- ❌ `.npmrc` のトークンをいじる

**理由**:
- この開発Macは `/Users/usedhonda/projects/mcp/chrome-ai-bridge/` を直接参照
- `npm publish` は他のユーザーがインストールする時のみ必要
- GitHub Actionsが自動的にnpm publishを実行
- **npm 2025年12月仕様変更でWebAuthn (Touch ID) のみのアカウントはローカルpublish不可**
  - ローカルから `npm publish` すると EOTP エラーが発生
  - GitHub Actions + Trusted Publishing (OIDC) で回避

---

### 効率的デバッグルール - 絶対厳守

#### 原則：MCPサーバー再起動を避ける

**MCPサーバー経由のテストは非効率**:
- Claude Code再起動が必要（30秒+）
- 毎回接続確立
- デバッグ情報が省略される

**直接実行を優先**:
- TypeScriptをビルド後、Node.jsで直接実行
- MCPサーバーを介さずに機能をテスト
- 繰り返しテストが高速（10秒以下）

#### デバッグ手法の選択基準

| 状況 | 手法 | 理由 |
|------|------|------|
| 単一関数のデバッグ | 直接実行スクリプト | 最速フィードバック |
| エンドツーエンド確認 | MCP経由 | 統合テストとして必要 |
| UI要素の調査 | ブラウザで手動確認 | DOM構造を目視確認 |
| エラー原因の特定 | ログ + 直接実行 | スタックトレース取得 |

#### テスト質問の書き方 - BAN回避

ChatGPT/Geminiへのテスト質問は、**自然な技術的質問**を使うこと。

**❌ 禁止（AI検出・BAN対象になりうる）:**
- `1+1は？` - 明らかにテスト目的
- `接続テスト` - 自動化の痕跡
- `Hello` / `OK` - 意味のないメッセージ
- 同じ質問の繰り返し

**✅ 推奨（自然なユーザー行動に見える）:**
```
JavaScriptでオブジェクトをディープコピーする方法を1つ教えて。コード例付きで。
Pythonでファイルを非同期で読み込む方法は？
TypeScriptでジェネリック型の使い方を簡潔に説明して。
```

**ポイント:**
- 具体的な技術トピック
- 実際に役立つ質問
- 適度な長さ（短すぎない）
- 毎回少し違う質問を使う

#### 直接実行スクリプトの使い方

**fast-chat.ts のテスト:**
```bash
# ビルド
npm run build

# 直接テスト（MCP不要）
npm run test:chatgpt           # ChatGPTのみ
npm run test:gemini            # Geminiのみ
npm run test:both              # 両方テスト

# カスタム質問でテスト（自然な質問を使う）
node --import ./scripts/browser-globals-mock.mjs scripts/test-fast-chat.mjs chatgpt "TypeScriptの型ガードの書き方を教えて"
```

**新しいモジュールをテストする場合:**
1. `scripts/test-[モジュール名].mjs` を作成
2. 対象関数を直接インポート
3. 最小限のテストコードを書く
4. `node --import ./scripts/browser-globals-mock.mjs scripts/test-*.mjs` で実行

#### デバッグ用スクリプト作成ルール

**必須要素:**
```javascript
#!/usr/bin/env node
// 1. テスト対象をビルド後のパスからインポート
import {targetFunction} from '../build/src/path/to/module.js';

// 2. コマンドライン引数を受け取る
const arg = process.argv[2] || 'default';

// 3. エラーハンドリング付きで実行
async function main() {
  try {
    const result = await targetFunction(arg);
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);  // 完全なスタックトレース
  }
}

main();
```

**注意**: `browser-globals-mock.mjs` は `--import` フラグで指定すること（ファイル内でimportしても効果なし）

#### 禁止事項

❌ **やってはいけないこと**:
- 毎回MCPサーバー経由でテスト（非効率）
- デバッグスクリプトなしで手探りで修正
- ログを見ずに「動くはず」と推測

✅ **やるべきこと**:
- 最初にデバッグスクリプトを作成
- ビルド → 直接実行 → 修正 のサイクル
- ログファイルを常に監視（別ターミナル）

#### ログ監視の習慣

```bash
# 別ターミナルで常時監視
tail -f .local/mcp-debug.log
```

---

### ChatGPT/Gemini質問の構築 - 必須

質問が詳細であるほど、回答の質が上がる。以下を必ず含める:

**必須項目**:
1. **背景**: プロジェクト名、技術スタック、現在の状況
2. **問題**: 具体的な症状、エラーメッセージ（あれば）
3. **試したこと**: 既に試した解決策と結果
4. **質問**: 番号付きで具体的に（1つの質問に複数項目OK）
5. **期待形式**: コード例、手順、比較表、メリデメなど

**良い例**:
```
chrome-ai-bridge プロジェクトで npm publish 時に EOTP エラーが発生。

環境:
- npm 11.3.0 / Node.js 24.2.0
- 2FA: WebAuthn (Touch ID) のみ

試したこと:
1. npm login --auth-type=web → ログイン成功
2. npm publish --auth-type=web → EOTP エラー

質問:
1. なぜ auth-type=web でも EOTP エラーになるのか？
2. Touch ID だけで publish する方法はあるか？
3. Trusted Publishing (OIDC) は代替として適切か？

コード例や具体的な手順で回答してほしい。
```

**悪い例**:
```
npm publish でエラーが出ます。どうすればいいですか？
```

### ログファイル記載の際の時間取得ルール

**時刻取得方法**:
- ✅ `date '+%y%m%d_%H%M%S'` - クライアントのローカル時刻を使用
- ❌ `TZ='Asia/Tokyo' date '+%y%m%d_%H%M%S'` - タイムゾーン指定は禁止

**理由**: 特定のタイムゾーンを強制せず、クライアントのローカル時刻を使用するため

### AI質問のデフォルト動作

**重要ルール**: ユーザーが「AIに〜を聞いて」と指示した場合、**必ず** `ask_chatgpt_gemini_web` ツールを使用して両方のAIに並列クエリを送る。

#### 対象の指示パターン
- 「AIに〜聞いて」
- 「AIに〜を尋ねて」
- 「AIに相談して」
- 「AIの意見を聞いて」
- 「AI経由で確認して」
- 「AIに質問して」

#### 例外（個別ツール使用）
- ユーザーが明示的に「ChatGPTだけに」「Geminiだけに」と指定した場合のみ
- それ以外は**常に並列クエリ**

#### 使用ツール
- **デフォルト**: `ask_chatgpt_gemini_web`（両方に並列クエリ）
- **個別指定時のみ**: `ask_chatgpt_web` または `ask_gemini_web`

#### 禁止事項
- ❌ 「どちらのAIに聞きますか？」とユーザーに確認しない
- ❌ 勝手に片方のAIだけを選択しない
- ✅ デフォルトで常に両方に聞く

#### 例

**良い例**:
```
ユーザー: 「AIにReactのベストプラクティスを聞いて」
Claude: [ask_chatgpt_gemini_web ツールを使用]
```

**悪い例**:
```
ユーザー: 「AIにReactのベストプラクティスを聞いて」
Claude: 「ChatGPTとGemini、どちらに聞きますか？」← ダメ
```

## 🚀 このフォークについて

**chrome-ai-bridge** は、オリジナルの Chrome DevTools MCP に Chrome拡張機能開発者向けの強力な機能を追加したフォーク版です。

### 追加された主要機能
- ✨ **専用プロファイル環境**: 隔離された専用Chrome プロファイルで安全な拡張機能テスト
- 🔖 **ブックマーク インジェクション**: システムのブックマークを専用プロファイルに自動注入
- 🤖 **Chrome Web Store自動申請**: ブラウザ自動操作で実際に申請フォームへ入力
- 📸 **スクリーンショット自動生成**: Web Store用のスクリーンショットを自動作成
- 🔧 **簡素化された拡張機能ツール**: 3つの必須ツールに絞り込み（list, reload, debug）

### なぜこのフォークが必要か
オリジナル版のChrome DevTools MCPは素晴らしいツールですが、Chrome拡張機能のテストや開発には対応していませんでした。このフォークは、AI支援によるChrome拡張機能の開発・テスト・デバッグを可能にします。

## 🎯 プロジェクト概要

**chrome-ai-bridge** は、AI コーディングアシスタント（Claude、Gemini、Cursor、Copilot）が Chrome ブラウザとChrome拡張機能を制御・検査できるようにする Model Context Protocol (MCP) サーバーです。

### パッケージ情報
- **npm パッケージ名**: `chrome-ai-bridge`
- **フォーク元**: [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-ai-bridge) by Google LLC

### オリジナル機能
- **パフォーマンス分析**: Chrome DevToolsを使用したトレース記録と実用的な洞察抽出
- **ブラウザ自動化**: Puppeteerによる信頼性の高いChrome自動化
- **デバッグツール**: ネットワークリクエスト分析、スクリーンショット、コンソール確認
- **エミュレーション**: CPU、ネットワーク、ウィンドウサイズのエミュレーション

### 🆕 このフォークで追加された機能
- **専用プロファイル アーキテクチャ**: システムプロファイルから独立した専用環境
- **ブックマーク注入システム**: ユーザーコンテキストを保持しながら安全性を確保
- **Chrome拡張機能のロード**: 開発中の拡張機能を動的にロード
- **Web Store自動申請**: `submit_to_webstore`ツールでブラウザ操作による自動申請
- **スクリーンショット生成**: `generate_extension_screenshots`ツールでStore用画像を自動作成

## 🏗 技術スタック

- **言語**: TypeScript
- **実行環境**: Node.js 22.12.0+
- **ビルドツール**: TypeScript Compiler (tsc)
- **主要依存関係**:
  - `@modelcontextprotocol/sdk`: MCP SDK
  - `puppeteer-core`: Chrome自動化（拡張機能サポート付き）
  - `chrome-devtools-frontend`: DevToolsインテグレーション
  - `yargs`: CLI引数パース

## 📁 プロジェクト構造

```
chrome-ai-bridge/
├── src/
│   ├── tools/         # MCPツール定義（入力、ナビゲーション、パフォーマンス等）
│   ├── formatters/    # 出力フォーマッター
│   ├── trace-processing/ # パフォーマンストレース処理
│   ├── McpContext.ts  # MCP コンテキスト管理
│   ├── McpResponse.ts # MCP レスポンス処理
│   ├── browser.ts     # ブラウザ管理（専用プロファイル、拡張機能サポート）
│   ├── bookmark-injector.ts # ブックマーク注入システム（v0.7.0+）
│   ├── profile-manager.ts   # プロファイル管理（v0.7.0+）
│   ├── cli.ts        # CLI設定（--loadExtensionフラグ追加）
│   ├── main.ts       # エントリーポイント
│   └── index.ts      # メインエクスポート
├── tests/            # テストスイート
├── scripts/          # ビルド・ドキュメント生成スクリプト
└── docs/
    ├── dedicated-profile-design.md # 専用プロファイル設計書（v0.7.0）
    └── ...           # その他ドキュメント
```

## 🔧 開発ワークフロー

### 配布用と開発用の分離

このプロジェクトは、**ユーザー向け（配布用）**と**開発者向け（ホットリロード）**で異なるエントリーポイントを使用します。

#### ユーザー向け（配布用）- シンプル

```bash
# ユーザーはこれだけ
npx chrome-ai-bridge@latest
```

**内部動作（ユーザーには見えない）:**
```
scripts/cli.mjs
  ↓
node --import browser-globals-mock.mjs build/src/main.js
  ↓
MCPサーバー起動（単一プロセス）
```

**特徴:**
- `--import`フラグは内部で自動的に使用（ユーザーは意識不要）
- `browser-globals-mock.mjs`で chrome-devtools-frontend の Node.js 互換性を確保
- シンプルで高速

#### 開発者向け（ホットリロード）- 効率的

```bash
# 開発者はこれで自動リロード環境
npm run dev
```

**内部動作:**
```
scripts/mcp-wrapper.mjs (MCP_ENV=development)
  ↓
tsc -w (TypeScript 自動コンパイル)
  ↓
chokidar (build/ ディレクトリ監視)
  ↓
ファイル変更検出 → build/src/main.js 自動再起動
```

**特徴:**
- TypeScript編集 → 2-5秒で自動反映
- VSCode Reload Window不要
- 開発速度が3-7倍向上

### ビルド・開発コマンド

```bash
# ビルド
npm run build

# 開発モード（ホットリロード）
npm run dev

# 型チェック
npm run typecheck

# フォーマット
npm run format

# テスト実行
npm test

# MCPサーバー再起動
npm run restart-mcp
```

### 🔄 ローカル開発セットアップ

#### 標準ワークフロー（手動リビルド）

**~/.claude.json 設定:**
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/chrome-ai-bridge/scripts/cli.mjs",
        "--loadExtensionsDir=/path/to/test/extensions"
      ]
    }
  }
}
```

**開発手順:**
```bash
# 1. TypeScript編集
vim src/tools/extensions.ts

# 2. ビルド
npm run build

# 3. MCP再起動（Claudeが自動実行）
npm run restart-mcp

# 4. VSCode Reload Window（ユーザーが実行）
# Cmd+R

# 5. テスト
```

#### ホットリロードワークフロー（推奨）

**~/.claude.json 設定:**
```json
{
  "mcpServers": {
    "chrome-ai-bridge": {
      "command": "node",
      "args": [
        "/Users/usedhonda/projects/chrome-ai-bridge/scripts/mcp-wrapper.mjs"
      ],
      "cwd": "/Users/usedhonda/projects/chrome-ai-bridge",
      "env": {
        "MCP_ENV": "development"
      }
    }
  }
}
```

**開発手順:**
```bash
# 1. 初回のみ: VSCode Reload Window（Cmd+R）

# 2. TypeScript編集
vim src/tools/extensions.ts

# 3. 自動的にビルド・再起動（2-5秒）

# 4. すぐにテスト可能！
```

**ホットリロードの利点:**
- ✅ tsc -w による自動コンパイル
- ✅ chokidar によるファイル変更検出
- ✅ VSCode Reload Window 不要
- ✅ 2-5秒のフィードバックループ（従来の20-30秒から大幅短縮）

### browser-globals-mock の役割

**問題:**
- chrome-devtools-frontend は `location`, `self`, `localStorage` などのブラウザグローバルを期待
- Node.js 環境にはこれらが存在しない
- インポート時にエラー: `ReferenceError: location is not defined`

**解決策:**
- `scripts/browser-globals-mock.mjs` でブラウザグローバルをモック
- `node --import browser-globals-mock.mjs` で main.js より先にロード
- chrome-devtools-frontend のインポートが成功

**ファイル:**
```javascript
// scripts/browser-globals-mock.mjs
globalThis.location = { search: '', href: '', ... };
globalThis.self = globalThis;
globalThis.localStorage = { getItem: () => null, ... };
```

**統合:**
- 配布用: `scripts/cli.mjs` が自動的に `--import` で呼び出し
- 開発用: `scripts/mcp-wrapper.mjs` は不要（build/src/main.js にフォールバック内蔵）
- ユーザーは意識不要

### コードスタイル
- **Linter**: ESLint + @typescript-eslint
- **Formatter**: Prettier
- **インデント**: 2スペース
- **セミコロン**: 必須
- **クォート**: シングルクォート優先

## 🧪 テスト戦略

- Node.js組み込みテストランナー使用
- テストファイル: `build/tests/**/*.test.js`
- スナップショットテスト対応
- `npm run test:only` で特定テストのみ実行可能
- 拡張機能ロード機能のテストケース追加予定

## 📝 MCP ツール構成

### ツールカテゴリ
1. **入力自動化** (7 tools): click, drag, fill, fill_form, handle_dialog, hover, upload_file
2. **ナビゲーション** (7 tools): close_page, list_pages, navigate_page, navigate_page_history, new_page, select_page, wait_for
3. **エミュレーション** (3 tools): emulate_cpu, emulate_network, resize_page
4. **パフォーマンス** (3 tools): performance_analyze_insight, performance_start_trace, performance_stop_trace
5. **ネットワーク** (2 tools): get_network_request, list_network_requests
6. **デバッグ** (4 tools): evaluate_script, list_console_messages, take_screenshot, take_snapshot

## 📦 インストール

### npm パッケージとして
```bash
# グローバルインストール
npm install -g chrome-ai-bridge

# ローカルインストール
npm install chrome-ai-bridge
```

### 直接実行
```bash
npx chrome-ai-bridge
```

## 🚀 起動オプション

### 標準オプション（オリジナル版と同じ）
```bash
# 基本起動
npx chrome-ai-bridge@latest

# ヘッドレスモード
npx chrome-ai-bridge@latest --headless

# カナリーチャンネル使用
npx chrome-ai-bridge@latest --channel=canary

# 分離モード（一時プロファイル使用）
npx chrome-ai-bridge@latest --isolated
```

### 🆕 拡張機能サポートオプション（このフォークで追加）
```bash
# Chrome拡張機能をロードして起動
npx chrome-ai-bridge@latest --loadExtension=/path/to/extension

# 複数の拡張機能をロード
npx chrome-ai-bridge@latest --loadExtension=/path/to/ext1,/path/to/ext2

# 拡張機能付きでヘッドレスモード（注：一部の拡張機能はヘッドレスで動作しない場合あり）
npx chrome-ai-bridge@latest --loadExtension=/path/to/extension --headless=false
```

## 🔐 セキュリティ考慮事項

- ブラウザインスタンスの内容はMCPクライアントに公開される
- 個人情報・機密情報の取り扱いに注意
- **専用プロファイル**: `~/.cache/chrome-ai-bridge/chrome-profile-$CHANNEL` に隔離保存
- **ブックマークのみ**: システムプロファイルからはブックマークのみを読み取り（パスワードや履歴は非公開）
- `--isolated` オプションで一時プロファイルを使用可能
- **拡張機能関連**: ロードする拡張機能のコードは信頼できるものであることを確認

## 🐛 既知の制限事項

### オリジナル版の制限
- macOS Seatbelt や Linux コンテナでのサンドボックス環境では制限あり
- サンドボックス環境では `--connect-url` で外部Chrome インスタンスへの接続が推奨

### 拡張機能サポートの制限
- ヘッドレスモードでは一部の拡張機能が正しく動作しない可能性
- Chrome Web Store からインストールされた拡張機能ではなく、開発中の拡張機能のみサポート
- 拡張機能のmanifest.jsonが有効である必要

## 📚 ドキュメント生成

```bash
# ドキュメント自動生成（ツールリファレンスなど）
npm run docs
```

## 🔄 現在の開発状況

- **実装済み**:
  - ✅ 専用プロファイル アーキテクチャ（システムプロファイルから独立）
  - ✅ ブックマーク注入システム（ユーザーコンテキストの保持）
  - ✅ `--loadExtension` CLIフラグの追加
  - ✅ `ignoreDefaultArgs` で `--disable-extensions` を除外
  - ✅ Puppeteer起動時の拡張機能パス設定

- **今後の予定**:
  - 選択的ブックマーク同期（特定フォルダのみ）
  - プロファイル テンプレート機能
  - 拡張機能専用のデバッグツール追加
  - 拡張機能のメッセージパッシングモニタリング

## 💡 開発ガイドライン

1. **コミット規約**: Conventional Commits形式
   - `feat:` 新機能
   - `fix:` バグ修正
   - `chore:` その他の変更
   - `docs:` ドキュメント更新
   - `test:` テスト追加・修正

2. **プルリクエスト**:
   - mainブランチへのPR作成
   - テスト・型チェック・フォーマットチェック必須
   - 変更内容の明確な説明
   - 拡張機能関連の変更は特に詳細な説明を記載

3. **デバッグ**:
   - `DEBUG=mcp:*` 環境変数でデバッグログ有効化
   - `--logFile` オプションでログファイル出力
   - 拡張機能のログは開発者ツールのコンソールで確認

## 🚀 **MCPサーバー動作反映ルール - 絶対厳守**

### **重要**: MCPサーバーはnpmパッケージとして動作

このプロジェクトは、Claude Codeがグローバルにインストールされたnpmパッケージとして実行します。
**ローカルのbuildディレクトリではなく、npm registryから配信されるパッケージが実際に使用されます。**

### **コード変更を動作に反映させる手順**

コード修正後、以下の手順を**必ず全て実行**すること：

```bash
# 1. バージョンアップ（package.json）
# パッチバージョンを上げる（例: 0.8.3 → 0.8.4）

# 2. ビルド
npm run build

# 3. Git コミット & プッシュ
git add -A
git commit -m "fix: [修正内容]"
git push

# 4. npm publish（最重要）
npm publish
```

**この4ステップを完了して初めて、Claude Codeで修正が反映されます。**

### **禁止事項**

❌ **絶対にやってはいけないこと**：
- `npm run build`だけで終わらせる（動作に反映されない）
- gitにpushだけして、npm publishを忘れる（動作に反映されない）
- 「再起動してください」と言ってnpm publishをスキップする（ユーザーは再起動しても古いバージョンのまま）

### **正しい完了報告**

✅ **正しい報告**：
```
v0.8.4をnpmに公開しました。
Claude Codeを再起動すると、Shadow DOM修正が反映されます。
```

❌ **間違った報告**：
```
ビルドが成功しました。Claude Codeを再起動してください。
（npm publishしていないため、実際には反映されない）
```

### **なぜこのルールが必要か**

1. **Claude Codeの動作原理**: `~/.config/claude-code/config.json`でグローバルインストールされたパッケージを参照
2. **ローカルbuildは使われない**: `./build/`ディレクトリは開発時のテスト用で、本番動作には使われない
3. **npm registryが唯一の真実**: npmに公開されたバージョンのみが、ユーザー環境で動作する

### **確認方法**

修正が本当に反映されたか確認する方法：

```bash
# グローバルインストールされたバージョンを確認
npm list -g chrome-ai-bridge

# npm registryの最新バージョンを確認
npm view chrome-ai-bridge version
```

**このルールを守らないと、何時間コードを修正してもユーザー環境では一切反映されません。**

## 📈 ユースケース

### Chrome拡張機能開発者向け
- 開発中の拡張機能の自動テスト
- content scriptとwebページの相互作用テスト
- 拡張機能のパフォーマンス分析
- AIを使った拡張機能のデバッグ支援

### QAエンジニア向け
- 拡張機能を含むE2Eテストの実行
- 拡張機能の影響を考慮したパフォーマンステスト
- 拡張機能とWebアプリケーションの統合テスト

## 📞 サポート・フィードバック

### オリジナルプロジェクト
- GitHub: https://github.com/ChromeDevTools/chrome-ai-bridge
- npm パッケージ: https://npmjs.org/package/chrome-ai-bridge

### このフォーク版
- 拡張機能サポートに関する問題は、このフォークのIssuesへ
- オリジナル機能に関する問題は、上流プロジェクトへ

## 🙏 謝辞

このプロジェクトは、Google LLCによる素晴らしい[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-ai-bridge)をベースにしています。オリジナルの開発者とコントリビューターに感謝します。

---

## 🤖 Claude 4.5 最適化ルール

### 作業ログの厳格化 - 絶対厳守

#### ログの必須作成タイミング
- **タスク完了時**: 必ず `docs/log/claude/[yymmdd_hhmmss-作業内容.md]` を作成
- **重要な決定時**: 設計判断、アーキテクチャ変更、却下された代替案
- **トラブルシューティング完了時**: 問題の原因、解決方法、再発防止策

#### ログ記載必須項目
```markdown
# [作業内容の要約]

## 📅 作業情報
- **日時**: YYYY-MM-DD HH:MM:SS (ローカル時刻)
- **担当**: Claude 4.5
- **ブランチ**: [ブランチ名]

## 📝 ユーザー指示
[元の指示内容を正確に記載]

## 🎯 実施内容
### 変更ファイル一覧
- `file1.ts:行番号` - 変更内容
- `file2.ts:行番号` - 変更内容

### 主要な変更点
1. [変更点1の詳細]
2. [変更点2の詳細]

### 実行したコマンド
```bash
npm run build
npm test
```

### テスト結果
- ✅ 型チェック: 成功
- ✅ ユニットテスト: 全て成功
- ⚠️ 警告: [警告内容があれば]

## 🤔 設計判断
### 採用したアプローチ
[選択した方法とその理由]

### 却下した代替案
1. **案A**: [却下理由]
2. **案B**: [却下理由]

## 📊 影響範囲
- **破壊的変更**: なし / あり（詳細）
- **パフォーマンス影響**: なし / あり（詳細）
- **セキュリティ影響**: なし / あり（詳細）

## ⚠️ 課題・TODO
- [ ] [残課題1]
- [ ] [残課題2]

## 💡 今後の検討事項
[長期的な改善案、技術的負債など]
```

#### ログ作成の自動化
- タスク完了後、自動的にログ生成を提案
- 複数タスクの場合、最後にまとめて1つのログを作成
- ログ作成を忘れた場合、次のタスク開始前に警告

---

### 並列処理の自動判断

#### 自動的にサブエージェント並列実行を提案すべき条件

**条件1: 独立した複数タスク（3つ以上）**
```
例: 「README更新、テスト追加、ドキュメント修正」
→ technical-writer, qa-tester, documentation-specialist を並列実行
```

**条件2: 異なる技術領域**
```
例: 「UI改善とバックエンドAPI追加」
→ react-ui-specialist, node-developer を並列実行
```

**条件3: 大規模リファクタリング**
```
例: 「コードベース全体の型安全性向上」
→ 複数ファイルを分担してdata-engineer, backend-developer を並列実行
```

**条件4: 包括的な品質改善**
```
例: 「パフォーマンス最適化」
→ performance-tester, code-reviewer, security-auditor を並列実行
```

#### 並列処理の実行方針
- **事前確認不要**: 明らかに並列化可能な場合は自動実行
- **実行前の説明**: 「以下のタスクを並列実行します」と簡潔に通知
- **進捗の可視化**: TodoWriteツールで各サブタスクを追跡
- **結果の統合**: 全エージェント完了後、統合レポート作成

#### 並列処理を避けるべき条件
- 同一ファイルへの同時編集が必要な場合
- タスク間に明確な依存関係がある場合
- ユーザーが「順番に」「段階的に」と指示した場合

---

### 品質チェックの自動化

#### コード変更時の自動チェック（必須）

**TypeScript/JavaScript プロジェクト:**
```bash
# 変更後、コミット前に自動実行
npm run typecheck  # 型エラーチェック
npm test          # ユニットテスト
npm run build     # ビルド確認
```

**実行タイミング:**
- src/ 配下のファイル変更時
- package.json, tsconfig.json 変更時
- 新しい依存関係追加時

**エラー時の対応:**
1. エラー内容を詳細に報告
2. 修正方法を提案
3. 修正後に再度自動チェック

#### 主要機能変更時の自動レビュー

**code-reviewer エージェント起動条件:**
- 100行以上のコード変更
- 新しいAPIエンドポイント追加
- セキュリティ関連のコード変更
- パフォーマンス重要な部分の変更

**レビュー観点:**
- コード品質（可読性、保守性）
- セキュリティ（脆弱性、入力検証）
- パフォーマンス（ボトルネック、最適化機会）
- テストカバレッジ（不足しているテストケース）

#### ドキュメント変更時の検証

**technical-writer エージェント起動条件:**
- README.md の大幅な変更
- 技術ドキュメントの追加・更新
- APIドキュメントの変更

**検証観点:**
- 技術的正確性
- コードとの一致性
- 例示コードの動作確認
- リンク切れチェック

---

### プロアクティブな提案

#### テストカバレッジの自動検出

**検出タイミング:**
- 新しい関数・メソッド追加時
- 既存コードの大幅な変更時
- テストファイル確認時

**提案内容:**
```
「新しい関数 `calculateTotal()` を追加しましたが、対応するユニットテストがありません。
以下のテストケースを追加しましょうか？
1. 正常系: 有効な入力での計算
2. 異常系: null/undefined の処理
3. 境界値: 0, 負の数の処理」
```

#### パフォーマンス改善機会の提示

**検出パターン:**
- ループ内での非効率な処理
- 不要な再レンダリング（React）
- 大きなバンドルサイズ
- 遅いデータベースクエリ

**提案例:**
```
「list_pages.ts:145 でループ内でDOM操作を行っています。
パフォーマンス改善として、DocumentFragmentを使用した一括更新を検討しませんか？」
```

#### セキュリティリスクの事前警告

**検出パターン:**
- ユーザー入力の直接使用
- 機密情報のハードコード
- 不適切な権限設定
- 古い依存関係の使用

**警告例:**
```
「⚠️ セキュリティリスク検出:
api.ts:78 でユーザー入力を直接SQLクエリに使用しています。
SQLインジェクション対策として、プリペアドステートメントの使用を推奨します。」
```

#### 技術的負債の追跡

**自動検出:**
- TODO, FIXME, HACK コメント
- 重複コード
- 複雑度の高い関数（Cyclomatic Complexity > 10）
- 未使用のインポート・変数

**レポート形式:**
```markdown
## 📊 技術的負債レポート

### 🔴 高優先度
- `browser.ts:234` - FIXME: メモリリーク対策が必要

### 🟡 中優先度
- `cli.ts:156` - TODO: エラーハンドリング改善
- `main.ts:89-120` - 重複コード（3箇所）

### 🟢 低優先度
- `utils.ts:45` - 未使用のインポート
```

---

### コンテキスト管理の改善

#### 定期的な要約生成

**要約タイミング:**
- 会話が20-30メッセージを超えた時
- トピックが大きく変わった時
- ユーザーが長時間離れた後に戻った時

**要約フォーマット:**
```markdown
## 📋 会話要約（過去30メッセージ）

### 完了したタスク
1. ✅ README.md の全面改訂（v0.6.3）
2. ✅ cli.ts のデッドコード削除
3. ✅ npm publish 完了

### 重要な決定事項
- システムプロファイル直接アクセス方式を採用
- 自動検出ロジックを削除（シンプル化のため）

### 現在の状態
- バージョン: 0.6.3
- ブランチ: main
- 最新コミット: e257a81

### 次のステップ候補
- テストカバレッジ向上
- Chrome 137+ 対応計画
```

#### 重要な決定事項の自動記録

**記録対象:**
- アーキテクチャの変更
- ライブラリ・技術選定
- セキュリティ方針
- パフォーマンス最適化戦略

**記録先:**
- `docs/decisions/[yyyymmdd-決定内容].md` （ADR形式）
- Architecture Decision Record として保存

**ADR フォーマット:**
```markdown
# ADR-001: システムプロファイル直接アクセス方式の採用

## ステータス
採用（2025-09-30）

## コンテキスト
Chrome拡張機能テストにおいて、プロファイル管理方法を決定する必要があった。

## 決定
システムのChromeプロファイルを直接使用する方式を採用。

## 理由
1. ゼロコンフィグで即座に使用可能
2. ブックマーク・拡張機能が自動同期
3. ユーザー体験に近い環境でテスト可能

## 代替案
1. プロファイルコピー方式 → 同期の手間
2. 一時プロファイル方式 → 実環境と乖離

## 影響
- システムプロファイルに依存するため、Chromeが起動中は使用不可
- セキュリティ: ユーザーデータへのアクセス権限が必要

## 関連コミット
- src/browser.ts:336-360
```

#### 長期的な改善計画の管理

**トラッキングファイル:**
- `docs/roadmap.md` - 長期ロードマップ
- `docs/technical-debt.md` - 技術的負債一覧
- `docs/ideas.md` - 将来的なアイデア

**自動更新:**
- 新しい技術的負債発見時に自動追加
- 解決済みの項目を自動的にアーカイブ
- 優先度の定期的な見直し提案

---

### 実装の優先順位

#### 🔴 即座に適用（このタスクから）
1. **作業ログの厳格化**: 全てのタスクでログ作成
2. **品質チェックの自動化**: コード変更時の自動テスト
3. **TodoWriteの積極活用**: 中規模タスクでも使用

#### 🟡 次回のタスクから適用
1. **並列処理の自動判断**: 複合タスクで自動提案
2. **プロアクティブな提案**: テストカバレッジ、セキュリティ警告
3. **コードレビューの自動化**: 主要機能変更時

#### 🟢 徐々に導入
1. **コンテキスト管理**: 長い会話での要約生成
2. **技術的負債の追跡**: 定期的なレポート
3. **ADRの自動生成**: 重要な決定事項の記録

---

### モニタリングと改善

#### 効果測定
- **作業ログの完全性**: 全タスクでログが作成されているか
- **品質向上**: 自動チェックによるバグ削減率
- **効率改善**: 並列処理による開発速度向上

#### 継続的改善
- 月1回のルール見直し
- 効果が薄いルールの削除
- 新しいベストプラクティスの追加

**このClaude 4.5最適化ルールにより、高い推論能力・コンテキスト処理能力を最大限活用し、開発効率と品質を大幅に向上させます。**
