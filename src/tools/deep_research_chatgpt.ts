/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Path to store chat session data
 */
const CHAT_SESSIONS_FILE = path.join(
  process.cwd(),
  'docs/ask/chatgpt/.chat-sessions.json',
);

interface ChatSession {
  chatId: string;
  url: string;
  lastUsed: string;
  title?: string;
}

interface ChatSessions {
  [projectName: string]: ChatSession;
}

/**
 * Load chat sessions from JSON file
 */
async function loadChatSessions(): Promise<ChatSessions> {
  try {
    const data = await fs.promises.readFile(CHAT_SESSIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save a chat session for a project
 */
async function saveChatSession(
  projectName: string,
  session: ChatSession,
): Promise<void> {
  const sessions = await loadChatSessions();
  sessions[projectName] = session;

  const dir = path.dirname(CHAT_SESSIONS_FILE);
  await fs.promises.mkdir(dir, {recursive: true});

  await fs.promises.writeFile(
    CHAT_SESSIONS_FILE,
    JSON.stringify(sessions, null, 2),
    'utf-8',
  );
}

/**
 * Sanitize question to remove sensitive information
 */
function sanitizeQuestion(text: string): string {
  const passwordPatterns = [
    /password\s*[:=]\s*\S+/gi,
    /パスワード\s*[:：=]\s*\S+/gi,
    /pwd\s*[:=]\s*\S+/gi,
    /secret\s*[:=]\s*\S+/gi,
  ];

  let sanitized = text;
  for (const pattern of passwordPatterns) {
    sanitized = sanitized.replace(pattern, '[パスワードは除外されました]');
  }

  return sanitized;
}

/**
 * Save conversation log to docs/ask/chatgpt/
 */
async function saveConversationLog(
  projectName: string,
  question: string,
  response: string,
  metadata: {
    researchTime?: number;
    chatUrl?: string;
    model?: string;
  },
): Promise<string> {
  const now = new Date();
  const timestamp = [
    String(now.getFullYear()).slice(2).padStart(2, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const topicSlug = question
    .substring(0, 50)
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/gi, '-')
    .toLowerCase()
    .slice(0, 30);

  const filename = `${timestamp}-${projectName}-deepresearch-${topicSlug}.md`;
  const logDir = 'docs/ask/chatgpt';
  const logPath = path.join(process.cwd(), logDir, filename);

  await fs.promises.mkdir(path.dirname(logPath), {recursive: true});

  const content = `# ${topicSlug}

## 📅 メタ情報
- **日時**: ${now.toLocaleString('ja-JP')}
- **プロジェクト**: ${projectName}
- **AIモデル**: ${metadata.model || 'ChatGPT DeepResearch'}
${metadata.researchTime ? `- **リサーチ時間**: ${metadata.researchTime}秒\n` : ''}${metadata.chatUrl ? `- **チャットURL**: ${metadata.chatUrl}\n` : ''}
## ❓ リサーチテーマ

${question}

## 🔍 DeepResearch 結果

${response}
`;

  await fs.promises.writeFile(logPath, content, 'utf-8');
  return path.relative(process.cwd(), logPath);
}

/**
 * Detect if question is code-related
 */
function isCodeRelatedQuestion(question: string): boolean {
  const codeKeywords = [
    'code',
    'コード',
    'programming',
    'プログラミング',
    'github',
    'repository',
    'リポジトリ',
    'api',
    'library',
    'ライブラリ',
    'framework',
    'フレームワーク',
    'typescript',
    'javascript',
    'python',
    'implementation',
    '実装',
    'algorithm',
    'アルゴリズム',
    'database',
    'データベース',
    'function',
    '関数',
  ];

  const lowerQuestion = question.toLowerCase();
  return codeKeywords.some((keyword) => lowerQuestion.includes(keyword));
}

/**
 * Detect if currently in DeepResearch mode
 */
async function detectDeepResearchMode(page: any): Promise<{
  isEnabled: boolean;
  indicator?: string;
}> {
  return await page.evaluate(() => {
    // Multi-language patterns for DeepResearch
    const DEEP_RESEARCH_PATTERN = /リサーチ|deep\s*research|ディープ\s*リサーチ|深度研究|深入研究/i;

    // Step 1: Check for the "リサーチ" pill button near prompt (MOST RELIABLE)
    // When DeepResearch is ON, a pill button appears in the composer form
    const promptTextarea = document.querySelector('#prompt-textarea');
    if (promptTextarea) {
      const form = promptTextarea.closest('form');
      if (form) {
        const pillButton = Array.from(form.querySelectorAll('button')).find(
          (btn) => {
            const text = btn.textContent?.trim() || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            // Check for pill button with research text
            return (
              btn.className.includes('composer-pill') &&
              DEEP_RESEARCH_PATTERN.test(text + ' ' + ariaLabel)
            );
          }
        );

        if (pillButton) {
          const text = pillButton.textContent?.trim() || '';
          return {
            isEnabled: true,
            indicator: `composer-pill: "${text}"`,
          };
        }
      }
    }

    // Step 2: Try data-testid selectors
    const dataTestIdSelectors = [
      '[data-testid*="deep-research"]',
      '[data-testid*="deepresearch"]',
      '[data-testid*="research-mode"]',
    ];

    for (const selector of dataTestIdSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return {
          isEnabled: true,
          indicator: `data-testid: ${element.getAttribute('data-testid')}`,
        };
      }
    }

    // Step 3: Try aria-* attributes SECOND
    const ariaSelectors = [
      '[aria-label*="Deep Research" i]',
      '[aria-label*="ディープリサーチ" i]',
      '[aria-checked="true"][role="menuitemradio"]',
    ];

    for (const selector of ariaSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));

      for (const element of elements) {
        const ariaLabel = element.getAttribute('aria-label') || '';
        const role = element.getAttribute('role') || '';

        // Check aria-label with pattern
        if (DEEP_RESEARCH_PATTERN.test(ariaLabel)) {
          return {
            isEnabled: true,
            indicator: `aria-label: ${ariaLabel.substring(0, 50)}`,
          };
        }

        // Check menuitemradio with aria-checked
        if (role === 'menuitemradio') {
          const isChecked = element.getAttribute('aria-checked') === 'true';
          const text = element.textContent || '';

          if (isChecked && DEEP_RESEARCH_PATTERN.test(text)) {
            return {
              isEnabled: true,
              indicator: 'menuitemradio (checked)',
            };
          }
        }
      }
    }

    // Step 4: Text matching as LAST resort (least reliable)
    const textElements = Array.from(
      document.querySelectorAll('div, span, button'),
    );

    for (const element of textElements) {
      const text = element.textContent || '';

      if (DEEP_RESEARCH_PATTERN.test(text)) {
        return {
          isEnabled: true,
          indicator: `text match: ${text.substring(0, 50).trim()}`,
        };
      }
    }

    return {isEnabled: false};
  });
}

/**
 * Enable DeepResearch mode by clicking + button and selecting option
 */
async function enableDeepResearchMode(
  page: any,
  response: any,
): Promise<{success: boolean; error?: string}> {
  try {
    response.appendResponseLine('DeepResearchモードを有効化中...');

    // Step 1: Click "+" button (ファイルの追加など)
    const plusButtonSelector = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const plusButton = buttons.find((btn) => {
        const aria = btn.getAttribute('aria-label') || '';
        return aria.includes('ファイルの追加');
      });

      if (!plusButton)
        return {success: false, error: '+ボタン（ファイルの追加など）が見つかりません'};

      // Return selector info instead of clicking
      const ariaLabel = plusButton.getAttribute('aria-label');
      return {success: true, ariaLabel};
    });

    if (!plusButtonSelector.success) {
      return {success: false, error: plusButtonSelector.error};
    }

    // Use Puppeteer's click for reliable interaction
    await page.click(`button[aria-label="${plusButtonSelector.ariaLabel}"]`);

    response.appendResponseLine('✅ +ボタン（ファイルの追加など）をクリック');

    // Wait for menu to appear
    await page.waitForSelector('[role="menuitemradio"]', { visible: true, timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 2: Find and click "Deep Research" menuitemradio
    const deepResearchResult = await page.evaluate(() => {
      const menuItems = Array.from(document.querySelectorAll('[role="menuitemradio"]'));

      const deepResearchItem = menuItems.find((item) =>
        item.textContent?.includes('Deep Research') || item.textContent?.includes('リサーチ')
      );

      if (!deepResearchItem) {
        return {
          success: false,
          error: `DeepResearch menuitemradio が見つかりません (found: ${menuItems.length} items: ${menuItems.map(m => m.textContent?.trim()).join(', ')})`,
        };
      }

      // Check if already checked
      const isChecked = deepResearchItem.getAttribute('aria-checked') === 'true';

      if (!isChecked) {
        (deepResearchItem as HTMLElement).click();
      }

      return { success: true, alreadyEnabled: isChecked };
    });

    if (!deepResearchResult.success) {
      return { success: false, error: deepResearchResult.error };
    }

    if (deepResearchResult.alreadyEnabled) {
      response.appendResponseLine('✅ DeepResearch は既に有効です');
    } else {
      response.appendResponseLine('✅ DeepResearch menuitemradio をクリック');
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 3: Verify mode was actually enabled (composer-pill detection)
    const verification = await detectDeepResearchMode(page);
    if (!verification.isEnabled) {
      return {
        success: false,
        error: 'DeepResearchモードの有効化に失敗しました（リサーチpillが検出されませんでした）',
      };
    }

    response.appendResponseLine(
      `✅ モード確認完了: DeepResearch有効 (${verification.indicator})`,
    );

    return {success: true};
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Configure information sources (enable GitHub if needed)
 */
async function configureSources(
  page: any,
  response: any,
  enableGitHub: boolean,
): Promise<void> {
  if (!enableGitHub) {
    response.appendResponseLine('📚 情報源設定: Web (デフォルト)');
    return;
  }

  response.appendResponseLine('📚 情報源設定: Web + GitHub (コード関連質問)');

  const sourcesConfigured = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sourcesButton = buttons.find((btn) =>
      btn.textContent?.includes('情報源'),
    );

    if (!sourcesButton) {
      return {success: false, error: '情報源ボタンが見つかりません'};
    }

    sourcesButton.click();
    return {success: true};
  });

  if (!sourcesConfigured.success) {
    response.appendResponseLine(`⚠️ ${sourcesConfigured.error}`);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  // Enable GitHub source
  const githubEnabled = await page.evaluate(() => {
    const checkboxes = Array.from(
      document.querySelectorAll('[role="menuitemcheckbox"]'),
    );
    const githubCheckbox = checkboxes.find((cb) =>
      cb.textContent?.includes('GitHub'),
    );

    if (!githubCheckbox) {
      return {success: false, error: 'GitHubオプションが見つかりません'};
    }

    const isChecked = githubCheckbox.getAttribute('aria-checked') === 'true';
    if (!isChecked) {
      (githubCheckbox as HTMLElement).click();
    }

    return {success: true, wasAlreadyEnabled: isChecked};
  });

  if (githubEnabled.success) {
    response.appendResponseLine(
      githubEnabled.wasAlreadyEnabled
        ? '✅ GitHub情報源は既に有効です'
        : '✅ GitHub情報源を有効化',
    );
  } else {
    response.appendResponseLine(`⚠️ ${githubEnabled.error}`);
  }

  // Close menu
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 300));
}

/**
 * Send question text and click send button
 */
async function sendQuestion(
  page: any,
  response: any,
  question: string,
): Promise<{success: boolean; error?: string}> {
  // Final verification before sending
  const finalCheck = await detectDeepResearchMode(page);
  if (!finalCheck.isEnabled) {
    return {
      success: false,
      error:
        'DeepResearchモードが無効です。送信前の最終確認に失敗しました。',
    };
  }

  response.appendResponseLine(
    `✅ 送信前確認: DeepResearchモード有効 (${finalCheck.indicator})`,
  );
  response.appendResponseLine('リサーチテーマを送信中...');

  const questionSent = await page.evaluate((questionText: string) => {
    const prosemirror = document.querySelector(
      '.ProseMirror[contenteditable="true"]',
    ) as HTMLElement;
    if (!prosemirror) return false;

    prosemirror.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = questionText;
    prosemirror.appendChild(p);
    prosemirror.dispatchEvent(new Event('input', {bubbles: true}));

    return true;
  }, question);

  if (!questionSent) {
    return {success: false, error: 'エディタが見つかりません'};
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  // Click send button
  const sent = await page.evaluate(() => {
    const sendButton = document.querySelector(
      'button[data-testid="send-button"]',
    ) as HTMLButtonElement;
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
      return true;
    }
    return false;
  });

  if (!sent) {
    return {success: false, error: '送信ボタンが見つかりません'};
  }

  response.appendResponseLine('✅ リサーチテーマ送信完了');
  return {success: true};
}

/**
 * Handle conversation continuation until research starts
 */
async function handleConversationLoop(
  page: any,
  response: any,
  maxTurns = 5,
): Promise<{researchStarted: boolean; error?: string}> {
  response.appendResponseLine(
    '💬 ChatGPTとの対話を開始（リサーチ開始まで継続）...',
  );

  let conversationTurns = 0;

  while (conversationTurns < maxTurns) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const status = await page.evaluate(() => {
      // Check for research progress indicator
      const progressIndicators = Array.from(
        document.querySelectorAll('div, span'),
      );
      const isResearching = progressIndicators.some(
        (el) =>
          el.textContent?.includes('リサーチ中') ||
          el.textContent?.includes('Researching') ||
          el.textContent?.includes('情報を収集中'),
      );

      if (isResearching) {
        return {phase: 'researching'};
      }

      // Check if ChatGPT is asking a clarifying question
      const assistantMessages = document.querySelectorAll(
        '[data-message-author-role="assistant"]',
      );
      if (assistantMessages.length === 0) {
        return {phase: 'waiting'};
      }

      const latestMessage = assistantMessages[assistantMessages.length - 1];
      const messageText = latestMessage.textContent || '';

      // Check if it's still streaming
      const buttons = Array.from(document.querySelectorAll('button'));
      const isStreaming = buttons.some((btn) => {
        const text = btn.textContent || '';
        const aria = btn.getAttribute('aria-label') || '';
        return (
          text.includes('ストリーミングの停止') ||
          text.includes('停止') ||
          aria.includes('ストリーミングの停止') ||
          aria.includes('停止')
        );
      });

      if (isStreaming) {
        return {phase: 'streaming'};
      }

      // ChatGPT has asked a question
      return {
        phase: 'clarification',
        question: messageText.substring(0, 200),
      };
    });

    if (status.phase === 'researching') {
      response.appendResponseLine('\n🔍 リサーチが開始されました！監視を開始...');
      return {researchStarted: true};
    }

    if (status.phase === 'clarification') {
      conversationTurns++;
      response.appendResponseLine(
        `\n💬 ChatGPTの質問 (${conversationTurns}/${maxTurns}):`,
      );
      response.appendResponseLine(`"${status.question}..."`);

      // Auto-respond to continue
      response.appendResponseLine('自動応答: その内容で実施してください');

      const responded = await page.evaluate(() => {
        const prosemirror = document.querySelector(
          '.ProseMirror[contenteditable="true"]',
        ) as HTMLElement;
        if (!prosemirror) return false;

        prosemirror.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = 'その内容で実施してください';
        prosemirror.appendChild(p);
        prosemirror.dispatchEvent(new Event('input', {bubbles: true}));

        return true;
      });

      if (responded) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        await page.evaluate(() => {
          const sendButton = document.querySelector(
            'button[data-testid="send-button"]',
          ) as HTMLButtonElement;
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
          }
        });

        response.appendResponseLine('✅ 応答を送信');
      }

      continue;
    }

    if (status.phase === 'streaming' || status.phase === 'waiting') {
      // Still processing, wait
      continue;
    }
  }

  return {
    researchStarted: false,
    error: '会話ターン数が上限に達しました。リサーチが開始されませんでした。',
  };
}

