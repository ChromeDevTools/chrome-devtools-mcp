import fs from 'node:fs/promises';
import path from 'node:path';

import {connectViaExtensionRaw, RawExtensionConnection} from './extension-raw.js';
import {CdpClient} from './cdp-client.js';
import {RelayServer} from '../extension/relay-server.js';
import {logConnectionState, logInfo, logError, logWarn} from './mcp-logger.js';
import {DOM_UTILS_CODE} from './utils/index.js';
import {getDriver, type SiteDriver} from './drivers/index.js';
import {NetworkInterceptor} from './network-interceptor.js';
import {
  getAgentConnection,
  getAllAgentConnections,
  clearAllAgentConnections,
  hasAgentId,
  type AgentConnection,
} from './agent-context.js';
import {saveAgentSession, getPreferredSessionV2, clearAgentSession} from './session-manager.js';

/**
 * Get current agent's client for the specified kind.
 * Returns null if not connected.
 */
function getClientFromAgent(kind: 'chatgpt' | 'gemini'): CdpClient | null {
  if (!hasAgentId()) {
    // Fallback for backward compatibility (no agent ID set)
    return null;
  }
  const conn = getAgentConnection();
  return kind === 'chatgpt' ? conn.chatgptClient : conn.geminiClient;
}

/**
 * Get current agent's relay for the specified kind.
 * Returns null if not connected.
 */
function getRelayFromAgent(kind: 'chatgpt' | 'gemini'): RelayServer | null {
  if (!hasAgentId()) {
    return null;
  }
  const conn = getAgentConnection();
  return kind === 'chatgpt' ? conn.chatgptRelay : conn.geminiRelay;
}

/**
 * Set client and relay for the current agent.
 */
function setClientForAgent(
  kind: 'chatgpt' | 'gemini',
  client: CdpClient | null,
  relay: RelayServer | null,
): void {
  if (!hasAgentId()) {
    console.error('[fast-chat] Warning: setClientForAgent called without agent ID');
    return;
  }
  const conn = getAgentConnection();
  if (kind === 'chatgpt') {
    conn.chatgptClient = client;
    conn.chatgptRelay = relay;
  } else {
    conn.geminiClient = client;
    conn.geminiRelay = relay;
  }
}

const CONNECT_REUSE_TIMEOUT_MS = Number(
  process.env.MCP_CONNECT_REUSE_TIMEOUT_MS || '7000',
);
const CONNECT_NEWTAB_TIMEOUT_MS = Number(
  process.env.MCP_CONNECT_NEWTAB_TIMEOUT_MS || '12000',
);

/**
 * チャット結果の型（タイミング情報付き）
 */
export interface ChatTimings {
  connectMs: number;
  waitInputMs: number;
  inputMs: number;
  sendMs: number;
  waitResponseMs: number;
  totalMs: number;
  navigateMs?: number;  // Gemini only
}

/**
 * デバッグ情報: DOM構造、抽出試行、タイミング等
 */
export interface ChatDebugInfo {
  // DOM構造
  dom: {
    articleCount: number;
    markdowns: Array<{
      className: string;
      innerTextLength: number;
      innerText: string;
      isResultThinking: boolean;
    }>;
    lastArticleHtml: string;
    lastArticleInnerText: string;
  };
  // 抽出試行
  extraction: {
    selectorsTried: Array<{
      selector: string;
      found: boolean;
      textLength: number;
    }>;
    finalSelector?: string;
    fallbackUsed?: string;
  };
  // タイミング
  timings: ChatTimings;
  // URL・タイトル
  url: string;
  documentTitle: string;
}

export interface ChatResult {
  answer: string;
  timings: ChatTimings;
  debug?: ChatDebugInfo;
}

function nowMs(): number {
  return Date.now();
}

/**
 * 接続の健全性を確認する
 * 軽量なevaluateコマンドで接続が生きているかチェック
 */
async function isConnectionHealthy(client: CdpClient, kind?: 'chatgpt' | 'gemini'): Promise<boolean> {
  const startTime = Date.now();
  try {
    // 4秒タイムアウトで簡単なコマンドを実行（2秒では不十分な場合があった）
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 4000)
    );
    await Promise.race([client.evaluate('1'), timeoutPromise]);
    const elapsed = Date.now() - startTime;
    if (kind) {
      logConnectionState(kind, 'healthy', {elapsed});
    }
    return true;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (kind) {
      logConnectionState(kind, 'unhealthy', {
        elapsed,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    console.error('[fast-cdp] Connection health check failed:', error);
    return false;
  }
}

/**
 * メッセージカウントが安定するまで待機
 * ページ読み込み完了を確認するため、カウントが2回連続で同じ値になるまで待機
 * @param client CDPクライアント
 * @param countExpr カウントを取得するJavaScript式
 * @param maxWaitMs 最大待機時間（デフォルト3000ms）
 * @param pollIntervalMs ポーリング間隔（デフォルト300ms）
 * @returns 安定したカウント値
 */
async function waitForStableCount(
  client: CdpClient,
  countExpr: string,
  maxWaitMs: number = 3000,
  pollIntervalMs: number = 300,
): Promise<number> {
  const startTime = Date.now();
  let lastCount = -1;
  let stableCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const currentCount = await client.evaluate<number>(countExpr);

    if (currentCount === lastCount) {
      stableCount++;
      if (stableCount >= 2) {
        // 2回連続で同じ値なら安定したとみなす
        return currentCount;
      }
    } else {
      stableCount = 0;
      lastCount = currentCount;
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  // タイムアウト時は最後のカウントを返す
  return lastCount >= 0 ? lastCount : 0;
}

function getProjectName(): string {
  return path.basename(process.cwd()) || 'default';
}

function getHistoryPath(): string {
  return path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'history.jsonl');
}

function getLocalTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

async function rotateHistoryIfNeeded(): Promise<void> {
  const historyPath = getHistoryPath();

  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // 1000件以下なら何もしない
    if (lines.length <= 1000) return;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // 30日以上古いエントリを除外
    const filtered = lines.filter(line => {
      try {
        const entry = JSON.parse(line);
        // ローカル時刻形式 "2026-02-01 00:36:02" または ISO形式 "2026-01-31T15:36:02.273Z" 両対応
        const ts = new Date(entry.ts).getTime();
        return ts > thirtyDaysAgo; // 30日以内は保持
      } catch {
        return true; // パース失敗は保持
      }
    });

    // 削除対象があれば書き換え
    if (filtered.length < lines.length) {
      await fs.writeFile(historyPath, filtered.join('\n') + '\n', 'utf-8');
      console.error(`[history] Rotated: ${lines.length} -> ${filtered.length} entries`);
    }
  } catch (err) {
    // ファイルがない場合は無視
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[history] Rotation error:', err);
    }
  }
}

/**
 * キャッシュされたGeminiクライアントをクリア（リトライ用）
 */
export function clearGeminiClient(): void {
  const client = getClientFromAgent('gemini');
  const relay = getRelayFromAgent('gemini');

  if (client) {
    console.error('[Gemini] Cached client cleared');
  }
  if (relay) {
    try {
      relay.stop();
    } catch {
      // ignore stop errors
    }
  }
  setClientForAgent('gemini', null, null);
}

/**
 * 全接続をクリーンアップ（プロセス終了時用）
 * MCPサーバー終了時にゾンビプロセスを防ぐために使用
 */
export async function cleanupAllConnections(): Promise<void> {
  // Snapshot entries before clearing to avoid mutation during iteration
  const entries = Array.from(getAllAgentConnections().entries());

  for (const [, conn] of entries) {
    if (conn.chatgptRelay) {
      try {
        await conn.chatgptRelay.stop();
      } catch {
        // ignore stop errors
      }
    }

    if (conn.geminiRelay) {
      try {
        await conn.geminiRelay.stop();
      } catch {
        // ignore stop errors
      }
    }
  }

  // Clear all at once after iteration
  clearAllAgentConnections();
  console.error('[fast-cdp] All connections cleaned up');
}

/**
 * 既存Geminiチャットがスタック状態（停止ボタンが消えない）かチェック
 * 最大5秒間待機して停止ボタンが消えるか確認
 */
