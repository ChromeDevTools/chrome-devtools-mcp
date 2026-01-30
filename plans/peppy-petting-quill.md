# Chrome拡張機能 接続切断問題の改善

## 問題

Chrome拡張機能（chrome-ai-bridge）との接続が頻繁に切れ、手動リロードが必要になる。

## 原因

Chrome Manifest V3のService Workerは、**約5分間の非アクティブ後に自動停止**される。
WebSocket接続にハートビート/ping-pongがないため、Service Workerが停止すると接続が切れる。

## 実装タスク

### ✅ 完了済み

- `manifest.json` に `alarms` 権限追加済み

### 📋 実装予定

#### 1. Keep-Alive実装（relay-server.ts）

サーバー側から30秒ごとにpingを送信し、Service Workerを維持する。

```typescript
// relay-server.ts に追加
private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

private startKeepAlive() {
  this.keepAliveTimer = setInterval(() => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}

private stopKeepAlive() {
  if (this.keepAliveTimer) {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }
}
```

#### 2. Ping/Pong応答（background.mjs）

拡張機能側でpingを受け取り、pongを返す。

```javascript
// RelayConnection._onMessageAsync() に追加
if (message.type === 'ping') {
  this._sendMessage({ type: 'pong' });
  return;
}
```

#### 3. chrome.alarms によるバックアップ（background.mjs）

1分ごとにService Workerをウェイクアップし、接続状態をチェック。

```javascript
// background.mjs に追加
const KEEPALIVE_ALARM = 'keepAlive';

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    logDebug('keepalive', 'Alarm triggered, checking connections');
    // アクティブな接続があればログを出力（接続維持のため）
    const activeCount = tabShareExtension._activeConnections.size;
    if (activeCount > 0) {
      logInfo('keepalive', `Active connections: ${activeCount}`);
    }
  }
});
```

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/extension/manifest.json` | バージョンアップのみ（alarms権限は追加済み） |
| `src/extension/background.mjs` | ping応答、alarmハンドラー追加 |
| `src/extension/relay-server.ts` | Keep-Alive送信ロジック追加 |

## 検証方法

1. `npm run build`
2. Chrome拡張機能をリロード
3. 5分以上放置してから`ask_gemini_web`を実行
4. 接続が維持されていることを確認
