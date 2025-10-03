/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Browser, Page } from 'puppeteer-core';

interface UIElement {
  name: string;
  selector: string;
  optional?: boolean;
}

/**
 * UI elements to check during health verification
 */
const UI_ELEMENTS: UIElement[] = [
  {
    name: 'Deep Research Toggle',
    selector: '[role="menuitemradio"]', // Deep Research menu item
  },
  {
    name: 'Composer Textarea',
    selector: 'textarea, .ProseMirror[contenteditable="true"]', // ChatGPT input area
  },
  {
    name: 'Send Button',
    selector: 'button[data-testid="send-button"]', // Send message button
  },
];

/**
 * Check if UI element exists using accessibility tree
 */
async function checkElementExists(
  page: Page,
  element: UIElement
): Promise<boolean> {
  try {
    // First try direct DOM query
    const domCheck = await page.evaluate((selector) => {
      return document.querySelector(selector) !== null;
    }, element.selector);

    if (domCheck) {
      return true;
    }

    // Fallback: Check accessibility tree
    const axTree = await page.accessibility.snapshot();
    if (!axTree) {
      return false;
    }

    // Search for element by name in AX tree
    function searchAxTree(node: any): boolean {
      if (node.name?.includes(element.name)) {
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (searchAxTree(child)) {
            return true;
          }
        }
      }
      return false;
    }

    return searchAxTree(axTree);
  } catch (error) {
    console.error(`Error checking ${element.name}:`, error);
    return false;
  }
}

/**
 * Verify ChatGPT UI health on startup
 */
export async function verifyUIHealth(browser: Browser): Promise<void> {
  console.error('\n🔍 UI Health Check: Starting...');

  let page: Page | undefined;

  try {
    // Get or create a page
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    // Navigate to ChatGPT with short timeout
    console.error('   Navigating to ChatGPT...');
    await page.goto('https://chatgpt.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for page to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check login status
    const currentUrl = page.url();
    if (currentUrl.includes('auth') || currentUrl.includes('login')) {
      console.error('⚠️  Not logged in to ChatGPT - skipping UI verification');
      console.error('   Please log in manually for full functionality');
      return;
    }

    // Check each UI element
    const results: Array<{ element: UIElement; found: boolean }> = [];

    for (const element of UI_ELEMENTS) {
      const found = await checkElementExists(page, element);
      results.push({ element, found });

      if (found) {
        console.error(`✅ ${element.name}: Found`);
      } else {
        const status = element.optional ? '⚠️' : '❌';
        console.error(`${status} ${element.name}: NOT FOUND`);
      }
    }

    // Summary
    const missingElements = results.filter((r) => !r.found && !r.element.optional);
    if (missingElements.length > 0) {
      console.error('\n⚠️  UI Health Check Warning:');
      console.error('   Some UI elements were not found. ChatGPT UI may have changed.');
      console.error('   Missing elements:');
      missingElements.forEach((r) => {
        console.error(`     - ${r.element.name}`);
      });
      console.error('\n💡 Suggestion: Run diagnostics to investigate:');
      console.error('   npm run diagnose:ui');
    } else {
      console.error('\n✅ UI Health Check: All elements found');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ UI Health Check Failed: ${errorMessage}`);
    console.error('   This is a warning only - MCP server will continue to start');
    console.error('   ChatGPT functionality may be limited');
  } finally {
    // Don't close the page - let the server reuse it
    console.error('');
  }
}

/**
 * Run UI health check with timeout protection
 */
export async function runStartupCheck(browser: Browser): Promise<void> {
  const timeoutMs = 35000; // 35 seconds total timeout

  try {
    await Promise.race([
      verifyUIHealth(browser),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('UI health check timeout')),
          timeoutMs
        )
      ),
    ]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`⚠️  Startup check timeout or error: ${errorMessage}`);
    console.error('   Continuing with server startup...');
  }
}
