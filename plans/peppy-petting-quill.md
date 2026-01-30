# Chrome拡張機能 接続切断問題の調査と改善案

## 問題

Chrome拡張機能（chrome-ai-bridge）との接続が頻繁に切れ、手動リロードが必要になる。

## 原因分析

### 🔴 主原因: Chrome Service Workerのライフサイクル

**ファイル**: `src/extension/manifest.json:10`

Chrome Manifest V3のService Workerは、**約5分間の非アクティブ後に自動停止**される。

```json
"background": {
  "service_worker": "background.mjs",
  "type": "module"
}
```

**影響**:
- メッセージハンドラーがガベージコレクション
- `chrome.debugger`接続が切断
- WebSocketは`OPEN`を報告するが、実際は「ゾンビ」状態

### 🔴 Keep-Aliveメカニズムの欠如

**ファイル**: `src/extension/relay-server.ts:107-125`

WebSocket接続にハートビート/ping-pongがない。

### 🟡 再接続後のみの健全性チェック

**ファイル**: `src/fast-cdp/fast-chat.ts:320-346`

健全性チェックは`getClient()`呼び出し時のみ。長時間操作中に接続が切れても検出されない。

### 🟡 接続切断時の自動再接続なし

**ファイル**: `src/extension/relay-server.ts:113-118`

```typescript
ws.on('close', () => {
  this.ws = null;
  this.ready = false;
  // 再接続ロジックなし
});
```

## タイムアウト設定一覧

| 場所 | 値 | 用途 |
|------|-----|------|
| `relay-server.ts:243` | 30秒 | CDPリクエストタイムアウト |
| `fast-chat.ts:42` | 2秒 | 健全性チェック |
| `extension-raw.ts:157` | 10秒 | 拡張機能接続待ち |
| `background.mjs:294` | 5秒 | WebSocketオープン待ち |
| `background.mjs:514` | 30秒 | 非アクティブタブのクリーンアップ |

---

## 改善案（難易度順）

### 案1: Keep-Alive実装（推奨・中難易度）

**効果**: ★★★★☆（Service Worker停止を防止）

**修正ファイル**:
- `src/extension/relay-server.ts` - サーバー側ping送信
- `src/extension/background.mjs` - クライアント側pong応答

**実装**:
```typescript
// relay-server.ts に追加
private startKeepAlive() {
  this.keepAliveTimer = setInterval(() => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000); // 30秒ごと
}
```

```javascript
// background.mjs に追加
_onMessage(event) {
  const msg = JSON.parse(event.data);
  if (msg.type === 'ping') {
    this._ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }
  // 既存処理...
}
```

**工数**: 2-3時間

---

### 案2: chrome.alarms による定期ウェイクアップ（低難易度）

**効果**: ★★★☆☆（Service Worker再起動の補助）

**修正ファイル**:
- `src/extension/manifest.json` - alarms権限追加
- `src/extension/background.mjs` - アラームハンドラー追加

**実装**:
```json
// manifest.json
"permissions": ["alarms", ...]
```

```javascript
// background.mjs
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // WebSocket接続状態をチェック、必要なら再接続
  }
});
```

**工数**: 1時間

---

### 案3: 自動再接続ロジック強化（中難易度）

**効果**: ★★★☆☆（切断後のリカバリー改善）

**修正ファイル**:
- `src/extension/relay-server.ts` - 再接続ロジック追加

**実装**:
```typescript
ws.on('close', () => {
  this.ws = null;
  this.ready = false;
  // 新規: 自動再接続（指数バックオフ）
  this.scheduleReconnect();
});

private scheduleReconnect(attempt = 1) {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
  setTimeout(() => this.attemptReconnect(attempt + 1), delay);
}
```

**工数**: 2-3時間

---

### 案4: 定期的な健全性チェック（低難易度）

**効果**: ★★☆☆☆（問題の早期検出）

**修正ファイル**:
- `src/fast-cdp/fast-chat.ts`

**実装**:
```typescript
// 接続作成後、定期チェック開始
setInterval(async () => {
  if (chatgptClient && !(await isConnectionHealthy(chatgptClient, 'chatgpt'))) {
    chatgptClient = null;
    console.log('[fast-cdp] ChatGPT connection unhealthy, will reconnect on next use');
  }
}, 60000); // 1分ごと
```

**工数**: 30分

---

## 推奨アプローチ

**フェーズ1（即効性）**: 案1 + 案2 を組み合わせ
- Keep-AliveでService Worker停止を防止
- chrome.alarmsでバックアップ

**フェーズ2（堅牢性）**: 案3を追加
- 切断時の自動リカバリー

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/extension/manifest.json` | alarms権限追加、バージョンアップ |
| `src/extension/background.mjs` | ping/pong応答、アラームハンドラー |
| `src/extension/relay-server.ts` | Keep-Alive送信、再接続ロジック |

---

## 検証方法

1. `npm run build`
2. Chrome拡張機能をリロード
3. 5分以上放置してから`ask_gemini_web`を実行
4. 接続が維持されていることを確認