async function checkGeminiStuckState(client: CdpClient): Promise<{isStuck: boolean; waitedMs: number}> {
  const maxWaitMs = 5000;
  const pollIntervalMs = 500;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const hasStopButton = await client.evaluate<boolean>(`
      (() => {
        ${DOM_UTILS_CODE}
        const buttons = __collectDeep(['button', '[role="button"]']).nodes.filter(__isVisible).filter(el => !__isDisabled(el));

        // 方法1: aria-labelベースの検索
        const stopByLabel = buttons.some(b => {
          const label = (b.getAttribute('aria-label') || '').trim();
          return label.includes('回答を停止') || label.includes('Stop generating') ||
                 label.includes('Stop streaming') || label === 'Stop';
        });
        if (stopByLabel) return true;

        // 方法2: mat-icon要素での検出
        const stopIcons = __collectDeep(['mat-icon[data-mat-icon-name="stop"]']).nodes;
        for (const stopIcon of stopIcons) {
          const btn = stopIcon.closest('button');
          if (btn && __isVisible(btn) && !__isDisabled(btn)) return true;
        }

        return false;
      })()
    `);

    if (!hasStopButton) {
      // 停止ボタンが消えた - スタックしていない
      return {isStuck: false, waitedMs: Date.now() - startTime};
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // 5秒間停止ボタンが消えなかった - スタック状態
  return {isStuck: true, waitedMs: Date.now() - startTime};
}

async function appendHistory(entry: {
  provider: 'chatgpt' | 'gemini';
  question: string;
  answer: string;
  url?: string;
  timings?: Record<string, number>;
}): Promise<void> {
  const project = getProjectName();
  const payload = {
    ts: getLocalTimestamp(),
    project,
    ...entry,
  };
  const targetPath = getHistoryPath();
  await fs.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.appendFile(targetPath, `${JSON.stringify(payload)}\n`, 'utf-8');

  // ローテーション実行（非同期、エラーは無視）
  rotateHistoryIfNeeded().catch(() => {});
}

async function saveDebug(kind: 'chatgpt' | 'gemini', payload: Record<string, any>) {
  const targetDir = path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'debug');
  await fs.mkdir(targetDir, {recursive: true});
  const file = path.join(targetDir, `${kind}-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
}

function normalizeGeminiResponse(text: string, question?: string): string {
  if (!text) return '';
  const filtered = text
    .split('\n')
    .map(line => line.trim())
    .filter(
      line =>
        line &&
        !/^思考プロセスを表示/.test(line) &&
        !/^次へのステップ/.test(line) &&
        !/^Show thinking/i.test(line) &&
        !/^Next steps/i.test(line) &&
        !/^(Gemini|PRO|作成したもの|Gemini との会話|ツール|思考モード|今すぐ回答)$/i.test(line) &&
        !/^Initiating Connection Check/i.test(line) &&
        !/^Acknowledging Connection Test/i.test(line) &&
        !/^Confirming Connection Integrity/i.test(line),
    );
  const cleaned = filtered
    .filter(line => (question ? line !== question.trim() : true))
    .join('\n')
    .trim();
  return cleaned;
}

// isSuspiciousAnswer 関数は削除済み（2回送信バグの原因）

/**
 * 新しい接続を作成する（リトライ機構付き）
 * 戦略:
 * - ChatGPT: 常に新規タブ（URLが /c/xxx に変わるため再利用困難）
 * - Gemini: 既存タブを再利用、失敗したら新規タブ
 */
async function createConnection(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  const startTime = Date.now();
  logConnectionState(kind, 'connecting');

  const preferredSession = await getPreferredSessionV2(kind);
  const preferred = preferredSession.url;
  const preferredTabId = preferredSession.tabId;
  const defaultUrl = kind === 'chatgpt'
    ? 'https://chatgpt.com/'
    : 'https://gemini.google.com/';

  logInfo('fast-chat', `createConnection: ${kind}`, {
    preferred,
    preferredTabId,
    defaultUrl,
    strategy: preferred ? 'reuse-existing' : 'new-tab',
  });

  // まず既存タブを探す（ChatGPT/Gemini共通）
  // 既存タブがあればそれを使う、なければ新規作成
  if (preferred) {
    logInfo('fast-chat', `Trying to reuse existing ${kind} tab`, {url: preferred, tabId: preferredTabId, timeoutMs: CONNECT_REUSE_TIMEOUT_MS});
    console.error(`[fast-cdp] Trying to reuse existing ${kind} tab: ${preferred} (tabId: ${preferredTabId}, ${CONNECT_REUSE_TIMEOUT_MS}ms timeout)`);
    try {
      const relayResult = await connectViaExtensionRaw({
        tabUrl: preferred,
        tabId: preferredTabId,
        newTab: false,
        allowTabTakeover: true,
        timeoutMs: CONNECT_REUSE_TIMEOUT_MS,
      });

      const client = new CdpClient(relayResult.relay);
      await Promise.all([
        client.send('Runtime.enable'),
        client.send('DOM.enable'),
        client.send('Page.enable'),
        client.send('Network.enable', {}),
      ]);

      // フォーカスエミュレーション有効化（バックグラウンドタブ対策）
      // Chrome DevTools: "Emulate a focused page" と同等
      // visibilityState を 'visible' に固定し、DOM更新の継続を促す
      try {
        await client.send('Emulation.setFocusEmulationEnabled', {enabled: true});
        console.error(`[fast-cdp] ${kind} focus emulation enabled`);
      } catch (e) {
        // 非クリティカル: 失敗しても続行
        console.error(`[fast-cdp] ${kind} setFocusEmulationEnabled failed (non-critical):`, e instanceof Error ? e.message : String(e));
      }

      // デバッグ: 接続直後のURLを確認
      const debugUrl = await client.evaluate<string>('location.href');
      console.error(`[fast-cdp] DEBUG: Connected tab URL = ${debugUrl}`);
      console.error(`[fast-cdp] DEBUG: targetInfo URL = ${relayResult.targetInfo?.url}`);

      // ページが読み込まれるまで待機（about:blank でなくなるまで）
      // タイムアウトは3秒で十分（通常は数百ms以内に完了）
      if (debugUrl === 'about:blank') {
        console.error(`[fast-cdp] WARNING: evaluate returns about:blank, waiting for navigation...`);
        await client.waitForFunction(
          `location.href !== 'about:blank' && document.readyState === 'complete'`,
          3000,
        );
      }

      // クライアントとRelay参照を保存
      setClientForAgent(kind, client, relayResult.relay);
      const elapsed = Date.now() - startTime;
      logConnectionState(kind, 'connected', {elapsed, reused: true});
      console.error(`[fast-cdp] ${kind} reused existing tab successfully`);
      return client;
    } catch (error) {
      logWarn('fast-chat', `${kind} existing tab not found`, {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[fast-cdp] ${kind} existing tab not found, will create new tab`);
    }
  }

  // 新しいタブを作成
  logInfo('fast-chat', `Creating new ${kind} tab`, {url: defaultUrl});
  console.error(`[fast-cdp] Creating new ${kind} tab: ${defaultUrl}`);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    logInfo('fast-chat', `${kind} connection attempt`, {attempt: attempt + 1, maxAttempts: 2});
    try {
      const relayResult = await connectViaExtensionRaw({
        tabUrl: defaultUrl,
        newTab: true,
        timeoutMs: CONNECT_NEWTAB_TIMEOUT_MS,
      });

      const client = new CdpClient(relayResult.relay);
      await Promise.all([
        client.send('Runtime.enable'),
        client.send('DOM.enable'),
        client.send('Page.enable'),
        client.send('Network.enable', {}),
      ]);

      // フォーカスエミュレーション有効化（バックグラウンドタブ対策）
      // Chrome DevTools: "Emulate a focused page" と同等
      // visibilityState を 'visible' に固定し、DOM更新の継続を促す
      try {
        await client.send('Emulation.setFocusEmulationEnabled', {enabled: true});
        console.error(`[fast-cdp] ${kind} focus emulation enabled (new tab)`);
      } catch (e) {
        // 非クリティカル: 失敗しても続行
        console.error(`[fast-cdp] ${kind} setFocusEmulationEnabled failed (non-critical):`, e instanceof Error ? e.message : String(e));
      }

      // クライアントとRelay参照を保存
      setClientForAgent(kind, client, relayResult.relay);

      // 新規タブ作成後、ページが読み込まれるまで待機（about:blank でなくなるまで）
      const debugUrl = await client.evaluate<string>('location.href');
      if (debugUrl === 'about:blank') {
        console.error(`[fast-cdp] Waiting for new tab to navigate from about:blank...`);
        await client.waitForFunction(
          `location.href !== 'about:blank' && document.readyState === 'complete'`,
          10000,  // 新規タブは読み込みに時間がかかる可能性があるので10秒
        );
        console.error(`[fast-cdp] New tab navigation complete`);
      }

      const elapsed = Date.now() - startTime;
      logConnectionState(kind, 'connected', {elapsed, attempt: attempt + 1, reused: false});
      console.error(`[fast-cdp] ${kind} new tab created successfully (attempt ${attempt + 1})`);
      return client;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logError('fast-chat', `${kind} connection attempt failed`, {
        attempt: attempt + 1,
        error: lastError.message,
      });
      console.error(`[fast-cdp] ${kind} new tab attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < 1) {
        console.error(`[fast-cdp] Retrying in 1s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw lastError || new Error(`Failed to connect to ${kind}`);
}

/**
 * クライアントを取得する（健全性チェック付き）
 * 既存の接続が切れている場合は自動的に再接続する
 * @public 外部から接続を事前確立するためにエクスポート
 */
export async function getClient(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  const existing = getClientFromAgent(kind);
  logInfo('fast-chat', `getClient called`, {kind, hasExisting: !!existing});

  // 既存接続がある場合、健全性をチェック
  if (existing) {
    logInfo('fast-chat', `Checking health of existing ${kind} connection`);
    const healthy = await isConnectionHealthy(existing, kind);
    if (healthy) {
      logInfo('fast-chat', `Reusing healthy ${kind} connection`);
      console.error(`[fast-cdp] Reusing healthy ${kind} connection`);
      return existing;
    }

    // 接続が切れている → 古いRelayServerをクリーンアップ
    logConnectionState(kind, 'reconnecting');
    console.error(`[fast-cdp] ${kind} connection lost, reconnecting...`);

    // 古いRelayServerを停止
    const oldRelay = getRelayFromAgent(kind);
    if (oldRelay) {
      logInfo('fast-chat', `Stopping stale ${kind} RelayServer`);
      console.error(`[fast-cdp] Stopping stale ${kind} RelayServer`);
      await oldRelay.stop().catch((err) => {
        logWarn('fast-chat', `Failed to stop stale ${kind} RelayServer`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // キャッシュをクリア
    setClientForAgent(kind, null, null);
  }

  // 新しい接続を作成
  return await createConnection(kind);
}

async function navigate(client: CdpClient, url: string) {
  await client.send('Page.navigate', {url});
  await client.waitForFunction(`document.readyState === 'complete'`, 30000);
}

async function askChatGPTFastInternal(question: string, debug?: boolean): Promise<ChatResult> {
  const t0 = nowMs();
  const timings: Partial<ChatTimings> = {};
  logInfo('chatgpt', 'askChatGPTFast started', {questionLength: question.length});

  const client = await getClient('chatgpt');
  timings.connectMs = nowMs() - t0;
  logInfo('chatgpt', 'getClient completed', {connectMs: timings.connectMs});

  // Network interceptor: parallel capture path (Phase 1)
  const interceptor = new NetworkInterceptor(client);
  interceptor.startCapture();

  const normalizedQuestion = question.replace(/\s+/g, '');

  // ループ前に初期カウントを取得（既存チャット再利用時に重要）
  // まずページロード完了を明示的に待つ
  await client.waitForFunction(`document.readyState === 'complete'`, 30000);
  console.error('[ChatGPT] Page load complete (readyState)');

  // SPA描画安定化のため追加待機
  await new Promise(r => setTimeout(r, 500));
  console.error('[ChatGPT] Waited 500ms for SPA rendering');

  // 既存チャット（/c/を含むURL）の場合、メッセージが描画されるまで待機
  const currentUrl = await client.evaluate<string>('location.href');
  if (currentUrl.includes('/c/')) {
    try {
      await client.waitForFunction(
        `document.querySelectorAll('[data-message-author-role="assistant"]').length > 0`,
        5000
      );
      console.error('[ChatGPT] Existing chat messages loaded');
    } catch {
      console.error('[ChatGPT] No existing messages found, continuing as new chat');
    }
  }

  // 入力欄が表示されるまで待機してから取得
  const tWaitInput = nowMs();
  logInfo('chatgpt', 'Waiting for input field');
  await client.waitForFunction(
    `(
      !!document.querySelector('textarea#prompt-textarea') ||
      !!document.querySelector('textarea[data-testid="prompt-textarea"]') ||
      !!document.querySelector('.ProseMirror[contenteditable="true"]')
    )`,
    30000,
  );
  timings.waitInputMs = nowMs() - tWaitInput;
  logInfo('chatgpt', 'Input field found', {waitInputMs: timings.waitInputMs});

  // 初期メッセージカウントを取得（ページ読み込み完了を待ってから）
  // ページが完全に読み込まれるまでカウントが安定しないため、安定するまで待機
  const userCountExpr = `document.querySelectorAll('[data-message-author-role="user"]').length`;
  const assistantCountExpr = `document.querySelectorAll('[data-message-author-role="assistant"]').length`;

  const initialUserCount = await waitForStableCount(client, userCountExpr);
  const initialAssistantCount = await waitForStableCount(client, assistantCountExpr);
  console.error(`[ChatGPT] Initial counts (stable): user=${initialUserCount}, assistant=${initialAssistantCount}`);

  // createConnection で正しいURL (https://chatgpt.com/) に接続済み

  const sanitized = JSON.stringify(question);
    const tInput = nowMs();
    await client.evaluate(`
      (() => {
        const text = ${sanitized};
        const preferredTextarea =
          document.querySelector('textarea#prompt-textarea') ||
          document.querySelector('textarea[data-testid="prompt-textarea"]');
        const preferredEditable = document.querySelector('.ProseMirror[contenteditable="true"]');
        const isVisible = (el) => {
          if (!el) return false;
          const rects = el.getClientRects();
          if (!rects || rects.length === 0) return false;
          const style = window.getComputedStyle(el);
          return style && style.visibility !== 'hidden' && style.display !== 'none';
        };
        if (preferredEditable) {
          preferredEditable.innerHTML = '';
          const p = document.createElement('p');
          p.textContent = text;
          preferredEditable.appendChild(p);
          preferredEditable.dispatchEvent(new Event('input', {bubbles: true}));
          return true;
        }
        const preferred = preferredTextarea || preferredEditable;
        if (preferred) {
          preferred.focus();
          if (preferred.tagName === 'TEXTAREA') {
            preferred.value = text;
            const inputEvent = typeof InputEvent !== 'undefined'
              ? new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text})
              : new Event('input', {bubbles: true});
            preferred.dispatchEvent(inputEvent);
            preferred.dispatchEvent(new Event('change', {bubbles: true}));
            return true;
          }
        if (preferred.isContentEditable) {
          preferred.focus();
          if (document.execCommand) {
            const range = document.createRange();
            range.selectNodeContents(preferred);
            range.collapse(false);
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
            document.execCommand('insertText', false, text);
          } else {
            preferred.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = text;
            preferred.appendChild(p);
          }
          preferred.dispatchEvent(new Event('input', {bubbles: true}));
          return true;
        }
        }
        const candidates = [
          ...Array.from(document.querySelectorAll('textarea')),
          ...Array.from(document.querySelectorAll('div[contenteditable="true"]')),
        ].filter(isVisible);
        const pick =
          candidates.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return rb.width * rb.height - ra.width * ra.height;
          })[0] || null;
        if (!pick) return false;
        pick.focus();
        if (pick.tagName === 'TEXTAREA') {
          pick.value = text;
          const inputEvent = typeof InputEvent !== 'undefined'
            ? new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text})
            : new Event('input', {bubbles: true});
          pick.dispatchEvent(inputEvent);
          pick.dispatchEvent(new Event('change', {bubbles: true}));
          return true;
        }
        if (pick.isContentEditable) {
          pick.focus();
          if (document.execCommand) {
            const range = document.createRange();
            range.selectNodeContents(pick);
            range.collapse(false);
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
            document.execCommand('insertText', false, text);
          } else {
            pick.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = text;
            pick.appendChild(p);
          }
          pick.dispatchEvent(new Event('input', {bubbles: true}));
          return true;
        }
        return false;
      })()
    `);
    timings.inputMs = nowMs() - tInput;
    let inputMatched = await client.evaluate<boolean>(`
      (() => {
        const preferredTextarea =
          document.querySelector('textarea#prompt-textarea') ||
          document.querySelector('textarea[data-testid="prompt-textarea"]');
        const preferredEditable = document.querySelector('.ProseMirror[contenteditable="true"]');
        const isVisible = (el) => {
          if (!el) return false;
          const rects = el.getClientRects();
          if (!rects || rects.length === 0) return false;
          const style = window.getComputedStyle(el);
          return style && style.visibility !== 'hidden' && style.display !== 'none';
        };
        if (preferredTextarea) {
          const text = preferredTextarea.value || '';
          return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
        }
        if (preferredEditable) {
          const text = preferredEditable.textContent || '';
          return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
        }
        const candidates = [
          ...Array.from(document.querySelectorAll('textarea')),
          ...Array.from(document.querySelectorAll('div[contenteditable="true"]')),
        ].filter(isVisible);
        const pick =
          candidates.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return rb.width * rb.height - ra.width * ra.height;
          })[0] || null;
        const text =
          pick && pick.tagName === 'TEXTAREA'
            ? pick.value || ''
            : pick
              ? pick.textContent || ''
              : '';
        return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
      })()
    `);
    if (!inputMatched) {
      await client.evaluate(`
        (() => {
          const target =
            document.querySelector('#prompt-textarea') ||
            document.querySelector('.ProseMirror[contenteditable="true"]') ||
            document.querySelector('textarea');
          if (target) {
            target.focus();
            target.click?.();
          }
        })()
      `);
      await client.send('Input.insertText', {text: question});
      inputMatched = await client.evaluate<boolean>(`
        (() => {
          const preferredTextarea =
            document.querySelector('textarea#prompt-textarea') ||
            document.querySelector('textarea[data-testid="prompt-textarea"]');
          const preferredEditable = document.querySelector('.ProseMirror[contenteditable="true"]');
          if (preferredTextarea) {
            const text = preferredTextarea.value || '';
            return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
          }
          if (preferredEditable) {
            const text = preferredEditable.textContent || '';
            return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
          }
          return false;
        })()
      `);
      if (!inputMatched) {
        await client.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'a',
          code: 'KeyA',
          windowsVirtualKeyCode: 65,
          modifiers: 2,
        });
        await client.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'a',
          code: 'KeyA',
          windowsVirtualKeyCode: 65,
          modifiers: 2,
        });
        await client.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Backspace',
          code: 'Backspace',
          windowsVirtualKeyCode: 8,
        });
        await client.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Backspace',
          code: 'Backspace',
          windowsVirtualKeyCode: 8,
        });
        for (const ch of question) {
          await client.send('Input.dispatchKeyEvent', {type: 'char', text: ch});
        }
        inputMatched = await client.evaluate<boolean>(`
          (() => {
            const preferredTextarea =
              document.querySelector('textarea#prompt-textarea') ||
              document.querySelector('textarea[data-testid="prompt-textarea"]');
            const preferredEditable = document.querySelector('.ProseMirror[contenteditable="true"]');
            if (preferredTextarea) {
              const text = preferredTextarea.value || '';
              return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
            }
            if (preferredEditable) {
              const text = preferredEditable.textContent || '';
              return text.replace(/\\s+/g, '').includes(${JSON.stringify(normalizedQuestion)});
            }
            return false;
          })()
        `);
      }
      if (!inputMatched) {
        throw new Error('ChatGPT input mismatch after typing.');
      }
    }

    logInfo('chatgpt', 'Input completed, preparing to send', {initialUserCount});

    // 入力完了後の待機（内部状態更新を待つ）
    await new Promise(resolve => setTimeout(resolve, 200));

    const tSend = nowMs();
    logInfo('chatgpt', 'Looking for send button');
    let buttonInfo: {found: boolean; disabled: boolean; x: number; y: number; selector: string} | null = null;
    const maxRetries = 120; // 60秒（500ms × 120回）
    for (let i = 0; i < maxRetries; i++) {
      buttonInfo = await client.evaluate<{
        found: boolean;
        disabled: boolean;
        x: number;
        y: number;
        selector: string;
      }>(`
        (() => {
          ${DOM_UTILS_CODE}
          const buttons = __collectDeep(['button', '[role="button"]']).nodes
            .filter(__isVisible)
            .filter(el => !__isDisabled(el));

          // 「Stop generating」ボタンがあるかチェック（応答生成中）
          const hasStopButton = buttons.some(b => {
            const text = (b.textContent || '').trim();
            const label = (b.getAttribute('aria-label') || '').trim();
            return text.includes('Stop generating') || label.includes('Stop generating') ||
                   text.includes('生成を停止') || label.includes('生成を停止');
          });

          // 応答生成中の場合、送信ボタンはdisabled扱い
          if (hasStopButton) {
            return {found: true, disabled: true, x: 0, y: 0, selector: 'stop-generating-present'};
          }

          // 送信ボタンを検索
          let sendButton =
            buttons.find(b => b.getAttribute('data-testid') === 'send-button') ||
            buttons.find(b =>
              (b.getAttribute('aria-label') || '').includes('送信') ||
              (b.getAttribute('aria-label') || '').includes('Send') ||
              (b.textContent || '').includes('送信') ||
              (b.textContent || '').includes('Send') ||
              b.querySelector('mat-icon[data-mat-icon-name="send"]')
            );

          if (!sendButton) {
            return {found: false, disabled: false, x: 0, y: 0, selector: 'none'};
          }

          const rect = sendButton.getBoundingClientRect();
          return {
            found: true,
            disabled: __isDisabled(sendButton),
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            selector: sendButton.getAttribute('data-testid') || sendButton.getAttribute('aria-label') || sendButton.textContent?.trim().slice(0, 20) || 'send-button'
          };
        })()
      `);

      if (buttonInfo.found && !buttonInfo.disabled) {
        console.error(`[ChatGPT] Send button ready on attempt ${i + 1}: selector="${buttonInfo.selector}"`);
        break;
      }

      if (i < maxRetries - 1) {
        const reason = !buttonInfo.found
          ? 'not found'
          : buttonInfo.disabled
            ? 'disabled (still generating)'
            : 'unknown';
        console.error(`[ChatGPT] Send button not ready (${reason}) - attempt ${i + 1}/${maxRetries}, waiting 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!buttonInfo) {
      throw new Error('ChatGPT send button check failed (buttonInfo is null)');
    }
    if (!buttonInfo.found) {
      throw new Error('ChatGPT send button not found after 60 seconds (page may not be fully loaded).');
    }
    if (buttonInfo.disabled) {
      throw new Error('ChatGPT send button is disabled after 60 seconds (previous response still generating).');
    }

    // JavaScript click() で直接クリック（CDP座標クリックは不安定なため）
    const clickResult = await client.evaluate<{clicked: boolean; selector: string | null}>(`
      (() => {
        const selectors = [
          'button[data-testid="send-button"]',
          '#composer-submit-button',
          'button[aria-label*="送信"]',
          'button[aria-label*="Send"]'
        ];
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
            btn.click();
            return {clicked: true, selector: sel};
          }
        }
        return {clicked: false, selector: null};
      })()
    `);

    if (!clickResult.clicked) {
      logWarn('chatgpt', 'JavaScript click failed, falling back to CDP click');
      // フォールバック: CDP座標クリック
      await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: buttonInfo.x,
        y: buttonInfo.y,
        button: 'left',
        clickCount: 1
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: buttonInfo.x,
        y: buttonInfo.y,
        button: 'left',
        clickCount: 1
      });
    }

    logInfo('chatgpt', 'Send button clicked', {method: clickResult.clicked ? 'js-click' : 'cdp', selector: clickResult.selector || buttonInfo.selector});
    timings.sendMs = nowMs() - tSend;
    // 既存チャットかどうかを事前に判定
    const urlBefore = await client.evaluate<string>('location.href');
    const isExistingChat = urlBefore.includes('/c/');

    try {
      if (isExistingChat) {
        // 既存チャット: メッセージカウント増加のみをチェック
        await client.waitForFunction(
          `document.querySelectorAll('[data-message-author-role="user"]').length > ${initialUserCount}`,
          15000,
        );
      } else {
        // 新規チャット: メッセージカウント増加 OR URL変更（/c/へのリダイレクト）
        await client.waitForFunction(
          `document.querySelectorAll('[data-message-author-role="user"]').length > ${initialUserCount} || location.href.includes('/c/')`,
          15000,
        );

        const urlNow = await client.evaluate<string>('location.href');
        if (urlNow.includes('/c/') && initialUserCount === 0) {
          // 新規チャット作成時: メッセージが表示されるまで待機
          await client.waitForFunction(
            `document.querySelectorAll('[data-message-author-role="user"]').length > 0`,
            15000,
          );
        }
      }

      // デバッグ: 送信後のメッセージカウント
      const userCountAfter = await client.evaluate<number>(
        `document.querySelectorAll('[data-message-author-role="user"]').length`
      );
      logInfo('chatgpt', 'Message sent successfully', {userCountBefore: initialUserCount, userCountAfter});

      if (userCountAfter <= initialUserCount && !(initialUserCount === 0 && userCountAfter > 0)) {
        throw new Error(`Message count did not increase (before: ${initialUserCount}, after: ${userCountAfter})`);
      }
    } catch (error) {
      // フォールバック: Enterキーイベント
      logWarn('chatgpt', 'Message not sent, trying Enter key fallback');
      await client.evaluate(`
        (() => {
          const textarea =
            document.querySelector('textarea#prompt-textarea') ||
            document.querySelector('textarea[data-testid="prompt-textarea"]') ||
            document.querySelector('.ProseMirror[contenteditable="true"]') ||
            document.querySelector('textarea');
          if (textarea) {
            textarea.focus();
            const eventInit = {bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13};
            textarea.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            textarea.dispatchEvent(new KeyboardEvent('keyup', eventInit));
          }
        })()
      `);
      try {
        await client.waitForFunction(
          `document.querySelectorAll('[data-message-author-role="user"]').length > ${initialUserCount}`,
          5000
        );
        logInfo('chatgpt', 'Enter key fallback succeeded');
      } catch (fallbackError) {
        const debugPayload = await client.evaluate<Record<string, any>>(`(() => {
          const msgs = document.querySelectorAll('[data-message-author-role=\"user\"]');
          const textarea =
            document.querySelector('textarea#prompt-textarea') ||
            document.querySelector('textarea[data-testid=\"prompt-textarea\"]') ||
            document.querySelector('textarea');
          const sendButton = document.querySelector('button[data-testid=\"send-button\"]');
          const iframes = Array.from(document.querySelectorAll('iframe')).map(frame => ({
            src: frame.getAttribute('src') || '',
            id: frame.id || '',
            name: frame.name || '',
            title: frame.title || ''
          }));
          return {
            url: location.href,
            title: document.title,
            userCount: msgs.length,
            textareaValue: textarea ? textarea.value || '' : '',
            textareaDisabled: textarea ? textarea.disabled || textarea.getAttribute('aria-disabled') === 'true' : null,
            textareaHasForm: textarea ? Boolean(textarea.form) : null,
            formAction: textarea && textarea.form ? textarea.form.action || '' : '',
            sendButtonDisabled: sendButton ? sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true' : null,
            iframeCount: iframes.length,
            iframes: iframes.slice(0, 5),
          };
        })()`);
        await saveDebug('chatgpt', {
          reason: 'userMessageTimeout',
          question,
          ...debugPayload,
        });
        throw new Error(`ChatGPT send did not create a new user message: ${String(error)}, fallback also failed: ${String(fallbackError)}`);
      }
    }
    // メッセージカウント増加を確認済みなので、テキストマッチングは不要
    // （ChatGPT UIの構造により、textContentが取得できない場合があるため）
    console.error('[ChatGPT] Message sent successfully (count increased)');
    timings.sendMs = nowMs() - tSend;

    // 新しいアシスタントメッセージが追加される、または既存メッセージのテキストが変化するまで待つ
    // 既存チャット再接続時: 新しいDOM要素が追加されず、既存の最後の要素にストリーミング追記される場合がある
    const initialLastTextLength = await client.evaluate<number>(`
      (() => {
        const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (msgs.length === 0) return 0;
        return (msgs[msgs.length - 1].textContent || '').length;
      })()
    `);
    console.error(`[ChatGPT] Initial state: assistantCount=${initialAssistantCount}, lastTextLength=${initialLastTextLength}`);

    try {
      await client.waitForFunction(`
        (() => {
          const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (msgs.length === 0) return false;
          const lastText = msgs[msgs.length - 1].textContent || '';
          // カウント増加 OR テキスト長変化（10文字以上の変化で検出）
          return msgs.length > ${initialAssistantCount} || lastText.length > ${initialLastTextLength} + 10;
        })()
      `, 30000);
      console.error('[ChatGPT] New response detected (count or text change)');
    } catch {
      console.error('[ChatGPT] Timeout waiting for response change, continuing with stop button detection...');
    }

    const tWaitResp = nowMs();
    console.error('[ChatGPT] Waiting for response (using stop button detection)...');

    // 新方式: ポーリングで状態を監視（診断ログ付き）
    // 長い応答に対応するため8分（480秒）に設定
    const maxWaitMs = 480000;
    const pollIntervalMs = 1000;
    const startWait = Date.now();
    let lastLoggedState = '';
    let sawStopButton = false;  // 生成中状態を検出したかどうか
    let streamingText = '';     // ストリーミング中に取得したテキスト（完了後に折りたたまれる対策）

    while (Date.now() - startWait < maxWaitMs) {
      const state = await client.evaluate<{
        hasStopButton: boolean;
        sendButtonFound: boolean;
        sendButtonDisabled: boolean | null;
        sendButtonTestId: string | null;
        assistantMsgCount: number;
        inputBoxHasText: boolean;
        isStillGenerating: boolean;
        hasResponseText: boolean;
        hasSkipThinkingButton: boolean;
        // デバッグ情報
        debug_assistantMsgsCount: number;
        debug_chatgptArticlesCount: number;
        debug_markdownsInLast: number;
        debug_lastAssistantInnerTextLen: number;
        debug_markdownInfo: string;
        debug_childInfo: string;
        debug_fullText: string;
        debug_articleTexts: string;
        debug_bodySnippet: string;
        debug_bodyLen: number;
        debug_pageUrl: string;
        debug_pageTitle: string;
        debug_iframeCount: number;
        debug_allMarkdownsInfo: string;
        debug_outerHtml: string;
        debug_mainContent: string;
        debug_presentationText: string;
      }>(`
        (() => {
          ${DOM_UTILS_CODE}

          // 停止ボタン検出（フォールバックセレクター付き）
          const stopBtn = document.querySelector('button[data-testid="stop-button"]') ||
                          document.querySelector('button[aria-label*="停止"]') ||
                          document.querySelector('button[aria-label*="Stop"]');
          const buttons = __collectDeep(['button', '[role="button"]']).nodes;
          // 送信ボタン検出（フォールバックセレクター付き）
          // 注意: 応答完了後は音声ボタンに置き換わり、送信ボタンがDOMから消える
          const sendBtn = buttons.find(b =>
            b.getAttribute('data-testid') === 'send-button' ||
            b.getAttribute('aria-label')?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('Send')
          );
          const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');

          // 新UI対応: articleからChatGPTのメッセージを探す
          const chatgptArticles = [];
          for (const article of document.querySelectorAll('article')) {
            const heading = article.querySelector('h6, h5, [role="heading"]');
            if (heading && (heading.textContent || '').includes('ChatGPT')) {
              chatgptArticles.push(article);
            }
          }

          // 入力欄の状態確認
          const inputBox = document.querySelector('.ProseMirror[contenteditable="true"]') ||
                          document.querySelector('textarea#prompt-textarea');
          const inputText = inputBox ?
            (inputBox.tagName === 'TEXTAREA' ? inputBox.value : inputBox.textContent) || '' : '';

          // Thinkingモード: 「回答を生成しています」テキストが表示されている間は生成中
          // ただし「思考時間: Xs」が表示されていれば完了とみなす
          const bodyText = document.body?.innerText || '';
          const hasGeneratingText = bodyText.includes('回答を生成しています') ||
                                   bodyText.includes('is still generating') ||
                                   bodyText.includes('generating a response');
          // 「思考時間」マーカーがあれば完了（Thinkingモード終了のサイン）
          const hasThinkingComplete = /思考時間[：:]\s*\d+s?/.test(bodyText) ||
                                      /Thinking.*\d+s?/.test(bodyText);
          // 「今すぐ回答」「Skip thinking」ボタンがある場合はThinking進行中
          const hasSkipThinkingButton = bodyText.includes('今すぐ回答') ||
                                        bodyText.includes('Skip thinking');
          const isStillGenerating = (hasGeneratingText && !hasThinkingComplete) || hasSkipThinkingButton;

          // 最後のアシスタントメッセージに実際のテキストがあるかチェック
          // 旧UIセレクター + 新UI(article)の両方を試す
          const lastAssistant = assistantMsgs[assistantMsgs.length - 1] ||
                               chatgptArticles[chatgptArticles.length - 1];
          let hasResponseText = false;
          if (lastAssistant) {
            // .markdown 内のテキストを確認（.result-thinking は空のプレースホルダーの可能性）
            const markdowns = lastAssistant.querySelectorAll('.markdown');
            for (const md of markdowns) {
              // result-thinking 以外の .markdown をチェック
              if (!md.classList.contains('result-thinking')) {
                // innerText が空でも textContent を試す
                const text = (md.innerText || md.textContent || '').trim();
                if (text.length > 0) {
                  hasResponseText = true;
                  break;
                }
              }
            }
            // result-thinking 内もチェック（テキストがあれば有効）
            if (!hasResponseText) {
              const rt = lastAssistant.querySelector('.result-thinking');
              if (rt) {
                const text = (rt.innerText || rt.textContent || '').trim();
                hasResponseText = text.length > 0;
              }
            }
            // 追加: .prose, [class*="markdown"], p要素 からもテキストを探す
            if (!hasResponseText) {
              const additionalSelectors = [
                '.prose:not(.result-thinking)',
                '[class*="markdown"]:not(.result-thinking)',
              ];
              for (const sel of additionalSelectors) {
                const elem = lastAssistant.querySelector(sel);
                if (elem) {
                  const text = (elem.innerText || elem.textContent || '').trim();
                  if (text.length > 0) {
                    hasResponseText = true;
                    break;
                  }
                }
              }
            }
            // 追加: button以外のp要素からテキストを探す
            if (!hasResponseText) {
              const paragraphs = lastAssistant.querySelectorAll('p');
              for (const p of paragraphs) {
                if (p.closest('button')) continue;
                const text = (p.innerText || p.textContent || '').trim();
                if (text.length > 0) {
                  hasResponseText = true;
                  break;
                }
              }
            }
          }
          // 追加: <main>要素から「ChatGPT:」以降のテキストを探す（Thinkingモード対応）
          if (!hasResponseText) {
            const mainEl = document.querySelector('main');
            if (mainEl) {
              const mainText = mainEl.innerText || '';
              // 「ChatGPT:」以降を取得し、終端マーカーで切る
              const idx = mainText.lastIndexOf('ChatGPT:');
              if (idx >= 0) {
                let afterChatGPT = mainText.slice(idx + 8).trim();
                // 終端マーカーで切る
                const endMarkers = ['あなた:', 'You:', '思考の拡張', 'ChatGPT の回答'];
                for (const m of endMarkers) {
                  const endIdx = afterChatGPT.indexOf(m);
                  if (endIdx > 0) afterChatGPT = afterChatGPT.slice(0, endIdx).trim();
                }
                // UIテキストではない実際の回答があるか
                if (afterChatGPT.length > 5 &&
                    !afterChatGPT.startsWith('思考の拡張') &&
                    !afterChatGPT.includes('cookie の設定')) {
                  hasResponseText = true;
                }
              }
            }
          }

          // assistantMsgCount: 旧UIセレクター + 新UI(article)の両方をカウント
          const assistantCount = Math.max(assistantMsgs.length, chatgptArticles.length);

          // デバッグ情報の収集
          const markdownsInLast = lastAssistant ? lastAssistant.querySelectorAll('.markdown').length : 0;
          const lastAssistantText = lastAssistant ? (lastAssistant.innerText || '').trim() : '';
          // 追加デバッグ: .markdown の内容と className
          let debug_markdownInfo = '';
          if (lastAssistant) {
            const mds = lastAssistant.querySelectorAll('.markdown');
            for (let i = 0; i < Math.min(mds.length, 3); i++) {
              const md = mds[i];
              const cls = md.className || '';
              const innerTxt = (md.innerText || '').trim().slice(0, 50);
              const textContent = (md.textContent || '').trim().slice(0, 50);
              // p要素のテキストも確認
              const pElements = md.querySelectorAll('p');
              let pTexts = '';
              for (let j = 0; j < Math.min(pElements.length, 3); j++) {
                const pTxt = (pElements[j].innerText || pElements[j].textContent || '').trim().slice(0, 30);
                pTexts += 'p[' + j + ']="' + pTxt + '" ';
              }
              debug_markdownInfo += 'md[' + i + ']: cls="' + cls.slice(0, 30) + '", innerT=' + innerTxt.length + ', textC=' + textContent.length + ', ' + pTexts + '| ';
            }
          }
          // lastAssistantの直接の子要素を調査
          let debug_childInfo = '';
          if (lastAssistant) {
            const children = lastAssistant.children || [];
            for (let i = 0; i < Math.min(children.length, 5); i++) {
              const ch = children[i];
              const tag = ch.tagName || '';
              const cls = (ch.className || '').slice(0, 30);
              const txt = (ch.innerText || ch.textContent || '').trim().slice(0, 30);
              debug_childInfo += tag + '.' + cls + '="' + txt + '" | ';
            }
          }
          // lastAssistant全体のinnerTextを調査（longer preview）
          let debug_fullText = '';
          if (lastAssistant) {
            debug_fullText = (lastAssistant.innerText || '').trim().slice(0, 200);
          }
          // lastAssistantのouterHTMLの一部を取得（DOM構造確認用）
          let debug_outerHtml = '';
          if (lastAssistant) {
            debug_outerHtml = (lastAssistant.outerHTML || '').slice(0, 500);
          }
          // 追加: メインコンテンツエリアの全テキストを取得
          let debug_mainContent = '';
          const mainEl = document.querySelector('main');
          if (mainEl) {
            debug_mainContent = (mainEl.innerText || '').slice(0, 300);
          }
          // 追加: role=presentation の要素内テキスト（ChatGPTのメッセージ表示エリア）
          let debug_presentationText = '';
          const presentationEl = document.querySelector('[role="presentation"]');
          if (presentationEl) {
            debug_presentationText = (presentationEl.innerText || '').slice(0, 300);
          }
          // 全articleのinnerTextをチェック
          let debug_articleTexts = '';
          for (let i = 0; i < chatgptArticles.length; i++) {
            const art = chatgptArticles[i];
            const txt = (art.innerText || '').trim().slice(0, 50);
            debug_articleTexts += 'art[' + i + ']="' + txt + '" | ';
          }
          // body全体のinnerTextから回答らしき部分を探す
          const bodyInnerText = (document.body?.innerText || '');
          // bodyの長さ
          const debug_bodyLen = bodyInnerText.length;
          // ページURLとタイトル
          const debug_pageUrl = location.href;
          const debug_pageTitle = document.title;
          // iframeの数
          const debug_iframeCount = document.querySelectorAll('iframe').length;
          // body text snippet
          const debug_bodySnippet = bodyInnerText.slice(0, 100);
          // 追加デバッグ: document全体の.markdown要素数と最初の3つの情報
          const allMarkdowns = document.querySelectorAll('.markdown');
          let debug_allMarkdownsInfo = 'total=' + allMarkdowns.length + ' | ';
          for (let i = 0; i < Math.min(allMarkdowns.length, 3); i++) {
            const md = allMarkdowns[i];
            const rect = md.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            const cls = (md.className || '').slice(0, 40);
            const txtLen = (md.innerText || '').length;
            debug_allMarkdownsInfo += 'md[' + i + ']: visible=' + visible + ', cls="' + cls + '", len=' + txtLen + ' | ';
          }
          // lastAssistantをスクロールして可視化（テスト）
          if (lastAssistant) {
            try { lastAssistant.scrollIntoView({ block: 'center' }); } catch {}
          }

          return {
            hasStopButton: Boolean(stopBtn),
            sendButtonFound: Boolean(sendBtn),
            sendButtonDisabled: sendBtn ? (
              sendBtn.disabled ||
              sendBtn.getAttribute('aria-disabled') === 'true' ||
              sendBtn.getAttribute('disabled') === 'true'
            ) : null,
            sendButtonTestId: sendBtn ? sendBtn.getAttribute('data-testid') : null,
            assistantMsgCount: assistantCount,
            inputBoxHasText: inputText.trim().length > 0,
            isStillGenerating,
            hasResponseText,
            hasSkipThinkingButton,
            // デバッグ情報
            debug_assistantMsgsCount: assistantMsgs.length,
            debug_chatgptArticlesCount: chatgptArticles.length,
            debug_markdownsInLast: markdownsInLast,
            debug_lastAssistantInnerTextLen: lastAssistantText.length,
            debug_markdownInfo: debug_markdownInfo,
            debug_childInfo: debug_childInfo,
            debug_fullText: debug_fullText,
            debug_articleTexts: debug_articleTexts,
            debug_bodySnippet: debug_bodySnippet,
            debug_bodyLen: debug_bodyLen,
            debug_pageUrl: debug_pageUrl,
            debug_pageTitle: debug_pageTitle,
            debug_iframeCount: debug_iframeCount,
            debug_allMarkdownsInfo: debug_allMarkdownsInfo,
            debug_outerHtml: debug_outerHtml,
            debug_mainContent: debug_mainContent,
            debug_presentationText: debug_presentationText,
          };
        })()
      `);

      // stopボタンを検出したらフラグを立てる（生成が始まった証拠）
      if (state.hasStopButton) {
        sawStopButton = true;
      }

      // 状態が変化した場合のみログ出力
      const currentState = JSON.stringify(state);
      if (currentState !== lastLoggedState) {
        const elapsed = Math.round((Date.now() - startWait) / 1000);
        console.error(`[ChatGPT] State @${elapsed}s: stop=${state.hasStopButton}, send=${state.sendButtonFound}(disabled=${state.sendButtonDisabled}), assistant=${state.assistantMsgCount}, inputHasText=${state.inputBoxHasText}, sawStop=${sawStopButton}, generating=${state.isStillGenerating}, skipThink=${state.hasSkipThinkingButton}, hasText=${state.hasResponseText}`);
        lastLoggedState = currentState;
      }

      // 応答完了条件（Thinkingモード対応版）:
      // 1. 停止ボタンを一度でも見た後に消えた
      // 2. AND 入力欄が空
      // 3. AND 新しいアシスタントメッセージが増えた
      // 注: hasResponseText は CDP でテキスト取得できない場合があるため必須条件から外す
      if (sawStopButton && !state.hasStopButton && !state.inputBoxHasText &&
          state.assistantMsgCount > initialAssistantCount) {
        console.error(`[ChatGPT] Response complete - stop button disappeared, input empty, assistant count increased (${initialAssistantCount} -> ${state.assistantMsgCount})`);
        // ChatGPT 5.2 Thinking: 完了直後にストリーミング中のテキストをキャプチャ
        // （完了後は折りたたまれてしまうため、この時点で取得）
        streamingText = await client.evaluate<string>(`
          (() => {
            const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
            if (msgs.length === 0) return '';
            const last = msgs[msgs.length - 1];
            // .markdown, .result-thinking, または直接テキストを試す
            const md = last.querySelector('.markdown');
            if (md) {
              const t = (md.innerText || md.textContent || '').trim();
              if (t.length > 0) return t;
            }
            const rt = last.querySelector('.result-thinking');
            if (rt) {
              const t = (rt.innerText || rt.textContent || '').trim();
              if (t.length > 0) return t;
            }
            return (last.innerText || last.textContent || '').trim();
          })()
        `);
        break;
      }

      // フォールバック: 5秒以上待って、stopボタンなし、入力欄空、新しいアシスタントメッセージが増えた
      // （stopボタンを見逃した場合の救済）
      const elapsed = Date.now() - startWait;
      if (elapsed > 5000 && !state.hasStopButton && !state.inputBoxHasText &&
          state.assistantMsgCount > initialAssistantCount && !state.isStillGenerating) {
        console.error(`[ChatGPT] Response complete - fallback after 5s (no stop button, input empty, assistant count increased ${initialAssistantCount} -> ${state.assistantMsgCount})`);
        break;
      }

      // Thinkingモード専用フォールバック: stopボタンなしでも、生成完了していれば完了
      // 重要: 「今すぐ回答」ボタンがある間は、まだThinking中なので待機を継続
      if (elapsed > 10000 && !state.isStillGenerating && !state.hasSkipThinkingButton &&
          state.assistantMsgCount > initialAssistantCount && !state.inputBoxHasText) {
        console.error(`[ChatGPT] Response complete - Thinking mode fallback after 10s (generating complete, no skip button)`);
        break;
      }

      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    // タイムアウトチェック
    if (Date.now() - startWait >= maxWaitMs) {
      const finalState = await client.evaluate<Record<string, unknown>>(`
        (() => {
          // フォールバックセレクター付きの検出
          const stopBtn = document.querySelector('button[data-testid="stop-button"]') ||
                          document.querySelector('button[aria-label*="停止"]') ||
                          document.querySelector('button[aria-label*="Stop"]');
          const allButtons = Array.from(document.querySelectorAll('button'));
          const sendBtn = allButtons.find(b =>
            b.getAttribute('data-testid') === 'send-button' ||
            b.getAttribute('aria-label')?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('Send')
          );
          const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');
          const inputBox = document.querySelector('.ProseMirror[contenteditable="true"]') ||
                          document.querySelector('textarea#prompt-textarea');
          const inputText = inputBox ?
            (inputBox.tagName === 'TEXTAREA' ? inputBox.value : inputBox.textContent) || '' : '';
          return {
            hasStopButton: Boolean(stopBtn),
            sendButtonFound: Boolean(sendBtn),
            sendButtonDisabled: sendBtn ? sendBtn.disabled : null,
            sendButtonAriaDisabled: sendBtn ? sendBtn.getAttribute('aria-disabled') : null,
            assistantMsgCount: assistantMsgs.length,
            inputBoxHasText: inputText.trim().length > 0,
            url: location.href,
          };
        })()
      `);
      console.error(`[ChatGPT] Timeout - final state: ${JSON.stringify(finalState)}`);
      throw new Error(`Timed out waiting for ChatGPT response (8min). Final state: ${JSON.stringify(finalState)}`);
    }

    // ChatGPT 5.2 Thinking モデル対応:
    // 回答が「思考」として折りたたまれている場合は展開してからテキストを取得
    // 重要: 回答内（article内）のボタンのみを対象にする
    // 入力欄横の「思考の拡張」ボタンを誤クリックしないよう厳密に検出
    const clickedExpand = await client.evaluate<boolean>(`
      (() => {
        // ChatGPTの回答article内のボタンのみを探す
        const articles = document.querySelectorAll('article');
        for (const article of articles) {
          const heading = article.querySelector('h6, h5, [role="heading"]');
          if (heading && (heading.textContent || '').includes('ChatGPT')) {
            // この回答内のボタンを探す
            const buttons = article.querySelectorAll('button');
            for (const btn of buttons) {
              const text = (btn.innerText || '').toLowerCase();
              // 「思考時間」「X seconds」を含むボタンで、展開可能なもの
              // 入力欄横の「思考の拡張」は article 外にあるので対象外
              if ((text.includes('思考時間') || text.includes('second') || text.includes('秒')) &&
                  btn.getAttribute('aria-expanded') === 'false') {
                btn.click();
                return true;
              }
            }
          }
        }
        return false;
      })()
    `);
    if (clickedExpand) {
      // 展開アニメーションとコンテンツロードを待つ
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.error('[ChatGPT] Expanded thinking content');
    }

    // 回答完了後、DOM安定化のための追加待機
    // ChatGPT Thinkingモードでは、停止ボタン消失後も最終回答がレンダリングされるまで遅延がある
    // 回答テキストが存在するまでポーリングで待機
    const maxWaitForText = 120000;  // 最大120秒（Thinkingモード対応：長い思考の後の回答レンダリングを待機）
    const pollInterval = 200;
    const waitStart = Date.now();
    let hasResponseText = false;

    // 重要: タブをフォアグラウンドに持ってくる
    // ChatGPTはバックグラウンドタブではテキストをレンダリングしない（パフォーマンス最適化）
    // Page.bringToFrontでタブをアクティブにすると、Reactがテキストをレンダリングする
    try {
      await client.send('Page.enable');
      await client.send('Page.bringToFront');
      // タブがフォアグラウンドになった後、Reactがレンダリングを完了するまで待機
      await new Promise(r => setTimeout(r, 500));
    } catch {
      // Page.bringToFrontが失敗しても続行（一部の環境では利用できない場合がある）
      console.error('[ChatGPT] Page.bringToFront failed, continuing anyway');
    }

    while (Date.now() - waitStart < maxWaitForText) {
      // Step 1: 最後のChatGPT articleを見つけてスクロール
      await client.evaluate<void>(`
        (() => {
          const articles = document.querySelectorAll('article');
          for (let i = articles.length - 1; i >= 0; i--) {
            const heading = articles[i].querySelector('h6, h5, [role="heading"]');
            if (heading && (heading.textContent || '').includes('ChatGPT')) {
              articles[i].scrollIntoView({ block: 'center', behavior: 'instant' });
              break;
            }
          }
        })()
      `);

      // Step 2: スクロール後、DOMの更新を待つ
      await new Promise(r => setTimeout(r, 100));

      // Step 3: テキストをチェック
      const checkResult = await client.evaluate<{ hasText: boolean; textLength: number; articleIndex: number; markdownClass: string; hasSkipButton: boolean; isStreaming: boolean; debug?: string }>(`
        (() => {
          const articles = document.querySelectorAll('article');
          // 最後のChatGPT articleを探す（テキストを持つものを優先）
          let lastChatGPTArticle = null;
          let lastChatGPTWithText = null;
          let lastIndex = -1;
          let lastIndexWithText = -1;
          for (let i = 0; i < articles.length; i++) {
            const heading = articles[i].querySelector('h6, h5, [role="heading"]');
            if (heading && (heading.textContent || '').includes('ChatGPT')) {
              lastChatGPTArticle = articles[i];
              lastIndex = i;
              // .markdown内にテキストがあるか確認
              const md = articles[i].querySelector('.markdown:not(.result-thinking)');
              if (md && (md.innerText || '').trim().length > 0) {
                lastChatGPTWithText = articles[i];
                lastIndexWithText = i;
              }
            }
          }
          // テキストを持つarticleを優先
          if (lastChatGPTWithText) {
            lastChatGPTArticle = lastChatGPTWithText;
            lastIndex = lastIndexWithText;
          }

          // 「今すぐ回答」「Skip thinking」ボタンがあるかチェック（Thinking進行中のサイン）
          const bodyText = document.body?.innerText || '';
          const hasSkipButton = bodyText.includes('今すぐ回答') || bodyText.includes('Skip thinking');

          if (!lastChatGPTArticle) return { hasText: false, textLength: 0, articleIndex: -1, markdownClass: '', hasSkipButton, isStreaming: false, debug: 'no article' };

          // 最後のarticle内で .markdown を探す
          // 注意: CDPでは .result-thinking クラスが付いていても、それが唯一の .markdown の場合がある
          const markdowns = lastChatGPTArticle.querySelectorAll('.markdown');
          const debugMd = Array.from(markdowns).map(md => ({
            cls: md.className.slice(0, 50),
            rt: md.classList.contains('result-thinking'),
            itLen: (md.innerText || '').length,
            tcLen: (md.textContent || '').length,
            html: (md.innerHTML || '').slice(0, 100)
          }));

          // まず .result-thinking ではない .markdown を試す
          for (const md of markdowns) {
            if (md.classList.contains('result-thinking')) continue;
            const isStreaming = md.classList.contains('streaming-animation');
            const text = (md.innerText || md.textContent || '').trim();
            if (text.length > 0) return { hasText: true, textLength: text.length, articleIndex: lastIndex, markdownClass: md.className, hasSkipButton, isStreaming, debug: JSON.stringify(debugMd) };
          }

          // フォールバック: .result-thinking でもテキストがあれば使う
          for (const md of markdowns) {
            const text = (md.innerText || md.textContent || '').trim();
            if (text.length > 0) return { hasText: true, textLength: text.length, articleIndex: lastIndex, markdownClass: md.className, hasSkipButton, isStreaming: false, debug: JSON.stringify(debugMd) };
          }

          // フォールバック: article内の p 要素を探す
          const paragraphs = lastChatGPTArticle.querySelectorAll('p');
          for (const p of paragraphs) {
            if (p.closest('button')) continue;  // button内のpは除外
            // CDPではinnerTextが空を返すことがあるため、textContentも試す
            const text = (p.innerText || p.textContent || '').trim();
            if (text.length > 0) return { hasText: true, textLength: text.length, articleIndex: lastIndex, markdownClass: 'p-element', hasSkipButton, isStreaming: false };
          }

          // 最終フォールバック: article全体のinnerText（ヘッダー除外）
          const articleText = (lastChatGPTArticle.innerText || '').trim();
          // "ChatGPT:" と "思考時間" を除外した実際のコンテンツがあるか
          const cleanedText = articleText
            .replace(/^ChatGPT:?\\s*/i, '')
            .replace(/思考時間[：:]\\s*\\d+s?/g, '')
            .replace(/今すぐ回答/g, '')
            .replace(/Skip thinking/g, '')
            .trim();
          if (cleanedText.length > 10) {
            return { hasText: true, textLength: cleanedText.length, articleIndex: lastIndex, markdownClass: 'article-fallback', hasSkipButton, isStreaming: false, debug: JSON.stringify(debugMd) };
          }

          return { hasText: false, textLength: 0, articleIndex: lastIndex, markdownClass: '', hasSkipButton, isStreaming: false, debug: JSON.stringify(debugMd) };
        })()
      `);

      // 「今すぐ回答」ボタンがある間はThinking中なので待機を継続
      if (checkResult.hasSkipButton) {
        const elapsed = Date.now() - waitStart;
        if (elapsed > 0 && elapsed % 3000 < pollInterval) {
          console.error(`[ChatGPT] Thinking in progress (skip button visible)... (${elapsed}ms)`);
        }
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      if (checkResult.hasText) {
        // ストリーミング中はまだ完了していないので待機を継続
        if (checkResult.isStreaming) {
          const elapsed = Date.now() - waitStart;
          if (elapsed > 0 && elapsed % 3000 < pollInterval) {
            console.error(`[ChatGPT] Response streaming... (${checkResult.textLength} chars, ${elapsed}ms)`);
          }
          await new Promise(r => setTimeout(r, pollInterval));
          continue;
        }
        hasResponseText = true;
        console.error(`[ChatGPT] Response text ready (${checkResult.textLength} chars) in article[${checkResult.articleIndex}] (${checkResult.markdownClass}) after ${Date.now() - waitStart}ms`);
        break;
      }
      // 定期的にデバッグログを出力
      const elapsed = Date.now() - waitStart;
      if (elapsed > 0 && elapsed % 2000 < pollInterval) {
        console.error(`[ChatGPT] Still waiting for response text... (${elapsed}ms, articleIndex=${checkResult.articleIndex}, debug=${checkResult.debug || 'none'})`);
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }

    if (!hasResponseText) {
      console.error(`[ChatGPT] Warning: Response text not detected after ${maxWaitForText}ms, proceeding with extraction...`);
    }

    // CDPセッション確認用デバッグログ
    const cdpDebug = await client.evaluate<{
      url: string;
      documentTitle: string;
      articleCount: number;
      markdownCount: number;
      bodyTextLength: number;
    }>(`
      (() => {
        return {
          url: window.location.href,
          documentTitle: document.title,
          articleCount: document.querySelectorAll('article').length,
          markdownCount: document.querySelectorAll('.markdown').length,
          bodyTextLength: (document.body.innerText || '').length
        };
      })()
    `);
    console.error('[ChatGPT] CDP debug:', JSON.stringify(cdpDebug));

    // 最後のアシスタントメッセージを直接取得
    // ChatGPT 5.2 Thinking: .result-thinking または .markdown 内のテキスト
    // リトライロジック: CDPがReactレンダリング完了前に実行される問題に対応

    // 重要: 最後のarticleにスクロールしてからテキストを抽出
    // CDPでは、ビューポート外の要素のinnerTextが空になる場合がある
    await client.evaluate<void>(`
      (() => {
        const articles = document.querySelectorAll('article');
        if (articles.length > 0) {
          articles[articles.length - 1].scrollIntoView({ block: 'end', behavior: 'instant' });
        }
      })()
    `);
    // スクロール後のレンダリング待機
    await new Promise(resolve => setTimeout(resolve, 300));

    let answer = '';
    const extractMaxRetries = 2;  // リトライを2回に削減（body.innerTextフォールバックがあるため）
    const extractBaseIntervalMs = 500;  // 段階的増加の基本間隔

    for (let retry = 0; retry < extractMaxRetries; retry++) {
      // 2回目以降は段階的に待機時間を増加（500ms, 750ms, 1000ms, 1250ms）
      if (retry > 0) {
        const waitMs = extractBaseIntervalMs + (retry - 1) * 250;
        console.error(`[ChatGPT] Waiting ${waitMs}ms before retry ${retry}...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
      // デバッグ: 抽出前のDOM状態を確認（最新articleの詳細）
      const debugInfo = await client.evaluate<{
        articles: number,
        chatgptArticles: number,
        lastArticleDebug: {
          index: number,
          markdownCount: number,
          markdowns: Array<{ className: string, innerTextLength: number, isResultThinking: boolean }>,
          paragraphCount: number,
          paragraphs: Array<{ innerTextLength: number, preview: string, inButton: boolean }>,
          articleInnerTextLength: number,
          articleInnerTextPreview: string
        } | null
      }>(`
        (() => {
          const articles = Array.from(document.querySelectorAll('article'));
          let chatgptCount = 0;
          let lastChatGPT = null;
          let lastIndex = -1;

          for (let i = 0; i < articles.length; i++) {
            const heading = articles[i].querySelector('h6, h5, [role="heading"]');
            if (heading && (heading.textContent || '').includes('ChatGPT')) {
              chatgptCount++;
              lastChatGPT = articles[i];
              lastIndex = i;
            }
          }

          if (!lastChatGPT) return { articles: articles.length, chatgptArticles: chatgptCount, lastArticleDebug: null };

          // 最新articleの詳細
          const markdowns = lastChatGPT.querySelectorAll('.markdown');
          const mdInfos = [];
          for (const md of markdowns) {
            mdInfos.push({
              className: md.className,
              innerTextLength: (md.innerText || '').length,
              isResultThinking: md.classList.contains('result-thinking')
            });
          }

          const paragraphs = lastChatGPT.querySelectorAll('p');
          const pInfos = [];
          for (let i = 0; i < Math.min(paragraphs.length, 5); i++) {
            const p = paragraphs[i];
            pInfos.push({
              innerTextLength: (p.innerText || '').length,
              preview: (p.innerText || '').substring(0, 30),
              inButton: !!p.closest('button')
            });
          }

          return {
            articles: articles.length,
            chatgptArticles: chatgptCount,
            lastArticleDebug: {
              index: lastIndex,
              markdownCount: markdowns.length,
              markdowns: mdInfos,
              paragraphCount: paragraphs.length,
              paragraphs: pInfos,
              articleInnerTextLength: (lastChatGPT.innerText || '').length,
              articleInnerTextPreview: (lastChatGPT.innerText || '').substring(0, 100)
            }
          };
        })()
      `);
      if (retry === 0) {
        console.error('[ChatGPT] Extract debug:', JSON.stringify(debugInfo.lastArticleDebug));
      }

      answer = await client.evaluate<string>(`
        (() => {
          const articles = document.querySelectorAll('article');
          let lastAssistantArticle = null;
          let lastAssistantWithText = null;

          // 新UI: article内のh6/h5/[role="heading"]に"ChatGPT"を含むものを探す
          // 仮想スクロール対策: テキストを持つ最後のarticleを優先
          for (const article of articles) {
            const heading = article.querySelector('h6, h5, [role="heading"]');
            if (heading && (heading.textContent || '').includes('ChatGPT')) {
              lastAssistantArticle = article;
              // .markdown内にテキストがあるか確認
              const md = article.querySelector('.markdown:not(.result-thinking)');
              if (md && (md.innerText || '').trim().length > 0) {
                lastAssistantWithText = article;
              }
            }
          }

          // テキストを持つarticleを優先、なければ最後のarticle
          lastAssistantArticle = lastAssistantWithText || lastAssistantArticle;

          // フォールバック: 旧セレクター
          if (!lastAssistantArticle) {
            const old = document.querySelectorAll('[data-message-author-role="assistant"]');
            if (old.length > 0) lastAssistantArticle = old[old.length - 1];
          }

          if (!lastAssistantArticle) return '';

          // ChatGPT 5.2 Thinking 対応:
          // 1. 通常の .markdown を先に探す（.result-thinking ではないもの）
          // 2. .result-thinking.markdown は空のプレースホルダーの場合があるので後回し

          // Step 1: .result-thinking クラスを持たない .markdown を探す
          const allMarkdowns = lastAssistantArticle.querySelectorAll('.markdown');
          for (const md of allMarkdowns) {
            // .result-thinking クラスを持つものはスキップ
            if (md.classList.contains('result-thinking')) continue;
            const text = (md.innerText || md.textContent || '').trim();
            if (text.length > 0) return text;
          }

          // Step 2: .result-thinking.markdown からテキストを取得（フォールバック）
          const thinking = lastAssistantArticle.querySelector('.result-thinking.markdown, .result-thinking');
          if (thinking) {
            const text = (thinking.innerText || thinking.textContent || '').trim();
            if (text.length > 0) return text;
          }

          // Step 3: その他のフォールバックセレクター
          const fallbackSelectors = [
            '.prose:not(.result-thinking)',
            '[class*="markdown"]:not(.result-thinking)',
            '.whitespace-pre-wrap'
          ];
          for (const sel of fallbackSelectors) {
            const elem = lastAssistantArticle.querySelector(sel);
            if (elem) {
              const text = (elem.innerText || elem.textContent || '').trim();
              if (text.length > 0) return text;
            }
          }

          // Thinkingモード対応: button以外のコンテンツコンテナからテキストを抽出
          // DOM構造: article > div > div (generic) > button/"思考時間" + div (generic) > p/回答
          const contentDivs = lastAssistantArticle.querySelectorAll(':scope > div > div');
          for (const div of contentDivs) {
            // buttonはスキップ（「思考中」「今すぐ回答」「思考時間: Xs」）
            if (div.tagName === 'BUTTON') continue;

            // div内のparagraphを探す
            const paragraphs = div.querySelectorAll('p');
            if (paragraphs.length > 0) {
              const text = Array.from(paragraphs)
                .map(p => (p.innerText || p.textContent || '').trim())
                .filter(t => t.length > 0)
                .join('\\n\\n');
              if (text.length > 0) return text;
            }
          }

          // テキスト抽出: p要素を結合（button内のpは除外）
          const paragraphs = lastAssistantArticle.querySelectorAll('p');
          if (paragraphs.length > 0) {
            const text = Array.from(paragraphs)
              .filter(p => !p.closest('button'))  // button内のpは除外
              .map(p => (p.innerText || p.textContent || '').trim())
              .filter(t => t.length > 0)
              .join('\\n\\n');
            if (text.length > 0) return text;
          }

          // フォールバック: article全体のテキスト（ヘッダー・ボタンテキスト除去）
          const fullText = (lastAssistantArticle.innerText || lastAssistantArticle.textContent || '').trim();
          // ボタンテキストパターンを除去
          const cleaned = fullText
            .replace(/^ChatGPT:\\s*/i, '')
            .split('\\n')
            .filter(line => {
              const trimmed = line.trim();
              // Thinking関連のボタンテキストを除外
              if (/^思考時間:\\s*\\d+s?$/.test(trimmed)) return false;
              if (trimmed === '思考中') return false;
              if (trimmed === '今すぐ回答') return false;
              if (trimmed === 'Skip thinking') return false;
              return true;
            })
            .join('\\n')
            .trim();
          return cleaned;
        })()
      `);

      // 有効なテキストが取得できたら終了
      if (answer && answer.length > 0 && !answer.startsWith('ChatGPT:')) {
        if (retry > 0) {
          console.error(`[ChatGPT] Got response on retry ${retry}`);
        }
        break;
      }

      // リトライ（待機はループ先頭で実行）
      if (retry < extractMaxRetries - 1) {
        console.error(`[ChatGPT] Response empty, will retry (${retry + 1}/${extractMaxRetries})...`);
      }
    }

    // リトライでも取得できない場合、<main>要素から抽出（Thinkingモード対応）
    if (!answer || answer.length === 0) {
      console.error('[ChatGPT] Trying main element fallback...');
      answer = await client.evaluate<string>(`
        (() => {
          const mainEl = document.querySelector('main');
          if (!mainEl) return '';
          const mainText = mainEl.innerText || '';
          // 最後の"ChatGPT:"以降のテキストを抽出
          const parts = mainText.split('ChatGPT:');
          if (parts.length < 2) return '';
          const lastPart = parts[parts.length - 1];
          // 終端マーカーまでを取得（UIテキストを除外）
          const endMarkers = ['あなた:', 'You:', 'cookie', 'ChatGPT の回答は必ずしも'];
          // UIテキストが先頭にある場合は無効とするマーカー
          const invalidStartMarkers = ['思考の拡張', '質問してみましょう', 'ChatGPT の回答'];
          let endIndex = lastPart.length;
          for (const marker of endMarkers) {
            const idx = lastPart.indexOf(marker);
            if (idx > 10 && idx < endIndex) endIndex = idx;
          }
          let result = lastPart.slice(0, endIndex).trim();
          // UIテキストで始まる場合は無効
          for (const invalid of invalidStartMarkers) {
            if (result.startsWith(invalid)) return '';
          }
          // 空や改行のみの場合は無効
          if (!result || result === '\\n' || result.length < 2) return '';
          return result;
        })()
      `);
      if (answer && answer.length > 0) {
        console.error(`[ChatGPT] Got response from main element fallback`);
      }
    }

    // さらにフォールバック: body.innerTextから抽出
    if (!answer || answer.length === 0) {
      console.error('[ChatGPT] Trying body.innerText fallback...');
      const bodyDebug = await client.evaluate<{bodyLen: number; chatgptCount: number; lastPartLen: number; lastPartPreview: string; afterTrim: string}>(`
        (() => {
          const bodyText = document.body.innerText || '';
          const parts = bodyText.split('ChatGPT:');
          const lastPart = parts.length >= 2 ? parts[parts.length - 1] : '';
          // 終端マーカー適用後
          const endMarkers = ['あなた:', 'You:', '思考の拡張', 'cookie', 'ChatGPT は間違えることがあります'];
          let endIndex = lastPart.length;
          for (const m of endMarkers) {
            const idx = lastPart.indexOf(m);
            if (idx > 10 && idx < endIndex) endIndex = idx;
          }
          const afterTrim = lastPart.slice(0, endIndex).trim();
          return {
            bodyLen: bodyText.length,
            chatgptCount: parts.length,
            lastPartLen: lastPart.length,
            lastPartPreview: lastPart.slice(0, 100).replace(/\\n/g, '\\\\n'),
            afterTrim: afterTrim.slice(0, 100)
          };
        })()
      `);
      console.error(`[ChatGPT] body.innerText debug: bodyLen=${bodyDebug.bodyLen}, chatgptCount=${bodyDebug.chatgptCount}, lastPartLen=${bodyDebug.lastPartLen}`);
      console.error(`[ChatGPT] body.innerText lastPartPreview: "${bodyDebug.lastPartPreview}"`);
      console.error(`[ChatGPT] body.innerText afterTrim: "${bodyDebug.afterTrim}"`);
      // 回答テキストを含む可能性のある要素を広範囲に調査
      const domDebug = await client.evaluate<{
        markdownCount: number;
        proseCount: number;
        pCount: number;
        textMessageCount: number;
        longestP: {len: number; preview: string};
        longestTextMessage: {len: number; preview: string};
      }>(`
        (() => {
          const markdowns = document.querySelectorAll('.markdown');
          const proses = document.querySelectorAll('.prose');
          const ps = document.querySelectorAll('p');
          const textMessages = document.querySelectorAll('.text-message');

          // 最長の p 要素を探す
          let longestP = {len: 0, preview: ''};
          for (const p of ps) {
            const text = (p.innerText || '').trim();
            if (text.length > longestP.len && !p.closest('button') && !p.closest('nav')) {
              longestP = {len: text.length, preview: text.slice(0, 100)};
            }
          }

          // 最長の .text-message を探す
          let longestTextMessage = {len: 0, preview: ''};
          for (const tm of textMessages) {
            const text = (tm.innerText || '').trim();
            if (text.length > longestTextMessage.len) {
              longestTextMessage = {len: text.length, preview: text.slice(0, 100)};
            }
          }

          return {
            markdownCount: markdowns.length,
            proseCount: proses.length,
            pCount: ps.length,
            textMessageCount: textMessages.length,
            longestP,
            longestTextMessage
          };
        })()
      `);
      console.error(`[ChatGPT] DOM: markdown=${domDebug.markdownCount}, prose=${domDebug.proseCount}, p=${domDebug.pCount}, textMessage=${domDebug.textMessageCount}`);

      // 最後のアシスタントメッセージの詳細な構造
      const assistantDebug = await client.evaluate<{
        count: number;
        lastHtml: string;
        lastChildren: Array<{tag: string; cls: string; len: number}>;
      }>(`
        (() => {
          const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
          if (assistants.length === 0) return {count: 0, lastHtml: '', lastChildren: []};
          const last = assistants[assistants.length - 1];
          const children = [];
          const walk = (el, depth) => {
            if (depth > 3) return;
            for (const ch of el.children || []) {
              children.push({
                tag: ch.tagName,
                cls: (ch.className || '').slice(0, 30),
                len: (ch.innerText || '').length
              });
              walk(ch, depth + 1);
            }
          };
          walk(last, 0);
          return {
            count: assistants.length,
            lastHtml: (last.outerHTML || '').slice(0, 500),
            lastChildren: children.slice(0, 15)
          };
        })()
      `);
      console.error(`[ChatGPT] Assistant messages: ${assistantDebug.count}`);
      console.error(`[ChatGPT] Last assistant children:`);
      assistantDebug.lastChildren.forEach((c, i) => {
        console.error(`  [${i}] <${c.tag}> cls="${c.cls}" len=${c.len}`);
      });

      answer = await client.evaluate<string>(`
        (() => {
          const bodyText = document.body.innerText || '';
          // 最後の"ChatGPT:"以降のテキストを抽出
          const parts = bodyText.split('ChatGPT:');
          if (parts.length < 2) return '';
          const lastPart = parts[parts.length - 1];
          // 終端マーカーまでを取得（UIテキストを除外）
          const endMarkers = ['あなた:', 'You:', 'cookie', 'ChatGPT は間違えることがあります'];
          // UIテキストが先頭にある場合は無効とするマーカー
          const invalidStartMarkers = ['思考の拡張', '質問してみましょう', 'ChatGPT の回答'];
          let endIndex = lastPart.length;
          for (const marker of endMarkers) {
            const idx = lastPart.indexOf(marker);
            if (idx > 10 && idx < endIndex) endIndex = idx;
          }
          const result = lastPart.slice(0, endIndex).trim();
          // UIテキストで始まる場合は無効
          for (const invalid of invalidStartMarkers) {
            if (result.startsWith(invalid)) return '';
          }
          return result;
        })()
      `);
      if (answer && answer.length > 0) {
        console.error(`[ChatGPT] Got response from body.innerText fallback`);
      }
    }

    // streamingTextが有効な場合はそれを優先（ChatGPT 5.2 Thinking対応）
    // DOMから取得したテキストが空または見出しのみ（"ChatGPT:"など）の場合はstreamingTextを使用
    const finalAnswer = (answer && answer.length > 0 && !answer.startsWith('ChatGPT:'))
      ? answer
      : (streamingText || answer);
    console.error(`[ChatGPT] Response extracted: ${finalAnswer.slice(0, 100)}...`);

    const finalUrl = await client.evaluate<string>('location.href');
    if (finalUrl && finalUrl.includes('chatgpt.com')) {
      await saveAgentSession('chatgpt', finalUrl);
    }
    timings.waitResponseMs = nowMs() - tWaitResp;
    timings.totalMs = nowMs() - t0;
    await appendHistory({
      provider: 'chatgpt',
      question,
      answer: finalAnswer,
      url: finalUrl || undefined,
      timings,
    });
    // 全てのタイミングフィールドが設定されていることを保証
    const fullTimings: ChatTimings = {
      connectMs: timings.connectMs ?? 0,
      waitInputMs: timings.waitInputMs ?? 0,
      inputMs: timings.inputMs ?? 0,
      sendMs: timings.sendMs ?? 0,
      waitResponseMs: timings.waitResponseMs ?? 0,
      totalMs: timings.totalMs ?? 0,
    };

    // デバッグ情報を収集（debugフラグがtrueの場合のみ）
    let debugInfo: ChatDebugInfo | undefined;
    if (debug) {
      const domDebug = await client.evaluate<{
        articleCount: number;
        markdowns: Array<{
          className: string;
          innerTextLength: number;
          innerText: string;
          isResultThinking: boolean;
        }>;
        lastArticleHtml: string;
        lastArticleInnerText: string;
        url: string;
        documentTitle: string;
      }>(`
        (() => {
          const articles = document.querySelectorAll('article');
          let lastChatGPTArticle = null;

          for (const article of articles) {
            const heading = article.querySelector('h6, h5, [role="heading"]');
            if (heading && (heading.textContent || '').includes('ChatGPT')) {
              lastChatGPTArticle = article;
            }
          }

          if (!lastChatGPTArticle) {
            const old = document.querySelectorAll('[data-message-author-role="assistant"]');
            if (old.length > 0) lastChatGPTArticle = old[old.length - 1];
          }

          const markdowns = lastChatGPTArticle
            ? Array.from(lastChatGPTArticle.querySelectorAll('.markdown'))
            : [];

          return {
            articleCount: articles.length,
            markdowns: markdowns.map(md => ({
              className: md.className,
              innerTextLength: (md.innerText || '').length,
              innerText: md.innerText || '',
              isResultThinking: md.classList.contains('result-thinking')
            })),
            lastArticleHtml: lastChatGPTArticle ? lastChatGPTArticle.innerHTML : '',
            lastArticleInnerText: lastChatGPTArticle ? (lastChatGPTArticle.innerText || '') : '',
            url: window.location.href,
            documentTitle: document.title
          };
        })()
      `);

      debugInfo = {
        dom: {
          articleCount: domDebug.articleCount,
          markdowns: domDebug.markdowns,
          lastArticleHtml: domDebug.lastArticleHtml,
          lastArticleInnerText: domDebug.lastArticleInnerText,
        },
        extraction: {
          selectorsTried: [
            {selector: '.markdown:not(.result-thinking)', found: domDebug.markdowns.some(m => !m.isResultThinking && m.innerTextLength > 0), textLength: domDebug.markdowns.filter(m => !m.isResultThinking).reduce((sum, m) => sum + m.innerTextLength, 0)},
            {selector: '.result-thinking.markdown', found: domDebug.markdowns.some(m => m.isResultThinking && m.innerTextLength > 0), textLength: domDebug.markdowns.filter(m => m.isResultThinking).reduce((sum, m) => sum + m.innerTextLength, 0)},
            {selector: 'article p', found: domDebug.lastArticleInnerText.length > 0, textLength: domDebug.lastArticleInnerText.length},
          ],
          finalSelector: finalAnswer ? (domDebug.markdowns.some(m => !m.isResultThinking && m.innerTextLength > 0) ? '.markdown:not(.result-thinking)' : 'fallback') : undefined,
          fallbackUsed: (!answer || answer.length === 0) ? 'body.innerText' : undefined,
        },
        timings: fullTimings,
        url: domDebug.url,
        documentTitle: domDebug.documentTitle,
      };
    }

    // Network interceptor: stop capture and wait for pending response body fetches
    await interceptor.stopCaptureAndWait();
    const networkResult = interceptor.getResult();
    logInfo('chatgpt', 'Network capture result', {
      frames: networkResult.frames.length,
      textLength: networkResult.text.length,
      rawDataSize: networkResult.rawDataSize,
      captureTimeMs: networkResult.captureTimeMs,
      summary: interceptor.getSummary(),
    });

    // Hybrid: prefer network text (primary), DOM as fallback
    let hybridAnswer = finalAnswer;
    let answerSource = 'dom';
    if (networkResult.text.length > 50) {
      hybridAnswer = networkResult.text;
      answerSource = 'network';
    }
    logInfo('chatgpt', 'Answer source selected', {
      source: answerSource,
      networkLen: networkResult.text.length,
      domLen: finalAnswer.length,
    });

    return {answer: hybridAnswer, timings: fullTimings, debug: debugInfo};
}

