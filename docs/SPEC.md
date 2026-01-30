# chrome-ai-bridge 接続仕様

## 概要

chrome-ai-bridge は、MCPサーバーとChrome拡張機能を連携させて、ChatGPT/Gemini の Web UI を自動操作するツールです。

## アーキテクチャ

```
┌─────────────────┐     HTTP      ┌──────────────────┐    WebSocket    ┌─────────────────┐
│  Claude Code    │ ─────────────▶│   MCP Server     │◀───────────────▶│ Chrome Extension│
│  (MCP Client)   │               │  (Node.js)       │                 │  (Service Worker)│
└─────────────────┘               └──────────────────┘                 └─────────────────┘
                                           │                                    │
                                           │                                    ▼
                                           │                            ┌─────────────────┐
                                           │                            │  Chrome Tab     │
                                           │                            │  (ChatGPT/Gemini)│
                                           └────────────────────────────┴─────────────────┘
```

## 接続フロー

### 1. MCPサーバー起動

MCPサーバーは起動時に以下を行う:

1. **relay-info HTTPサーバー起動** (ポート: 19222-19250 の空きポート)
2. **WebSocketサーバー起動** (relay-info と同一ポート)
3. Chrome拡張機能からの接続を待機

### 2. Chrome拡張機能の接続

Chrome拡張機能は **受動モード** で動作する:

- **自発的なタブオープンは行わない**
- MCPサーバーからの明示的なリクエスト時のみ動作
- 既存のChatGPT/Geminiタブがあれば再利用

### 3. ツール呼び出し時の動作

`ask_chatgpt_web` / `ask_gemini_web` / `ask_chatgpt_gemini_web` 呼び出し時:

```
1. MCP Server: relay-info エンドポイントを更新
   - tabUrl: "https://chatgpt.com/" or "https://gemini.google.com/"
   - question: ユーザーの質問

2. Extension: relay-info をポーリングで検出
   - GET http://localhost:{port}/relay-info

3. Extension: 対象タブの取得
   a. 既存タブがあれば再利用
   b. なければ新規タブを作成

4. Extension: CDP経由で質問を入力・送信

5. Extension: 回答完了を検出

6. Extension: WebSocket経由で結果を返却

7. MCP Server: 結果をMCPクライアントに返却
```

## 受動モードの仕様

### 背景

v1.1.17以前は、拡張機能が自発的にChatGPT/Geminiタブを開いていた。これにより:
- ユーザーが意図しないタブが開く
- リソースの無駄遣い
- BAN リスクの増大

### 現在の動作 (v1.1.18+)

1. **拡張機能ロード時**: 既存のアラームをクリア（残存アラーム対策）
2. **自動タブオープン**: 完全に削除
3. **タブ作成トリガー**: MCPツール呼び出し時のみ

### コード変更点

```javascript
// v1.1.19: 既存アラームのクリア
chrome.alarms.clear(DISCOVERY_ALARM);

// アラームリスナーは削除（受動モードでは不要）
// scheduleDiscovery() はアラームを作成しない
```

## タブ管理

### 既存タブの再利用条件

1. **ChatGPT**: `https://chatgpt.com/*` にマッチするタブ
2. **Gemini**: `https://gemini.google.com/*` にマッチするタブ
3. タブが「正常な状態」であること（ログイン済み、エラーなし）

### 新規タブ作成のトリガー

- 既存タブが存在しない場合
- 既存タブがログイン画面の場合
- 既存タブがエラー状態の場合

### タブ管理の実装

```javascript
// 既存タブの検索
const existingTabs = await chrome.tabs.query({
  url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
});

// 再利用可能なタブがあれば使用
if (existingTabs.length > 0) {
  return existingTabs[0];
}

// なければ新規作成
return await chrome.tabs.create({ url: 'https://chatgpt.com/' });
```

## エラーハンドリング

### 接続失敗時の動作

| エラー種別 | 動作 |
|-----------|------|
| relay-info 接続失敗 | リトライ（最大120回 × 500ms） |
| WebSocket 切断 | 自動再接続を試行 |
| タブ作成失敗 | エラーを返却（再試行しない） |
| CDP 接続失敗 | タブを閉じて再作成 |

### タイムアウト処理

- **質問送信**: 30秒でタイムアウト
- **回答待機**: 120秒でタイムアウト
- **接続確立**: 60秒でタイムアウト

## relay-info エンドポイント

### リクエスト

```
GET http://localhost:{port}/relay-info
```

### レスポンス

```json
{
  "wsUrl": "ws://localhost:{port}",
  "tabUrl": "https://chatgpt.com/",
  "question": "TypeScriptの型ガードの書き方を教えて",
  "newTab": false
}
```

### フィールド説明

| フィールド | 説明 |
|-----------|------|
| `wsUrl` | WebSocket 接続先URL |
| `tabUrl` | 操作対象のURL（ChatGPT/Gemini） |
| `question` | 送信する質問文 |
| `newTab` | 新規タブ作成を強制するか |

## セキュリティ考慮事項

1. **ローカルホストのみ**: relay-info は `127.0.0.1` でのみリッスン
2. **認証なし**: ローカル環境のため認証は実装していない
3. **機密情報**: 質問内容にAPIキーや認証情報を含めないこと

## トラブルシューティング

### タブが勝手に開く

1. Chrome拡張機能を更新（v1.1.19以上）
2. `chrome://extensions/` で拡張機能を再読み込み
3. 既存のアラームがクリアされる

### 接続が確立されない

1. MCPサーバーが起動しているか確認
2. ポート 19222-19250 が使用可能か確認
3. Chrome拡張機能が有効か確認

### 回答が取得できない

1. ChatGPT/Geminiにログイン済みか確認
2. ブラウザのコンソールでエラーを確認
3. レート制限に達していないか確認
