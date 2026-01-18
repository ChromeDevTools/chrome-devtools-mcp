# リファクタリング実装プラン v0.11.1 → v1.0.0

## 📋 概要

現在のv0.11.1（ChatGPT新UI対応完了）から、UI変更に強く、テスト可能で、拡張性の高いアーキテクチャへの段階的リファクタリングプラン。

**策定日**: 2025-10-03
**策定者**: Claude 4.5 + ChatGPT (共同議論)
**対象バージョン**: v0.11.1 → v1.0.0

---

## 🎯 フェーズ別ロードマップ

| Phase | 目的 | 主な実装内容 | 目安 | リスク | テスト | ロールバック |
|-------|------|-------------|------|--------|--------|-------------|
| **1** | **Canary導入**（監視と証跡） | `.github/workflows/canary.yml`<br>`tests/canary/**`<br>npm scripts追加 | 0.5–1日 | **低**<br>既存コード未変更 | CFT固定でスモーク<br>証跡採取 | Workflow無効化で即戻せる |
| **2** | **セレクタManifest化**（最小） | `src/selectors/loader.ts`<br>`providers/chatgpt/base.json`<br>既存ツールに薄い読み出し層 | 1–2日 | **低〜中**<br>読み出し層の追加のみ | Canary + 手動<br>DeepResearch導線確認 | 環境変数フラグで無効化 |
| **3** | **自己修復ロケータ導入**（部分適用） | `src/lib/locate.ts`（AX→DOM）<br>`src/lib/robustClick.ts`<br>既存の1〜2操作に適用 | 1–3日 | **中**<br>クリック動作の差し替え | Canary + 要素単位の視覚回帰 | `USE_ROBUST_LOCATOR=0`で旧経路 |
| **4** | **Provider Adapter層**（新規は新設計） | `src/providers/{chatgpt,gemini}/`<br>共通IF（types）<br>既存はラップ | 2–5日 | **中〜高**<br>設計変更 | 既存2ツールの<br>振る舞い同等性テスト | 既存エントリポイントに戻せる |

**下位互換性**: 各フェーズとも、既存 `ask_chatgpt_web` / `deep_research_chatgpt` の公開I/Fは変更しません。

---

## 📦 Phase 1: Canary Test導入（v0.12.0）

### 目的
- UI変更の早期検知
- 失敗時の証跡自動採取（AXツリー、HTML、スクリーンショット）
- GitHub Issue自動起票

### 作成ファイル

#### 1. `.github/workflows/canary.yml`
```yaml
name: canary
on:
  schedule:
    - cron: "*/30 1-14 * * 1-5"  # 平日(UTC)に30分毎
  workflow_dispatch: {}
jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      CHATGPT_COOKIES_JSON: ${{ secrets.CHATGPT_COOKIES_JSON }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup PNPM
        run: corepack enable && corepack prepare pnpm@latest --activate
      - name: Install deps
        run: pnpm i --frozen-lockfile=false
      - name: Install Chrome for Testing
        run: npx @puppeteer/browsers install chrome@stable
      - name: Run canary
        run: pnpm test:canary || echo "CANARY_FAILED=1" >> $GITHUB_ENV
      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: artifacts
          path: artifacts/**
      - name: Create GitHub Issue on failure
        if: env.CANARY_FAILED == '1'
        uses: peter-evans/create-issue-from-file@v4
        with:
          title: "Canary failed: ${{ github.run_id }}"
          content-filepath: artifacts/summary.md
          labels: canary,bug,triage
      - name: Slack notify (optional)
        if: env.CANARY_FAILED == '1' && env.SLACK_WEBHOOK_URL != ''
        run: |
          node -e "const https=require('https');const d={text:'Canary failed: run ${{github.run_id}}'};const req=https.request('${{env.SLACK_WEBHOOK_URL}}',{method:'POST',headers:{'Content-Type':'application/json'}});req.write(JSON.stringify(d));req.end();"
```

#### 2. `package.json` (scripts追加)
```json
{
  "scripts": {
    "test:canary": "jest -c tests/canary/jest.config.cjs",
    "canary:local": "PUPPETEER_EXECUTABLE_PATH=$(npx @puppeteer/browsers executable-path chrome@stable) jest -c tests/canary/jest.config.cjs --runInBand"
  },
  "devDependencies": {
    "@puppeteer/browsers": "^2",
    "jest": "^29",
    "ts-jest": "^29",
    "jest-image-snapshot": "^7",
    "pixelmatch": "^5"
  }
}
```

