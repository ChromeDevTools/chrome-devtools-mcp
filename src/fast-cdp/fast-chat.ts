import fs from 'node:fs/promises';
import path from 'node:path';

import {connectViaExtensionRaw} from './extension-raw.js';
import {CdpClient} from './cdp-client.js';
import {logConnectionState, logInfo, logError, logWarn} from './mcp-logger.js';

let chatgptClient: CdpClient | null = null;
let geminiClient: CdpClient | null = null;

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

export interface ChatResult {
  answer: string;
  timings: ChatTimings;
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
    // 2秒タイムアウトで簡単なコマンドを実行
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 2000)
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

type SessionEntry = {
  url: string;
  tabId?: number;
  lastUsed: string;
};

type SessionStore = {
  projects: Record<
    string,
    {
      chatgpt?: SessionEntry;
      gemini?: SessionEntry;
    }
  >;
};

function getProjectName(): string {
  return path.basename(process.cwd()) || 'default';
}

function getSessionPath(): string {
  return path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'sessions.json');
}

function getHistoryPath(): string {
  return path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'history.jsonl');
}

async function loadSessions(): Promise<SessionStore> {
  try {
    const data = await fs.readFile(getSessionPath(), 'utf-8');
    const parsed = JSON.parse(data) as SessionStore;
    if (parsed && typeof parsed === 'object' && parsed.projects) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return {projects: {}};
}

async function saveSession(kind: 'chatgpt' | 'gemini', url: string, tabId?: number): Promise<void> {
  const project = getProjectName();
  const sessions = await loadSessions();
  if (!sessions.projects[project]) {
    sessions.projects[project] = {};
  }
  const entry: SessionEntry = {
    url,
    lastUsed: new Date().toISOString(),
  };
  if (tabId !== undefined) {
    entry.tabId = tabId;
  }
  sessions.projects[project][kind] = entry;
  const targetPath = getSessionPath();
  await fs.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.writeFile(targetPath, JSON.stringify(sessions, null, 2), 'utf-8');
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
    ts: new Date().toISOString(),
    project,
    ...entry,
  };
  const targetPath = getHistoryPath();
  await fs.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.appendFile(targetPath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

async function saveDebug(kind: 'chatgpt' | 'gemini', payload: Record<string, any>) {
  const targetDir = path.join(process.cwd(), '.local', 'chrome-ai-bridge', 'debug');
  await fs.mkdir(targetDir, {recursive: true});
  const file = path.join(targetDir, `${kind}-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
}

interface PreferredSession {
  url: string | null;
  tabId?: number;
}

async function getPreferredSession(kind: 'chatgpt' | 'gemini'): Promise<PreferredSession> {
  const project = getProjectName();
  const sessions = await loadSessions();
  const entry = sessions.projects[project]?.[kind];
  return {
    url: entry?.url || null,
    tabId: entry?.tabId,
  };
}

// Keep for backward compatibility
async function getPreferredUrl(kind: 'chatgpt' | 'gemini'): Promise<string | null> {
  const session = await getPreferredSession(kind);
  return session.url;
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

function isSuspiciousAnswer(answer: string, question: string): boolean {
  const trimmed = answer.trim();
  if (!trimmed) return true;
  if (question.trim() === 'OK') return false;
  if (/\d/.test(question) && !/\d/.test(trimmed)) return true;
  if (/^ok$/i.test(trimmed)) return true;

  // キーワード関連性チェック: 質問に含まれる重要キーワードが回答にも含まれるか
  // 質問から2文字以上の単語を抽出
  const questionWords = question
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]/g, ' ')  // 記号を空白に
    .split(/\s+/)
    .filter(w => w.length >= 2);
  const answerLower = answer.toLowerCase();

  // 質問の主要キーワードが回答に1つも含まれない場合は怪しい
  // ただし、短い質問（キーワード2つ以下）は除外
  if (questionWords.length >= 3) {
    const matchedKeywords = questionWords.filter(w => answerLower.includes(w));
    if (matchedKeywords.length === 0) {
      console.error(`[isSuspiciousAnswer] No keyword match: question keywords=${JSON.stringify(questionWords)}, answer preview="${answer.slice(0, 50)}..."`);
      return true;
    }
  }

  return false;
}

/**
 * 新しい接続を作成する（リトライ機構付き）
 * 戦略:
 * - ChatGPT: 常に新規タブ（URLが /c/xxx に変わるため再利用困難）
 * - Gemini: 既存タブを再利用、失敗したら新規タブ
 */
async function createConnection(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  const startTime = Date.now();
  logConnectionState(kind, 'connecting');

  const preferredSession = await getPreferredSession(kind);
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
    logInfo('fast-chat', `Trying to reuse existing ${kind} tab`, {url: preferred, tabId: preferredTabId, timeoutMs: 3000});
    console.error(`[fast-cdp] Trying to reuse existing ${kind} tab: ${preferred} (tabId: ${preferredTabId}, 3s timeout)`);
    try {
      const relayResult = await connectViaExtensionRaw({
        tabUrl: preferred,
        tabId: preferredTabId,
        newTab: false,
        timeoutMs: 3000,  // 短いタイムアウト
      });

      const client = new CdpClient(relayResult.relay);
      await client.send('Runtime.enable');
      await client.send('DOM.enable');
      await client.send('Page.enable');

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

      if (kind === 'chatgpt') {
        chatgptClient = client;
      } else {
        geminiClient = client;
      }
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
        timeoutMs: 5000,  // 5秒タイムアウト
      });

      const client = new CdpClient(relayResult.relay);
      await client.send('Runtime.enable');
      await client.send('DOM.enable');
      await client.send('Page.enable');

      if (kind === 'chatgpt') {
        chatgptClient = client;
      } else {
        geminiClient = client;
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
  logInfo('fast-chat', `getClient called`, {kind, hasExisting: kind === 'chatgpt' ? !!chatgptClient : !!geminiClient});
  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;

  // 既存接続がある場合、健全性をチェック
  if (existing) {
    logInfo('fast-chat', `Checking health of existing ${kind} connection`);
    const healthy = await isConnectionHealthy(existing, kind);
    if (healthy) {
      logInfo('fast-chat', `Reusing healthy ${kind} connection`);
      console.error(`[fast-cdp] Reusing healthy ${kind} connection`);
      return existing;
    }

    // 接続が切れている → キャッシュをクリア
    logConnectionState(kind, 'reconnecting');
    console.error(`[fast-cdp] ${kind} connection lost, reconnecting...`);
    if (kind === 'chatgpt') {
      chatgptClient = null;
    } else {
      geminiClient = null;
    }
  }

  // 新しい接続を作成
  return await createConnection(kind);
}

async function navigate(client: CdpClient, url: string) {
  await client.send('Page.navigate', {url});
  await client.waitForFunction(`document.readyState === 'complete'`, 30000);
}

async function askChatGPTFastInternal(question: string): Promise<ChatResult> {
  const t0 = nowMs();
  const timings: Partial<ChatTimings> = {};
  logInfo('chatgpt', 'askChatGPTFast started', {questionLength: question.length});

  const client = await getClient('chatgpt');
  timings.connectMs = nowMs() - t0;
  logInfo('chatgpt', 'getClient completed', {connectMs: timings.connectMs});

  const normalizedQuestion = question.replace(/\s+/g, '');

  // ループ前に初期カウントを取得（既存チャット再利用時に重要）
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

  // 初期メッセージカウントを**ループ外**で取得（これが重要）
  const initialUserCountBeforeLoop = await client.evaluate<number>(
    `document.querySelectorAll('[data-message-author-role="user"]').length`,
  );
  const initialAssistantCountBeforeLoop = await client.evaluate<number>(
    `document.querySelectorAll('[data-message-author-role="assistant"]').length`,
  );
  console.error(`[ChatGPT] Initial counts BEFORE loop: user=${initialUserCountBeforeLoop}, assistant=${initialAssistantCountBeforeLoop}`);

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

    // ループ外で取得した初期カウントを使用
    const initialUserCount = initialUserCountBeforeLoop;

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
          const collectDeep = (selectorList) => {
            const results = [];
            const seen = new Set();
            const visit = (root) => {
              if (!root) return;
              for (const sel of selectorList) {
                try {
                  root.querySelectorAll?.(sel)?.forEach(el => {
                    if (!seen.has(el)) {
                      seen.add(el);
                      results.push(el);
                    }
                  });
                } catch {
                  // ignore selector errors
                }
              }
              const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
              for (const el of elements) {
                if (el.shadowRoot) visit(el.shadowRoot);
              }
            };
            visit(document);
            return results;
          };
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
          const buttons = collectDeep(['button', '[role="button"]'])
            .filter(isVisible)
            .filter(el => !isDisabled(el));

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
            disabled: isDisabled(sendButton),
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

    // CDP Input.dispatchMouseEventでクリック
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

    logInfo('chatgpt', 'Send button clicked', {x: buttonInfo.x, y: buttonInfo.y, selector: buttonInfo.selector});
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
          attempt,
          ...debugPayload,
        });
        throw new Error(`ChatGPT send did not create a new user message: ${String(error)}, fallback also failed: ${String(fallbackError)}`);
      }
    }
    // メッセージカウント増加を確認済みなので、テキストマッチングは不要
    // （ChatGPT UIの構造により、textContentが取得できない場合があるため）
    console.error('[ChatGPT] Message sent successfully (count increased)');
    timings.sendMs = nowMs() - tSend;

    // ループ外で取得した初期カウントを使用
    const initialAssistantCount = initialAssistantCountBeforeLoop;

    const tWaitResp = nowMs();
    console.error(`[ChatGPT] Waiting for response (initial assistant count from BEFORE loop: ${initialAssistantCount})...`);

    // 新方式: ポーリングで状態を監視（診断ログ付き）
    // 長い応答に対応するため8分（480秒）に設定
    const maxWaitMs = 480000;
    const pollIntervalMs = 1000;
    const startWait = Date.now();
    let lastLoggedState = '';
    let sawStopButton = false;  // 生成中状態を検出したかどうか

    while (Date.now() - startWait < maxWaitMs) {
      const state = await client.evaluate<{
        hasStopButton: boolean;
        sendButtonFound: boolean;
        sendButtonDisabled: boolean | null;
        sendButtonTestId: string | null;
        assistantMsgCount: number;
        inputBoxHasText: boolean;
      }>(`
        (() => {
          const collectDeep = (selectorList) => {
            const results = [];
            const seen = new Set();
            const visit = (root) => {
              if (!root) return;
              for (const sel of selectorList) {
                try {
                  root.querySelectorAll?.(sel)?.forEach(el => {
                    if (!seen.has(el)) {
                      seen.add(el);
                      results.push(el);
                    }
                  });
                } catch {}
              }
              const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
              for (const el of elements) {
                if (el.shadowRoot) visit(el.shadowRoot);
              }
            };
            visit(document);
            return results;
          };

          // 停止ボタン検出（フォールバックセレクター付き）
          const stopBtn = document.querySelector('button[data-testid="stop-button"]') ||
                          document.querySelector('button[aria-label*="停止"]') ||
                          document.querySelector('button[aria-label*="Stop"]');
          const buttons = collectDeep(['button', '[role="button"]']);
          // 送信ボタン検出（フォールバックセレクター付き）
          // 注意: 応答完了後は音声ボタンに置き換わり、送信ボタンがDOMから消える
          const sendBtn = buttons.find(b =>
            b.getAttribute('data-testid') === 'send-button' ||
            b.getAttribute('aria-label')?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('Send')
          );
          const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');

          // 入力欄の状態確認
          const inputBox = document.querySelector('.ProseMirror[contenteditable="true"]') ||
                          document.querySelector('textarea#prompt-textarea');
          const inputText = inputBox ?
            (inputBox.tagName === 'TEXTAREA' ? inputBox.value : inputBox.textContent) || '' : '';

          return {
            hasStopButton: Boolean(stopBtn),
            sendButtonFound: Boolean(sendBtn),
            sendButtonDisabled: sendBtn ? (
              sendBtn.disabled ||
              sendBtn.getAttribute('aria-disabled') === 'true' ||
              sendBtn.getAttribute('disabled') === 'true'
            ) : null,
            sendButtonTestId: sendBtn ? sendBtn.getAttribute('data-testid') : null,
            assistantMsgCount: assistantMsgs.length,
            inputBoxHasText: inputText.trim().length > 0,
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
        console.error(`[ChatGPT] State @${elapsed}s: stop=${state.hasStopButton}, send=${state.sendButtonFound}(disabled=${state.sendButtonDisabled}), assistant=${state.assistantMsgCount}(+${state.assistantMsgCount - initialAssistantCount}), inputHasText=${state.inputBoxHasText}`);
        lastLoggedState = currentState;
      }

      const newAssistantCount = state.assistantMsgCount - initialAssistantCount;

      // 応答完了条件1（優先）: stopボタンなし AND 入力欄空 AND 新しいアシスタントメッセージがある
      // 送信ボタンの存在に依存しない（応答完了後は音声ボタンに置き換わりsendButtonが消えるため）
      if (!state.hasStopButton && !state.inputBoxHasText && newAssistantCount > 0) {
        console.error(`[ChatGPT] Response complete - no stop button, input empty, new message (+${newAssistantCount})`);
        break;
      }

      // 応答完了条件2: stopボタンなし AND 送信ボタンあり AND 送信ボタン有効 AND 新しいアシスタントメッセージがある
      if (!state.hasStopButton && state.sendButtonFound && !state.sendButtonDisabled && newAssistantCount > 0) {
        console.error(`[ChatGPT] Response complete - send button enabled, new assistant message (+${newAssistantCount})`);
        break;
      }

      // 応答完了条件3: stopボタンを見た後に消えた AND 新しいアシスタントメッセージがある AND 入力欄が空
      if (sawStopButton && !state.hasStopButton && newAssistantCount > 0 && !state.inputBoxHasText) {
        console.error(`[ChatGPT] Response complete - stop button disappeared, new assistant message (+${newAssistantCount})`);
        break;
      }

      // 応答完了条件4: 15秒以上待って、stopボタンなし、入力欄空
      // （メッセージカウントが増えない場合のフォールバック - セレクターが変わった可能性）
      const elapsed = Date.now() - startWait;
      if (elapsed > 15000 && !state.hasStopButton && !state.inputBoxHasText) {
        console.error(`[ChatGPT] Response complete - fallback after 15s (no stop button, input empty)`);
        break;
      }

      // 応答完了条件5: stopボタンを見た後に消え、送信ボタンが有効、入力欄空
      // （メッセージカウントに頼らない安全な判定）
      if (sawStopButton && !state.hasStopButton && state.sendButtonFound && !state.sendButtonDisabled && !state.inputBoxHasText) {
        console.error(`[ChatGPT] Response complete - stop button gone, send enabled, input empty`);
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

    // 新しいアシスタントメッセージのみを取得（initialAssistantCount 以降）
    const answer = await client.evaluate<string>(`
      (() => {
        const initialCount = ${initialAssistantCount};
        const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (messages.length === 0) return '';

        // initialAssistantCount 以降の新しいメッセージのみを対象とする
        const allMessages = Array.from(messages);
        const newMessages = allMessages.slice(initialCount);

        // 新しいメッセージがない場合は空文字を返す
        if (newMessages.length === 0) {
          console.warn('[ChatGPT] No new messages after initialCount=' + initialCount + ', total=' + allMessages.length);
          return '';
        }

        // 最新の新しいメッセージを取得
        const msg = newMessages[newMessages.length - 1];
        const content = msg.querySelector?.('.markdown, .prose, .markdown.prose, .message-content') || msg;

        const extractText = (root) => {
          if (!root) return '';
          const parts = [];
          const visit = (node) => {
            if (!node) return;
            if (node.nodeType === Node.TEXT_NODE) {
              const value = node.textContent;
              if (value) parts.push(value);
              return;
            }
            if (node.shadowRoot) visit(node.shadowRoot);
            const children = node.childNodes ? Array.from(node.childNodes) : [];
            for (const child of children) visit(child);
          };
          visit(root);
          return parts.join(' ').replace(/\\s+/g, ' ').trim();
        };

        return extractText(content);
      })()
    `);

    console.error(`[ChatGPT] Response extracted: ${answer.slice(0, 100)}...`);

    if (!isSuspiciousAnswer(answer, question) || attempt === 1) {
      const finalUrl = await client.evaluate<string>('location.href');
      if (isSuspiciousAnswer(answer, question)) {
        const debugPayload = await client.evaluate<Record<string, any>>(`(() => {
          const assistants = document.querySelectorAll('[data-message-author-role=\"assistant\"]');
          const users = document.querySelectorAll('[data-message-author-role=\"user\"]');
          const lastAssistant = assistants[assistants.length - 1];
          const lastUser = users[users.length - 1];
          return {
            url: location.href,
            title: document.title,
            assistantCount: assistants.length,
            userCount: users.length,
            lastAssistantText: lastAssistant ? (lastAssistant.innerText || lastAssistant.textContent || '') : '',
            lastAssistantHtml: lastAssistant ? (lastAssistant.outerHTML || '').slice(0, 20000) : '',
            lastUserText: lastUser ? (lastUser.innerText || lastUser.textContent || '') : '',
          };
        })()`);
        await saveDebug('chatgpt', {
          question,
          answer,
          attempt,
          ...debugPayload,
        });
      }
      if (finalUrl && finalUrl.includes('chatgpt.com')) {
        await saveSession('chatgpt', finalUrl);
      }
      timings.waitResponseMs = nowMs() - tWaitResp;
      timings.totalMs = nowMs() - t0;
      await appendHistory({
        provider: 'chatgpt',
        question,
        answer,
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
      return {answer, timings: fullTimings};
    }
  }

  throw new Error('ChatGPT response was suspicious after all attempts');
}

/**
 * ChatGPTに質問して回答を取得（後方互換用）
 */
export async function askChatGPTFast(question: string): Promise<string> {
  const result = await askChatGPTFastInternal(question);
  return result.answer;
}

/**
 * ChatGPTに質問して回答とタイミング情報を取得
 */
export async function askChatGPTFastWithTimings(question: string): Promise<ChatResult> {
  return askChatGPTFastInternal(question);
}

async function askGeminiFastInternal(question: string): Promise<ChatResult> {
  const t0 = nowMs();
  const timings: Partial<ChatTimings> = {};
  const client = await getClient('gemini');
  timings.connectMs = nowMs() - t0;

  const tUrl = nowMs();
  const currentUrl = await client.evaluate<string>('location.href');
  if (!currentUrl || !currentUrl.includes('gemini.google.com')) {
    const preferred = await getPreferredUrl('gemini');
    await navigate(client, preferred || 'https://gemini.google.com/');
  } else {
    const preferred = await getPreferredUrl('gemini');
    if (preferred && !currentUrl.startsWith(preferred)) {
      await navigate(client, preferred);
    }
  }
  timings.navigateMs = nowMs() - tUrl;

  const tWaitInput = nowMs();
  await client.waitForFunction(
    `!!document.querySelector('[role="textbox"], div[contenteditable="true"], textarea') || !!document.querySelector('a[href*="accounts.google.com"]')`,
    15000,
  );
  timings.waitInputMs = nowMs() - tWaitInput;

  // ★ 初期カウント取得: テキスト入力前に既存メッセージ数を記録
  const geminiUserCountExpr = `(() => {
    const selectors = ${JSON.stringify([
      'user-query',
      '.user-query',
      '[data-test-id*="user"]',
      '[data-test-id*="prompt"]',
      '[data-message-author-role="user"]',
      'message[author="user"]',
      '[data-author="user"]',
    ])};
    const results = [];
    const seen = new Set();
    const collectDeep = (selectorList) => {
      const visit = (root) => {
        if (!root) return;
        for (const sel of selectorList) {
          try {
            root.querySelectorAll?.(sel)?.forEach(el => {
              if (!seen.has(el)) {
                seen.add(el);
                results.push(el);
              }
            });
          } catch {
            // ignore selector errors
          }
        }
        const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
        for (const el of elements) {
          if (el.shadowRoot) visit(el.shadowRoot);
        }
      };
      visit(document);
    };
    collectDeep(selectors);
    return results.length;
  })()`;

  const initialGeminiUserCount = await client.evaluate<number>(geminiUserCountExpr);
  const initialModelResponseCount = await client.evaluate<number>(`
    (() => {
      const collectDeep = (selectorList) => {
        const results = [];
        const seen = new Set();
        const visit = (root) => {
          if (!root) return;
          for (const sel of selectorList) {
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {}
          }
          const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (const el of elements) {
            if (el.shadowRoot) visit(el.shadowRoot);
          }
        };
        visit(document);
        return results;
      };
      return collectDeep(['model-response', '.model-response', '[data-test-id*="response"]']).length;
    })()
  `);
  console.error(`[Gemini] Initial counts BEFORE input: user=${initialGeminiUserCount}, modelResponse=${initialModelResponseCount}`);

  const sanitized = JSON.stringify(question);
  const tInput = nowMs();

  // Phase 1: 最初の入力試行
  const inputResult = await client.evaluate<{ok: boolean; actualText: string}>(`
    (() => {
      const text = ${sanitized};
      const collectDeep = (selectorList) => {
        const results = [];
        const seen = new Set();
        const visit = (root) => {
          if (!root) return;
          for (const sel of selectorList) {
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {
              // ignore selector errors
            }
          }
          const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (const el of elements) {
            if (el.shadowRoot) {
              visit(el.shadowRoot);
            }
          }
        };
        visit(document);
        return results;
      };
      const textbox =
        collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
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
        const collectDeep = (selectorList) => {
          const results = [];
          const seen = new Set();
          const visit = (root) => {
            if (!root) return;
            for (const sel of selectorList) {
              try {
                root.querySelectorAll?.(sel)?.forEach(el => {
                  if (!seen.has(el)) {
                    seen.add(el);
                    results.push(el);
                  }
                });
              } catch {}
            }
            const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            for (const el of elements) {
              if (el.shadowRoot) visit(el.shadowRoot);
            }
          };
          visit(document);
          return results;
        };
        const textbox =
          collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
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
        const collectDeep = (selectorList) => {
          const results = [];
          const seen = new Set();
          const visit = (root) => {
            if (!root) return;
            for (const sel of selectorList) {
              try {
                root.querySelectorAll?.(sel)?.forEach(el => {
                  if (!seen.has(el)) {
                    seen.add(el);
                    results.push(el);
                  }
                });
              } catch {}
            }
            const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            for (const el of elements) {
              if (el.shadowRoot) visit(el.shadowRoot);
            }
          };
          visit(document);
          return results;
        };
        const textbox =
          collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
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
        const visible = (el) => {
          if (!el) return false;
          const rects = el.getClientRects();
          if (!rects || rects.length === 0) return false;
          const style = window.getComputedStyle(el);
          return style && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const collectDeep = (selector) => {
          const results = [];
          const seen = new Set();
          const visit = (root) => {
            if (!root) return;
            try {
              root.querySelectorAll?.(selector)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {
              // ignore
            }
            const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            for (const el of elements) {
              if (el.shadowRoot) visit(el.shadowRoot);
            }
          };
          visit(document);
          return results;
        };
        const counts = (selector) => {
          const nodes = collectDeep(selector);
          const visibleNodes = nodes.filter(visible);
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
      const collectDeep = (selectorList) => {
        const results = [];
        const seen = new Set();
        const visit = (root) => {
          if (!root) return;
          for (const sel of selectorList) {
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {
              // ignore selector errors
            }
          }
          const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (const el of elements) {
            if (el.shadowRoot) {
              visit(el.shadowRoot);
            }
          }
        };
        visit(document);
        return results;
      };
      const textbox =
        collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
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
    const selectors = ${JSON.stringify([
      'user-query',
      '.user-query',
      '[data-test-id*="user"]',
      '[data-test-id*="prompt"]',
      '[data-message-author-role="user"]',
      'message[author="user"]',
      '[data-author="user"]',
    ])};
    const results = [];
    const seen = new Set();
    const collectDeep = (selectorList) => {
      const visit = (root) => {
        if (!root) return;
        for (const sel of selectorList) {
          try {
            root.querySelectorAll?.(sel)?.forEach(el => {
              if (!seen.has(el)) {
                seen.add(el);
                results.push(el);
              }
            });
          } catch {
            // ignore selector errors
          }
        }
        const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
        for (const el of elements) {
          if (el.shadowRoot) visit(el.shadowRoot);
        }
      };
      visit(document);
    };
    collectDeep(selectors);
    const last = results[results.length - 1];
    return last ? (last.textContent || '').trim() : '';
  })()`;

  // 入力完了後の待機（内部状態更新を待つ）
  await new Promise(resolve => setTimeout(resolve, 200));
  console.error('[Gemini] Waited 200ms after input for state update');

  // Phase 2: 送信前テキスト確認 - 入力フィールドに正しいテキストがあるか最終確認
  const preSendCheck = await client.evaluate<{hasText: boolean; textLength: number; textPreview: string}>(`
    (() => {
      const collectDeep = (selectorList) => {
        const results = [];
        const seen = new Set();
        const visit = (root) => {
          if (!root) return;
          for (const sel of selectorList) {
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {}
          }
          const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (const el of elements) {
            if (el.shadowRoot) visit(el.shadowRoot);
          }
        };
        visit(document);
        return results;
      };
      const textbox =
        collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
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
  for (let i = 0; i < maxRetries; i++) {
    buttonInfo = await client.evaluate<{
    found: boolean;
    disabled: boolean;
    x: number;
    y: number;
    selector: string;
  }>(`
    (() => {
      const collectDeep = (selectorList) => {
        const results = [];
        const seen = new Set();
        const visit = (root) => {
          if (!root) return;
          for (const sel of selectorList) {
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {
              // ignore selector errors
            }
          }
          const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (const el of elements) {
            if (el.shadowRoot) {
              visit(el.shadowRoot);
            }
          }
        };
        visit(document);
        return results;
      };
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
      const buttons = collectDeep(['button', '[role="button"]'])
        .filter(isVisible)
        .filter(el => !isDisabled(el));

      // 「停止」ボタンがあるかチェック（応答生成中）
      const hasStopButton = buttons.some(b => {
        const text = (b.textContent || '').trim();
        const label = (b.getAttribute('aria-label') || '').trim();
        return text.includes('停止') || label.includes('停止') ||
               text.includes('Stop') || label.includes('Stop');
      });

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
        disabled: isDisabled(sendButton),
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

    if (i < maxRetries - 1) {
      const reason = !buttonInfo.found
        ? 'not found'
        : buttonInfo.disabled
          ? 'disabled (still generating)'
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
    throw new Error('Gemini send button is disabled after 60 seconds (previous response still generating).');
  }

  // CDP Input.dispatchMouseEventでクリック
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

  console.error('[Gemini] Mouse click dispatched via CDP');
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

  const tWaitResp = nowMs();
  console.error('[Gemini] Waiting for response completion (mic button OR send button enabled)...');

  // 応答完了判定:
  // - 停止ボタンがない AND (マイクボタンが表示 OR 送信ボタンが有効)
  // マイクボタン = 入力欄が空（応答後の状態）
  // 送信ボタン有効 = テキスト入力中でも送信可能（次の質問を入力済み）
  try {
    await client.waitForFunction(`
      (() => {
        const collectDeep = (selectorList) => {
          const results = [];
          const seen = new Set();
          const visit = (root) => {
            if (!root) return;
            for (const sel of selectorList) {
              try {
                root.querySelectorAll?.(sel)?.forEach(el => {
                  if (!seen.has(el)) {
                    seen.add(el);
                    results.push(el);
                  }
                });
              } catch {}
            }
            const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            for (const el of elements) {
              if (el.shadowRoot) visit(el.shadowRoot);
            }
          };
          visit(document);
          return results;
        };

        const isVisible = (el) => {
          if (!el) return false;
          const rects = el.getClientRects();
          if (!rects || rects.length === 0) return false;
          const style = window.getComputedStyle(el);
          return style && style.visibility !== 'hidden' && style.display !== 'none';
        };

        const isDisabled = (el) => {
          if (!el) return true;
          return el.disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.getAttribute('disabled') === 'true';
        };

        const buttons = collectDeep(['button', '[role="button"]']).filter(isVisible);

        // 停止ボタンがある場合はまだ生成中（これが最優先）
        const hasStopButton = buttons.some(b => {
          const text = (b.textContent || '').trim();
          const label = (b.getAttribute('aria-label') || '').trim();
          return text.includes('停止') || label.includes('停止') ||
                 text.includes('Stop') || label.includes('Stop');
        });
        if (hasStopButton) return false;

        // 条件1: マイクボタンが表示（入力欄が空 = 応答完了後の状態）
        const micButton = document.querySelector('[data-node-type="speech_dictation_mic_button"]') ||
                          buttons.find(b => {
                            const label = (b.getAttribute('aria-label') || '').toLowerCase();
                            return label.includes('マイク') || label.includes('mic');
                          });
        if (micButton && isVisible(micButton)) {
          return true;
        }

        // 条件2: 送信ボタンが有効（テキスト入力済みで送信可能）
        const sendBtn = buttons.find(b =>
          (b.textContent || '').includes('プロンプトを送信') ||
          (b.textContent || '').includes('送信') ||
          (b.getAttribute('aria-label') || '').includes('送信') ||
          (b.getAttribute('aria-label') || '').includes('Send') ||
          b.querySelector('mat-icon[data-mat-icon-name="send"]') ||
          b.querySelector('[data-icon="send"]')
        );
        if (sendBtn && !isDisabled(sendBtn)) {
          return true;
        }

        return false;
      })()
    `, 480000);  // 8分（長い応答に対応）
    console.error('[Gemini] Response complete (mic button or send button ready)');
  } catch (waitError) {
    console.error('[Gemini] Timeout waiting for response completion');
    const diagnostics = await client.evaluate(`
      (() => {
        const textIncludes = (needle) => document.body && document.body.innerText && document.body.innerText.includes(needle);
        const counts = (selector) => {
          const nodes = Array.from(document.querySelectorAll(selector));
          return {all: nodes.length};
        };
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
        };
      })()
    `);
    throw new Error(`Timed out waiting for Gemini response (send button not enabled after 8min): ${JSON.stringify(diagnostics)}`);
  }

  // 新しいレスポンスのみを取得（initialModelResponseCount 以降）
  const rawText = await client.evaluate<string>(`
    (() => {
      const initialCount = ${initialModelResponseCount};
      const collectDeep = (selectorList) => {
        const results = [];
        const seen = new Set();
        const visit = (root) => {
          if (!root) return;
          for (const sel of selectorList) {
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {}
          }
          const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
          for (const el of elements) {
            if (el.shadowRoot) visit(el.shadowRoot);
          }
        };
        visit(document);
        return results;
      };

      const allResponses = collectDeep(['model-response', '[data-test-id*="response"]', '.response', '.markdown', '.model-response']);

      // initialModelResponseCount 以降の新しいレスポンスのみを対象とする
      const newResponses = allResponses.slice(initialCount);

      if (newResponses.length === 0) {
        console.warn('[Gemini] No new responses after initialCount=' + initialCount + ', total=' + allResponses.length);
        // フォールバック: 最新のレスポンスを使用（カウントが信頼できない場合）
        if (allResponses.length > 0) {
          const msg = allResponses[allResponses.length - 1];
          const extractText = (root) => {
            if (!root) return '';
            const parts = [];
            const visit = (node) => {
              if (!node) return;
              if (node.nodeType === Node.TEXT_NODE) {
                const value = node.textContent;
                if (value) parts.push(value);
                return;
              }
              if (node.shadowRoot) visit(node.shadowRoot);
              const children = node.childNodes ? Array.from(node.childNodes) : [];
              for (const child of children) visit(child);
            };
            visit(root);
            return parts.join(' ').replace(/\\s+/g, ' ').trim();
          };
          return extractText(msg);
        }
        // フォールバック: aria-live="polite"
        const live = document.querySelector('[aria-live="polite"]');
        return live ? (live.textContent || '').trim() : '';
      }

      // 最新の新しいレスポンスを取得
      const msg = newResponses[newResponses.length - 1];
      const extractText = (root) => {
        if (!root) return '';
        const parts = [];
        const visit = (node) => {
          if (!node) return;
          if (node.nodeType === Node.TEXT_NODE) {
            const value = node.textContent;
            if (value) parts.push(value);
            return;
          }
          if (node.shadowRoot) visit(node.shadowRoot);
          const children = node.childNodes ? Array.from(node.childNodes) : [];
          for (const child of children) visit(child);
        };
        visit(root);
        return parts.join(' ').replace(/\\s+/g, ' ').trim();
      };

      return extractText(msg);
    })()
  `);

  const normalized = normalizeGeminiResponse(rawText, question);
  console.error(`[Gemini] Response extracted: ${normalized.slice(0, 100)}...`);

  const finalUrl = await client.evaluate<string>('location.href');
  if (finalUrl && finalUrl.includes('gemini.google.com')) {
    await saveSession('gemini', finalUrl);
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
  return {answer: normalized, timings: fullTimings};
}

/**
 * Geminiに質問して回答を取得（後方互換用）
 */
export async function askGeminiFast(question: string): Promise<string> {
  const result = await askGeminiFastInternal(question);
  return result.answer;
}

/**
 * Geminiに質問して回答とタイミング情報を取得
 */
export async function askGeminiFastWithTimings(question: string): Promise<ChatResult> {
  return askGeminiFastInternal(question);
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

  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;

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
          const collectDeep = (selectorList) => {
            const results = [];
            const seen = new Set();
            const visit = (root) => {
              if (!root) return;
              for (const sel of selectorList) {
                try {
                  root.querySelectorAll?.(sel)?.forEach(el => {
                    if (!seen.has(el)) {
                      seen.add(el);
                      results.push(el);
                    }
                  });
                } catch {}
              }
              const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
              for (const el of elements) {
                if (el.shadowRoot) visit(el.shadowRoot);
              }
            };
            visit(document);
            return results;
          };

          // 入力欄
          const textbox = collectDeep(['[role="textbox"]', 'div[contenteditable="true"]', 'textarea'])[0];
          const inputFound = !!textbox;
          const inputValue = textbox ?
            (textbox.isContentEditable ? textbox.innerText : (textbox.value || textbox.textContent || '')) : '';

          // 送信ボタン
          const buttons = collectDeep(['button[aria-label*="Send"]', 'button[aria-label*="送信"]', 'button.send-button', '[data-test-id*="send"]']);
          const sendButtonFound = buttons.length > 0;

          // メッセージカウント
          const userSelectors = ['user-query', '.user-query', '[data-message-author-role="user"]', 'message[author="user"]'];
          const userMsgs = collectDeep(userSelectors);
          const assistantSelectors = ['model-response', '.model-response', '[data-message-author-role="assistant"]', 'message[author="model"]'];
          const assistantMsgs = collectDeep(assistantSelectors);

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

  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;

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
          const collectDeep = (sel) => {
            const results = [];
            const seen = new Set();
            const visit = (root) => {
              if (!root) return;
              try {
                root.querySelectorAll?.(sel)?.forEach(el => {
                  if (!seen.has(el)) {
                    seen.add(el);
                    results.push(el);
                  }
                });
              } catch {}
              const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
              for (const el of elements) {
                if (el.shadowRoot) visit(el.shadowRoot);
              }
            };
            visit(document);
            return results;
          };

          const elements = collectDeep(${JSON.stringify(selector)});
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
        const collectDeep = (sel) => {
          const results = [];
          const seen = new Set();
          const visit = (root) => {
            if (!root) return;
            try {
              root.querySelectorAll?.(sel)?.forEach(el => {
                if (!seen.has(el)) {
                  seen.add(el);
                  results.push(el);
                }
              });
            } catch {}
            const elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            for (const el of elements) {
              if (el.shadowRoot) visit(el.shadowRoot);
            }
          };
          visit(document);
          return results;
        };

        const messages = [];

        // User messages
        const userEls = collectDeep(${JSON.stringify(messageSelectors.user)});
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
        const assistantEls = collectDeep(${JSON.stringify(messageSelectors.assistant)});
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