/**
 * Driver経由でChatGPTに質問（実験的）
 * 環境変数 CAI_USE_DRIVERS=1 で有効化
 */
async function askChatGPTViaDriver(question: string, debug?: boolean): Promise<ChatResult> {
  const t0 = nowMs();
  const timings: Partial<ChatTimings> = {};

  // 接続
  const client = await getClient('chatgpt');
  timings.connectMs = nowMs() - t0;
  logInfo('chatgpt', '[Driver] getClient completed', {connectMs: timings.connectMs});

  // Driver取得・設定
  const driver = getDriver('chatgpt');
  if (!driver) {
    throw new Error('ChatGPT driver not found');
  }
  driver.setClient(client);

  // 入力欄待機
  const tWaitInput = nowMs();
  await client.waitForFunction(
    `!!document.querySelector('textarea#prompt-textarea') ||
     !!document.querySelector('.ProseMirror[contenteditable="true"]')`,
    30000
  );
  timings.waitInputMs = nowMs() - tWaitInput;

  // 送信
  const tInput = nowMs();
  const sendResult = await driver.sendPrompt(question);
  if (!sendResult.success) {
    throw new Error(`Failed to send prompt: ${sendResult.error}`);
  }
  timings.inputMs = nowMs() - tInput;

  const tSend = nowMs();
  timings.sendMs = nowMs() - tSend;

  // 応答待機
  const tWaitResp = nowMs();
  await driver.waitForResponse({maxWaitMs: 480000});
  timings.waitResponseMs = nowMs() - tWaitResp;

  // 応答抽出
  const extractResult = await driver.extractResponse({debug});
  const answer = extractResult.text;
  logInfo('chatgpt', '[Driver] Response extracted', {
    length: answer.length,
    evidence: extractResult.evidence,
    confidence: extractResult.confidence,
  });

  // セッション保存
  const finalUrl = await driver.getCurrentUrl();
  if (finalUrl.includes('chatgpt.com')) {
    await saveAgentSession('chatgpt', finalUrl);
  }

  timings.totalMs = nowMs() - t0;

  // 履歴保存
  await appendHistory({
    provider: 'chatgpt',
    question,
    answer,
    url: finalUrl,
    timings,
  });

  const fullTimings: ChatTimings = {
    connectMs: timings.connectMs ?? 0,
    waitInputMs: timings.waitInputMs ?? 0,
    inputMs: timings.inputMs ?? 0,
    sendMs: timings.sendMs ?? 0,
    waitResponseMs: timings.waitResponseMs ?? 0,
    totalMs: timings.totalMs ?? 0,
  };

  return {answer, timings: fullTimings};
}

