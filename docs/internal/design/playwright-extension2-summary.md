# Playwright MCP extension2 調査メモ（複数タブ対応版）

## 対象
- リポジトリ: `/Users/usedhonda/projects/public/playwright-mcp`
- パッケージ: `packages/extension2`
- 主なファイル:
  - `manifest.json`
  - `lib/background.mjs`
  - `connect.html` / `status.html` / `lib/ui/*.js`

## 目的
- Playwright MCP の Extension Bridge（extension2）の全体像と、複数タブ対応の仕組みを把握
- chrome-ai-bridge に移植する際の要点を抽出

---

## 1. 全体アーキテクチャ

```
MCP Client (Playwright MCP)
  ↕ WebSocket (localhost, token)
Extension (background.mjs)
  ↕ chrome.debugger (tabId + sessionId)
Chrome Tab(s)
```

- **RelayServerはMCP側**（Playwright MCP）で起動し、Extensionがそれに接続。
- Extension側は **タブ選択UI** を持ち、複数タブを管理。
- Extensionは **chrome.debugger** による CDP 中継のみを担当。
- Target.* の emulationはしておらず、**Playwright側のプロトコルに合わせた中継**のみ。

---

## 2. 主要クラス構成（background.mjs）

### RelayConnection
- **WebSocket 1本 = タブ1つ** の接続単位
- chrome.debugger.onEvent / onDetach を購読
- 受信メッセージは2種類:
  - `attachToTab`: debugger attach + Target.getTargetInfo を返す
  - `forwardCDPCommand`: CDPコマンドを chrome.debugger に投げる

**要点**
- CDPイベントは `forwardCDPEvent` としてそのままMCPへ送る
- `sessionId` は chrome.debugger が返すものを**そのまま上流へ**流す（独自生成なし）

### TabShareExtension
- 接続管理
  - `_activeConnections`: tabId → RelayConnection
  - `_pendingTabSelection`: UI（選択タブ）からの待ち合わせ
- UI連携
  - `connect.html` / `status.html` からの `runtime.onMessage`
- 複数タブ対応
  - active/pending の状態を分離
  - バッジ更新（接続状態表示）

---

## 3. メッセージプロトコル（Extension ↔ MCP）

### Extension → MCP
- `forwardCDPEvent`
  - `{sessionId, method, params}`
- `response`
  - `{id, result}` or `{id, error}`

### MCP → Extension
- `attachToTab`
  - UIで選ばれた tabId で chrome.debugger.attach
  - `Target.getTargetInfo` を返す
- `forwardCDPCommand`
  - `{sessionId, method, params}` をそのまま chrome.debugger.sendCommand

**重要**
- Target.* の shim は不要。**CDPのセッション管理はPlaywright側が完全に担う**

---

## 4. UIフロー（タブ選択）

- `connect.html`
  - MCP relay URL へ接続
  - タブ一覧取得 → 選択
- `status.html`
  - 現在接続中のタブを表示
- UIメッセージ
  - `connectToMCPRelay`
  - `getTabs`
  - `connectToTab`
  - `disconnect`

---

## 5. extension2 のポイント（なぜ安定するか）

- **Target.* の再実装をしない**
- **sessionId を偽装しない**
- chrome.debugger が返すセッションをそのまま流す
- タブ選択・管理を Extension側に閉じている
- MCP側が「Target管理の責務」を持つ

---

## 6. chrome-ai-bridge への移植時の要点

### 必須
- Target.* emulation の撤廃（最小化）
- `forwardCDPCommand` を Playwright式（sessionId保持）に合わせる
- `attachToTab` の明示コマンド設計
- Extension UI / 状態管理の整理

### 推奨
- MCP側の `pages.list` を使わず、**Extension選択タブを唯一のターゲット**とする
- `Target.getTargetInfo` は attach 直後に実行
- `sessionId` は chrome.debugger の値をそのまま利用

---

## 7. 移植の初期タスク（提案）

1. Extension側に `attachToTab` / `forwardCDPCommand` 方式を導入
2. MCP側 `ExtensionTransport` を Playwright互換プロトコルに切替
3. Target shim を廃止または無効化
4. Tab UI を Playwright extension2 方式に近づける

---

## 参考
- `packages/extension2/lib/background.mjs`
- `packages/extension2/connect.html`
- `packages/extension2/status.html`

