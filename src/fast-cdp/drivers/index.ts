/**
 * Driver module exports
 *
 * This module provides the driver infrastructure and built-in drivers
 * for ChatGPT and Gemini.
 */

// Types
export type {
  SiteDriver,
  DriverSelectors,
  SelectorSpec,
  SendResult,
  ExtractResult,
  DriverChatResult,
  DriverOptions,
  DriverMeta,
} from './types.js';

// Registry
export {
  registerDriver,
  getDriver,
  getDriverForUrl,
  getDriverNames,
  getAllDriverMeta,
} from './registry.js';

// ChatGPT Driver
export {
  ChatGPTDriver,
  CHATGPT_DRIVER_META,
  createChatGPTDriver,
  CHATGPT_SELECTORS,
  CHATGPT_EXTRA_SELECTORS,
} from './chatgpt/index.js';

// Gemini Driver
export {
  GeminiDriver,
  GEMINI_DRIVER_META,
  createGeminiDriver,
  GEMINI_SELECTORS,
  GEMINI_EXTRA_SELECTORS,
} from './gemini/index.js';

// Auto-register built-in drivers
import {registerDriver} from './registry.js';
import {CHATGPT_DRIVER_META, createChatGPTDriver} from './chatgpt/index.js';
import {GEMINI_DRIVER_META, createGeminiDriver} from './gemini/index.js';

registerDriver(CHATGPT_DRIVER_META, createChatGPTDriver);
registerDriver(GEMINI_DRIVER_META, createGeminiDriver);