/**
 * Driver経由でGeminiに質問（実験的）
 */
async function askGeminiViaDriver(question: string, debug?: boolean): Promise<ChatResult> {
  const t0 = nowMs();
  const timings: Partial<ChatTimings> = {};

  // 接続
  const client = await getClient('gemini');
  timings.connectMs = nowMs() - t0;
  logInfo('gemini', '[Driver] getClient completed', {connectMs: timings.connectMs});

  // Driver取得・設定
  const driver = getDriver('gemini');
  if (!driver) {
    throw new Error('Gemini driver not found');
  }
  driver.setClient(client);

  // 入力欄待機
  const tWaitInput = nowMs();
  await client.waitForFunction(
    `!!document.querySelector('[role="textbox"]') ||
     !!document.querySelector('div[contenteditable="true"]') ||
     !!document.querySelector('textarea')`,
    15000
  );
  timings.waitInputMs = nowMs() - tWaitInput;

  // 送信
  const tInput = nowMs();
  const sendResult = await driver.sendPrompt(question);
  if (!sendResult.success) {
    throw new Error(`Failed to send prompt: ${sendResult.error}`);
  }
  timings.inputMs = nowMs() - tInput;

  const tSend = nowMs();
  timings.sendMs = nowMs() - tSend;

  // 応答待機
  const tWaitResp = nowMs();
  await driver.waitForResponse({maxWaitMs: 480000});
  timings.waitResponseMs = nowMs() - tWaitResp;

  // 応答抽出
  const extractResult = await driver.extractResponse({debug});
  const answer = normalizeGeminiResponse(extractResult.text, question);
  logInfo('gemini', '[Driver] Response extracted', {
    length: answer.length,
    evidence: extractResult.evidence,
    confidence: extractResult.confidence,
  });

  // セッション保存
  const finalUrl = await driver.getCurrentUrl();
  if (finalUrl.includes('gemini.google.com')) {
    await saveAgentSession('gemini', finalUrl);
  }

  timings.totalMs = nowMs() - t0;

  // 履歴保存
  await appendHistory({
    provider: 'gemini',
    question,
    answer,
    url: finalUrl,
    timings,
  });

  const fullTimings: ChatTimings = {
    connectMs: timings.connectMs ?? 0,
    waitInputMs: timings.waitInputMs ?? 0,
    inputMs: timings.inputMs ?? 0,
    sendMs: timings.sendMs ?? 0,
    waitResponseMs: timings.waitResponseMs ?? 0,
    totalMs: timings.totalMs ?? 0,
  };

  return {answer, timings: fullTimings};
}

