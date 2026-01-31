# Gemini応答抽出の安定化

## 問題

Geminiは応答を表示しているが、chrome-ai-bridgeが取得できずタイムアウトする。

```
Timed out waiting for Gemini response (8min).
sawStopButton=true, textStableCount=461
```

## 調査結果（2026-01-31）

### Playwrightで確認した実際のDOM構造

```yaml
# 応答コンテナ
generic [ref=e107]:
  generic [ref=e108]:
    generic [ref=e115]:
      button "思考プロセスを表示" [ref=e122]   # ← 応答の目印
      generic [ref=e132]:                      # ← 応答本文
        paragraph: "日本の政治の現状について..."
        heading: "1. 高市早苗首相について"
        paragraph: "高市早苗氏は..."
        list: [listitem, listitem, ...]
        table: [...]
  generic [ref=e203]:
    button "良い回答"    # ← 応答完了の目印
    button "悪い回答"
    button "やり直す"
    button "コピー"

# マイクボタン（正確な構造）
button "マイク" [ref=e274]:
  img [alt="mic"]

# 入力欄
textbox "ここにプロンプトを入力してください" [ref=e241]
```

### 根本原因

1. **セレクター不一致**: `model-response`, `.response` は**存在しない**
2. **マイクボタン検出**: `[data-node-type="speech_dictation_mic_button"]` は存在しない。実際は `button` + `img[alt="mic"]`
3. **応答要素**: 特定のクラス名がなく、`generic` 要素のネスト構造

## 修正方針

### 方針1: マイクボタン検出の修正
現在のセレクターを実際のDOM構造に合わせる

### 方針2: 応答完了判定の改善
「良い回答」「悪い回答」ボタンの存在を応答完了の証拠として使用

### 方針3: 応答テキスト抽出の改善
フィードバックボタンの前にある要素からテキストを取得

## 修正内容

**ファイル**: `src/fast-cdp/fast-chat.ts`

### 変更1: マイクボタン検出の修正（line 2019-2026付近）

**言語非依存**: `img[alt="mic"]` を使用

```typescript
// 現状（動作しない）
const micButton = document.querySelector('[data-node-type="speech_dictation_mic_button"]') || ...

// 修正後（言語非依存）
const micButton = (() => {
  // img[alt="mic"] を含むボタンを探す（アイコン名は言語非依存）
  const micImg = document.querySelector('img[alt="mic"]');
  if (micImg) return micImg.closest('button');
  return null;
})();
```

### 変更2: 応答完了判定の追加条件（line 2090付近）

**言語非依存**: `img[alt="thumb_up"]`, `img[alt="thumb_down"]` を使用

```typescript
// フィードバックボタンの存在を確認（言語非依存）
const hasFeedbackButtons = !!document.querySelector('img[alt="thumb_up"], img[alt="thumb_down"]');

// 条件追加: フィードバックボタンが表示されていれば応答完了
if (sawStopButton && !state.hasStopButton && hasFeedbackButtons) {
  console.error('[Gemini] Response complete - feedback buttons visible');
  break;
}
```

### 変更3: 応答テキスト抽出の改善（line 2179付近）

**言語非依存**: `img[alt="thumb_up"]` を基準に応答要素を特定

```typescript
// フィードバックボタンを基準に応答を探す（言語非依存）
const answer = await client.evaluate<string>(`
  (() => {
    // thumb_upアイコンを探す（言語非依存）
    const thumbUpImg = document.querySelector('img[alt="thumb_up"]');
    if (!thumbUpImg) return '';

    // ボタンの親コンテナを遡る
    let container = thumbUpImg.closest('button')?.parentElement;
    if (!container) return '';

    // さらに親を遡って応答テキストを含む要素を探す
    // フィードバックボタン群の前の兄弟要素に応答がある
    const parent = container.parentElement;
    if (!parent) return '';

    // paragraph, heading, list などのテキスト要素を収集
    const textElements = parent.querySelectorAll('p, h1, h2, h3, li, td');
    const texts = Array.from(textElements)
      .map(el => (el.innerText || el.textContent || '').trim())
      .filter(t => t.length > 0);

    if (texts.length > 0) return texts.join('\\n\\n');

    // フォールバック: 親要素全体からテキスト取得（ボタンを除外）
    const clone = parent.cloneNode(true);
    clone.querySelectorAll('button, img').forEach(el => el.remove());
    return (clone.innerText || clone.textContent || '').trim();
  })()
`);
```

## 修正箇所

| ファイル | 行 | 内容 |
|----------|-----|------|
| `src/fast-cdp/fast-chat.ts` | 2019-2026 | マイクボタン検出の修正 |
| `src/fast-cdp/fast-chat.ts` | 2090付近 | フィードバックボタンによる完了判定 |
| `src/fast-cdp/fast-chat.ts` | 2179付近 | テキスト抽出の改善 |

## 検証

```bash
npm run build
npm run test:gemini -- "JavaScriptでオブジェクトをディープコピーする方法を教えてください。コード例も含めて。"
```

成功条件:
- 回答に `structuredClone` または `JSON.parse` などの方法が含まれる
- タイムアウトせずに応答を取得（60秒以内）
- 応答テキストが正しく抽出される（空でない）
