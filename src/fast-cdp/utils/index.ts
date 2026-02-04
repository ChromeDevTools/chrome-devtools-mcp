/**
 * Utilities for browser automation
 *
 * This module exports browser-side utility code that can be injected
 * via CDP's Runtime.evaluate for Shadow DOM traversal, visibility checks,
 * and various waiting strategies.
 */

export {
  DomUtils,
  COLLECT_DEEP_CODE,
  IS_VISIBLE_CODE,
  IS_DISABLED_CODE,
  DOM_UTILS_CODE,
  type DeepQueryOptions,
  type DeepQueryResult,
} from './dom.js';

export {
  WaitUtils,
  WAIT_UNTIL_NOT_BUSY_CODE,
  WAIT_UNTIL_STABLE_TEXT_CODE,
  WAIT_FOR_ELEMENT_CODE,
  WAIT_UTILS_CODE,
  type WaitOptions,
} from './wait.js';
