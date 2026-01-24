# Gemini画像生成修正計画

## 現状
- v1.0.11: ファイルシステム監視フォールバック追加済み
- ビルド: 完了済み
- 問題: MCPサーバーに反映されていなかった

## 実装済みの修正内容

### 1. MutationObserver + ポーリング方式 (gemini-image.ts:272-345)
- 2秒ポーリングを廃止
- MutationObserverでwindow.__geminiImageFoundフラグを設定
- 500msポーリングでフラグをチェック
- page.evaluateのタイムアウト問題を回避

### 2. ファイルシステム監視フォールバック (gemini-image.ts:440-496)
- ダウンロード前に既存の`Gemini_Generated_Image_*.png`を記録
- 500msポーリングで新しいファイルを検出
- CDPイベントが発火しなくても動作

### 3. 進捗表示のしきい値方式 (gemini-image.ts:371-382)
- 25%/50%/75%/100%を確実に報告

## 検証方法
ユーザーがClaude Codeを再起動後:
```
ask_gemini_image --prompt "A blue circle" --outputPath "/tmp/test.png"
```

期待される出力:
```
Geminiに接続中...
✅ ログイン確認完了
プロンプトを送信中...
🎨 画像生成中... (1-2分かかることがあります)
✅ 画像生成完了 (XX秒)
📥 画像をダウンロード中...
⏳ ダウンロード完了を待機中...  ← v1.0.11の新メッセージ
✅ ダウンロード完了: Gemini_Generated_Image_XXX.png
✂️ ウォーターマークをクロップ中...
✅ クロップ完了
🎉 画像生成完了!
```

## 次のステップ
1. ユーザーがClaude Codeを再起動
2. ユーザーがask_gemini_imageをテスト
3. 結果をフィードバック