#### 3. `tests/canary/jest.config.cjs`
```javascript
module.exports = {
  testTimeout: 120000,
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  testMatch: ["**/tests/canary/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/canary/setup.ts"]
};
```

#### 4. `tests/canary/setup.ts`
```typescript
import fs from 'node:fs';
import path from 'node:path';

beforeAll(() => {
  fs.mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
});
```

#### 5. `tests/canary/helpers/browser.ts`
```typescript
import puppeteer, { Browser, Page } from 'puppeteer';

export async function launch(): Promise<Browser> {
  const exec = process.env.PUPPETEER_EXECUTABLE_PATH;
  return puppeteer.launch({
    headless: true,
    executablePath: exec,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

export async function newPageWithCookies(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage();
  const cookiesJson = process.env.CHATGPT_COOKIES_JSON;
  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson);
    await page.setCookie(...cookies);
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page;
}
```

#### 6. `tests/canary/helpers/artifacts.ts`
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { Page } from 'puppeteer';

export async function dumpArtifacts(page: Page, name: string) {
  const base = path.join(process.cwd(), 'artifacts');
  const ts = Date.now();
  await page.screenshot({ path: path.join(base, `${name}-${ts}.png`), fullPage: true });
  const html = await page.content();
  fs.writeFileSync(path.join(base, `${name}-${ts}.html`), html, 'utf8');
}

export async function saveSummary(lines: string[]) {
  const p = path.join(process.cwd(), 'artifacts', 'summary.md');
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
}
```

#### 7. `tests/canary/helpers/ax.ts`
```typescript
import { Page } from 'puppeteer';

export async function hasAXMenuItem(page: Page, nameLike: string) {
  const tree = await page.accessibility.snapshot({ interestingOnly: false });
  const hit = search(tree, n =>
    n.role === 'menuitemradio' &&
    (n.name||'').toLowerCase().includes(nameLike.toLowerCase())
  );
  return !!hit;
}

function search(node: any, pred: (n:any)=>boolean): any {
  if (!node) return null;
  if (pred(node)) return node;
  for (const c of node.children || []) {
    const r = search(c, pred);
    if (r) return r;
  }
  return null;
}
```

#### 8. `tests/canary/chatgpt.smoke.test.ts`
```typescript
import { launch, newPageWithCookies } from './helpers/browser';
import { dumpArtifacts, saveSummary } from './helpers/artifacts';
import { hasAXMenuItem } from './helpers/ax';

describe('Canary: ChatGPT Deep Research entry exists', () => {
  it('should show any evidence of Deep research tool (AX-level)', async () => {
    const browser = await launch();
    const page = await newPageWithCookies(browser, 'https://chat.openai.com/');
    const errs: string[] = [];

    try {
      const seen = await hasAXMenuItem(page, 'deep research');
      if (!seen) errs.push('AX: menuitemradio[name~=Deep research] not found');
    } catch (e:any) {
      errs.push(`AX error: ${e?.message || e}`);
    } finally {
      await dumpArtifacts(page, 'chatgpt-root');
      await browser.close();
    }

    await saveSummary([
      '# Canary summary',
      errs.length ? '## ❌ Failed' : '## ✅ Passed',
      ...errs.map(e => `- ${e}`)
    ]);
    if (errs.length) throw new Error(errs.join('\n'));
  });
});
```

### Canaryテスト範囲
- **対象**: DeepResearch導線の存在観測（実行まではしない）
- **検証**: AXツリーに`role=menuitemradio`かつ`name≈"Deep research"`が存在するか
- **証跡**: スクリーンショット + HTML + AXツリー（JSON）
- **通知**: 失敗時にArtifacts保存 + GitHub Issue自動起票

### 成功の定義
- スケジュール実行で24〜48時間連続グリーン
- **または** 失敗時に有用な証跡が蓄積されること

### 次フェーズ移行基準
- **連続グリーン** → Phase 2 着手
- **失敗が多発** → Canaryの閾値/検知ロジックを見直しつつPhase 2は並行着手

---

## 📦 Phase 2: セレクタManifest化（v0.13.0）

### 目的
- セレクタを宣言的に管理（JSON形式）
- UI変更時の修正箇所を明確化
- 複数のフォールバック戦略を実装

### ディレクトリ構造
```
src/selectors/
├── loader.ts
├── providers/
│   └── chatgpt/
│       └── base.json             # 長寿命（意味中心）
└── overrides/
    └── chatgpt/
        └── 2025-10.json          # UI変動の上書き（短寿命）
