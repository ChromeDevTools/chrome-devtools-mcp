# Chrome自動再起動の挙動修正

## 問題

ユーザーがChromeを閉じると、自動的にChromeが再起動される。
この挙動はユーザーの意図に反する。

## 原因

`BrowserConnectionManager` クラスが `disconnected` イベントを検出すると、
自動的に再接続（＝Chrome再起動）を試みる設計になっている。

### 該当コード

**`src/browser-connection-manager.ts:76-82`**
```typescript
private onDisconnected = () => {
  this.log('Browser disconnected');
  this.setState(ConnectionState.RECONNECTING);
  void this.triggerReconnect('event:disconnected');  // ← これが自動再起動の原因
};
```

**`src/browser-connection-manager.ts:94-108`**
```typescript
setBrowser(browser: Browser, factory: () => Promise<Browser>): void {
  // ...
  this.browser.on('disconnected', this.onDisconnected);  // ← イベントハンドラ登録
}
```

---

## 修正方針

### `disconnected` イベント時の自動再接続を無効化

**変更箇所**: `src/browser-connection-manager.ts:76-82`

```typescript
// Before
private onDisconnected = () => {
  this.log('Browser disconnected');
  this.setState(ConnectionState.RECONNECTING);
  void this.triggerReconnect('event:disconnected');
};

// After
private onDisconnected = () => {
  this.log('Browser disconnected');
  this.setState(ConnectionState.DISCONNECTED);
  // 自動再接続は無効化 - MCP操作時に必要なら再接続する
};
```

**理由**:
1. ユーザーが意図的にChromeを閉じた場合、再起動は望まれない
2. 操作中のCDP接続エラーは `executeWithRetry` で別途対応される
3. MCP側からのリクエスト時にのみ再接続を試みる方が自然

---

## 修正対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/browser-connection-manager.ts` | `onDisconnected` の挙動変更（1箇所） |

---

## 検証方法

1. `npm run build` - ビルド成功
2. `npm test` - テスト通過
3. MCPサーバー起動、Chromeが立ち上がることを確認
4. **Chromeを手動で閉じる**
5. **期待**: Chromeが自動再起動しない ✓
6. MCPツール（例: `take_snapshot`）を実行
7. **期待**: 新しいChromeが起動して動作する ✓
