# CDP Connection Error: Target closed

## 📅 報告情報
- **日時**: 2025-10-04 11:26:29 (JST)
- **バージョン**: v0.12.0
- **報告者**: ユーザー（他プロジェクトで使用時）
- **プロジェクト**: t2

## 🐛 エラー内容

### エラーメッセージ
```
Protocol error (Target.setDiscoverTargets): Target closed
```

### 影響範囲
- **全てのMCPツールが使用不可**
  - `ask_chatgpt_web`
  - `list_pages`
  - その他すべてのChrome DevTools拡張ツール

### 再現手順
1. 別のプロジェクト（t2）でClaude Codeを起動
2. Chrome DevTools MCP拡張ツールを使用しようとする
3. 即座にエラーが発生
4. リトライしても同じエラー

## 🔍 技術的分析

### 根本原因
**Chrome DevTools Protocol (CDP) の接続が切断されている**

`Target.setDiscoverTargets` は CDP の基本的なメソッドで、以下の状況で失敗します:
1. Chromeブラウザが起動していない
2. MCPサーバーとChromeの接続が切断された
3. Chrome拡張機能が無効化されている
4. WebSocket接続が切れた

### エラーパターン
- ✅ **即座に失敗**: タイムアウトせず即座にエラー
- ✅ **一貫した失敗**: 何度リトライしても同じエラー
- ✅ **全ツールに影響**: 特定のツールだけでなく、全てのツールが影響を受ける

### 現在の問題点
1. **エラーメッセージが不親切**
   - 「Protocol error (Target.setDiscoverTargets): Target closed」では原因が分からない
   - 解決方法が示されない

2. **自動リカバリーなし**
   - 接続が切れたら手動でMCPサーバー再起動が必要
   - 自動再接続の仕組みがない

3. **ヘルスチェック不足**
   - 接続状態を事前に確認する機能がない
   - 接続が切れていることに気づくのはツール実行時のみ

## 💡 改善提案

### 1. エラーメッセージの改善（高優先度）

**現在**:
```
Protocol error (Target.setDiscoverTargets): Target closed
```

**改善案**:
```
❌ Chrome DevTools接続エラー

Chrome DevToolsとの接続が切断されています。

📋 確認事項:
1. Chromeブラウザが起動しているか確認してください
2. Chrome DevTools拡張機能が有効になっているか確認してください
3. Claude Codeを再起動してみてください

🔧 解決方法:
- Chrome再起動: Chromeを完全に終了して再起動
- MCP再起動: Claude Codeを再起動
- 拡張機能確認: chrome://extensions で拡張機能を確認

詳細: docs/troubleshooting.md#cdp-connection-error
```

#### 実装箇所
`src/McpResponse.ts` または各ツールのエラーハンドリング部分で、CDP接続エラーを検出してユーザーフレンドリーなメッセージに変換:

```typescript
// 例: src/McpResponse.ts
export function handleCDPError(error: Error): string {
  if (error.message.includes('Target closed') ||
      error.message.includes('Protocol error')) {
    return `
❌ Chrome DevTools接続エラー

Chrome DevToolsとの接続が切断されています。

📋 確認事項:
1. Chromeブラウザが起動しているか確認してください
2. Chrome DevTools拡張機能が有効になっているか確認してください
3. Claude Codeを再起動してみてください

🔧 解決方法:
- Chrome再起動: Chromeを完全に終了して再起動
- MCP再起動: Claude Codeを再起動
- 拡張機能確認: chrome://extensions で拡張機能を確認

元のエラー: ${error.message}
    `.trim();
  }
  return error.message;
}
```

### 2. 接続ヘルスチェック機能（中優先度）

**新しいMCPツール: `check_connection_health`**

```typescript
// src/tools/check-connection-health.ts
export const checkConnectionHealth = defineTool({
  name: 'check_connection_health',
  description: 'Chrome DevTools接続の健全性をチェック',
  schema: {},
  handler: async (request, response, context) => {
    const checks = {
      browserRunning: false,
      cdpConnected: false,
      extensionActive: false,
      pagesAvailable: false
    };

    try {
      // 1. ブラウザプロセスチェック
      const browser = context.browser;
      checks.browserRunning = browser.isConnected();

      // 2. CDP接続チェック
      const pages = await browser.pages();
      checks.cdpConnected = true;
      checks.pagesAvailable = pages.length > 0;

      // 3. 拡張機能チェック
      // ... 拡張機能の状態確認ロジック

      response.addTextContent(`