// Driver統合モードの判定
const USE_DRIVERS = process.env.CAI_USE_DRIVERS === '1';

/**
 * ChatGPTに質問して回答を取得（後方互換用）
 */
export async function askChatGPTFast(question: string, debug?: boolean): Promise<string> {
  if (USE_DRIVERS) {
    const result = await askChatGPTViaDriver(question, debug);
    return result.answer;
  }
  const result = await askChatGPTFastInternal(question, debug);
  return result.answer;
}

/**
 * ChatGPTに質問して回答とタイミング情報を取得
 */
export async function askChatGPTFastWithTimings(question: string, debug?: boolean): Promise<ChatResult> {
  if (USE_DRIVERS) {
    return askChatGPTViaDriver(question, debug);
  }
  return askChatGPTFastInternal(question, debug);
}

async function askGeminiFastInternal(question: string, debug?: boolean): Promise<ChatResult> {
  const t0 = nowMs();
  const timings: Partial<ChatTimings> = {};
  const client = await getClient('gemini');
  timings.connectMs = nowMs() - t0;

  // Network interceptor: parallel capture path (Phase 1)
  const interceptor = new NetworkInterceptor(client);
  interceptor.startCapture();

  const tUrl = nowMs();
  const currentUrl = await client.evaluate<string>('location.href');
  if (!currentUrl || !currentUrl.includes('gemini.google.com')) {
    const preferred = (await getPreferredSessionV2('gemini')).url;
    await navigate(client, preferred || 'https://gemini.google.com/');
  } else {
    const preferred = (await getPreferredSessionV2('gemini')).url;
    if (preferred && !currentUrl.startsWith(preferred)) {
      await navigate(client, preferred);
    }
  }
  timings.navigateMs = nowMs() - tUrl;

  // ページロード完了を明示的に待つ
  await client.waitForFunction(`document.readyState === 'complete'`, 30000);
  console.error('[Gemini] Page load complete (readyState)');

  // SPA描画安定化のため追加待機
  await new Promise(r => setTimeout(r, 500));
  console.error('[Gemini] Waited 500ms for SPA rendering');

  // 既存チャット（URLにチャットIDが含まれる）の場合、メッセージが描画されるまで待機
  const geminiCurrentUrl = await client.evaluate<string>('location.href');
  // 既存チャットのURLパターン: /app/xxxxx (チャットID)
  const isExistingGeminiChat = /\/app\/[a-zA-Z0-9]+/.test(geminiCurrentUrl);
  if (isExistingGeminiChat) {
    try {
      await client.waitForFunction(
        `document.querySelectorAll('model-response, .model-response').length > 0`,
        5000
      );
      console.error('[Gemini] Existing chat messages loaded');

      // 既存チャットの状態をチェック（停止ボタンがスタックしていないか）
      const stuckCheckResult = await checkGeminiStuckState(client);
      if (stuckCheckResult.isStuck) {
        console.error(`[Gemini] Existing chat appears stuck (stop button detected for ${stuckCheckResult.waitedMs}ms). Clearing session and retrying.`);

        // セッションとクライアントをクリア
        await clearAgentSession('gemini');
        clearGeminiClient();

        // エラーを投げて、呼び出し元でリトライを促す
        throw new Error('GEMINI_STUCK_EXISTING_CHAT: Previous chat appears stuck (stop button visible). Session cleared, please retry.');
      }
    } catch (error) {
      // GEMINI_STUCK_* エラーは再スロー（リトライ用）
      if (error instanceof Error && error.message.includes('GEMINI_STUCK_')) {
        throw error;
      }
      console.error('[Gemini] No existing messages found, continuing as new chat');
    }
  }

  const tWaitInput = nowMs();
  await client.waitForFunction(
    `!!document.querySelector('[role="textbox"], div[contenteditable="true"], textarea') || !!document.querySelector('a[href*="accounts.google.com"]')`,
    15000,
  );
  timings.waitInputMs = nowMs() - tWaitInput;

  // ★ 初期カウント取得: テキスト入力前に既存メッセージ数を記録
  const geminiUserSelectors = [
    'user-query',
    '.user-query',
    '[data-test-id*="user"]',
    '[data-test-id*="prompt"]',
    '[data-message-author-role="user"]',
    'message[author="user"]',
    '[data-author="user"]',
  ];
  const geminiUserCountExpr = `(() => {
    ${DOM_UTILS_CODE}
    return __collectDeep(${JSON.stringify(geminiUserSelectors)}).nodes.length;
  })()`;

  const geminiModelResponseCountExpr = `
    (() => {
      ${DOM_UTILS_CODE}
      return __collectDeep(['model-response', '.model-response', '[data-test-id*="response"]']).nodes.length;
    })()
  `;

  // ページ読み込み完了を待ってから初期カウントを取得
  // カウントが安定するまでポーリング（2回連続で同じ値になるまで）
  const initialGeminiUserCount = await waitForStableCount(client, geminiUserCountExpr);
  const initialModelResponseCount = await waitForStableCount(client, geminiModelResponseCountExpr);
  console.error(`[Gemini] Initial counts (stable): user=${initialGeminiUserCount}, modelResponse=${initialModelResponseCount}`);

  const sanitized = JSON.stringify(question);
  const tInput = nowMs();

  // Phase 1: 最初の入力試行
  const inputResult = await client.evaluate<{ok: boolean; actualText: string}>(`
    (() => {
      ${DOM_UTILS_CODE}
      const text = ${sanitized};
      const textbox = __collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea']).nodes[0];
      if (!textbox) return {ok: false, actualText: ''};
      textbox.focus();
      if (textbox.isContentEditable) {
        // テキストをクリアしてから設定
        textbox.innerText = '';
        textbox.innerText = text;
        textbox.dispatchEvent(new Event('input', {bubbles: true}));
        textbox.dispatchEvent(new Event('change', {bubbles: true}));
        // 実際に設定されたテキストを取得して返す
        const actualText = (textbox.innerText || textbox.textContent || '').trim();
        return {ok: true, actualText};
      }
      if ('value' in textbox) {
        textbox.value = text;
        textbox.dispatchEvent(new Event('input', {bubbles: true}));
        textbox.dispatchEvent(new Event('change', {bubbles: true}));
        const actualText = (textbox.value || '').trim();
        return {ok: true, actualText};
      }
      return {ok: false, actualText: ''};
    })()
  `);

  // 入力検証: 質問の先頭20文字が含まれているか確認
  const questionPrefix = question.slice(0, 20).replace(/\s+/g, '');
  let inputOk = inputResult.ok && inputResult.actualText.replace(/\s+/g, '').includes(questionPrefix);

  if (!inputOk && inputResult.ok) {
    // Phase 2: innerTextで失敗した場合、Input.insertText でリトライ
    console.error('[Gemini] Input verification failed, retrying with Input.insertText...');
    console.error(`[Gemini] Expected prefix: "${questionPrefix}", actual: "${inputResult.actualText.slice(0, 30)}..."`);

    // テキストボックスをクリアしてフォーカス
    await client.evaluate(`
      (() => {
        ${DOM_UTILS_CODE}
        const textbox = __collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea']).nodes[0];
        if (textbox) {
          textbox.focus();
          if (textbox.isContentEditable) {
            textbox.innerText = '';
          } else if ('value' in textbox) {
            textbox.value = '';
          }
          // 全選択してから削除（より確実にクリア）
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
        }
      })()
    `);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Input.insertText でテキストを挿入
    await client.send('Input.insertText', {text: question});

    await new Promise(resolve => setTimeout(resolve, 200));

    // 再検証
    const retryResult = await client.evaluate<string>(`
      (() => {
        ${DOM_UTILS_CODE}
        const textbox = __collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea']).nodes[0];
        if (!textbox) return '';
        return (textbox.isContentEditable ? (textbox.innerText || textbox.textContent) : textbox.value) || '';
      })()
    `);

    inputOk = retryResult.replace(/\s+/g, '').includes(questionPrefix);
    console.error(`[Gemini] Retry result: inputOk=${inputOk}, text="${retryResult.slice(0, 30)}..."`);
  }
  timings.inputMs = nowMs() - tInput;
  if (!inputOk) {
    const diagnostics = await client.evaluate(`
      (() => {
        ${DOM_UTILS_CODE}
        const counts = (selector) => {
          const nodes = __collectDeep([selector]).nodes;
          const visibleNodes = nodes.filter(__isVisible);
          return {all: nodes.length, visible: visibleNodes.length};
        };
        return {
          url: location.href,
          contenteditable: counts('[contenteditable]'),
          roleTextbox: counts('[role=\"textbox\"]'),
          textarea: counts('textarea'),
          inputText: counts('input[type=\"text\"]'),
        };
      })()
    `);
    throw new Error(`Gemini input box not found: ${JSON.stringify(diagnostics)}`);
  }

  const normalizedQuestion = question.replace(/\s+/g, '');
  const geminiInputMatched = await client.evaluate<boolean>(`
    (() => {
      ${DOM_UTILS_CODE}
      const textbox = __collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea']).nodes[0];
      if (!textbox) return false;
      const text =
        (textbox.isContentEditable ? textbox.innerText : textbox.value || textbox.textContent || '')
          .replace(/\\s+/g, '');
      return text.includes(${JSON.stringify(normalizedQuestion)});
    })()
  `);
  if (!geminiInputMatched) {
    throw new Error('Gemini input mismatch after typing.');
  }

  // geminiUserTextExpr: 最後のユーザーメッセージのテキストを取得
  const geminiUserTextExpr = `(() => {
    ${DOM_UTILS_CODE}
    const results = __collectDeep(${JSON.stringify(geminiUserSelectors)}).nodes;
    const last = results[results.length - 1];
    return last ? (last.textContent || '').trim() : '';
  })()`;

  // 入力完了後の待機（内部状態更新を待つ）
  await new Promise(resolve => setTimeout(resolve, 200));
  console.error('[Gemini] Waited 200ms after input for state update');

  // Phase 2: 送信前テキスト確認 - 入力フィールドに正しいテキストがあるか最終確認
  const preSendCheck = await client.evaluate<{hasText: boolean; textLength: number; textPreview: string}>(`
    (() => {
      ${DOM_UTILS_CODE}
      const textbox = __collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea']).nodes[0];
      if (!textbox) return {hasText: false, textLength: 0, textPreview: ''};
      const text = (textbox.isContentEditable
        ? (textbox.innerText || textbox.textContent)
        : textbox.value) || '';
      return {
        hasText: text.trim().length > 0,
        textLength: text.trim().length,
        textPreview: text.trim().slice(0, 50)
      };
    })()
  `);

  console.error(`[Gemini] Pre-send check: hasText=${preSendCheck.hasText}, length=${preSendCheck.textLength}, preview="${preSendCheck.textPreview}..."`);

  if (!preSendCheck.hasText || preSendCheck.textLength < 5) {
    throw new Error(`[Gemini] Input field empty or too short before send. Expected question but got: "${preSendCheck.textPreview}"`);
  }

  const tSend = nowMs();

  // 送信ボタンが有効になるまで待機（応答生成完了まで）
  let buttonInfo: {found: boolean; disabled: boolean; x: number; y: number; selector: string} | null = null;
  const maxRetries = 120; // 60秒（500ms × 120回）
  const forceNewChatThreshold = 60; // 30秒経過で新規チャットへの切り替えを検討（500ms × 60回）
  let stopButtonConsecutiveCount = 0;

  for (let i = 0; i < maxRetries; i++) {
    buttonInfo = await client.evaluate<{
    found: boolean;
    disabled: boolean;
    x: number;
    y: number;
    selector: string;
  }>(`
    (() => {
      ${DOM_UTILS_CODE}
      const buttons = __collectDeep(['button', '[role="button"]']).nodes
        .filter(__isVisible)
        .filter(el => !__isDisabled(el));

      // 「停止」ボタンがあるかチェック（応答生成中）
      // Shadow DOM対応: __collectDeepを使用して全てのボタン内から検索
      const hasStopButton = (() => {
        // 方法1: aria-labelベースの検索（最も信頼性が高い）
        const stopByLabel = buttons.some(b => {
          const label = (b.getAttribute('aria-label') || '').trim();
          return label.includes('回答を停止') || label.includes('Stop generating') ||
                 label.includes('Stop streaming') || label === 'Stop';
        });
        if (stopByLabel) return true;

        // 方法2: mat-icon要素での検出（Gemini用 - Shadow DOM対応）
        const stopIcons = __collectDeep(['mat-icon[data-mat-icon-name="stop"]']).nodes;
        for (const stopIcon of stopIcons) {
          const btn = stopIcon.closest('button');
          if (btn && __isVisible(btn) && !__isDisabled(btn)) return true;
        }

        // 方法3: img[alt="stop"] での検出（ChatGPT用 - Shadow DOM対応）
        const stopImgs = __collectDeep(['img[alt="stop"]']).nodes;
        for (const stopImg of stopImgs) {
          const btn = stopImg.closest('button');
          if (btn && __isVisible(btn) && !__isDisabled(btn)) return true;
        }

        return false;
      })();

      // 応答生成中の場合、送信ボタンはdisabled扱い
      if (hasStopButton) {
        return {found: true, disabled: true, x: 0, y: 0, selector: 'stop-button-present'};
      }

      // 送信ボタンを検索
      let sendButton = buttons.find(b =>
        (b.textContent || '').includes('プロンプトを送信') ||
        (b.textContent || '').includes('送信') ||
        (b.getAttribute('aria-label') || '').includes('送信') ||
        (b.getAttribute('aria-label') || '').includes('Send')
      );
      if (!sendButton) {
        sendButton = buttons.find(
          b =>
            b.querySelector('mat-icon[data-mat-icon-name="send"]') ||
            b.querySelector('[data-icon="send"]')
        );
      }

      if (!sendButton) {
        return {found: false, disabled: false, x: 0, y: 0, selector: 'none'};
      }

      const rect = sendButton.getBoundingClientRect();
      return {
        found: true,
        disabled: __isDisabled(sendButton),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        selector: sendButton.getAttribute('aria-label') || sendButton.textContent?.trim().slice(0, 20) || 'send-button'
      };
    })()
  `);

    if (buttonInfo.found && !buttonInfo.disabled) {
      console.error(`[Gemini] Send button ready on attempt ${i + 1}: selector="${buttonInfo.selector}"`);
      break;
    }

    // 停止ボタンが検出され続けているかカウント
    if (buttonInfo.selector === 'stop-button-present') {
      stopButtonConsecutiveCount++;
    } else {
      stopButtonConsecutiveCount = 0;
    }

    // 30秒以上停止ボタンが検出され続けている場合、セッションをクリアして新規チャットに切り替え
    if (stopButtonConsecutiveCount >= forceNewChatThreshold) {
      console.error(`[Gemini] Stop button detected for ${forceNewChatThreshold * 0.5}s - clearing session and forcing new chat`);

      // セッションとクライアントをクリアして新規チャットを強制
      await clearAgentSession('gemini');
      clearGeminiClient();

      // エラーを投げて再試行を促す
      throw new Error('GEMINI_STUCK_STOP_BUTTON: Previous response appears stuck. Session cleared, please retry.');
    }

    if (i < maxRetries - 1) {
      const reason = !buttonInfo.found
        ? 'not found'
        : buttonInfo.disabled
          ? `disabled (still generating, stop button count: ${stopButtonConsecutiveCount}/${forceNewChatThreshold})`
          : 'unknown';
      console.error(`[Gemini] Send button not ready (${reason}) - attempt ${i + 1}/${maxRetries}, waiting 500ms...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (!buttonInfo) {
    throw new Error('Gemini send button check failed (buttonInfo is null)');
  }
  if (!buttonInfo.found) {
    throw new Error('Gemini send button not found after 60 seconds (page may not be fully loaded).');
  }
  if (buttonInfo.disabled) {
    throw new Error('Gemini send button is disabled after 60 seconds (previous response still generating). Try clearing the chat history or opening a new chat.');
  }

  // JavaScript click() で直接クリック（CDP座標クリックは不安定なため）
  const clickResult = await client.evaluate<{clicked: boolean; selector: string | null}>(`
    (() => {
      // Gemini送信ボタンのセレクター（優先順）
      const selectors = [
        'button[data-node-type="send_button"]',
        'button mat-icon[data-mat-icon-name="send"]',
        'button[aria-label*="送信"]',
        'button[aria-label*="Send"]'
      ];
      // mat-icon を含むボタンを探す
      const matIconBtn = document.querySelector('mat-icon[data-mat-icon-name="send"]');
      if (matIconBtn) {
        const btn = matIconBtn.closest('button');
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          btn.click();
          return {clicked: true, selector: 'mat-icon[data-mat-icon-name="send"] parent button'};
        }
      }
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
          btn.click();
          return {clicked: true, selector: sel};
        }
      }
      return {clicked: false, selector: null};
    })()
  `);

  if (!clickResult.clicked) {
    console.error('[Gemini] JavaScript click failed, falling back to CDP click');
    // フォールバック: CDP座標クリック
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: buttonInfo.x,
      y: buttonInfo.y,
      button: 'left',
      clickCount: 1
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: buttonInfo.x,
      y: buttonInfo.y,
      button: 'left',
      clickCount: 1
    });
  }

  console.error(`[Gemini] Send button clicked (method: ${clickResult.clicked ? 'js-click' : 'cdp'}, selector: ${clickResult.selector || 'cdp-coords'})`);
  timings.sendMs = nowMs() - tSend;

  // 送信成功確認用のダミー変数
  const sendOk = true;
  if (!sendOk) {
    const diagnostics = await client.evaluate(`
      (() => {
        const isVisible = (el) => {
          if (!el) return false;
          const rects = el.getClientRects();
          if (!rects || rects.length === 0) return false;
          const style = window.getComputedStyle(el);
          return style && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const isDisabled = (el) => {
          if (!el) return true;
          return (
            el.disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.getAttribute('disabled') === 'true'
          );
        };
        const candidates = Array.from(document.querySelectorAll('button,[role="button"]'));
        const mapped = candidates
          .filter(isVisible)
          .map(el => ({
            tag: el.tagName,
            aria: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
            disabled: isDisabled(el),
            text: (el.textContent || '').trim().slice(0, 40),
          }));
        const editable =
          document.querySelector('[role="textbox"][contenteditable="true"]') ||
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector('textarea') ||
          document.querySelector('input[type="text"]');
        const value =
          editable && 'value' in editable ? editable.value : editable?.textContent || '';
        return {
          url: location.href,
          candidateCount: mapped.length,
          candidates: mapped.slice(0, 10),
          inputLength: value ? value.length : 0,
        };
      })()
    `);
    throw new Error(`Gemini send action failed: ${JSON.stringify(diagnostics)}`);
  }
  try {
    await client.waitForFunction(`${geminiUserCountExpr} > ${initialGeminiUserCount}`, 8000);
    // デバッグ: 送信後のメッセージカウント
    const userCountAfter = await client.evaluate<number>(geminiUserCountExpr);
    console.error(`[Gemini] User message count after send: ${userCountAfter} (increased: ${userCountAfter > initialGeminiUserCount})`);
  } catch (error) {
    // フォールバック: Enterキーイベント
    console.error('[Gemini] Message not sent, trying Enter key fallback');
    await client.evaluate(`
      (() => {
        const textbox =
          document.querySelector('[role="textbox"]') ||
          document.querySelector('div[contenteditable="true"]');
        if (textbox) {
          textbox.focus();
          const eventInit = {bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13};
          textbox.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          textbox.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        }
      })()
    `);
    try {
      await client.waitForFunction(`${geminiUserCountExpr} > ${initialGeminiUserCount}`, 5000);
      console.error('[Gemini] Enter key fallback succeeded');
    } catch (fallbackError) {
      throw new Error(`Gemini send did not create a new user message: ${String(error)}, fallback also failed: ${String(fallbackError)}`);
    }
  }
  // メッセージカウント増加を確認済みなので、テキストマッチングは不要
  // （Gemini UIの構造により、textContentが取得できない場合があるため）
  console.error('[Gemini] Message sent successfully (count increased)');

  // 新しいモデル応答が追加されるまで待つ（既存メッセージとの誤認防止）
  try {
    await client.waitForFunction(`${geminiModelResponseCountExpr} > ${initialModelResponseCount}`, 30000);
    console.error('[Gemini] New model response element detected');
  } catch {
    console.error('[Gemini] Timeout waiting for new model response, continuing...');
  }

  const tWaitResp = nowMs();
  console.error('[Gemini] Waiting for response completion (polling with diagnostics)...');

  // ChatGPT側と同様のポーリングループで応答完了を検出
  // 長い応答に対応するため8分（480秒）に設定
  const maxWaitMs = 480000;
  const pollIntervalMs = 1000;
  const startWait = Date.now();
  let lastLoggedState = '';
  let sawStopButton = false;  // 停止ボタンを見たかどうか（生成が始まった証拠）
  let lastTextLength = 0;
  let textStableCount = 0;  // テキスト長が変わらなかった回数

  while (Date.now() - startWait < maxWaitMs) {
    const state = await client.evaluate<{
      hasStopButton: boolean;
      hasMicButton: boolean;
      hasFeedbackButtons: boolean;
      sendButtonEnabled: boolean;
      modelResponseCount: number;
      lastResponseTextLength: number;
      inputBoxEmpty: boolean;
    }>(`
      (() => {
        ${DOM_UTILS_CODE}

        const buttons = __collectDeep(['button', '[role="button"]']).nodes.filter(__isVisible);

        // 停止ボタン検出（応答生成中かどうか）- Shadow DOM対応
        const hasStopButton = (() => {
          // 方法1: aria-labelベースの検索（最も信頼性が高い）
          const stopByLabel = buttons.some(b => {
            const label = (b.getAttribute('aria-label') || '').trim();
            return label.includes('回答を停止') || label.includes('Stop generating') ||
                   label.includes('Stop streaming') || label === 'Stop';
          });
          if (stopByLabel) return true;

          // 方法2: mat-icon要素での検出（Gemini用 - Shadow DOM対応）
          const stopIcons = __collectDeep(['mat-icon[data-mat-icon-name="stop"]']).nodes;
          for (const stopIcon of stopIcons) {
            const btn = stopIcon.closest('button');
            if (btn && __isVisible(btn)) return true;
          }

          // 方法3: img[alt="stop"] での検出（ChatGPT用 - Shadow DOM対応）
          const stopImgs = __collectDeep(['img[alt="stop"]']).nodes;
          for (const stopImg of stopImgs) {
            const btn = stopImg.closest('button');
            if (btn && __isVisible(btn)) return true;
          }

          return false;
        })();

        // マイクボタン検出（言語非依存 - Shadow DOM対応）
        const micButton = (() => {
          // img[alt="mic"] を含むボタンを探す（アイコン名は言語非依存 - Shadow DOM対応）
          const micImgs = __collectDeep(['img[alt="mic"]']).nodes;
          for (const micImg of micImgs) {
            const btn = micImg.closest('button');
            if (btn && __isVisible(btn)) return btn;
          }
          // フォールバック: aria-labelベースの検索
          return buttons.find(b => {
            const label = (b.getAttribute('aria-label') || '').toLowerCase();
            return label.includes('マイク') ||
                   label.includes('mic') ||
                   label.includes('microphone') ||
                   label.includes('voice');
          });
        })();

        // 送信ボタン検出
        const sendBtn = buttons.find(b =>
          (b.textContent || '').includes('プロンプトを送信') ||
          (b.textContent || '').includes('送信') ||
          (b.getAttribute('aria-label') || '').includes('送信') ||
          (b.getAttribute('aria-label') || '').includes('Send') ||
          b.querySelector('mat-icon[data-mat-icon-name="send"]') ||
          b.querySelector('[data-icon="send"]')
        );

        // フィードバックボタン検出（言語非依存: thumb_up/thumb_downアイコン）
        // Shadow DOM対応: __collectDeepを使用
        const feedbackImgs = __collectDeep(['img[alt="thumb_up"]', 'img[alt="thumb_down"]']).nodes;
        const hasFeedbackButtons = feedbackImgs.length > 0 ||
          buttons.some(b => {
            const label = (b.getAttribute('aria-label') || '').toLowerCase();
            return label.includes('良い回答') || label.includes('悪い回答') ||
                   label.includes('good') || label.includes('bad');
          });

        // モデルレスポンス収集（Shadow DOM対応）
        const allResponses = __collectDeep(['model-response', '[data-test-id*="response"]', '.response', '.model-response']).nodes;
        const lastResponse = allResponses[allResponses.length - 1];
        const lastResponseTextLength = lastResponse ? (lastResponse.innerText || lastResponse.textContent || '').length : 0;

        // 入力欄の状態確認
        const inputSelectors = ['rich-textarea textarea', '.ql-editor', '[contenteditable="true"]', 'textarea'];
        let inputBoxEmpty = true;
        for (const sel of inputSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '');
            if (text.trim().length > 0) {
              inputBoxEmpty = false;
              break;
            }
          }
        }

        return {
          hasStopButton,
          hasMicButton: Boolean(micButton && __isVisible(micButton)),
          hasFeedbackButtons,
          sendButtonEnabled: Boolean(sendBtn && !__isDisabled(sendBtn)),
          modelResponseCount: allResponses.length,
          lastResponseTextLength,
          inputBoxEmpty,
        };
      })()
    `);

    // 停止ボタンを検出したらフラグを立てる（生成が始まった証拠）
    if (state.hasStopButton) {
      sawStopButton = true;
    }

    // テキスト長安定化検出
    if (state.lastResponseTextLength === lastTextLength && state.lastResponseTextLength > 0) {
      textStableCount++;
    } else {
      textStableCount = 0;
      lastTextLength = state.lastResponseTextLength;
    }

    // 状態が変化した場合のみログ出力
    const currentState = JSON.stringify(state);
    if (currentState !== lastLoggedState) {
      const elapsed = Math.round((Date.now() - startWait) / 1000);
      console.error(`[Gemini] State @${elapsed}s: stop=${state.hasStopButton}, mic=${state.hasMicButton}, feedback=${state.hasFeedbackButtons}, send=${state.sendButtonEnabled}, responses=${state.modelResponseCount}, textLen=${state.lastResponseTextLength}, inputEmpty=${state.inputBoxEmpty}, sawStop=${sawStopButton}, textStable=${textStableCount}`);
      lastLoggedState = currentState;
    }

    // 応答完了条件0: 停止ボタンを見た後に消えた AND フィードバックボタン表示 AND 新しい回答が増えた
    if (sawStopButton && !state.hasStopButton && state.hasFeedbackButtons && state.modelResponseCount > initialModelResponseCount) {
      console.error(`[Gemini] Response complete - stop button disappeared, feedback buttons visible, response count increased (${initialModelResponseCount} -> ${state.modelResponseCount})`);
      break;
    }

    // 応答完了条件1: 停止ボタンを見た後に消えた AND マイクボタン表示 AND 新しい回答が増えた
    if (sawStopButton && !state.hasStopButton && state.hasMicButton && state.modelResponseCount > initialModelResponseCount) {
      console.error(`[Gemini] Response complete - stop button disappeared, mic button visible, response count increased (${initialModelResponseCount} -> ${state.modelResponseCount})`);
      break;
    }

    // 応答完了条件2: 停止ボタンを見た後に消えた AND 送信ボタン有効 AND 入力欄空 AND 新しい回答が増えた
    if (sawStopButton && !state.hasStopButton && state.sendButtonEnabled && state.inputBoxEmpty && state.modelResponseCount > initialModelResponseCount) {
      console.error(`[Gemini] Response complete - stop button disappeared, send button enabled, input empty, response count increased (${initialModelResponseCount} -> ${state.modelResponseCount})`);
      break;
    }

    // 応答完了条件3: テキスト長が5秒間安定 AND 新しいレスポンスが増えた
    if (textStableCount >= 5 && state.modelResponseCount > initialModelResponseCount && !state.hasStopButton) {
      console.error(`[Gemini] Response complete - text stable for ${textStableCount}s, response count increased (${initialModelResponseCount} -> ${state.modelResponseCount})`);
      break;
    }

    // 応答完了条件3b: テキスト長が10秒間安定 AND レスポンスがある AND 停止ボタンなし（既存チャット再接続時の救済）
    if (textStableCount >= 10 && state.modelResponseCount > 0 && !state.hasStopButton) {
      console.error(`[Gemini] Response complete - text stable for ${textStableCount}s, response exists (count=${state.modelResponseCount}), no stop button (existing chat recovery)`);
      break;
    }

    // 応答完了条件3c: テキスト長が30秒間安定 AND レスポンスがある（強制完了 - stopボタン検出失敗の救済）
    if (textStableCount >= 30 && state.modelResponseCount > 0) {
      console.error(`[Gemini] Response complete - FORCED: text stable for ${textStableCount}s, response exists (count=${state.modelResponseCount})`);
      break;
    }

    // フォールバック: 10秒以上経過 + 停止ボタンを見ていない + 新しいレスポンスが増えた + 停止ボタンなし
    const elapsed = Date.now() - startWait;
    if (elapsed > 10000 && !sawStopButton && state.modelResponseCount > initialModelResponseCount && !state.hasStopButton && (state.hasMicButton || state.inputBoxEmpty)) {
      console.error(`[Gemini] Response complete - fallback after 10s (no stop button seen, response count increased ${initialModelResponseCount} -> ${state.modelResponseCount}, mic=${state.hasMicButton})`);
      break;
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  // タイムアウトチェック
  if (Date.now() - startWait >= maxWaitMs) {
    const finalState = await client.evaluate<Record<string, unknown>>(`
      (() => {
        const textIncludes = (needle) => document.body && document.body.innerText && document.body.innerText.includes(needle);
        const counts = (selector) => {
          const nodes = Array.from(document.querySelectorAll(selector));
          return {count: nodes.length};
        };
        const allButtons = Array.from(document.querySelectorAll('button'));
        const buttonSummary = allButtons.slice(0, 10).map(b => ({
          text: (b.textContent || '').trim().substring(0, 30),
          label: b.getAttribute('aria-label'),
          disabled: b.disabled,
        }));
        const loginLink = document.querySelector('a[href*="accounts.google.com"]');
        return {
          url: location.href,
          loginLink: Boolean(loginLink),
          signInText: textIncludes('Sign in') || textIncludes('ログイン') || textIncludes('Sign in to'),
          responseCounts: {
            modelResponse: counts('model-response'),
            dataResponse: counts('[data-test-id*="response"]'),
            markdown: counts('.markdown'),
            ariaLive: counts('[aria-live="polite"]'),
          },
          buttonSummary,
        };
      })()
    `);
    console.error(`[Gemini] Timeout - final state: ${JSON.stringify(finalState)}`);
    throw new Error(`Timed out waiting for Gemini response (8min). sawStopButton=${sawStopButton}, textStableCount=${textStableCount}. Final state: ${JSON.stringify(finalState)}`);
  }

  // 重要: タブをフォアグラウンドに持ってくる（バックグラウンドタブ対策）
  // GeminiもChatGPTと同様、バックグラウンドタブではDOMの状態が正しく取得できない
  // Page.bringToFrontでタブをアクティブにすると、DOMが最新状態に更新される
  try {
    await client.send('Page.bringToFront');
    // タブがフォアグラウンドになった後、DOM更新を待機
    await new Promise(r => setTimeout(r, 300));
    console.error('[Gemini] Page.bringToFront executed before text extraction');
  } catch {
    // Page.bringToFrontが失敗しても続行（一部の環境では利用できない場合がある）
    console.error('[Gemini] Page.bringToFront failed, continuing anyway');
  }

  // 最後のレスポンスを取得（フィードバックボタン基準 + フォールバック）
  const rawText = await client.evaluate<string>(`
    (() => {
      ${DOM_UTILS_CODE}

      // 方法1: フィードバックボタン（thumb_up）を基準に応答を探す（言語非依存・最も確実）
      // Shadow DOM対応: __collectDeepを使用
      const feedbackImgs = __collectDeep(['img[alt="thumb_up"]', 'img[alt="thumb_down"]']).nodes;
      const thumbUpImg = feedbackImgs.find(img => img.alt === 'thumb_up') || feedbackImgs[0];
      if (thumbUpImg) {
        // ボタンの親コンテナを遡る
        let container = thumbUpImg.closest('button')?.parentElement;
        if (container) {
          // さらに親を遡って応答テキストを含む要素を探す
          const parent = container.parentElement;
          if (parent) {
            // paragraph, heading, list などのテキスト要素を収集
            const textElements = parent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, pre, code');
            const texts = Array.from(textElements)
              .map(el => (el.innerText || el.textContent || '').trim())
              .filter(t => t.length > 0);

            if (texts.length > 0) {
              return texts.join('\\n\\n');
            }

            // フォールバック: 親要素全体からテキスト取得（ボタンを除外）
            const clone = parent.cloneNode(true);
            clone.querySelectorAll('button, img').forEach(el => el.remove());
            const text = (clone.innerText || clone.textContent || '').trim();
            if (text.length > 0) {
              return text;
            }
          }
        }
      }

      // 方法2: 従来のセレクターベース（Shadow DOM対応 - __collectDeepは上で定義済み）
      const allResponses = __collectDeep(['model-response', '[data-test-id*="response"]', '.response', '.model-response']).nodes;

      if (allResponses.length === 0) {
        // 方法3: aria-live="polite"
        const live = document.querySelector('[aria-live="polite"]');
        return live ? (live.innerText || live.textContent || '').trim() : '';
      }

      // 最後のレスポンス要素を直接取得
      const lastMsg = allResponses[allResponses.length - 1];

      // マークダウンコンテンツを優先、なければ要素全体
      const content = lastMsg.querySelector?.('.markdown') || lastMsg;

      // innerTextが最もシンプルで確実
      return (content.innerText || content.textContent || '').trim();
    })()
  `);

  const normalized = normalizeGeminiResponse(rawText, question);
  console.error(`[Gemini] Response extracted: ${normalized.slice(0, 100)}...`);

  const finalUrl = await client.evaluate<string>('location.href');
  if (finalUrl && finalUrl.includes('gemini.google.com')) {
    await saveAgentSession('gemini', finalUrl);
  }
  timings.waitResponseMs = nowMs() - tWaitResp;
  timings.totalMs = nowMs() - t0;
  await appendHistory({
    provider: 'gemini',
    question,
    answer: normalized,
    url: finalUrl || undefined,
    timings,
  });
  // 全てのタイミングフィールドが設定されていることを保証
  const fullTimings: ChatTimings = {
    connectMs: timings.connectMs ?? 0,
    waitInputMs: timings.waitInputMs ?? 0,
    inputMs: timings.inputMs ?? 0,
    sendMs: timings.sendMs ?? 0,
    waitResponseMs: timings.waitResponseMs ?? 0,
    totalMs: timings.totalMs ?? 0,
    navigateMs: timings.navigateMs,  // Gemini のみ
  };

  // デバッグ情報を収集（debugフラグがtrueの場合のみ）
  let debugInfo: ChatDebugInfo | undefined;
  if (debug) {
    const domDebug = await client.evaluate<{
      articleCount: number;
      markdowns: Array<{
        className: string;
        innerTextLength: number;
        innerText: string;
        isResultThinking: boolean;
      }>;
      lastArticleHtml: string;
      lastArticleInnerText: string;
      url: string;
      documentTitle: string;
    }>(`
      (() => {
        ${DOM_UTILS_CODE}

        const allResponses = __collectDeep(['model-response', '[data-test-id*="response"]', '.response', '.model-response']).nodes;
        const lastResponse = allResponses.length > 0 ? allResponses[allResponses.length - 1] : null;

        const markdownElements = lastResponse ? Array.from(lastResponse.querySelectorAll('.markdown')) : [];

        return {
          articleCount: allResponses.length,
          markdowns: markdownElements.map(md => ({
            className: md.className,
            innerTextLength: (md.innerText || '').length,
            innerText: md.innerText || '',
            isResultThinking: false  // Gemini doesn't have this concept
          })),
          lastArticleHtml: lastResponse ? lastResponse.innerHTML : '',
          lastArticleInnerText: lastResponse ? (lastResponse.innerText || '') : '',
          url: window.location.href,
          documentTitle: document.title
        };
      })()
    `);

    debugInfo = {
      dom: {
        articleCount: domDebug.articleCount,
        markdowns: domDebug.markdowns,
        lastArticleHtml: domDebug.lastArticleHtml,
        lastArticleInnerText: domDebug.lastArticleInnerText,
      },
      extraction: {
        selectorsTried: [
          {selector: 'model-response', found: domDebug.articleCount > 0, textLength: domDebug.lastArticleInnerText.length},
          {selector: '.markdown', found: domDebug.markdowns.length > 0, textLength: domDebug.markdowns.reduce((sum, m) => sum + m.innerTextLength, 0)},
          {selector: 'img[alt="thumb_up"] parent', found: !!rawText, textLength: rawText.length},
        ],
        finalSelector: normalized ? 'model-response or thumb_up parent' : undefined,
        fallbackUsed: undefined,
      },
      timings: fullTimings,
      url: domDebug.url,
      documentTitle: domDebug.documentTitle,
    };
  }

  // Network interceptor: stop capture and wait for pending response body fetches
  await interceptor.stopCaptureAndWait();
  const networkResult = interceptor.getResult();
  logInfo('gemini', 'Network capture result', {
    frames: networkResult.frames.length,
    textLength: networkResult.text.length,
    rawDataSize: networkResult.rawDataSize,
    captureTimeMs: networkResult.captureTimeMs,
    summary: interceptor.getSummary(),
  });

  // Hybrid: prefer network text (primary), DOM as fallback
  // Normalize network text with same Gemini-specific cleanup as DOM text
  const networkNormalized = normalizeGeminiResponse(networkResult.text, question);
  let hybridAnswer = normalized;
  let answerSource = 'dom';
  if (networkNormalized.length > 50) {
    hybridAnswer = networkNormalized;
    answerSource = 'network';
  }
  logInfo('gemini', 'Answer source selected', {
    source: answerSource,
    networkLen: networkNormalized.length,
    domLen: normalized.length,
  });

  return {answer: hybridAnswer, timings: fullTimings, debug: debugInfo};
}

/**
 * Geminiに質問して回答を取得（後方互換用）
 */
export async function askGeminiFast(question: string, debug?: boolean): Promise<string> {
  if (USE_DRIVERS) {
    const result = await askGeminiViaDriver(question, debug);
    return result.answer;
  }
  const result = await askGeminiFastInternal(question, debug);
  return result.answer;
}

/**
 * Geminiに質問して回答とタイミング情報を取得
 */
export async function askGeminiFastWithTimings(question: string, debug?: boolean): Promise<ChatResult> {
  if (USE_DRIVERS) {
    return askGeminiViaDriver(question, debug);
  }
  return askGeminiFastInternal(question, debug);
}

/**
 * CDPが見ているページのスナップショットを取得
 * デバッグ用：実際にCDPが何を見ているか確認できる
 */
export interface CdpSnapshot {
  kind: 'chatgpt' | 'gemini';
  connected: boolean;
  // ページ基本情報
  url?: string;
  title?: string;
  readyState?: string;
  // DOM情報
  bodyText?: string;
  elementCount?: number;
  // 入力欄
  hasInputField?: boolean;
  inputFieldValue?: string;
  inputFieldSelector?: string;
  // 送信ボタン
  hasSendButton?: boolean;
  sendButtonDisabled?: boolean;
  sendButtonSelector?: string;
  // メッセージカウント
  userMessageCount?: number;
  assistantMessageCount?: number;
  // その他のUI状態
  hasStopButton?: boolean;
  hasLoginPrompt?: boolean;
  visibleDialogs?: string[];
  // スクリーンショット
  screenshotPath?: string;
  // エラー
  error?: string;
  // タイムスタンプ
  timestamp?: string;
}

export async function takeCdpSnapshot(
  kind: 'chatgpt' | 'gemini',
  options?: {
    includeScreenshot?: boolean;
    bodyTextLimit?: number;
  }
): Promise<CdpSnapshot> {
  const result: CdpSnapshot = {
    kind,
    connected: false,
    timestamp: new Date().toISOString(),
  };

  const existing = getClientFromAgent(kind);

  if (!existing) {
    result.error = `No ${kind} connection exists. Use ask_${kind}_web first to establish a connection.`;
    return result;
  }

  // 接続の健全性チェック
  const healthy = await isConnectionHealthy(existing, kind);
  if (!healthy) {
    result.error = `${kind} connection is not healthy (disconnected or unresponsive).`;
    return result;
  }

  result.connected = true;

  try {
    // ページ基本情報
    const basicInfo = await existing.evaluate<{
      url: string;
      title: string;
      readyState: string;
      elementCount: number;
    }>(`
      ({
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        elementCount: document.querySelectorAll('*').length,
      })
    `);
    result.url = basicInfo.url;
    result.title = basicInfo.title;
    result.readyState = basicInfo.readyState;
    result.elementCount = basicInfo.elementCount;

    // Body テキスト（指定文字数まで）
    const limit = options?.bodyTextLimit ?? 1000;
    result.bodyText = await existing.evaluate<string>(`
      document.body?.innerText?.slice(0, ${limit}) || "(empty body)"
    `);

    if (kind === 'chatgpt') {
      // ChatGPT用の詳細情報取得
      const chatgptState = await existing.evaluate<{
        inputFound: boolean;
        inputValue: string;
        inputSelector: string;
        sendButtonFound: boolean;
        sendButtonDisabled: boolean;
        sendButtonSelector: string;
        stopButtonFound: boolean;
        userMsgCount: number;
        assistantMsgCount: number;
        hasLoginPrompt: boolean;
        dialogs: string[];
      }>(`
        (() => {
          // 入力欄
          const textarea = document.querySelector('textarea#prompt-textarea') ||
                          document.querySelector('textarea[data-testid="prompt-textarea"]');
          const prosemirror = document.querySelector('.ProseMirror[contenteditable="true"]');
          let inputFound = false;
          let inputValue = '';
          let inputSelector = '';
          if (textarea) {
            inputFound = true;
            inputValue = textarea.value || '';
            inputSelector = textarea.id ? '#' + textarea.id : 'textarea[data-testid="prompt-textarea"]';
          } else if (prosemirror) {
            inputFound = true;
            inputValue = prosemirror.textContent || '';
            inputSelector = '.ProseMirror[contenteditable="true"]';
          }

          // 送信ボタン
          const sendBtn = document.querySelector('button[data-testid="send-button"]');
          const sendButtonFound = !!sendBtn;
          const sendButtonDisabled = sendBtn ? (
            sendBtn.disabled ||
            sendBtn.getAttribute('aria-disabled') === 'true' ||
            sendBtn.getAttribute('disabled') === 'true'
          ) : false;

          // 停止ボタン
          const stopBtn = document.querySelector('button[data-testid="stop-button"]');

          // メッセージカウント
          const userMsgs = document.querySelectorAll('[data-message-author-role="user"]');
          const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');

          // ログインプロンプト
          const hasLoginPrompt = !!document.querySelector('button[data-testid="login-button"]') ||
                                !!document.querySelector('[data-testid="login-modal"]') ||
                                document.body?.innerText?.includes('ログイン') && !inputFound;

          // ダイアログ
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
            .map(d => d.getAttribute('aria-label') || d.textContent?.slice(0, 50) || 'unknown dialog');

          return {
            inputFound,
            inputValue,
            inputSelector,
            sendButtonFound,
            sendButtonDisabled,
            sendButtonSelector: sendButtonFound ? 'button[data-testid="send-button"]' : '',
            stopButtonFound: !!stopBtn,
            userMsgCount: userMsgs.length,
            assistantMsgCount: assistantMsgs.length,
            hasLoginPrompt,
            dialogs,
          };
        })()
      `);

      result.hasInputField = chatgptState.inputFound;
      result.inputFieldValue = chatgptState.inputValue;
      result.inputFieldSelector = chatgptState.inputSelector;
      result.hasSendButton = chatgptState.sendButtonFound;
      result.sendButtonDisabled = chatgptState.sendButtonDisabled;
      result.sendButtonSelector = chatgptState.sendButtonSelector;
      result.hasStopButton = chatgptState.stopButtonFound;
      result.userMessageCount = chatgptState.userMsgCount;
      result.assistantMessageCount = chatgptState.assistantMsgCount;
      result.hasLoginPrompt = chatgptState.hasLoginPrompt;
      result.visibleDialogs = chatgptState.dialogs;

    } else {
      // Gemini用の詳細情報取得
      const geminiState = await existing.evaluate<{
        inputFound: boolean;
        inputValue: string;
        sendButtonFound: boolean;
        userMsgCount: number;
        assistantMsgCount: number;
        hasLoginPrompt: boolean;
        dialogs: string[];
      }>(`
        (() => {
          ${DOM_UTILS_CODE}

          // 入力欄
          const textbox = __collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea']).nodes[0];
          const inputFound = !!textbox;
          const inputValue = textbox ?
            (textbox.isContentEditable ? textbox.innerText : (textbox.value || textbox.textContent || '')) : '';

          // 送信ボタン
          const buttons = __collectDeep(['button[aria-label*="Send"]', 'button[aria-label*="送信"]', 'button.send-button', '[data-test-id*="send"]']).nodes;
          const sendButtonFound = buttons.length > 0;

          // メッセージカウント
          const userSelectors = ['user-query', '.user-query', '[data-message-author-role="user"]', 'message[author="user"]'];
          const userMsgs = __collectDeep(userSelectors).nodes;
          const assistantSelectors = ['model-response', '.model-response', '[data-message-author-role="assistant"]', 'message[author="model"]'];
          const assistantMsgs = __collectDeep(assistantSelectors).nodes;

          // ログインプロンプト
          const hasLoginPrompt = document.body?.innerText?.includes('Sign in') ||
                                document.body?.innerText?.includes('ログイン');

          // ダイアログ
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
            .map(d => d.getAttribute('aria-label') || d.textContent?.slice(0, 50) || 'unknown dialog');

          return {
            inputFound,
            inputValue,
            sendButtonFound,
            userMsgCount: userMsgs.length,
            assistantMsgCount: assistantMsgs.length,
            hasLoginPrompt,
            dialogs,
          };
        })()
      `);

      result.hasInputField = geminiState.inputFound;
      result.inputFieldValue = geminiState.inputValue;
      result.hasSendButton = geminiState.sendButtonFound;
      result.userMessageCount = geminiState.userMsgCount;
      result.assistantMessageCount = geminiState.assistantMsgCount;
      result.hasLoginPrompt = geminiState.hasLoginPrompt;
      result.visibleDialogs = geminiState.dialogs;
    }

    // スクリーンショット（オプション）
    if (options?.includeScreenshot) {
      try {
        const screenshot = await existing.send('Page.captureScreenshot', {format: 'png'});
        if (screenshot?.data) {
          const timestamp = Date.now();
          const screenshotPath = `/tmp/cdp-snapshot-${kind}-${timestamp}.png`;
          const {writeFile} = await import('node:fs/promises');
          await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
          result.screenshotPath = screenshotPath;
        }
      } catch (ssError) {
        // スクリーンショット失敗は致命的ではない
        console.error(`[fast-cdp] Screenshot failed for ${kind}:`, ssError);
      }
    }
  } catch (error) {
    result.error = `Failed to get snapshot: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

