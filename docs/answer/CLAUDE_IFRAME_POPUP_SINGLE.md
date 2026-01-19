# CLAUDE_IFRAME_POPUP_SINGLE.md — Claude Code にこの1枚を読ませて実装する用

**対象**: https://github.com/usedhonda/chrome-ai-bridge  
**目的**: 「ページ内 iFrame 型ポップアップ」（例: `chrome.runtime.getURL('popup.html')` を `iframe` で注入）を、MCP経由で **検出 → アタッチ → DOM取得 → ローカル拡張にパッチ → `chrome.runtime.reload()` → 再検証** まで自動化。

---

## TL;DR（Claude Code への指示）

> この指示に従って、`src/tools/iframe.popup.tools.ts` を**新規作成**。  
> 3つのエクスポート関数を提供：  
> - `inspectIframe(cdp, urlPattern: RegExp, waitMs?: number)` → iFrame検出・DOM取得  
> - `patchAndReload(cdp, extensionPath, patches)` → ローカル拡張を置換してリロード  
> - `reloadExtension(cdp)` → SW経由で `chrome.runtime.reload()` 実行  
> その後、既存の MCP ツール登録に **`iframePopup.inspect / iframePopup.patch / iframePopup.reload`** として公開する。

---

## 受け入れ基準（Acceptance Criteria）

- 任意のページに注入された `chrome-extension://<id>/popup.html` の **iFrame を自動検出**できる（`urlPattern` で正規表現指定可能）。
- CDP の **Isolated World** で `document.documentElement.outerHTML` を取得できる。
- ローカルの拡張ソース（`popup.html` / `*.css` / `*.js`）に **テキスト置換パッチ**を適用し、**`chrome.runtime.reload()`** で反映できる。
- リロード後、再度 `inspectIframe` を叩いて、変更が反映された **HTML差分**を確認できる。

---

## 実装チェックリスト

1. CDP 初期化時に `Runtime.enable`, `DOM.enable`, `Log.enable`, `Page.enable` を有効化。
2. `Page.getFrameTree` と `Page.frameNavigated` を用い、`frame.url` が `urlPattern` に一致する iFrame を **待ち合わせ**（最大 `waitMs`）。
3. `Page.createIsolatedWorld({ frameId })` → `Runtime.evaluate({ contextId, expression })` で **フレーム内 DOM** を読む。
4. 変更は **ローカル拡張フォルダに直接パッチ**。差し替え後に **`chrome.runtime.reload()`**（SW を `Target.attachToTarget` で開いて `Runtime.evaluate` 相当を送る）。
5. 必要であれば `--user-data-dir` などの **開発専用プロファイル**で Chrome を起動し、対象拡張のみをロードする。

---

## スターターコード（このまま作成して OK）

**作成先:** `src/tools/iframe.popup.tools.ts`

