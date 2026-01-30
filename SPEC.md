# Extension Connection Specification

**このファイルは非推奨です。最新の技術仕様書は [`docs/SPEC.md`](./docs/SPEC.md) を参照してください。**

---

## 概要

chrome-ai-bridge の接続仕様、ChatGPT/Gemini 操作フロー、セレクター一覧、エラーハンドリング等の詳細は:

**[docs/SPEC.md](./docs/SPEC.md)**

に統合されました。

## 主な内容

- アーキテクチャ概要
- 接続フロー（Discovery Server、Relay Server）
- ChatGPT 操作フロー・セレクター
- Gemini 操作フロー・セレクター
- テキスト入力の3段階フォールバック
- Shadow DOM 対応（collectDeep）
- 回答完了検出ロジック
- セッション管理
- エラーハンドリング・タイムアウト
- テストコマンド