✅ 接続ヘルスチェック

ブラウザ起動: ${checks.browserRunning ? '✅' : '❌'}
CDP接続: ${checks.cdpConnected ? '✅' : '❌'}
拡張機能: ${checks.extensionActive ? '✅' : '❌'}
利用可能ページ: ${checks.pagesAvailable ? '✅' : '❌'}

${Object.values(checks).every(v => v) ?
  '全てのチェックに合格しました！' :
  '⚠️ 問題が検出されました。上記の❌項目を確認してください。'}
      `);
    } catch (error) {
      response.addTextContent(`❌ ヘルスチェック失敗: ${error.message}`);
    }
  }
});
```

### 3. 自動再接続機能（中優先度）

**ブラウザ接続のラッパー実装**

```typescript
// src/browser-connection-manager.ts
export class BrowserConnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000; // 2秒

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.isCDPConnectionError(error)) {
        console.warn(`CDP connection error in ${operationName}, attempting reconnect...`);
        return await this.retryWithReconnect(operation, operationName);
      }
      throw error;
    }
  }

  private async retryWithReconnect<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    for (let i = 0; i < this.maxReconnectAttempts; i++) {
      this.reconnectAttempts++;
      console.log(`Reconnect attempt ${i + 1}/${this.maxReconnectAttempts}...`);

      await this.sleep(this.reconnectDelay * (i + 1)); // Exponential backoff

      try {
        await this.reconnectBrowser();
        return await operation();
      } catch (error) {
        if (i === this.maxReconnectAttempts - 1) {
          throw new Error(
            `Failed to reconnect after ${this.maxReconnectAttempts} attempts. ` +
            `Please restart Claude Code or Chrome browser.`
          );
        }
      }
    }
    throw new Error('Reconnection failed');
  }

  private isCDPConnectionError(error: any): boolean {
    const errorMessage = error.message || '';
    return (
      errorMessage.includes('Target closed') ||
      errorMessage.includes('Protocol error') ||
      errorMessage.includes('Session closed')
    );
  }

  private async reconnectBrowser(): Promise<void> {
    // ブラウザ再接続ロジック
    // 既存のbrowser.tsの再起動処理を呼び出す
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 4. 起動時の接続確認強化（低優先度）

**v0.12.0の起動時ヘルスチェックに接続確認を追加**

`src/startup-check.ts` を拡張:

```typescript
export async function runStartupCheck(page: Page): Promise<void> {
  console.log('🔍 Startup Health Check: Starting...');

  // 既存のUI要素チェック
  // ...

  // 🆕 CDP接続チェック追加
  console.log('🔌 Checking CDP connection...');
  try {
    const cdpSession = await page.target().createCDPSession();
    await cdpSession.send('Target.getTargets');
    console.log('✅ CDP connection: OK');
    await cdpSession.detach();
  } catch (error) {
    console.error('❌ CDP connection: FAILED');
    console.error('   This may cause tool failures. Consider restarting Chrome.');
  }
}
```

## 📚 トラブルシューティングガイド（新規作成）

`docs/troubleshooting.md` を作成:

```markdown
# Troubleshooting Guide

## CDP Connection Error: Target closed

### 症状
```
Protocol error (Target.setDiscoverTargets): Target closed
```

### 原因
Chrome DevTools Protocolの接続が切断されています。

### 解決方法

#### 方法1: Claude Codeの再起動（推奨）
1. Claude Codeを完全に終了
2. 再度起動
3. ツールを再実行

#### 方法2: Chromeブラウザの再起動
1. Chromeを完全に終了（すべてのウィンドウを閉じる）
2. Chromeを再起動
3. Claude Codeを再起動
4. ツールを再実行

#### 方法3: 拡張機能の確認
1. Chromeで `chrome://extensions` を開く
2. Chrome DevTools MCP拡張機能を確認
3. 無効になっていれば有効化
4. エラーが表示されていればリロード

#### 方法4: プロセスの完全クリーンアップ
```bash
# Chromeプロセスを全て終了
pkill -9 Chrome

# Claude Codeを再起動
```

### 予防策