```

### 作成ファイル

#### 1. `src/selectors/providers/chatgpt/base.json`
```json
{
  "deepResearchToggle": [
    { "strategy": "ax", "role": "menuitemradio", "name": "Deep research" },
    { "strategy": "css", "value": "[role='menuitemradio'][aria-checked]" },
    { "strategy": "text", "value": "Deep research" }
  ],
  "toolsButton": [
    { "strategy": "ax", "role": "button", "name": "Tools" },
    { "strategy": "text", "value": "Tools" }
  ]
}
```

#### 2. `src/selectors/overrides/chatgpt/2025-10.json`
```json
{
  "deepResearchToggle": [
    { "strategy": "css", "value": "[data-testid='deep-research-toggle']" }
  ]
}
```

#### 3. `src/selectors/loader.ts`
```typescript
import fs from 'node:fs';
import path from 'node:path';

export type Locator =
  | { strategy: 'ax'; role?: string; name?: string }
  | { strategy: 'css'; value: string }
  | { strategy: 'xpath'; value: string }
  | { strategy: 'text'; value: string };

export type ProviderSelectors = Record<string, Locator[]>;

export function loadSelectors(provider: 'chatgpt', uiSig?: string): ProviderSelectors {
  const base = readJson(`providers/${provider}/base.json`);
  const ovPath = uiSig ? `overrides/${provider}/${uiSig}.json` : '';
  const ov = ovPath && exists(ovPath) ? readJson(ovPath) : {};
  return deepMerge(base, ov);
}

function readJson(rel: string) {
  const p = path.join(__dirname, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function exists(rel: string) {
  return fs.existsSync(path.join(__dirname, rel));
}

function deepMerge(a: any, b: any) {
  if (Array.isArray(a) && Array.isArray(b)) return [...b, ...a];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: any = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b ?? a;
}
```

### 既存コードとの共存
```typescript
// chatgpt-web.ts / deep_research_chatgpt.ts に最小差分追加
import { loadSelectors } from '../selectors/loader';

const USE_REG = process.env.SELECTOR_REGISTRY === '1';
const selectors = USE_REG ? loadSelectors('chatgpt', '2025-10') : null;

async function ensureDeepResearchToggle(page: Page) {
  if (USE_REG && selectors?.deepResearchToggle) {
    try {
      // Phase 2では簡易CSS検索でもOK
      const cssLoc = selectors.deepResearchToggle.find(l => l.strategy === 'css');
      if (cssLoc) {
        const h = await page.$(cssLoc.value);
        if (h) return h;
      }
    } catch {}
  }
  // フォールバック：現行実装
  return await page.evaluate(/* 現状の検出JS */);
}
```

### 成功の定義
- `SELECTOR_REGISTRY=1` で`deepResearchToggle`が安定検出
- OFF時と動作等価

---

## 📦 Phase 3: 自己修復ロケータ導入（v0.14.0）

### 目的
- AX（Accessibility API）で「意味」を検証
- DOMで実際の操作を実行
- 失敗時の証跡自動採取

### 作成ファイル

#### 1. `src/lib/locate.ts`
```typescript
import type { Page, ElementHandle } from 'puppeteer';
import type { Locator } from '../selectors/loader';

export async function findElement(page: Page, locators: Locator[]): Promise<ElementHandle<Element>> {
  // 1) AXで存在検証
  const ax = locators.find(l => l.strategy === 'ax');
  if (ax) {
    const tree = await page.accessibility.snapshot({ interestingOnly: false });
    if (!matchAX(tree, ax)) {
      throw new Error(`AX not found: role=${(ax as any).role} name=${(ax as any).name}`);
    }
  }

  // 2) DOMで実体を取得
  for (const l of locators) {
    if (l.strategy === 'css') {
      const h = await page.$(l.value);
      if (h) return h;
    } else if (l.strategy === 'xpath') {
      const hs = await page.$x(l.value);
      if (hs[0]) return hs[0] as ElementHandle<Element>;
    } else if (l.strategy === 'text') {
      const hs = await page.$x(`//*[contains(normalize-space(text()), ${JSON.stringify(l.value)})]`);
      if (hs[0]) return hs[0] as ElementHandle<Element>;
    }
  }
  throw new Error('Element not found by any locator');
}

function matchAX(node: any, ax: any): boolean {
  if (!node) return false;
  const okRole = !ax.role || node.role === ax.role;
  const okName = !ax.name || (node.name || '').toLowerCase().includes(ax.name.toLowerCase());
  if (okRole && okName) return true;
  for (const c of node.children || []) if (matchAX(c, ax)) return true;
  return false;
}
```

#### 2. `src/lib/robustClick.ts`
```typescript
import { Page, ElementHandle } from 'puppeteer';
import { findElement } from './locate';
import type { Locator } from '../selectors/loader';
import fs from 'node:fs';
import path from 'node:path';

export async function robustClick(page: Page, locators: Locator[], stepName: string) {
  return withRetries(async (attempt) => {
    try {
      const handle = await findElement(page, locators);
      await handle.click({ delay: 5 });
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 });
      return true;
    } catch (e) {
      // 失敗時は証拠採取
      const base = path.join(process.cwd(), 'artifacts');
      fs.mkdirSync(base, { recursive: true });
      await page.screenshot({ path: path.join(base, `${stepName}-${Date.now()}.png`) });
      const html = await page.content();
      fs.writeFileSync(path.join(base, `${stepName}-${Date.now()}.html`), html, 'utf8');

      throw e;
    }
  }, { retries: 3, baseMs: 800, jitter: true });
}

