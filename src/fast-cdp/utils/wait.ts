/**
 * Wait Utilities for browser automation
 *
 * Browser-side code for various waiting strategies.
 * These are designed to be injected via CDP's Runtime.evaluate.
 */

/**
 * Options for waiting operations
 */
export interface WaitOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
}

/**
 * Browser-side code for waiting until busy indicators disappear.
 *
 * This function polls for the presence of "busy" elements (like stop buttons,
 * loading spinners) and returns when they are no longer visible.
 *
 * @param busySelectors - Selectors that indicate the page is busy
 * @param stopSelectors - Selectors that indicate a stop/cancel button is present
 * @param options - Wait options
 */
export const WAIT_UNTIL_NOT_BUSY_CODE = `
  const __waitUntilNotBusy = async (busySelectors, stopSelectors, options = {}) => {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollIntervalMs = options.pollIntervalMs ?? 200;
    const startTime = Date.now();

    const hasBusyIndicator = () => {
      for (const sel of [...busySelectors, ...stopSelectors]) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              return true;
            }
          }
        } catch (e) {}
      }
      return false;
    };

    while (Date.now() - startTime < timeoutMs) {
      if (!hasBusyIndicator()) {
        return { success: true, waitedMs: Date.now() - startTime };
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    return { success: false, waitedMs: Date.now() - startTime, timedOut: true };
  };
`;

/**
 * Browser-side code for waiting until text content stabilizes.
 *
 * This function monitors a target element's text and waits until it
 * hasn't changed for a specified duration.
 *
 * @param targetSelector - Selector for the element to monitor
 * @param stableMs - Time with no changes to consider stable (default: 500ms)
 * @param timeoutMs - Maximum wait time (default: 30000ms)
 */
export const WAIT_UNTIL_STABLE_TEXT_CODE = `
  const __waitUntilStableText = async (targetSelector, options = {}) => {
    const stableMs = options.stableMs ?? 500;
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const startTime = Date.now();

    let lastText = '';
    let lastChangeTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const el = document.querySelector(targetSelector);
      const currentText = el ? el.innerText || el.textContent || '' : '';

      if (currentText !== lastText) {
        lastText = currentText;
        lastChangeTime = Date.now();
      }

      if (currentText && Date.now() - lastChangeTime >= stableMs) {
        return {
          success: true,
          text: currentText,
          waitedMs: Date.now() - startTime
        };
      }

      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    return {
      success: false,
      text: lastText,
      waitedMs: Date.now() - startTime,
      timedOut: true
    };
  };
`;

/**
 * Browser-side code for waiting until an element appears.
 *
 * @param selector - Selector for the element to wait for
 * @param timeoutMs - Maximum wait time (default: 10000ms)
 */
export const WAIT_FOR_ELEMENT_CODE = `
  const __waitForElement = async (selector, options = {}) => {
    const timeoutMs = options.timeoutMs ?? 10000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return { success: true, element: el, waitedMs: Date.now() - startTime };
        }
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    return { success: false, waitedMs: Date.now() - startTime, timedOut: true };
  };
`;

/**
 * Combined wait utilities code
 */
export const WAIT_UTILS_CODE = `
${WAIT_UNTIL_NOT_BUSY_CODE}
${WAIT_UNTIL_STABLE_TEXT_CODE}
${WAIT_FOR_ELEMENT_CODE}
`;

/**
 * WaitUtils namespace for organizing wait utility functions
 */
export const WaitUtils = {
  WAIT_UNTIL_NOT_BUSY_CODE,
  WAIT_UNTIL_STABLE_TEXT_CODE,
  WAIT_FOR_ELEMENT_CODE,
  WAIT_UTILS_CODE,
};

export default WaitUtils;