- **定期的な再起動**: 長時間使用している場合、1日1回Claude Codeを再起動
- **接続確認**: `check_connection_health` ツールで定期的に確認
- **安定版Chromeを使用**: Canaryチャンネルは不安定な場合あり

### それでも解決しない場合

GitHub Issuesに以下の情報を添えて報告してください:
- OS/バージョン
- Chromeバージョン
- 再現手順
- エラーログ
```

## 🔄 実装の優先順位

### Phase 1（即座に実装可能）
1. ✅ **エラーメッセージ改善** - `src/McpResponse.ts` にヘルパー関数追加
2. ✅ **トラブルシューティングガイド** - `docs/troubleshooting.md` 作成

### Phase 2（次のマイナーバージョン v0.13.0）
3. ⭕ **接続ヘルスチェックツール** - `check_connection_health` 追加
4. ⭕ **起動時接続確認** - `startup-check.ts` 拡張

### Phase 3（将来的な改善 v0.14.0+）
5. 🔵 **自動再接続機能** - `BrowserConnectionManager` 実装
6. 🔵 **接続監視** - バックグラウンドでの定期的なヘルスチェック

## 🎯 期待される効果

### ユーザー体験の改善
- **エラーの理解**: 何が起きているか明確に分かる
- **解決の迅速化**: 具体的な解決方法が提示される
- **自己解決率向上**: サポート問い合わせ減少

### 開発者体験の改善
- **デバッグの容易化**: 接続状態を明示的に確認可能
- **信頼性向上**: 自動再接続で一時的な接続断に対応
- **監視の強化**: 問題の早期発見

## 📝 関連Issue/PR

### 今後作成すべきGitHub Issues
1. "Improve CDP connection error messages"
2. "Add connection health check tool"
3. "Implement automatic reconnection on CDP errors"
4. "Create comprehensive troubleshooting guide"

## 🔗 参考資料

- [Chrome DevTools Protocol Documentation](https://chromedevtools.github.io/devtools-protocol/)
- [Puppeteer Connection Handling](https://pptr.dev/api/puppeteer.connection)
- [Target.setDiscoverTargets](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-setDiscoverTargets)

---

## 📊 影響分析

### 発生頻度
- **現在**: 不明（ユーザー報告ベース）
- **推定**: プロジェクト切り替え時、長時間使用後に発生しやすい

### 影響範囲
- **ブロッキング**: 全てのMCPツールが使用不可
- **回避策**: Claude Code再起動で解決
- **データ損失**: なし（状態は保持される）

### ビジネスインパクト
- **ユーザー満足度**: 低下（エラーメッセージが不親切）
- **サポートコスト**: 増加（同じ質問が繰り返される）
- **採用率**: 影響あり（不安定と認識される可能性）

---

## ✅ v0.14.0 実装状況（2025-10-04）

### 実装完了機能

#### 1. エラーメッセージ改善（高優先度）✅
- **実装箇所**: `src/browser-connection-manager.ts`
- **機能**: ユーザーフレンドリーなエラーメッセージ
- **内容**:
  - 日本語での明確なエラー説明
  - 具体的な解決方法の提示
  - トラブルシューティングガイドへのリンク

#### 2. 自動再接続機能（中優先度）✅
- **実装箇所**: `src/browser-connection-manager.ts`
- **機能**: BrowserConnectionManager クラス
- **主要機能**:
  - **Single-flight pattern**: 並行再接続を防止
  - **Event-driven detection**: browser 'disconnected' イベント監視
  - **State machine**: CONNECTED | RECONNECTING | CLOSED 状態管理
  - **Exponential backoff with jitter**: 再接続遅延にランダム性追加（thundering herd防止）
  - **Type-safe error detection**: instanceof ProtocolError/TimeoutError チェック

#### 3. CDP再初期化（中優先度）✅
- **実装箇所**: `src/McpContext.ts`
- **機能**: reinitializeCDP() メソッド
- **再初期化内容**:
  - `Target.setDiscoverTargets`: ターゲット検出有効化
  - `Target.setAutoAttach`: 自動アタッチ設定
  - `Network.enable`: ネットワークドメイン有効化
  - `Runtime.enable`: Runtimeドメイン有効化
  - `Log.enable`: Logドメイン有効化

#### 4. コレクター再初期化（中優先度）✅
- **実装箇所**: `src/McpContext.ts`
- **機能**: updateBrowser() メソッド
- **再初期化対象**:
  - NetworkCollector: ネットワークリクエスト収集
  - ConsoleCollector: コンソールメッセージ収集
  - Pages snapshot: ページリスト更新

### 技術的詳細

#### Single-Flight Pattern実装
```typescript
private reconnectInFlight: Promise<void> | null = null;

