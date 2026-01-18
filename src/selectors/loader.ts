/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Selector definition supporting multiple selector strategies
 */
export interface SelectorDef {
  css?: string;
  xpath?: string;
  text?: string | string[];
  ax?: {
    role?: string;
    name?: string;
    nameContains?: string;
    ariaLabel?: string | string[];
    ariaLabelContains?: string;
  };
  description?: string;
}

/**
 * ChatGPT selectors schema
 */
export interface ChatGPTSelectors {
  version: string;
  lastUpdated: string;
  description: string;
  elements: Record<string, SelectorDef>;
  placeholders?: {
    normalMode?: string;
  };
}

let cachedSelectors: ChatGPTSelectors | null = null;

/**
 * Load ChatGPT selectors from JSON file
 */
export function loadSelectors(): ChatGPTSelectors {
  if (cachedSelectors) {
    return cachedSelectors;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const selectorsPath = path.join(__dirname, 'chatgpt.json');

  try {
    const data = fs.readFileSync(selectorsPath, 'utf-8');
    cachedSelectors = JSON.parse(data) as ChatGPTSelectors;
    return cachedSelectors;
  } catch (error) {
    throw new Error(`Failed to load selectors from ${selectorsPath}: ${error}`);
  }
}

/**
 * Get a specific selector definition
 */
export function getSelector(elementName: string): SelectorDef {
  const selectors = loadSelectors();
  const selector = selectors.elements[elementName];

  if (!selector) {
    throw new Error(`Selector not found: ${elementName}`);
  }

  return selector;
}

/**
 * Generate page.evaluate() compatible selector function for text matching
 */
export function generateTextMatcher(
  selector: SelectorDef,
  tagName = 'button',
): string {
  const textPatterns = Array.isArray(selector.text)
    ? selector.text
    : [selector.text];

  return `
    Array.from(document.querySelectorAll('${tagName}')).find(el => {
      const text = el.textContent || '';
      return ${textPatterns.map(t => `text.includes('${t}')`).join(' || ')};
    })
  `;
}

/**
 * Generate page.evaluate() compatible selector function for accessibility matching
 */
export function generateAxMatcher(
  selector: SelectorDef,
  tagName = 'button',
): string {
  if (!selector.ax) {
    throw new Error('Accessibility selector not defined');
  }

  const conditions: string[] = [];

  if (selector.ax.ariaLabel) {
    const labels = Array.isArray(selector.ax.ariaLabel)
      ? selector.ax.ariaLabel
      : [selector.ax.ariaLabel];
    conditions.push(
      labels.map(label => `aria.includes('${label}')`).join(' || '),
    );
  }

  if (selector.ax.ariaLabelContains) {
    conditions.push(`aria.includes('${selector.ax.ariaLabelContains}')`);
  }

  if (selector.ax.nameContains) {
    conditions.push(`aria.includes('${selector.ax.nameContains}')`);
  }

  return `
    Array.from(document.querySelectorAll('${tagName}')).find(el => {
      const aria = el.getAttribute('aria-label') || '';
      return ${conditions.join(' || ')};
    })
  `;
}

/**
 * Check if placeholder matches expected patterns
 */
export function checkPlaceholder(placeholder: string): boolean {
  const selectors = loadSelectors();

  if (selectors.placeholders?.normalMode) {
    return placeholder.includes(selectors.placeholders.normalMode);
  }

  return false;
}

/**
 * Clear cached selectors (useful for testing or hot-reload)
 */
export function clearCache(): void {
  cachedSelectors = null;
  cachedGeminiSelectors = null;
}

export interface GeminiSelectors {
  version: string;
  lastUpdated: string;
  description: string;
  elements: Record<string, SelectorDef>;
  placeholders?: {
    normalMode?: string;
  };
}

let cachedGeminiSelectors: GeminiSelectors | null = null;

/**
 * Load Gemini selectors from JSON file
 */
export function loadGeminiSelectors(): GeminiSelectors {
  if (cachedGeminiSelectors) {
    return cachedGeminiSelectors;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const selectorsPath = path.join(__dirname, 'gemini.json');

  try {
    const data = fs.readFileSync(selectorsPath, 'utf-8');
    cachedGeminiSelectors = JSON.parse(data) as GeminiSelectors;
    return cachedGeminiSelectors;
  } catch (error) {
    throw new Error(`Failed to load selectors from ${selectorsPath}: ${error}`);
  }
}

/**
 * Get a specific Gemini selector definition
 */
export function getGeminiSelector(elementName: string): SelectorDef {
  const selectors = loadGeminiSelectors();
  const selector = selectors.elements[elementName];

  if (!selector) {
    throw new Error(`Selector not found: ${elementName}`);
  }

  return selector;
}