async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries: number; baseMs: number; jitter: boolean }
): Promise<T> {
  for (let i = 0; i <= opts.retries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      if (i === opts.retries) throw e;
      const delay = opts.baseMs * Math.pow(2, i);
      const jitter = opts.jitter ? Math.random() * delay * 0.1 : 0;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  throw new Error('unreachable');
}
```

### 適用箇所
- 最初は1カ所だけ（例: Deep Researchトグル押下）
- 問題なければ横展開

### ロールバック
- `USE_ROBUST_LOCATOR=0` で旧クリック経路に即戻せる

---

## 📦 Phase 4: Provider Adapter層（v0.15.0）

### 目的
- ChatGPT、Gemini、Claudeを統一インターフェイスで管理
- 既存コードをラップして再利用
- 新規プロバイダは新設計で実装

### 作成ファイル

#### 1. `src/providers/types.ts`
```typescript
import { Page } from 'puppeteer';

export interface ChatProvider {
  name: 'chatgpt' | 'gemini' | 'claude';
  capabilities: {
    deepResearch?: boolean;
    toolsMenu?: boolean;
    projects?: boolean;
  };
  openNewChat(page: Page): Promise<void>;
  ensureTool(page: Page, toolName: 'Deep research' | 'Search'): Promise<void>;
  sendMessage(page: Page, text: string): Promise<void>;
  readReport(page: Page): Promise<string>;
}
```

#### 2. `src/providers/chatgpt/index.ts`
```typescript
import { ChatProvider } from '../types';
import { Page } from 'puppeteer';
// 既存のchatgpt-web.tsの関数をインポート

export class ChatGPTProvider implements ChatProvider {
  name = 'chatgpt' as const;
  capabilities = {
    deepResearch: true,
    toolsMenu: true,
    projects: true
  };

  async openNewChat(page: Page): Promise<void> {
    // 既存のロジックをラップ
  }

  async ensureTool(page: Page, toolName: string): Promise<void> {
    // 既存のDeepResearch有効化ロジックをラップ
  }

  async sendMessage(page: Page, text: string): Promise<void> {
    // 既存の送信ロジックをラップ
  }

  async readReport(page: Page): Promise<string> {
    // 既存の回答取得ロジックをラップ
  }
}
```

### 段階的移行
1. **Adapterインターフェイスだけ定義**（既存ツールはそのまま）
2. **ChatGPT実装をラッパーでAdapter化**（既存の中身は最大限再利用）
3. **Canaryを Adapter 経由に**（回帰検出の窓口を統一）
4. **新規プロバイダは最初からAdapter+Manifest**

---

## 🚀 最初の1週間のタスクリスト（Phase 1細分化）

### Day 1
- ✅ `@puppeteer/browsers` 導入・CFT固定のローカル動作確認
- ✅ `tests/canary/**` ひな型追加（helpers, setup, smoke test）

### Day 2
- ✅ GitHub Actions `.github/workflows/canary.yml` 追加
- ✅ Self-hosted Runner or Cookie注入の方針決定・Secrets登録

### Day 3
- ✅ Canary実行→Artifactsの粒度調整（スクショ/HTML/summary.md）
- ✅ 失敗時のIssue自動起票（テンプレ整備）

### Day 4
- ✅ Slack通知（任意）実装、閾値/再試行ポリシー微調整
- ✅ READMEにCanaryの目的・運用・Secret項目を追記

### Day 5
- ✅ 24h連続実行の結果をレビュー（失敗ケースの有用性確認）
- ✅ Phase 2のブランチ作成・ディレクトリ雛形だけコミット（まだOFF）

---

## ✅ 各フェーズの成功判定基準

### Phase 1（v0.12.0）
- ✅ スケジュール実行が安定稼働
- ✅ 失敗時Artifactsが迅速な原因特定に十分

### Phase 2（v0.13.0）
- ✅ `SELECTOR_REGISTRY=1` で`deepResearchToggle`が安定検出
- ✅ OFF時と動作等価

### Phase 3（v0.14.0）
- ✅ `USE_ROBUST_LOCATOR=1` で対象操作の失敗率が低下
- ✅ 視覚回帰がグリーン
- ✅ OFF時と結果等価

### Phase 4（v0.15.0）
- ✅ 既存2ツールをAdapter経由で動かした場合と機能等価
- ✅ 入出力・ログの差分最小

---

## 📊 マイルストーンとリリースノート

### v0.12.0（Phase 1完了）
**追加**:
- Canary CI導入
- 失敗時Artifacts（HTML/スクショ）自動採取
- GitHub Issue自動起票

**既存I/F**: 変更なし（ランタイム影響なし）

### v0.13.0（Phase 2完了）
**追加**:
- セレクタManifest（`deepResearchToggle`）
- ローダ導入
- `SELECTOR_REGISTRY`フラグ

**既存I/F**: 変更なし（既定OFF、フォールバックあり）

### v0.14.0（Phase 3完了）
**追加**:
- 自己修復ロケータ（AX→DOM）
- `USE_ROBUST_LOCATOR`フラグ
- 対象は1操作から開始

**テスト**: 要素視覚回帰・Contractテストを併設

### v0.15.0（Phase 4完了）
**追加**:
- Provider Adapter層（ChatGPTをラップ）
- 新規プロバイダは新設計で対応開始

**以後**: 安定確認ののち v1.0.0（デフォルトでSelector Registry + Robust Locator ON）

---

## ⚠️ リスク管理

### リスク1: 既存機能の破壊
**対策**: 各フェーズで環境変数フラグ導入（デフォルトOFF）。PRはまずOFFでマージ→Canaryで挙動観測→ONに切替

### リスク2: テスト不足
**対策**: Phase1で可観測性（証跡）を最大化し、Phase2でContractテスト（ローカル模擬DOM）を並行追加

### リスク3: UI変更のタイミング
**対策**: Canaryで早期検知、`overrides/chatgpt/<stamp>.json`へ小パッチで吸収。必要ならIssue自動起票（AX/HTML/スクショ添付）

---

## 🎯 超小パッチ（今すぐ入れると最も効く）

1. **Canary + アーティファクト採取**（上記ファイルをそのまま追加）
2. **`src/selectors/**` の空の雛形と `loadSelectors()` を先にコミット**（Phase2の地ならし）
3. **既存コードに環境変数フラグの読み出しだけ入れておく**（実際の利用は後でON）

---

**このプランにより、v0.11.1から段階的にv1.0.0へ移行し、UI変更に強く、テスト可能で、拡張性の高いアーキテクチャを実現します。**
