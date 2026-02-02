# Chrome拡張 connect.htmlタブ大量発生問題

## 状態: 設計完了・実装待ち

---

## 問題

Chrome再起動時に、過去に接続したMCPサーバーごとにconnect.htmlタブが大量に開く。

## 根本原因

1. **Chrome起動時にDiscoveryが自動開始** - `onStartup`リスナー + 即時`scheduleDiscovery()`呼び出し
2. **タイムスタンプ比較が不安定** - Service Worker再起動で`extensionStartTime`がリセット、`lastRelayByPort`もクリア
3. **失敗即UI起動** - 自動接続失敗で即座にconnect.htmlを開く

---

## 解決策：Chrome起動時はconnect.html開かない

**シンプルな変更:**
- Chrome起動時（`onStartup`, `onInstalled`, 即時実行）はDiscoveryを開始するが、connect.htmlは開かない
- ユーザーが拡張アイコンをクリックした時のみconnect.htmlを開く

### 実装方法

```javascript
// 状態フラグ追加
let userTriggeredDiscovery = false;

// アイコンクリック時のみフラグをtrue
chrome.action.onClicked.addListener(() => {
  userTriggeredDiscovery = true;  // ユーザーが明示的にトリガー
  scheduleDiscovery();
});

// 自動起動時はフラグをfalseのまま
chrome.runtime.onStartup.addListener(() => {
  // userTriggeredDiscovery = false のまま
  scheduleDiscovery();
});

// autoOpenConnectUi内でフラグをチェック
if (!ok) {
  if (userTriggeredDiscovery) {
    await ensureConnectUiTab(...);
  } else {
    logDebug('Skipping connect UI (auto-startup mode)');
  }
}
```

---

## 動作フロー

### Chrome起動時
1. `onStartup` → `scheduleDiscovery()`
2. Discovery実行、MCPサーバー検出
3. `autoConnectRelay` 試行
4. 成功 → 接続完了、connect.html不要
5. 失敗 → **connect.html開かない**（`userTriggeredDiscovery = false`）

### ユーザーがアイコンクリック時
1. `userTriggeredDiscovery = true`
2. `scheduleDiscovery()`
3. Discovery実行、MCPサーバー検出
4. `autoConnectRelay` 試行
5. 失敗 → connect.html開く（ユーザーが明示的にトリガー）

---

## 修正対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/extension/background.mjs` | `userTriggeredDiscovery`フラグ追加、条件分岐 |

---

## 変更点（差分）

```diff
+ let userTriggeredDiscovery = false;

  chrome.action.onClicked.addListener(() => {
+   userTriggeredDiscovery = true;
    scheduleDiscovery();
  });

  // autoOpenConnectUi内
  if (!ok) {
-   const serverStartedAt = relay.data.startedAt || 0;
-   const isNewServer = serverStartedAt >= (extensionStartTime - 2000);
-   if (isNewServer) {
+   if (userTriggeredDiscovery) {
      await ensureConnectUiTab(...);
    }
  }
```

---

## 検証方法

1. 変更を適用しビルド: `npm run build`
2. Chrome拡張を再読み込み
3. **テスト1: Chrome再起動**
   - 複数のMCPサーバーを起動
   - Chromeを完全終了・再起動
   - → connect.htmlタブが**0個**であることを確認
   - → 自動接続が成功していればMCPサーバーは使える
4. **テスト2: 手動トリガー**
   - 拡張アイコンをクリック
   - → 接続失敗時のみconnect.htmlが1個開く

---

## 期待される結果

| シナリオ | 現在 | 修正後 |
|----------|------|--------|
| Chrome起動時、複数MCP検出 | 複数タブ開く | **0タブ** |
| アイコンクリック後 | 1タブ | 1タブ |
| 自動接続成功時 | 0タブ | 0タブ |