/**
 * DOM取得用インターフェース
 */
export interface DomSnapshot {
  kind: 'chatgpt' | 'gemini';
  url: string;
  title: string;
  timestamp: string;
  connected: boolean;
  error?: string;
  selectors: {
    [selector: string]: {
      count: number;
      elements: Array<{
        tagName: string;
        attributes: Record<string, string>;
        textContent: string;
        outerHTML: string;
      }>;
    };
  };
  messages?: Array<{
    role: 'user' | 'assistant' | 'unknown';
    text: string;
    attributes: Record<string, string>;
  }>;
}

/**
 * 指定したセレクターでDOM要素を取得
 * デバッグ用：UIが変わった時にセレクターを特定するために使用
 */
export async function getPageDom(
  kind: 'chatgpt' | 'gemini',
  selectors: string[] = [],
): Promise<DomSnapshot> {
  const result: DomSnapshot = {
    kind,
    url: '',
    title: '',
    timestamp: new Date().toISOString(),
    connected: false,
    selectors: {},
  };

  const existing = getClientFromAgent(kind);

  if (!existing) {
    result.error = `No ${kind} connection exists. Use ask_${kind}_web first to establish a connection.`;
    return result;
  }

  // 接続の健全性チェック
  const healthy = await isConnectionHealthy(existing, kind);
  if (!healthy) {
    result.error = `${kind} connection is not healthy (disconnected or unresponsive).`;
    return result;
  }

  result.connected = true;

  try {
    // 基本情報取得
    const basicInfo = await existing.evaluate<{url: string; title: string}>(`
      ({url: location.href, title: document.title})
    `);
    result.url = basicInfo.url;
    result.title = basicInfo.title;

    // デフォルトセレクター（指定がない場合）
    const defaultSelectors = kind === 'chatgpt'
      ? [
          '[data-message-author-role]',
          '[data-testid]',
          '.ProseMirror',
          'textarea',
          'button[data-testid="send-button"]',
          'button[data-testid="stop-button"]',
        ]
      : [
          'model-response',
          'user-query',
          '[role="textbox"]',
          'div[contenteditable="true"]',
          'button[aria-label*="Send"]',
          'button[aria-label*="送信"]',
        ];

    const targetSelectors = selectors.length > 0 ? selectors : defaultSelectors;

    // 各セレクターで要素を取得
    for (const selector of targetSelectors) {
      const selectorResult = await existing.evaluate<{
        count: number;
        elements: Array<{
          tagName: string;
          attributes: Record<string, string>;
          textContent: string;
          outerHTML: string;
        }>;
      }>(`
        (() => {
          ${DOM_UTILS_CODE}

          const elements = __collectDeep([${JSON.stringify(selector)}]).nodes;
          return {
            count: elements.length,
            elements: elements.slice(0, 10).map(el => {
              const attrs = {};
              for (const attr of el.attributes) {
                attrs[attr.name] = attr.value;
              }
              return {
                tagName: el.tagName.toLowerCase(),
                attributes: attrs,
                textContent: (el.textContent || '').slice(0, 200),
                outerHTML: (el.outerHTML || '').slice(0, 500),
              };
            }),
          };
        })()
      `);

      result.selectors[selector] = selectorResult;
    }

    // メッセージ要素を特別に取得
    const messageSelectors = kind === 'chatgpt'
      ? {
          user: '[data-message-author-role="user"]',
          assistant: '[data-message-author-role="assistant"]',
        }
      : {
          user: 'user-query, .user-query, [data-message-author-role="user"]',
          assistant: 'model-response, .model-response, [data-message-author-role="assistant"]',
        };

    const messages = await existing.evaluate<Array<{
      role: 'user' | 'assistant' | 'unknown';
      text: string;
      attributes: Record<string, string>;
    }>>(`
      (() => {
        ${DOM_UTILS_CODE}

        const messages = [];

        // User messages
        const userEls = __collectDeep([${JSON.stringify(messageSelectors.user)}]).nodes;
        for (const el of userEls) {
          const attrs = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          messages.push({
            role: 'user',
            text: (el.textContent || '').slice(0, 500),
            attributes: attrs,
          });
        }

        // Assistant messages
        const assistantEls = __collectDeep([${JSON.stringify(messageSelectors.assistant)}]).nodes;
        for (const el of assistantEls) {
          const attrs = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          messages.push({
            role: 'assistant',
            text: (el.textContent || '').slice(0, 500),
            attributes: attrs,
          });
        }

        return messages;
      })()
    `);

    result.messages = messages;

  } catch (error) {
    result.error = `Failed to get DOM: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}