/**
 * Monitor research progress until completion
 */
async function monitorResearch(
  page: any,
  response: any,
  startTime: number,
): Promise<{completed: boolean; result?: string; error?: string}> {
  response.appendResponseLine(
    '⏳ DeepResearchを実行中... (数分かかる場合があります)',
  );

  const MAX_WAIT_TIME = 15 * 60 * 1000; // 15 minutes max
  let progressCounter = 0;

  while (Date.now() - startTime < MAX_WAIT_TIME) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const researchStatus = await page.evaluate(() => {
      // Check if research completed
      const assistantMessages = document.querySelectorAll(
        '[data-message-author-role="assistant"]',
      );
      if (assistantMessages.length === 0) {
        return {completed: false, stillResearching: true};
      }

      const latestMessage = assistantMessages[assistantMessages.length - 1];

      // Check if still researching
      const progressIndicators = Array.from(
        document.querySelectorAll('div, span'),
      );
      const isResearching = progressIndicators.some(
        (el) =>
          el.textContent?.includes('リサーチ中') ||
          el.textContent?.includes('Researching') ||
          el.textContent?.includes('情報を収集中'),
      );

      if (isResearching) {
        return {completed: false, stillResearching: true};
      }

      // Check if streaming
      const buttons = Array.from(document.querySelectorAll('button'));
      const isStreaming = buttons.some((btn) => {
        const text = btn.textContent || '';
        const aria = btn.getAttribute('aria-label') || '';
        return (
          text.includes('ストリーミングの停止') ||
          aria.includes('ストリーミングの停止')
        );
      });

      if (isStreaming) {
        return {completed: false, stillResearching: true};
      }

      // Research completed
      return {
        completed: true,
        result: latestMessage.textContent || '',
      };
    });

    if (researchStatus.completed) {
      const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
      response.appendResponseLine(
        `\n✅ DeepResearch完了 (所要時間: ${elapsedMinutes}分)`,
      );

      return {
        completed: true,
        result: researchStatus.result || '',
      };
    }

    // Show progress every 30 seconds
    progressCounter++;
    if (progressCounter % 6 === 0) {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      response.appendResponseLine(
        `⏱️ ${elapsedSeconds}秒経過 - リサーチ継続中...`,
      );
    }
  }

  return {
    completed: false,
    error: 'リサーチがタイムアウトしました（15分経過）',
  };
}

