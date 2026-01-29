import fs from 'node:fs/promises';
import path from 'node:path';

import {connectViaExtensionRaw} from './extension-raw.js';
import {CdpClient} from './cdp-client.js';

let chatgptClient: CdpClient | null = null;
let geminiClient: CdpClient | null = null;

function nowMs(): number {
  return Date.now();
}

/**
 * 接続の健全性を確認する
 * 軽量なevaluateコマンドで接続が生きているかチェック
 */
async function isConnectionHealthy(client: CdpClient): Promise<boolean> {
  try {
    // 2秒タイムアウトで簡単なコマンドを実行
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 2000)
    );
    await Promise.race([client.evaluate('1'), timeoutPromise]);
    return true;
  } catch (error) {
    console.error('[fast-cdp] Connection health check failed:', error);
    return false;
  }
}

type SessionStore = {
  projects: Record<
    string,
    {
      chatgpt?: {url: string; lastUsed: string};
      gemini?: {url: string; lastUsed: string};
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

async function saveSession(kind: 'chatgpt' | 'gemini', url: string): Promise<void> {
  const project = getProjectName();
  const sessions = await loadSessions();
  if (!sessions.projects[project]) {
    sessions.projects[project] = {};
  }
  sessions.projects[project][kind] = {
    url,
    lastUsed: new Date().toISOString(),
  };
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

async function getPreferredUrl(kind: 'chatgpt' | 'gemini'): Promise<string | null> {
  const project = getProjectName();
  const sessions = await loadSessions();
  const entry = sessions.projects[project]?.[kind];
  return entry?.url || null;
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
  return false;
}

/**
 * 新しい接続を作成する（リトライ機構付き）
 * 戦略:
 * - ChatGPT: 常に新規タブ（URLが /c/xxx に変わるため再利用困難）
 * - Gemini: 既存タブを再利用、失敗したら新規タブ
 */
async function createConnection(kind: 'chatgpt' | 'gemini'): Promise<CdpClient> {
  const preferred = await getPreferredUrl(kind);
  const defaultUrl = kind === 'chatgpt'
    ? 'https://chatgpt.com/'
    : 'https://gemini.google.com/';

  // ChatGPT: 常に新規タブを作成（URLが変わるため既存タブ再利用は不安定）
  // Gemini: 既存タブを再利用、失敗したら新規タブ
  if (kind === 'gemini' && preferred) {
    console.error(`[fast-cdp] Trying to reuse existing ${kind} tab: ${preferred} (3s timeout)`);
    try {
      const relayResult = await connectViaExtensionRaw({
        tabUrl: preferred,
        newTab: false,
        timeoutMs: 3000,  // 短いタイムアウト
      });

      const client = new CdpClient(relayResult.relay);
      await client.send('Runtime.enable');
      await client.send('DOM.enable');
      await client.send('Page.enable');

      geminiClient = client;
      console.error(`[fast-cdp] ${kind} reused existing tab successfully`);
      return client;
    } catch (error) {
      console.error(`[fast-cdp] ${kind} existing tab not found, will create new tab`);
    }
  }

  // 新しいタブを作成
  console.error(`[fast-cdp] Creating new ${kind} tab: ${defaultUrl}`);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
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

      console.error(`[fast-cdp] ${kind} new tab created successfully (attempt ${attempt + 1})`);
      return client;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
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
  const existing = kind === 'chatgpt' ? chatgptClient : geminiClient;

  // 既存接続がある場合、健全性をチェック
  if (existing) {
    const healthy = await isConnectionHealthy(existing);
    if (healthy) {
      console.error(`[fast-cdp] Reusing healthy ${kind} connection`);
      return existing;
    }

    // 接続が切れている → キャッシュをクリア
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

export async function askChatGPTFast(question: string): Promise<string> {
  const t0 = nowMs();
  const timings: Record<string, number> = {};
  const client = await getClient('chatgpt');
  timings.connectMs = nowMs() - t0;
  const normalizedQuestion = question.replace(/\s+/g, '');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const tUrl = nowMs();
    const currentUrl = await client.evaluate<string>('location.href');
    const pageTitle = await client.evaluate<string>('document.title');
    const lastUserText = await client.evaluate<string>(`(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="user"]');
      const last = msgs[msgs.length - 1];
      return last ? (last.textContent || '') : '';
    })()`);
    if (attempt === 1) {
      await navigate(client, 'https://chatgpt.com/');
    } else if (
      (pageTitle && pageTitle.includes('接続テスト')) ||
      (lastUserText && lastUserText.includes('接続テスト'))
    ) {
      await navigate(client, 'https://chatgpt.com/');
    } else if (!currentUrl || !currentUrl.includes('chatgpt.com')) {
      const preferred = await getPreferredUrl('chatgpt');
      await navigate(client, preferred || 'https://chatgpt.com/');
    } else {
      const preferred = await getPreferredUrl('chatgpt');
      if (preferred && !currentUrl.startsWith(preferred)) {
        await navigate(client, preferred);
      }
    }
    timings.navigateMs = nowMs() - tUrl;

    const tWaitInput = nowMs();
    await client.waitForFunction(
      `(
        !!document.querySelector('textarea#prompt-textarea') ||
        !!document.querySelector('textarea[data-testid="prompt-textarea"]') ||
        !!document.querySelector('.ProseMirror[contenteditable="true"]')
      )`,
      30000,
    );
    timings.waitInputMs = nowMs() - tWaitInput;

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

    const initialUserCount = await client.evaluate<number>(
      `document.querySelectorAll('[data-message-author-role="user"]').length`,
    );

    // デバッグ: 送信前のメッセージカウント
    console.error(`[ChatGPT] User message count before send: ${initialUserCount}`);

    // 入力完了後の待機（内部状態更新を待つ）
    await new Promise(resolve => setTimeout(resolve, 200));
    console.error('[ChatGPT] Waited 200ms after input for state update');

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

    console.error('[ChatGPT] Mouse click dispatched via CDP');
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
      console.error(`[ChatGPT] User message count after send: ${userCountAfter} (increased: ${userCountAfter > initialUserCount || (initialUserCount === 0 && userCountAfter > 0)})`);

      if (userCountAfter <= initialUserCount && !(initialUserCount === 0 && userCountAfter > 0)) {
        throw new Error(`Message count did not increase (before: ${initialUserCount}, after: ${userCountAfter})`);
      }
    } catch (error) {
      // フォールバック: Enterキーイベント
      console.error('[ChatGPT] Message not sent, trying Enter key fallback');
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
        console.error('[ChatGPT] Enter key fallback succeeded');
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

    // 送信直後のアシスタントカウントを基準にする
    // （既存チャットでは、送信前後でカウントが変わらない可能性がある）
    await new Promise(resolve => setTimeout(resolve, 500)); // DOM更新を待つ

    // 送信前の最後のアシスタントメッセージテキストを記録（既存チャットの場合）
    // Thinkingモード（result-thinking）は無視し、実際のテキストを持つメッセージのみを対象にする
    const lastAssistantTextBefore = await client.evaluate<string>(`
      (() => {
        const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (assistants.length === 0) return '';

        // 最後から順に、実際のテキストを持つメッセージを探す
        for (let i = assistants.length - 1; i >= 0; i--) {
          const msg = assistants[i];
          // result-thinkingクラスを持つ要素は無視
          if (msg.querySelector('.result-thinking')) continue;

          const text = (msg.textContent || '').trim();
          if (text.length > 10) {  // 10文字以上のテキストがあれば有効
            return text.slice(0, 200);
          }
        }
        return '';  // テキストを持つメッセージがない場合
      })()
    `);
    console.error(`[ChatGPT] Last assistant text before (non-thinking): "${lastAssistantTextBefore.slice(0, 80)}..."`);

    // DOM構造デバッグ: 様々なセレクタを試す
    const domDebug = await client.evaluate<Record<string, number>>(`
      (() => {
        const selectors = {
          'data_role_assistant': '[data-message-author-role="assistant"]',
          'data_role_user': '[data-message-author-role="user"]',
          'article': 'article',
          'agent_turn': '.agent-turn',
          'data_testid_conv_turn': '[data-testid*="conversation-turn"]',
          'data_message_id': '[data-message-id]',
        };
        const results = {};
        for (const [key, sel] of Object.entries(selectors)) {
          try {
            results[key] = document.querySelectorAll(sel).length;
          } catch {
            results[key] = -1;
          }
        }
        return results;
      })()
    `);
    console.error(`[ChatGPT] DOM Debug:`, JSON.stringify(domDebug));

    // デバッグ: 実際のメッセージ要素のHTMLをダンプ
    const htmlDump = await client.evaluate<{
      assistantHtml: string[];
      userHtml: string[];
      articleHtml: string[];
    }>(`
      (() => {
        const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
        const users = document.querySelectorAll('[data-message-author-role="user"]');
        const articles = document.querySelectorAll('article');
        return {
          assistantHtml: Array.from(assistants).map(el => el.outerHTML.slice(0, 500)),
          userHtml: Array.from(users).map(el => el.outerHTML.slice(0, 500)),
          articleHtml: Array.from(articles).map(el => el.outerHTML.slice(0, 500)),
        };
      })()
    `);

    // HTMLダンプをファイルに保存
    const dumpPath = '/tmp/chatgpt-dom-dump.json';
    await fs.writeFile(dumpPath, JSON.stringify(htmlDump, null, 2), 'utf-8');
    console.error(`[ChatGPT] HTML dump saved to: ${dumpPath}`);

    const initialAssistantCount = domDebug.data_role_assistant || 0;
    console.error(`[ChatGPT] Initial assistant count after send: ${initialAssistantCount}`);

    const tWaitResp = nowMs();
    const start = Date.now();
    console.error(`[ChatGPT] Waiting for response... (initialAssistantCount: ${initialAssistantCount})`);
    let loopCount = 0;
    while (Date.now() - start < 60000) {
      loopCount++;
      if (loopCount % 10 === 1) {
        console.error(`[ChatGPT] Response wait loop: attempt ${loopCount}, elapsed ${Math.round((Date.now() - start) / 1000)}s`);
      }
      const status = await client.evaluate<{
        completed: boolean;
        text?: string;
        debug?: {
          streaming: boolean;
          assistantCount: number;
          hasStop: boolean;
          allCounts?: Record<string, number>;
          textChanged?: boolean;
          lastText?: string;
        };
      }>(`
        (() => {
        const stop = document.querySelector('button[data-testid="stop-button"]');
        const buttons = Array.from(document.querySelectorAll('button'));
        const textStop = buttons.some(btn =>
          (btn.textContent || '').includes('ストリーミングの停止') ||
          (btn.textContent || '').includes('停止')
        );
        const streaming = !!stop || textStop;

          // デバッグ: 複数のセレクタでカウント
          const allCounts = {
            data_role_assistant: document.querySelectorAll('[data-message-author-role="assistant"]').length,
            data_role_user: document.querySelectorAll('[data-message-author-role="user"]').length,
            article: document.querySelectorAll('article').length,
            agent_turn: document.querySelectorAll('.agent-turn').length,
            data_testid_conv: document.querySelectorAll('[data-testid*="conversation-turn"]').length,
            data_message_id: document.querySelectorAll('[data-message-id]').length,
          };

          const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
          const assistantCount = messages.length;

          // 既存チャット対応: 最後のアシスタントメッセージのテキストが変化したか
          // Thinkingモードのメッセージは無視
          let lastAssistantText = '';
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.querySelector('.result-thinking')) continue;
            const text = (msg.textContent || '').trim();
            if (text.length > 10) {
              lastAssistantText = text.slice(0, 200);
              break;
            }
          }
          const textChanged = lastAssistantText !== ${JSON.stringify(lastAssistantTextBefore)} && lastAssistantText.length > 10;

          // 完了条件: カウント増加 OR (ストリーミング完了 AND テキスト変化)
          if (!streaming && (messages.length > ${initialAssistantCount} || (messages.length === ${initialAssistantCount} && textChanged))) {
            const msg = messages[messages.length - 1];
            if (!msg) return {completed: true, text: ''};
            const content =
              msg.querySelector?.('.markdown, .prose, .markdown.prose, .message-content') || msg;
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
            return {completed: true, text: extractText(content), debug: {streaming, assistantCount, hasStop: !!stop, allCounts, textChanged, lastText: lastAssistantText}};
          }
          return {completed: false, debug: {streaming, assistantCount, hasStop: !!stop, allCounts, textChanged, lastText: lastAssistantText}};
        })()
      `);
      if (loopCount % 10 === 1 && status.debug) {
        console.error(`[ChatGPT] Status: streaming=${status.debug.streaming}, assistantCount=${status.debug.assistantCount}, hasStop=${status.debug.hasStop}, textChanged=${status.debug.textChanged}`);
        if (status.debug.allCounts) {
          console.error(`[ChatGPT] All counts:`, JSON.stringify(status.debug.allCounts));
        }
        if (status.debug.lastText) {
          console.error(`[ChatGPT] Last text: "${status.debug.lastText.slice(0, 80)}..."`);
        }
      }

      // 10回に1回、HTMLダンプを更新
      if (loopCount === 11 || loopCount === 21) {
        const htmlDumpLoop = await client.evaluate<{assistantHtml: string[]}>(`
          (() => {
            const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
            return {
              assistantHtml: Array.from(assistants).map(el => el.outerHTML.slice(0, 1000)),
            };
          })()
        `);
        const dumpPath = `/tmp/chatgpt-dom-dump-loop${loopCount}.json`;
        await fs.writeFile(dumpPath, JSON.stringify(htmlDumpLoop, null, 2), 'utf-8');
        console.error(`[ChatGPT] HTML dump (loop ${loopCount}) saved to: ${dumpPath}`);
      }
      if (status.completed) {
        console.error(`[ChatGPT] Response completed after ${loopCount} attempts (${Math.round((Date.now() - start) / 1000)}s)`);
        const answer = status.text || '';
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
          return answer;
        }
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error('Timed out waiting for ChatGPT response');
}

export async function askGeminiFast(question: string): Promise<string> {
  const t0 = nowMs();
  const timings: Record<string, number> = {};
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

  const sanitized = JSON.stringify(question);
  const tInput = nowMs();
  const inputOk = await client.evaluate<boolean>(`
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
      if (!textbox) return false;
      textbox.focus();
      if (textbox.isContentEditable) {
        textbox.innerText = text;
        textbox.dispatchEvent(new Event('input', {bubbles: true}));
        textbox.dispatchEvent(new Event('change', {bubbles: true}));
        return true;
      }
      if ('value' in textbox) {
        textbox.value = text;
        textbox.dispatchEvent(new Event('input', {bubbles: true}));
        textbox.dispatchEvent(new Event('change', {bubbles: true}));
        return true;
      }
      return false;
    })()
  `);
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
  const initialGeminiUserCount = await client.evaluate<number>(geminiUserCountExpr);

  // デバッグ: 送信前のメッセージカウント
  const userCountBefore = await client.evaluate<number>(geminiUserCountExpr);
  console.error(`[Gemini] User message count before send: ${userCountBefore}`);

  // 入力完了後の待機（内部状態更新を待つ）
  await new Promise(resolve => setTimeout(resolve, 200));
  console.error('[Gemini] Waited 200ms after input for state update');

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

  const initialCount = await client.evaluate<number>(
    `document.querySelectorAll('model-response, [data-test-id*="response"], .response, .markdown, .model-response, [aria-live="polite"]').length`,
  );
  const initialLiveText = await client.evaluate<string>(
    `(document.querySelector('[aria-live="polite"]')?.textContent || '').trim()`,
  );
  const tWaitResp = nowMs();
  const start = Date.now();
  const maxWait = 45000;

  // 6秒リトライロジックは削除（CDP Input.dispatchMouseEventで確実に送信）
  while (Date.now() - start < maxWait) {
    const status = await client.evaluate<{
      completed: boolean;
      text?: string;
    }>(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const streaming = buttons.some(btn =>
          (btn.textContent || '').includes('停止') ||
          (btn.getAttribute('aria-label') || '').includes('停止')
        );
        if (streaming) {
          return {completed: false};
        }
        const responses = document.querySelectorAll('model-response, [data-test-id*="response"], .response, .markdown, .model-response');
        if (responses.length > ${initialCount}) {
          const msg = responses[responses.length - 1];
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
          return {completed: true, text: extractText(msg)};
        }
        const live = document.querySelector('[aria-live="polite"]');
        const liveText = live ? (live.textContent || '').trim() : '';
        if (liveText && liveText.length > ${JSON.stringify(initialLiveText)}.length + 5) {
          return {completed: true, text: liveText};
        }
        return {completed: false};
      })()
    `);
    if (status.completed) {
      const normalized = normalizeGeminiResponse(status.text || '', question);
      if (normalized) {
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
        return normalized;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

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
          status: counts('[role="status"]'),
          alert: counts('[role="alert"]'),
        },
      };
    })()
  `);
  throw new Error(
    `Timed out waiting for Gemini response (45s): ${JSON.stringify(diagnostics)}`,
  );
}
