# Chrome拡張機能開発ツール テストシナリオ

## 🎯 基本機能テスト

### 1. 拡張機能管理機能

```
navigate_extensions_page
list_extensions
```

**期待結果**:

- chrome://extensions/ ページが開く
- "Test Extension for MCP" が一覧に表示される
- 拡張機能の状態（有効/無効、バージョン等）が確認できる

### 2. 拡張機能リロード機能

```
reload_extension extensionName="Test Extension"
```

**期待結果**:

- 拡張機能が正常にリロードされる
- 成功メッセージが表示される

### 3. エラー検出機能

```
get_extension_errors extensionName="Test Extension"
```

**期待結果**:

- エラー数が表示される（意図的エラーがある場合）
- エラーがない場合は正常メッセージ

## 🔍 ストレージ操作テスト

### 4. ストレージ読み取り

```
get_extension_storage storageType="local"
```

**期待結果**:

```json
{
  "test_key": "test_value",
  "timestamp": 1234567890,
  "counter": 5,
  "page_visits": [...]
}
```

### 5. ストレージ書き込み

```
set_extension_storage storageType="local" data={"mcp_test": "hello", "debug_mode": true}
```

**期待結果**:

- データが正常に書き込まれる
- 確認のため再度 get_extension_storage で検証

### 6. ストレージクリア

```
clear_extension_storage storageType="local" keys=["mcp_test"]
```

**期待結果**:

- 指定したキーのみが削除される
- 他のデータは残る

## 🛠 デバッグ機能テスト

### 7. Service Worker 検査

```
inspect_service_worker extensionName="Test Extension"
```

**期待結果**:

- Service Worker の開発者ツールが開く
- コンソールログが確認できる
- "Test Extension: Background script loaded" などのログが見える

## 🔄 統合テストシナリオ

### 8. 拡張機能開発ワークフロー

1. `list_extensions` で現在の状態確認
2. `get_extension_storage` でデータ確認
3. `set_extension_storage` でテストデータ追加
4. `reload_extension` で変更適用
5. `inspect_service_worker` でデバッグ
6. `get_extension_errors` でエラーチェック

### 9. エラー発生・修正ワークフロー

1. Popup から "Cause Error" ボタンクリック
2. `get_extension_errors` でエラー検出
3. `inspect_service_worker` でエラー詳細確認
4. コード修正後 `reload_extension`
5. `get_extension_errors` でエラー解消確認

## 🎨 UI/UX改善提案テスト

### 10. 使いやすさの検証

- エラーメッセージの分かりやすさ
- 成功時のフィードバックの適切さ
- 操作手順の直感性
- 必要な情報の網羅性

## 📊 パフォーマンステスト

### 11. 大量データでの動作確認

- 多数の拡張機能がある環境
- 大量のストレージデータがある場合
- 長時間稼働している拡張機能

## 💡 改善アイデア収集

### テスト中に検討したい項目

- [ ] もっと知りたい拡張機能の情報は？
- [ ] 操作が煩雑に感じる部分は？
- [ ] エラーメッセージで理解しにくい部分は？
- [ ] 追加したい機能は？
- [ ] 自動化できそうな操作は？

## 🚨 エラーケース

### 12. 異常系テスト

- 存在しない拡張機能名を指定
- 無効な拡張機能を操作
- ストレージAPIが利用できないページで実行
- 権限のない操作を実行
