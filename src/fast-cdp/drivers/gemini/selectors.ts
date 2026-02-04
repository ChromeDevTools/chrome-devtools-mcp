/**
 * Gemini Selectors
 *
 * Centralized selector definitions for Gemini UI elements.
 * Gemini uses Shadow DOM extensively, so deep selectors are often needed.
 */

import type {DriverSelectors} from '../types.js';

/**
 * Gemini UI selectors
 *
 * Multiple selectors per element type for fallback handling.
 * Listed in order of preference (most reliable first).
 */
export const GEMINI_SELECTORS: DriverSelectors = {
  // Root element containing the conversation
  conversationRoot: [
    'main',
    '[role="main"]',
  ],

  // Input field for typing prompts
  promptInput: [
    '[role="textbox"]',
    'div[contenteditable="true"]',
    'textarea',
    'rich-textarea textarea',
    '.ql-editor',
  ],

  // Send button
  sendButton: [
    'button[aria-label*="送信"]',
    'button[aria-label*="Send"]',
    'button:has(mat-icon[data-mat-icon-name="send"])',
    '[data-test-id*="send"]',
  ],

  // Stop button (shown during generation)
  stopButton: [
    'button[aria-label*="回答を停止"]',
    'button[aria-label*="Stop generating"]',
    'button[aria-label*="Stop streaming"]',
    'button:has(mat-icon[data-mat-icon-name="stop"])',
  ],

  // User message containers
  userMessage: [
    'user-query',
    '.user-query',
    '[data-test-id*="user"]',
    '[data-test-id*="prompt"]',
    '[data-message-author-role="user"]',
    'message[author="user"]',
    '[data-author="user"]',
  ],

  // Assistant response containers
  assistantMessage: [
    'model-response',
    '.model-response',
    '[data-test-id*="response"]',
    '.response',
    '[data-message-author-role="assistant"]',
    'message[author="model"]',
  ],

  // Busy/loading indicators
  busyIndicator: [
    'button[aria-label*="回答を停止"]',
    'button[aria-label*="Stop"]',
    'mat-icon[data-mat-icon-name="stop"]',
    '.loading',
  ],

  // Error messages
  errorBanner: [
    '[role="alert"]',
    '.error-message',
  ],
};

/**
 * Additional Gemini-specific selectors
 */
export const GEMINI_EXTRA_SELECTORS = {
  // Feedback buttons (thumb up/down) - indicates response is complete
  thumbUp: 'img[alt="thumb_up"]',
  thumbDown: 'img[alt="thumb_down"]',

  // Mic button (indicates ready state)
  micButton: 'img[alt="mic"]',

  // Login prompt
  loginPrompt: 'a[href*="accounts.google.com"]',
};