private async reconnectBrowser(): Promise<void> {
  // Return existing promise if reconnection already in progress
  if (this.reconnectInFlight) {
    return this.reconnectInFlight;
  }

  this.reconnectInFlight = this._doReconnect();

  try {
    await this.reconnectInFlight;
  } finally {
    this.reconnectInFlight = null;
  }
}
```

#### Exponential Backoff with Jitter
```typescript
// Base delay: 1s, 2s, 4s, 8s, 10s (max)
const baseDelay = Math.min(
  initialDelay * Math.pow(2, attempt),
  maxDelay
);

// Add ±20% randomness to prevent thundering herd
const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
const delay = Math.max(0, baseDelay + jitter);
```

#### State Machine Transitions
```typescript
enum ConnectionState {
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED'
}

// Transitions:
// CLOSED -> CONNECTED: setBrowser()
// CONNECTED -> CLOSED: browser 'disconnected' event
// CONNECTED -> RECONNECTING: reconnection start
// RECONNECTING -> CONNECTED: reconnection success
// RECONNECTING -> CLOSED: reconnection failure
```

### テスト戦略

#### Unit Tests
- **ファイル**: `tests/browser-connection-manager.test.ts`
- **カバレッジ**:
  - Single-flight pattern の並行再接続防止
  - State machine の状態遷移
  - Exponential backoff with jitter の遅延計算
  - Event-driven disconnection handling
  - CDP error detection (instanceof + string matching)
  - Max reconnect attempts の尊重
  - エラーハンドリング edge cases

#### Integration Tests
- **ファイル**: `tests/mcpcontext-reconnection.test.ts`
- **カバレッジ**:
  - updateBrowser() フロー
  - CDP re-initialization (Target.setDiscoverTargets等)
  - NetworkCollector/ConsoleCollector 再初期化
  - State consistency after reconnection
  - Error recovery scenarios

### 未実装機能

#### Phase 2（将来的な改善）
1. ⭕ **接続ヘルスチェックツール** - `check_connection_health` 追加
2. ⭕ **起動時接続確認** - `startup-check.ts` 拡張
3. ⭕ **接続監視** - バックグラウンドでの定期的なヘルスチェック

### 期待される効果

#### v0.14.0 での改善
- **自動回復**: 一時的な接続断から自動復帰（最大3回リトライ）
- **並行安全性**: Single-flight pattern で不要な再接続を防止
- **負荷分散**: Jitter により複数クライアントの再接続が分散
- **状態可視性**: State machine で接続状態を明確に管理
- **型安全性**: instanceof チェックで正確なエラー検出

#### ユーザー体験の向上
- **自動修復**: 3回まで自動的に再接続を試行
- **明確なエラー**: 再接続失敗時に分かりやすいメッセージ
- **信頼性向上**: CDP接続の安定性が大幅に向上

---

## 📚 Troubleshooting Guide（v0.14.0+）

### Auto-Reconnection の動作確認方法

#### 正常動作の確認
```
# コンソールログで確認（enableLogging: true の場合）
[ConnectionManager] Browser instance set, state: CONNECTED
[ConnectionManager] CDP connection error in list_pages, attempting reconnect...
[ConnectionManager] Reconnect attempt 1/3 for list_pages...
[ConnectionManager] Waiting 950ms before reconnect attempt...
[ConnectionManager] State transition: CONNECTED -> RECONNECTING
[ConnectionManager] Browser reconnected successfully
[ConnectionManager] State transition: RECONNECTING -> CONNECTED
[ConnectionManager] Reconnection successful, retrying list_pages...
```

#### 再接続失敗時のメッセージ
```
❌ Chrome DevTools接続エラー

3回の再接続を試みましたが、Chrome DevToolsとの接続を回復できませんでした。

📋 最後のエラー:
Protocol error (Target.setDiscoverTargets): Target closed

