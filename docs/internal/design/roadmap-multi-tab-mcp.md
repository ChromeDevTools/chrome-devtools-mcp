# Roadmap: A/B 並行方針 (ChatGPT+Gemini 高速化)

## 目的
- ChatGPT と Gemini へ同時に高速問い合わせできる構成を作る。
- まずは安定性重視で **A: 2プロセス運用** を確実化し、その後 **B: 1プロセス統合** を実現する。

---

## A: 2プロセス運用 (即時安定)

### ゴール
- `chrome-ai-bridge` を2プロセス起動し、
  - プロセス1: ChatGPT タブ専用
  - プロセス2: Gemini タブ専用
- それぞれ独立に MCP 接続・送受信が可能。

### 必要タスク
1. **ポート分離**
   - RelayServer と Discovery のポートを起動時に指定可能にする。
   - 例: ChatGPT側=8765/9001, Gemini側=8766/9002 など。
2. **起動手順の固定化**
   - 2プロセスの起動コマンドを明記し、競合しない設定テンプレを用意。
3. **拡張接続の安定化**
   - extension がそれぞれ正しい relay に接続できるよう、
     UI/auto-discovery の URL パラメータを厳密に管理。
4. **運用記録**
   - ChatGPT/Gemini 各プロセスの状態・ログ収集フローを決める。

### 推奨: 2プロセス起動テンプレ
※ extension 側の自動Discovery(8765固定)が競合するため、**Discoveryは無効化**し手動接続で運用する。

ChatGPT 用:
```
MCP_EXTENSION_DISCOVERY_DISABLED=1 \
node scripts/cli.mjs \
  --attachTabUrl=https://chatgpt.com/ \
  --attachTabNew \
  --extensionRelayPort=9001
```

Gemini 用:
```
MCP_EXTENSION_DISCOVERY_DISABLED=1 \
node scripts/cli.mjs \
  --attachTabUrl=https://gemini.google.com/ \
  --attachTabNew \
  --extensionRelayPort=9002
```

接続方法:
- 各プロセスのログに出る `Connection URL (ws://127.0.0.1:PORT?token=...)` を控える
- それぞれのタブで `chrome-extension://<EXTENSION_ID>/ui/connect.html` を開き、
  Relay URL を貼り付けて接続

### 成果物
- 2プロセス起動手順ドキュメント
- デフォルト設定ファイル or 起動スクリプト

---

## B: 1プロセス統合 (最終形)

### ゴール
- 1つの `chrome-ai-bridge` が **同時に2タブ接続** し、
  ChatGPT/Gemini を並列で送受信できる。

### 必要タスク
1. **RelayServer のマルチ接続化**
   - ws を1本だけでなく、複数タブ接続を保持可能にする。
2. **セッション/タブ管理**
   - タブID・sessionId をキーに分離してCDPを転送。
3. **MCPツールのスコープ化**
   - `chatgpt.*` / `gemini.*` のように送信先タブを明示。
4. **pages.list の再設計**
   - “常に1件”ではなく、複数タブを同時に返す。
5. **負荷制御**
   - 大量イベント転送のフィルタリング/バックプレッシャー設計。

### 成果物
- マルチタブ対応設計書
- 1プロセスで2タブ同時利用できるMCP実装

---

## 進行順序
1. Aを完成させて **安定に同時問い合わせ** を成立させる
2. 並行してBの設計と試験を進める
3. Bが十分安定したら A運用から移行
