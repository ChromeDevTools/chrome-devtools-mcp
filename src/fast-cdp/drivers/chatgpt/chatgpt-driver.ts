/**
 * ChatGPT Driver
 *
 * Handles ChatGPT-specific DOM interactions for sending prompts
 * and extracting responses.
 */

import {BaseDriver} from '../../core/base-driver.js';
import type {
  DriverSelectors,
  SendResult,
  ExtractResult,
  DriverOptions,
} from '../types.js';
import {CHATGPT_SELECTORS} from './selectors.js';

/**
 * ChatGPT Site Driver
 */
export class ChatGPTDriver extends BaseDriver {
  readonly name = 'chatgpt';
  readonly selectors: DriverSelectors = CHATGPT_SELECTORS;

  /**
   * Send a prompt to ChatGPT
   */
  async sendPrompt(text: string): Promise<SendResult> {
    const client = this.getClient();
    const sanitized = JSON.stringify(text);

    // Input the text
    const inputResult = await this.evaluateWithUtils<boolean>(`
      const text = ${sanitized};

      // Try preferred selectors first
      const preferredEditable = document.querySelector('.ProseMirror[contenteditable="true"]');
      if (preferredEditable) {
        preferredEditable.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = text;
        preferredEditable.appendChild(p);
        preferredEditable.dispatchEvent(new Event('input', {bubbles: true}));
        return true;
      }

      const preferredTextarea =
        document.querySelector('textarea#prompt-textarea') ||
        document.querySelector('textarea[data-testid="prompt-textarea"]');

      if (preferredTextarea) {
        preferredTextarea.focus();
        preferredTextarea.value = text;
        const inputEvent = typeof InputEvent !== 'undefined'
          ? new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text})
          : new Event('input', {bubbles: true});
        preferredTextarea.dispatchEvent(inputEvent);
        preferredTextarea.dispatchEvent(new Event('change', {bubbles: true}));
        return true;
      }

      // Fallback to largest visible input
      const candidates = [
        ...Array.from(document.querySelectorAll('textarea')),
        ...Array.from(document.querySelectorAll('div[contenteditable="true"]')),
      ].filter(__isVisible);

      const pick = candidates.sort((a, b) => {
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
        pick.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = text;
        pick.appendChild(p);
        pick.dispatchEvent(new Event('input', {bubbles: true}));
        return true;
      }

      return false;
    `);

    if (!inputResult) {
      return {success: false, error: 'Failed to input text'};
    }

    // Wait for input to be processed
    await this.sleep(100);

    // Click send button
    const clickResult = await this.evaluateWithUtils<{clicked: boolean; selector: string | null}>(`
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
    `);

    if (!clickResult.clicked) {
      return {success: false, error: 'Failed to click send button'};
    }

    this.log('Prompt sent', {selector: clickResult.selector});
    return {success: true};
  }

  /**
   * Check if ChatGPT is currently processing
   */
  async isProcessing(): Promise<boolean> {
    return this.evaluateWithUtils<boolean>(`
      const buttons = __collectDeep(['button', '[role="button"]']).nodes
        .filter(__isVisible)
        .filter(el => !__isDisabled(el));

      // Check for stop button
      const hasStopButton = buttons.some(b => {
        const text = (b.textContent || '').trim();
        const label = (b.getAttribute('aria-label') || '').trim();
        return text.includes('Stop generating') || label.includes('Stop generating') ||
               text.includes('生成を停止') || label.includes('生成を停止') ||
               label.includes('Stop streaming') || label === 'Stop';
      });
      if (hasStopButton) return true;

      // Check for streaming indicator
      const streaming = document.querySelector('.result-streaming');
      if (streaming) return true;

      // Check for "generating" text
      const bodyText = document.body?.innerText || '';
      const hasGeneratingText = bodyText.includes('回答を生成しています') ||
                               bodyText.includes('is still generating') ||
                               bodyText.includes('generating a response');
      const hasThinkingComplete = /思考時間[：:]\s*\\d+s?/.test(bodyText) ||
                                  /Thinking.*\\d+s?/.test(bodyText);
      const hasSkipThinkingButton = bodyText.includes('今すぐ回答') ||
                                    bodyText.includes('Skip thinking');

      return (hasGeneratingText && !hasThinkingComplete) || hasSkipThinkingButton;
    `);
  }

  /**
   * Extract the latest response from ChatGPT
   */
  async extractResponse(options?: DriverOptions): Promise<ExtractResult> {
    const result = await this.evaluateWithUtils<{text: string; evidence: string}>(`
      // Get all assistant messages
      const assistantMsgs = document.querySelectorAll('[data-message-author-role="assistant"]');

      // Also check new UI with articles
      const chatgptArticles = [];
      for (const article of document.querySelectorAll('article')) {
        const heading = article.querySelector('h6, h5, [role="heading"]');
        if (heading && (heading.textContent || '').includes('ChatGPT')) {
          chatgptArticles.push(article);
        }
      }

      const lastAssistant = assistantMsgs[assistantMsgs.length - 1] ||
                           chatgptArticles[chatgptArticles.length - 1];

      if (!lastAssistant) {
        return {text: '', evidence: 'no-assistant-message'};
      }

      // Try to get markdown content (excluding thinking content)
      const markdowns = lastAssistant.querySelectorAll('.markdown:not(.result-thinking)');
      let text = '';

      for (const md of markdowns) {
        const mdText = (md.innerText || md.textContent || '').trim();
        if (mdText.length > text.length) {
          text = mdText;
        }
      }

      if (text) {
        return {text, evidence: '.markdown:not(.result-thinking)'};
      }

      // Fallback to result-thinking if present
      const thinking = lastAssistant.querySelector('.result-thinking.markdown');
      if (thinking) {
        text = (thinking.innerText || thinking.textContent || '').trim();
        if (text) {
          return {text, evidence: '.result-thinking.markdown'};
        }
      }

      // Last resort: full assistant message
      text = (lastAssistant.innerText || lastAssistant.textContent || '').trim();
      return {text, evidence: 'full-assistant-message'};
    `);

    return {
      text: result.text,
      confidence: result.text.length > 0 ? 0.8 : 0.0,
      evidence: result.evidence,
    };
  }

  /**
   * Check if login is required
   */
  async needsLogin(): Promise<boolean> {
    return this.evaluateWithUtils<boolean>(`
      const url = location.href;
      if (url.includes('auth0.openai.com') || url.includes('/auth/login')) {
        return true;
      }

      const bodyText = document.body?.innerText || '';
      return bodyText.includes('Log in') && bodyText.includes('Sign up') &&
             !document.querySelector('[data-message-author-role]');
    `);
  }
}

/**
 * Driver metadata for registration
 */
export const CHATGPT_DRIVER_META = {
  name: 'chatgpt',
  urlPatterns: [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
  ],
  description: 'ChatGPT by OpenAI',
};

/**
 * Factory function for creating ChatGPT driver instances
 */
export function createChatGPTDriver(): ChatGPTDriver {
  return new ChatGPTDriver();
}
