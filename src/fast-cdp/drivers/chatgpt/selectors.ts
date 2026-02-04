/**
 * ChatGPT Selectors
 *
 * Centralized selector definitions for ChatGPT UI elements.
 * These are semantic selectors that describe what we're looking for,
 * not just raw CSS strings.
 */

import type {DriverSelectors} from '../types.js';

/**
 * ChatGPT UI selectors
 *
 * Multiple selectors per element type for fallback handling.
 * Listed in order of preference (most reliable first).
 */
export const CHATGPT_SELECTORS: DriverSelectors = {
  // Root element containing the conversation
  conversationRoot: [
    'main',
    '[role="main"]',
  ],

  // Input field for typing prompts
  promptInput: [
    'textarea#prompt-textarea',
    'textarea[data-testid="prompt-textarea"]',
    '.ProseMirror[contenteditable="true"]',
    'textarea[placeholder*="Message"]',
    'div[contenteditable="true"]',
  ],

  // Send button
  sendButton: [
    'button[data-testid="send-button"]',
    '#composer-submit-button',
    'button[aria-label*="送信"]',
    'button[aria-label*="Send"]',
  ],

  // Stop button (shown during generation)
  stopButton: [
    'button[data-testid="stop-button"]',
    'button[aria-label*="停止"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="Stop generating"]',
  ],

  // User message containers
  userMessage: [
    '[data-message-author-role="user"]',
    'article:has(h6:contains("You"))',
  ],

  // Assistant response containers
  assistantMessage: [
    '[data-message-author-role="assistant"]',
    'article:has(h6:contains("ChatGPT"))',
  ],

  // Busy/loading indicators
  busyIndicator: [
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
    '.result-streaming',
    '[data-testid="stop-button"]',
  ],

  // Error messages
  errorBanner: [
    '[role="alert"]',
    '.text-red-500',
    '[data-testid="error-message"]',
  ],
};

/**
 * Additional ChatGPT-specific selectors
 */
export const CHATGPT_EXTRA_SELECTORS = {
  // Markdown content within assistant messages
  markdown: '.markdown',

  // Thinking/reasoning content
  resultThinking: '.result-thinking',

  // Code blocks
  codeBlock: 'pre code',

  // Thinking time marker (indicates thinking mode completion)
  thinkingTimeMarker: /思考時間[：:]\s*\d+s?|Thinking.*\d+s?/,

  // Skip thinking button
  skipThinkingButton: ['button:contains("今すぐ回答")', 'button:contains("Skip thinking")'],
};
