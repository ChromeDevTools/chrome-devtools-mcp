# Escキャンセル後にMCPが使えなくなる問題の修正計画

## 問題の概要

ユーザーがEscでタスクをキャンセルすると、その後MCPが使えなくなる。

## 根本原因

調査の結果、以下の問題が特定されました：

### 1. `disconnect`イベントでの過剰なシャットダウン（主因）

**ファイル**: `src/graceful.ts:145`

```typescript
process.on('disconnect', () => gracefulExit('disconnect'));
```

**問題**: Claude CodeがEscでキャンセルすると：
1. stdin/stdoutが閉じられる
2. MCPサーバーが`disconnect`イベントを受信
3. `gracefulExit()`が呼ばれて`process.exit(0)`で終了
4. MCPプロセス自体が死ぬ → 接続喪失

### 2. コンテキストが無効化されない

**ファイル**: `src/main.ts:120`

```typescript
let context: McpContext;  // モジュールレベル変数
```

**問題**: ブラウザが閉じられても`context`がリセットされない。次回のツール呼び出しで死んだブラウザ参照を使おうとしてエラー。

### 3. CDP接続のクリーンアップ不足

**ファイル**: `src/McpContext.ts`

`gracefulExit`時に`reinitializeCDP()`が呼ばれず、CDPセッションが残存。

## 修正方針

### 方針A: `disconnect`イベントを無視する（推奨）

MCPサーバーはstdin/stdoutが閉じられても**終了しない**。
- SIGINT/SIGTERMは引き続きgracefulExitをトリガー
- `disconnect`（親プロセス切断）は無視
- ブラウザは次回のツール呼び出し時に必要に応じて再起動

**理由**: Claude Codeは複数のMCPツール呼び出しを行う可能性があり、1回のキャンセルでサーバーを終了させるのは過剰。

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/graceful.ts:145` | `disconnect`イベントハンドラを削除またはログのみに変更 |

## 実装詳細

### graceful.ts 修正

```typescript
// 変更前
process.on('disconnect', () => gracefulExit('disconnect'));

// 変更後（ログのみ、終了しない）
process.on('disconnect', () => {
  logger('[graceful] Parent process disconnected (ignored - MCP server continues)');
});
```

## 期待される動作

```
[ユーザー] Esc キー押下
    ↓
[Claude Code] 現在のタスクをキャンセル
    ↓
[MCP Server] 'disconnect'イベント受信 → ログ出力のみ（終了しない）
    ↓
[ユーザー] 次のタスクを依頼
    ↓
[MCP Server] 正常に動作継続
```

## 検証方法

1. Claude Codeで`ask_chatgpt_web`などのブラウザ操作ツールを実行
2. 実行中にEscでキャンセル
3. 再度MCPツールを呼び出して正常に動作することを確認

## リスク評価

- **低リスク**: `disconnect`イベントは親プロセス切断時にのみ発火
- SIGINT/SIGTERMによる明示的な終了シグナルは引き続き正常に処理
- ブラウザプロセスは必要に応じて再起動される（既存の再接続ロジック）