```ts
// src/tools/iframe.popup.tools.ts
// Minimal scaffolding for inspecting & editing in-page iframe popups via CDP.
// Wire these into your MCP server's tool registry as `iframePopup.inspect`, `iframePopup.patch`, `iframePopup.reload`.

import fs from "node:fs/promises";
import path from "node:path";
import type { CDPSession } from "puppeteer";

export type InspectResult = {
  frameId: string;
  frameUrl: string;
  html: string;
  screenshotBase64?: string;
  consoleLogs?: string[];
};

export async function findExtensionIdViaTargets(cdp: CDPSession): Promise<string> {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const ext = targetInfos.find(
    t => t.type === "service_worker" && t.url.startsWith("chrome-extension://")
  );
  if (!ext) throw new Error("Extension service worker not found");
  return new URL(ext.url).host;
}

export async function waitForFrameByUrlMatch(
  cdp: CDPSession,
  pattern: RegExp,
  timeoutMs = 5000
): Promise<{ frameId: string; frameUrl: string }> {
  await cdp.send("Page.enable");
  // First quick scan
  const tree = await cdp.send("Page.getFrameTree");
  const hit = scanTree(tree.frameTree, pattern);
  if (hit) return hit;

  // Then wait for navigation events
  const start = Date.now();
  return await new Promise((resolve, reject) => {
    function onNav(ev: any) {
      const { frame } = ev;
      if (frame?.url && pattern.test(frame.url)) {
        cleanup();
        resolve({ frameId: frame.id, frameUrl: frame.url });
      }
    }
    function onTimeout() {
      cleanup();
      reject(new Error(`Timeout waiting for frame by url match: ${pattern}`));
    }
    function cleanup() {
      cdp.off("Page.frameNavigated", onNav);
    }
    cdp.on("Page.frameNavigated", onNav);
    const left = Math.max(0, timeoutMs - (Date.now() - start));
    setTimeout(onTimeout, left);
  });

  function scanTree(node: any, rx: RegExp): { frameId: string; frameUrl: string } | null {
    if (node?.frame?.url && rx.test(node.frame.url)) {
      return { frameId: node.frame.id, frameUrl: node.frame.url };
    }
    for (const c of node.childFrames ?? []) {
      const r = scanTree(c, rx);
      if (r) return r;
    }
    return null;
  }
}

export async function inspectIframe(
  cdp: CDPSession,
  urlPattern: RegExp,
  waitMs = 5000
): Promise<InspectResult> {
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Log.enable");

  const { frameId, frameUrl } = await waitForFrameByUrlMatch(cdp, urlPattern, waitMs);

  const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
    frameId,
    worldName: "mcp",
    // grantUniveralAccess is a known CDP option in some builds. It's optional here.
  });

  const { result } = await cdp.send("Runtime.evaluate", {
    contextId: executionContextId,
    expression: "document.documentElement.outerHTML",
    returnByValue: true,
  });

  return {
    frameId,
    frameUrl,
    html: String(result.value ?? ""),
  };
}

export async function patchAndReload(
  cdp: CDPSession,
  extensionPath: string,
  patches: Array<{ file: string; find: string; replace: string }>
) {
  for (const p of patches) {
    const abs = path.join(extensionPath, p.file);
    const src = await fs.readFile(abs, "utf8");
    const rx = new RegExp(p.find, "g");
    const out = src.replace(rx, p.replace);
    if (out != src) await fs.writeFile(abs, out, "utf8");
  }
  await reloadExtension(cdp);
}

export async function reloadExtension(cdp: CDPSession) {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const sw = targetInfos.find(t => t.type === "service_worker" && t.url.startsWith("chrome-extension://"));
  if (!sw) throw new Error("Extension service worker not found for reload");

  // Attach to the service worker and execute chrome.runtime.reload()
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: sw.targetId,
    flatten: true,
  });

  await cdp.send("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression: "chrome.runtime.reload()" },
    }),
  });
}

```

---

## 使い方のサンプル（Claudeへの指示例）

```
1) 拡張 iFrame を検出して DOM を取得:
   const r1 = await iframePopup.inspect({ urlPattern: /chrome-extension:\/\/[^/]+\/popup\.html$/, waitMs: 5000 })

2) タイトルを書き換え:
   await iframePopup.patch({
     extensionPath: "/Users/me/dev/my-ext",
     patches: [{ file: "popup.html", find: "<title>.*?</title>", replace: "<title>Dev Popup</title>" }]
   })

3) 再度 DOM を取得して差分確認:
   const r2 = await iframePopup.inspect({ urlPattern: /popup\.html$/ })
```

---

## 注意点（開発専用の安全運用）

- Chrome は **専用プロファイル（`--user-data-dir`）**で起動し、`--disable-extensions-except` / `--load-extension` で対象拡張のみを有効化。
- CORS などで詰まる場合のみ **`--disable-web-security`** を付ける（恒常運用は非推奨）。
- `chrome-extension://` へのネットワークインターセプトで差し替えるより、**ローカルソースを直接パッチ**するのが堅牢。

この1ファイルを Claude Code に読み込ませれば、実装が進められます。
