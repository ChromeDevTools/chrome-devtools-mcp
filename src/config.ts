/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Global configuration for chrome-ai-bridge
 */

/**
 * ChatGPT configuration
 */
export const CHATGPT_CONFIG = {
  /**
   * Default ChatGPT URL with gpt-5-thinking model
   */
  DEFAULT_URL: 'https://chatgpt.com/?model=gpt-5-thinking',

  /**
   * Base URL for ChatGPT (without query params)
   */
  BASE_URL: 'https://chatgpt.com/',

  /**
   * Default model parameter
   */
  DEFAULT_MODEL: 'gpt-5-thinking',
} as const;

/**
 * Gemini configuration
 */
export const GEMINI_CONFIG = {
  /**
   * Default Gemini URL
   */
  DEFAULT_URL: 'https://gemini.google.com/',

  /**
   * Base URL for Gemini
   */
  BASE_URL: 'https://gemini.google.com/',
} as const;
