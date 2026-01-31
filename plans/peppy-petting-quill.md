# 同時接続の設計見直し計画

## 絶対ルール

**単独接続（askChatGPTFast, askGeminiFast）に影響を与えない**

- 単独接続のコードは一切変更しない
- テストは必ず単独接続から先に実行し、問題がないことを確認
- 並列接続の変更は ai-helpers.ts / chatgpt-gemini-web.ts のみに限定
- 問題発生時は即座に中止

## 背景

commit `0440614` で単独接続（askChatGPTFast, askGeminiFast）に `waitForStableCount()` と初期カウント追跡を導入した。同時接続（ask_chatgpt_gemini_web）でも同じ安定した関数を共有し、設計を見直す。

## 現状分析

### 呼び出し構造

```
ask_chatgpt_gemini_web (chatgpt-gemini-web.ts)
  ├─ connectAI('chatgpt') ──→ getClient('chatgpt')
  ├─ connectAI('gemini') ───→ getClient('gemini')
  │
  └─ Promise.all([
       askAI('chatgpt', q) ──→ askChatGPTFast()  ← 単独実装をそのまま使用
       askAI('gemini', q) ───→ askGeminiFast()   ← 単独実装をそのまま使用
     ])
```

### 現状の問題点

1. **接続と質問が分離**: `connectAI()` で接続後、`askAI()` で再度接続（getClient内部で）
2. **ai-helpers.ts の薄いラッパー**: `askAI()` は単に try-catch でラップしているだけ
3. **冗長性**: 並列接続で特別な最適化がない

### 良い点（維持すべき）

1. 単独接続の実装（`askChatGPTFastInternal`, `askGeminiFastInternal`）は安定
2. `waitForStableCount()` は既に共通関数として抽出済み
3. 初期カウント追跡も各実装に組み込み済み

## 設計方針

### 結論: 現状維持 + 軽微な改善

調査の結果、**現在の設計は適切**であり、大幅な変更は不要と判断。

理由:
- 並列接続は内部で `askChatGPTFast()` / `askGeminiFast()` を呼び出しており、commit `0440614` の改善は**自動的に適用**される
- 接続の再利用は `getClient()` 内部で既にキャッシュされている
- 過度な共通化は可読性・保守性を損なう

### 改善候補（オプション）

| 改善 | 効果 | 優先度 |
|------|------|--------|
| `connectAI()` の削除 | 冗長コード削減 | 低 |
| `ai-helpers.ts` の簡略化 | ファイル数削減 | 低 |
| `collectDeep()` の共通関数化 | コード重複削減 | 中 |
| タイミング情報の統一 | 並列クエリのタイミング可視化 | 中 |

## 提案: 3つの選択肢

### 選択肢A: 現状維持（推奨）

変更なし。現在の設計は十分に機能している。

**理由**:
- 並列接続は既に単独接続の安定した実装を内部で使用
- `waitForStableCount()` と初期カウント追跡は自動的に適用済み
- 不要な変更はリスクを増やすだけ

### 選択肢B: 軽微なリファクタリング

1. `ai-helpers.ts` の `connectAI()` を削除
2. `askAI()` を `chatgpt-gemini-web.ts` にインライン化
3. ファイル構造をシンプルに

**変更ファイル**:
- `src/tools/ai-helpers.ts` - 削除または縮小
- `src/tools/chatgpt-gemini-web.ts` - ロジック統合

### 選択肢C: 共通関数の抽出

1. `collectDeep()` を `src/fast-cdp/dom-helpers.ts` に抽出
2. 重複コード（約20箇所）を共通関数呼び出しに置き換え

**新規ファイル**:
- `src/fast-cdp/dom-helpers.ts`

**変更ファイル**:
- `src/fast-cdp/fast-chat.ts` - 共通関数を使用

## 決定: 現状維持 + テスト検証

## テスト計画

### 1. 単独接続の動作確認（最優先）

**目的**: 単独接続が正常に動作することを先に確認

```bash
# ChatGPT単独
npm run test:chatgpt -- "TypeScriptでジェネリック型を使う簡単な例を1つ示して"

# Gemini単独
npm run test:gemini -- "TypeScriptでジェネリック型を使う簡単な例を1つ示して"
```

**確認ポイント**:
- 両方とも正常に応答が返ってくるか
- commit `0440614` の改善が正しく動作しているか

**重要**: ここで問題があれば、並列接続のテストには進まない。

### 2. 並列接続の基本動作テスト

**目的**: 単独接続が正常な状態で、並列接続も動作することを確認

```bash
npm run test:both
```

**確認ポイント**:
- 両方から応答が返ってくるか
- 単独接続と同じ品質の応答か

### 3. 応答検出の正確性テスト（最重要）

**目的**: commit `0440614` の修正が並列接続でも機能することを確認

**シナリオ**: 既存のチャットセッションに対して新しい質問を送信

```bash
# 1. まず単独で質問（チャット履歴を作る）
npm run test:chatgpt -- "1+1は？"

# 2. 続けて別の質問（古い回答を返さないことを確認）
npm run test:chatgpt -- "2+2は？"
# → 期待: "4" を含む回答（"2" ではない）

# 3. 並列接続でも同様のテスト
npm run test:both
# → 期待: 新しい質問に対する回答が返る
```

**確認ポイント**:
- `initialAssistantCount` / `initialModelResponseCount` が正しく追跡されているか
- 古い回答ではなく新しい回答が返ってくるか

### 3. エラーハンドリングテスト

**目的**: 片方が失敗しても他方が動作することを確認

**シナリオ**: 意図的にログアウト状態を作る（手動）

1. Geminiからログアウト
2. `npm run test:both` 実行
3. ChatGPTのみ成功し、Geminiはエラーメッセージが返る

### 4. タイミング情報の確認

**目的**: 応答時間の計測が正しく動作することを確認

```bash
npm run test:both
```

**確認ポイント**:
- 履歴ファイル `.local/chrome-ai-bridge/history.jsonl` にタイミング情報が記録されているか
- `connectMs`, `waitResponseMs`, `totalMs` が妥当な値か

### テスト結果の記録

テスト後、結果を `docs/log/claude/` に記録する。

## 検証コマンド

```bash
# 基本動作テスト
npm run test:both

# 履歴確認
tail -5 .local/chrome-ai-bridge/history.jsonl | jq .

# デバッグログ確認（問題発生時）
tail -f .local/mcp-debug.log
```