🔧 解決方法:
1. Claude Codeを再起動してください
2. Chromeブラウザを完全に終了して再起動してください
3. chrome://extensions でChrome DevTools拡張機能を確認してください

詳細: docs/troubleshooting.md#cdp-connection-error
```

### トラブルシューティング手順

#### 1. 自動再接続が動作しない場合

**症状**: CDP エラーが発生しても再接続されない

**確認事項**:
1. BrowserConnectionManager が正しく初期化されているか
2. Browser factory が設定されているか
3. enableLogging オプションでログを確認

**解決方法**:
```typescript
// ConnectionManager のログを有効化
const context = await McpContext.from(
  browser,
  logger,
  browserFactory,
  { enableLogging: true }
);
```

#### 2. 再接続が繰り返し失敗する場合

**症状**: 3回とも再接続に失敗する

**原因**:
- Chrome ブラウザが完全に停止している
- Chrome 拡張機能が無効化されている
- システムリソース不足

**解決方法**:
1. Chrome を完全に再起動
2. `chrome://extensions` で拡張機能を確認
3. システムリソースを確認（メモリ、CPU）
4. Claude Code を再起動

#### 3. State machine が RECONNECTING で固まる場合

**症状**: 接続状態が RECONNECTING から変わらない

**確認方法**:
```typescript
console.log('State:', context.connectionManager.getState());
console.log('Is reconnecting:', context.connectionManager.isReconnecting());
```

**解決方法**:
- 再接続タイムアウトを待つ（最大 ~30秒）
- タイムアウト後も解決しない場合、Claude Code 再起動

#### 4. CDP reinitialization エラー

**症状**: CDP コマンドが "Target closed" で失敗する

**原因**: CDP ドメインの再初期化が失敗

**確認方法**:
```
# ログで確認
Warning: Failed to enable target discovery: ...
Warning: Failed to configure auto-attach: ...
```

**解決方法**:
- Chrome を再起動（CDP セッションをクリーンアップ）
- Claude Code を再起動
- それでも解決しない場合、GitHub Issues へ報告

#### 5. Network/Console Collector が動作しない

**症状**: 再接続後、ネットワークリクエストやコンソールメッセージが収集されない

**原因**: Collector の再初期化失敗

**確認方法**:
```typescript
const requests = context.getNetworkRequests();
const consoleLogs = context.getConsoleData();
console.log('Requests:', requests.length);
console.log('Console logs:', consoleLogs.length);
```

**解決方法**:
- `updateBrowser()` を明示的に呼び出す
- Collector の `init()` が正常に完了したか確認

### デバッグ Tips

#### 詳細ログの有効化
```typescript
// 環境変数で DEBUG ログを有効化
process.env.DEBUG = 'mcp:*';

// ConnectionManager のログを有効化
const connectionOptions = {
  enableLogging: true,
  maxReconnectAttempts: 5,
  initialRetryDelay: 500,
};
```

#### State 監視
```typescript
// State の変化を監視
setInterval(() => {
  console.log('Connection state:', context.connectionManager.getState());
  console.log('Is connected:', context.connectionManager.isConnected());
  console.log('Reconnect attempts:', context.connectionManager.getReconnectAttempts());
}, 5000);
```

#### CDP コマンドのテスト
```typescript
// CDP 接続を手動でテスト
const page = context.getSelectedPage();
const client = await page.target().createCDPSession();

try {
  await client.send('Target.getTargets');
  console.log('CDP connection: OK');
} catch (error) {
  console.error('CDP connection: FAILED', error);
}
```

### それでも解決しない場合

GitHub Issues に以下の情報を添えて報告してください:

1. **環境情報**:
   - OS/バージョン
   - Chrome バージョン
   - chrome-devtools-mcp バージョン
   - Node.js バージョン

2. **エラーログ**:
   - ConnectionManager のログ（enableLogging: true）
   - CDP エラーメッセージ
   - State machine の状態遷移ログ

3. **再現手順**:
   - どのような操作で発生したか
   - 再接続試行回数
   - 最後のエラーメッセージ

4. **試した解決方法**:
   - Chrome 再起動の有無
   - Claude Code 再起動の有無
   - その他試した対処法

---

**このドキュメントは、実際のユーザー報告に基づいて作成され、v0.14.0 の実装により大幅に改善されました。**