export const deepResearchChatGPT = defineTool({
  name: 'deep_research_chatgpt',
  description: `Perform deep research using ChatGPT's DeepResearch mode. This tool automatically handles mode detection, source selection, conversation continuation, and result retrieval. Use this when thorough research is needed.`,
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    question: z
      .string()
      .describe(
        'The research question or topic. Should be detailed and well-formed.',
      ),
    projectName: z
      .string()
      .optional()
      .describe(
        'Project name for organizing research sessions. Defaults to current working directory name.',
      ),
    enableGitHub: z
      .boolean()
      .optional()
      .describe(
        'Enable GitHub as information source. Auto-detected if question is code-related.',
      ),
    reuseSession: z
      .boolean()
      .optional()
      .describe(
        'Reuse existing project chat session instead of creating new chat. Default: false',
      ),
  },
  handler: async (request, response, context) => {
    const {question, projectName, enableGitHub, reuseSession = false} =
      request.params;

    const sanitizedQuestion = sanitizeQuestion(question);
    const project =
      projectName || path.basename(process.cwd()) || 'unknown-project';

    // Auto-detect if GitHub should be enabled
    const shouldEnableGitHub =
      enableGitHub !== undefined
        ? enableGitHub
        : isCodeRelatedQuestion(question);

    const page = context.getSelectedPage();

    try {
      // Phase 1: Navigate to ChatGPT
      response.appendResponseLine('🔍 DeepResearchモードを開始...');

      let needsNewChat = true;

      if (reuseSession) {
        // Try to load existing session
        const sessions = await loadChatSessions();
        const existingSession = sessions[project];

        if (existingSession) {
          response.appendResponseLine(
            `既存のプロジェクトチャットを使用: ${existingSession.url}`,
          );
          await page.goto(existingSession.url, {waitUntil: 'networkidle2'});
          needsNewChat = false;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          response.appendResponseLine(
            '既存チャットが見つかりませんでした。新規作成します。',
          );
        }
      }

      if (needsNewChat) {
        await page.goto('https://chatgpt.com/?model=gpt-5-thinking', {waitUntil: 'networkidle2'});
      }

      // Check if logged in
      const currentUrl = page.url();
      if (currentUrl.includes('auth') || currentUrl.includes('login')) {
        response.appendResponseLine(
          '❌ ChatGPTにログインが必要です。ブラウザで手動ログインしてください。',
        );
        response.appendResponseLine(`ログインURL: ${currentUrl}`);
        return;
      }

      response.appendResponseLine('✅ ログイン確認完了');

      // Phase 2: Create new chat if needed
      if (needsNewChat) {
        response.appendResponseLine('新規チャットを作成中...');

        await page.evaluate(() => {
          const newChatLink = document.querySelector('a[href="/"]');
          if (newChatLink) {
            (newChatLink as HTMLElement).click();
          }
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Turn off temporary chat
        const tempChatDisabled = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find((b) => {
            const label = b.getAttribute('aria-label') || '';
            return label.includes('一時チャットをオフにする');
          });
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });

        if (tempChatDisabled) {
          response.appendResponseLine('✅ 一時チャット無効化');
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Phase 3: Detect and enable DeepResearch mode if needed
      const modeStatus = await detectDeepResearchMode(page);

      if (modeStatus.isEnabled) {
        response.appendResponseLine(
          `✅ DeepResearchモード既に有効 (${modeStatus.indicator})`,
        );
      } else {
        response.appendResponseLine('DeepResearchモードが無効です。有効化します...');
        const enableResult = await enableDeepResearchMode(page, response);

        if (!enableResult.success) {
          response.appendResponseLine(`❌ ${enableResult.error}`);
          return;
        }
      }

      // Phase 4: Configure information sources
      await configureSources(page, response, shouldEnableGitHub);

      // Phase 5: Send research question
      const sendResult = await sendQuestion(page, response, sanitizedQuestion);
      if (!sendResult.success) {
        response.appendResponseLine(`❌ ${sendResult.error}`);
        return;
      }

      // Phase 6: Conversation continuation loop
      const startTime = Date.now();
      const loopResult = await handleConversationLoop(page, response);

      if (!loopResult.researchStarted) {
        response.appendResponseLine(`⚠️ ${loopResult.error}`);
        return;
      }

      // Phase 7: Monitor research progress
      const monitorResult = await monitorResearch(page, response, startTime);

      if (!monitorResult.completed) {
        response.appendResponseLine(`❌ ${monitorResult.error}`);
        return;
      }

      // Phase 8: Save results
      const chatUrl = page.url();
      const chatIdMatch = chatUrl.match(/\/c\/([a-f0-9-]+)/);

      if (chatIdMatch) {
        const chatId = chatIdMatch[1];
        await saveChatSession(project, {
          chatId,
          url: chatUrl,
          lastUsed: new Date().toISOString(),
          title: `[DeepResearch: ${project}]`,
        });
        response.appendResponseLine(`💾 チャットセッション保存: ${chatId}`);
      }

      // Save conversation log
      const logPath = await saveConversationLog(
        project,
        sanitizedQuestion,
        monitorResult.result || '',
        {
          researchTime: Math.floor((Date.now() - startTime) / 1000),
          chatUrl,
          model: 'ChatGPT DeepResearch',
        },
      );

      response.appendResponseLine(`📝 リサーチログ保存: ${logPath}`);
      response.appendResponseLine(`🔗 チャットURL: ${chatUrl}`);
      response.appendResponseLine('\n' + '='.repeat(60));
      response.appendResponseLine('DeepResearch結果:\n');
      response.appendResponseLine(monitorResult.result || '');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`❌ エラー: ${errorMessage}`);
      throw error;
    }
  },
});
