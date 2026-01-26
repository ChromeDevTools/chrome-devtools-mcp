# Gemini送信ボタンが押せない問題の修正計画

## 問題の概要

`ask_gemini_web`で長い質問を送信すると：
1. 質問が途中で分割送信される
2. 送信ボタンが押せず「ぐるぐる」状態になる

## 経緯

1. **v1.0.14**: Escキャンセル問題を修正（`disconnect`イベント無視）
2. **v1.0.15**: テキスト入力を`textContent`から`keyboard.type()`に変更
3. **v1.0.16**: 改行を`Shift+Enter`で入力するように変更
4. **現在**: まだ問題が発生

## 調査結果

### 検証内容
1. MCP fillツールでテキスト入力 → click()で送信 → **成功**
2. 送信ボタンのDOM状態: `disabled:false`, `isVisible:true` → **正常**

### 根本原因

**問題**: `keyboard.type()`での入力がAngularの状態と同期しない

| 方法 | 実装 | Angular互換性 |
|------|------|--------------|
| MCP fillツール | `Locator.fill()` | ○ 安定 |
| 現在のコード | `keyboard.type()` | △ 不安定 |

`Locator.fill()`はPuppeteerがフォーム入力用に最適化したメソッドで、適切なイベント（input, change等）を発火し、フレームワークとの互換性が高い。

## 修正方針

`keyboard.type()`から`Locator.fill()`に変更する。

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/tools/gemini-web.ts:393-409` | テキスト入力を`Locator.fill()`に変更 |

## 実装詳細

```typescript
// 変更前: keyboard.type() + Shift+Enter
const lines = sanitizedQuestion.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (i > 0) {
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
  }
  await page.keyboard.type(lines[i], {delay: 2});
}

// 変更後: Locator.fill()
const textbox = await page.$(textboxSelector);
await textbox?.asElement()?.evaluate((el, text) => {
  (el as HTMLElement).innerText = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, sanitizedQuestion);
// または
await page.locator(textboxSelector).fill(sanitizedQuestion);
```

## 検証方法

1. Claude Codeを再起動
2. `ask_gemini_web`で長い質問（複数行）を送信
3. 質問が分割されず、正常に送信・回答されることを確認
