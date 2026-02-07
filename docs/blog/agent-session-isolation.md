# Agent Teams と セッション分離 — 並行エージェントの衝突を防ぐ

> chrome-ai-bridge が Agent Teams（複数の Claude Code エージェントの並行動作）をサポートするに至った技術的背景と、セッション分離の設計について。

---

## なぜセッション分離が必要だったのか

chrome-ai-bridge は、Chrome ブラウザ上の ChatGPT / Gemini に質問を送り、回答を取得する MCP サーバーです。通常は1つのエージェントが1つの MCP サーバーに接続して使用します。

しかし、Claude Code には **Agent Teams** という機能があります。

### Agent Teams とは

Agent Teams は、複数の Claude Code エージェントがチームとして並行動作する仕組みです。リーダーが `TeamCreate` でチームを作成し、`Task` ツールで子プロセスを spawn する。各エージェントは独立したプロセスとして動作し、タスクリストで作業を分担します。

```
Team Lead (親プロセス)
  ├── Researcher (子プロセス)
  ├── Implementer (子プロセス)
  └── Tester (子プロセス)
```

ここで問題になるのが、**全エージェントが同じ MCP サーバーに接続する** という点です。

### 衝突の具体例

V1（プロジェクト名ベースのセッション管理）では、こんなことが起きていました:

```
1. Agent A が ChatGPT に質問 → セッション保存: sessions.projects["my-project"].chatgpt = { url: "chat/abc" }
2. Agent B が ChatGPT に質問 → セッション上書き: sessions.projects["my-project"].chatgpt = { url: "chat/xyz" }
3. Agent A が次の質問を送信 → chat/xyz に送られる（Agent B のセッション！）
```

同一プロジェクト内の複数エージェントが同じキー（`projects["my-project"]`）を共有しているため、最後に書いたエージェントのセッションが勝つ（last-write-wins）。Agent A の会話コンテキストが破壊されます。

---

## 調査: Agent Teams の仕組み

### エージェントの起動フロー

```
TeamCreate (チーム定義)
  └── Task tool (subagent spawn)
        └── 子プロセス起動
              └── MCP サーバーに接続
                    └── initialize リクエスト送信
```

各子エージェントは **独立した OS プロセス** です。MCP プロトコルの `initialize` リクエストでサーバーに接続し、クライアント名（例: `"claude-code"`）を通知します。

### 識別の課題

問題は、複数エージェントが同じクライアント名で接続してくること。MCP プロトコル自体にはエージェントの固有 ID を伝える標準的な仕組みがありません。

---

## V1 の問題点

V1 のセッションストアは以下の構造でした:

```json
{
  "projects": {
    "my-project": {
      "chatgpt": { "url": "https://chatgpt.com/c/abc123" },
      "gemini": { "url": "https://gemini.google.com/app/xyz789" }
    }
  }
}
```

| 問題 | 説明 |
|------|------|
| 同一プロジェクト内の区別不可 | キーがプロジェクト名のみ |
| Last-write-wins | 複数エージェントが同じキーに書き込む |
| セッション漏洩 | Agent A のリクエストが Agent B のチャットに送られる |

単一エージェントの利用では顕在化しませんが、Agent Teams を使った瞬間に破綻します。

---

## V2 の設計

### コアコンセプト: エージェント単位の分離

```json
{
  "version": 2,
  "agents": {
    "claude-code-12345": {
      "lastAccess": "2026-02-07T10:00:00.000Z",
      "chatgpt": { "url": "https://chatgpt.com/c/abc123", "tabId": 1 },
      "gemini": null
    },
    "claude-code-12346": {
      "lastAccess": "2026-02-07T10:01:00.000Z",
      "chatgpt": { "url": "https://chatgpt.com/c/def456", "tabId": 2 },
      "gemini": { "url": "https://gemini.google.com/app/xyz789" }
    }
  },
  "config": {
    "sessionTtlMinutes": 30,
    "maxAgents": 10
  }
}
```

キーが `projects[projectName]` から `agents[agentId]` に変わっただけ — シンプルですが、これで各エージェントが完全に独立したセッションを持てます。

### Agent ID の生成戦略

Agent ID はハイブリッド方式で生成します（`agent-context.ts:generateAgentId()`）:

| 優先度 | 方法 | 生成される ID | ユースケース |
|--------|------|-------------|-------------|
| 1 | `CAI_AGENT_ID` 環境変数 + PID | `my-agent-12345` | 明示的な制御が必要な場合 |
| 2 | MCP クライアント名 + PID | `claude-code-12345` | 通常の Agent Teams 利用 |
| 3 | フォールバック | `agent-12345-1707300000000` | クライアント名が不明な場合 |

PID を含めることで、同一マシン上の複数プロセスが一意に区別されます。

### TTL による自動クリーンアップ

エージェントプロセスは終了しても、セッションファイルにエントリが残ります。放置するとエントリが際限なく増える。

解決策は TTL（Time To Live）:

- 各セッションに `lastAccess` タイムスタンプを記録
- API 呼び出しのたびに `lastAccess` を更新
- TTL 超過（デフォルト30分）のセッションは自動削除

```
Agent A が質問 → lastAccess 更新 → TTL リセット
  ... 30分経過 ...
次の cleanupStaleSessions() 呼び出しで Agent A のエントリ削除
```

### maxAgents 制限

同時に存在できるエージェントセッション数を制限（デフォルト10）。上限超過時は最も古い `lastAccess` のエントリから削除します。

### V1 → V2 自動マイグレーション

V1 形式のセッションファイルが検出された場合、自動的に V2 に変換します:

```
V1: projects["my-project"] → V2: agents["legacy-my_project"]
```

プロジェクト名に `legacy-` プレフィックスを付け、安全でない文字を `_` に置換。既存ユーザーはセッションファイルの手動編集不要で、そのまま V2 に移行できます。

---

## 実装のポイント

### ファイル構成

| ファイル | 役割 |
|---------|------|
| `src/fast-cdp/agent-context.ts` | Agent ID 生成、接続状態管理（`AgentConnection`） |
| `src/fast-cdp/session-manager.ts` | V2 セッション永続化、V1 マイグレーション、TTL クリーンアップ |
| `src/config.ts` | 環境変数からのセッション設定読み込み（`> 0` バリデーション） |
| `src/fast-cdp/fast-chat.ts` | V2 セッション API を使用したタブ管理 |
| `src/main.ts` | MCP initialize 時に Agent ID 生成・設定 |

### agent-context.ts — 接続状態の分離

各エージェントは `AgentConnection` オブジェクトを持ちます:

```typescript
interface AgentConnection {
  chatgptClient: CdpClient | null;
  geminiClient: CdpClient | null;
  chatgptRelay: RelayServer | null;
  geminiRelay: RelayServer | null;
  lastAccess: Date;
}
```

CDP クライアントと RelayServer のインスタンスがエージェントごとに独立。Agent A の ChatGPT 接続と Agent B の ChatGPT 接続は完全に別物です。

### config.ts — 環境変数バリデーション

```typescript
sessionTtlMinutes: raw.ttl > 0 ? raw.ttl : 30,
maxAgents: raw.max > 0 ? Math.floor(raw.max) : 10,
```

`> 0` チェックにより、`NaN`、`0`、負数はすべてデフォルト値にフォールバックします。`maxAgents` は `Math.floor()` で小数を切り捨て。

### main.ts — 起動時の Agent ID 設定

```typescript
const agentId = generateAgentId();
setAgentId(agentId);
```

MCP サーバーの起動直後、最初のリクエストを処理する前に Agent ID を確定させます。以降のすべてのセッション操作はこの ID に紐づきます。

---

## 残課題

| 課題 | 状況 | 影響 |
|------|------|------|
| `history.jsonl` の Agent 対応 | 未対応 | 全エージェントの履歴が混在して記録される |
| RelayServer のエージェント間分離 | 各エージェントが独立インスタンスを保持（実装済み） | ポート数の増加 |

`history.jsonl` は現状、Agent ID を記録していません。Agent Teams 利用時に「どのエージェントがどの質問をしたか」をログから追跡するには、今後の対応が必要です。

---

## まとめ

> **同じ MCP サーバーでも、エージェントは混ざらない。**

Agent Teams で複数の Claude Code エージェントが並行動作するとき、各エージェントが独立した ChatGPT / Gemini セッションを持つ必要がある。V2 のセッション分離は、キーをプロジェクト名からエージェント ID に変えるというシンプルな設計変更で、この問題を解決しました。

TTL と maxAgents による自動クリーンアップ、V1 からの自動マイグレーション、環境変数による設定 — 既存ユーザーへの影響をゼロに抑えつつ、Agent Teams という新しいユースケースに対応しています。
