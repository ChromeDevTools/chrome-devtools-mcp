/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page} from 'puppeteer-core';

/**
 * Options for MutationObserver-based completion detection
 */
export interface CompletionDetectionOptions {
  /** Duration of silence (no DOM changes) to consider generation complete. Default: 2000ms */
  silenceDuration?: number;
  /** Maximum time to wait for completion. Default: 300000ms (5 minutes) */
  timeout?: number;
  /** Element selector to observe. Default: 'body' */
  observeSelector?: string;
  /** Additional check function to run in browser context */
  additionalCheck?: string;
}

/**
 * Wait for DOM changes to settle using MutationObserver.
 * This is more reliable than polling for streaming AI responses.
 *
 * Based on Gemini's recommendation:
 * - Use MutationObserver to detect when DOM stops changing
 * - Consider generation complete when no changes for `silenceDuration` ms
 * - Combine with additional checks (e.g., stop button disappearance)
 */
export async function waitForDomSilence(
  page: Page,
  options: CompletionDetectionOptions = {},
): Promise<{completed: boolean; timedOut?: boolean}> {
  const {
    silenceDuration = 2000,
    timeout = 300000,
    observeSelector = 'body',
    additionalCheck,
  } = options;

  return page.evaluate(
    ({silenceDuration, timeout, observeSelector, additionalCheck}) => {
      return new Promise<{completed: boolean; timedOut?: boolean}>(
        (resolve) => {
          const target = document.querySelector(observeSelector);
          if (!target) {
            resolve({completed: false});
            return;
          }

          let silenceTimeout: ReturnType<typeof setTimeout>;
          let overallTimeout: ReturnType<typeof setTimeout>;

          const observer = new MutationObserver(() => {
            // Reset silence timer on any DOM change
            clearTimeout(silenceTimeout);
            silenceTimeout = setTimeout(() => {
              // DOM has been silent for silenceDuration
              // Run additional check if provided
              if (additionalCheck) {
                try {
                  const checkFn = new Function(
                    'return (' + additionalCheck + ')()',
                  );
                  if (!checkFn()) {
                    // Additional check failed, keep waiting
                    return;
                  }
                } catch {
                  // Check failed, consider complete anyway
                }
              }
              cleanup();
              resolve({completed: true});
            }, silenceDuration);
          });

          const cleanup = () => {
            clearTimeout(silenceTimeout);
            clearTimeout(overallTimeout);
            observer.disconnect();
          };

          // Start overall timeout
          overallTimeout = setTimeout(() => {
            cleanup();
            resolve({completed: false, timedOut: true});
          }, timeout);

          // Start observing
          observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          });

          // Initial silence timer
          silenceTimeout = setTimeout(() => {
            if (additionalCheck) {
              try {
                const checkFn = new Function(
                  'return (' + additionalCheck + ')()',
                );
                if (!checkFn()) {
                  return;
                }
              } catch {
                // Check failed
              }
            }
            cleanup();
            resolve({completed: true});
          }, silenceDuration);
        },
      );
    },
    {silenceDuration, timeout, observeSelector, additionalCheck},
  );
}

/**
 * Multi-fallback selector strategy.
 * Try multiple selectors in order of preference until one matches.
 */
export async function findElementWithFallback(
  page: Page,
  selectors: string[],
  options: {timeout?: number; visible?: boolean} = {},
): Promise<{found: boolean; selector?: string; uid?: string}> {
  const {timeout = 5000} = options;

  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, {
        timeout: Math.min(1000, timeout / selectors.length),
        visible: options.visible,
      });
      if (element) {
        return {found: true, selector};
      }
    } catch {
      // Continue to next selector
    }
  }

  return {found: false};
}

/**
 * Combined completion detection for ChatGPT/Gemini.
 * Uses MutationObserver + stop button check for robust detection.
 */
export async function waitForAIResponseComplete(
  page: Page,
  options: {
    /** Selectors to check for stop/generating state */
    stopSelectors?: string[];
    /** Selectors to check for completion state */
    completeSelectors?: string[];
    /** Response container selector */
    responseSelector?: string;
    /** Duration of silence to consider complete */
    silenceDuration?: number;
    /** Maximum wait time */
    timeout?: number;
    /** Callback for progress updates */
    onProgress?: (text: string) => void;
  } = {},
): Promise<{
  completed: boolean;
  timedOut?: boolean;
  responseText?: string;
}> {
  const {
    stopSelectors = [],
    completeSelectors = [],
    responseSelector = 'body',
    silenceDuration = 2000,
    timeout = 300000,
  } = options;

  const startTime = Date.now();

  // Build additional check function as string (to be evaluated in browser)
  const additionalCheckFn = `
    function() {
      // Check if still generating (stop button visible)
      const stopSelectors = ${JSON.stringify(stopSelectors)};
      for (const sel of stopSelectors) {
        if (document.querySelector(sel)) {
          return false; // Still generating
        }
      }

      // Check for completion indicators
      const completeSelectors = ${JSON.stringify(completeSelectors)};
      if (completeSelectors.length > 0) {
        for (const sel of completeSelectors) {
          if (document.querySelector(sel)) {
            return true; // Explicitly complete
          }
        }
      }

      return true; // No stop button, consider complete
    }
  `;

  const result = await waitForDomSilence(page, {
    silenceDuration,
    timeout,
    observeSelector: responseSelector,
    additionalCheck: additionalCheckFn,
  });

  // Get final response text
  let responseText = '';
  if (result.completed) {
    responseText = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      return el?.textContent || '';
    }, responseSelector);
  }

  return {
    completed: result.completed,
    timedOut: result.timedOut,
    responseText,
  };
}

/**
 * Type text using clipboard injection for faster input.
 * Much faster than page.type() for long text.
 */
export async function typeViaClipboard(
  page: Page,
  text: string,
  targetSelector: string,
): Promise<boolean> {
  try {
    // Focus the target element
    await page.click(targetSelector);

    // Use clipboard to paste text (faster than typing)
    await page.evaluate(async (text) => {
      // Write to clipboard
      await navigator.clipboard.writeText(text);
    }, text);

    // Paste using keyboard shortcut
    const isMac =
      (await page.evaluate(() => navigator.platform.includes('Mac'))) || false;
    const modifier = isMac ? 'Meta' : 'Control';

    await page.keyboard.down(modifier);
    await page.keyboard.press('KeyV');
    await page.keyboard.up(modifier);

    return true;
  } catch {
    // Fallback to regular typing if clipboard fails
    return false;
  }
}
