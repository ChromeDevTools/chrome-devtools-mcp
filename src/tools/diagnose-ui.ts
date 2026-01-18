/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import z from 'zod';

import {CHATGPT_CONFIG} from '../config.js';
import {isLoginRequired} from '../login-helper.js';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * ChatGPT UI Diagnostic Tool
 *
 * This tool helps developers quickly diagnose UI changes in ChatGPT by:
 * 1. Capturing complete AX tree (accessibility tree)
 * 2. Saving HTML snapshot
 * 3. Taking a screenshot
 * 4. Detecting important elements and their current selectors
 * 5. Generating a diagnostic report
 */

interface ElementInfo {
  name: string;
  status: 'found' | 'not_found' | 'structure_changed';
  selectors?: {
    css?: string;
    xpath?: string;
    accessibility?: string;
  };
  details?: string;
  suggestion?: string;
}

interface DiagnosticResult {
  timestamp: string;
  url: string;
  elements: ElementInfo[];
  filesGenerated: {
    html: string;
    screenshot: string;
    axTree: string;
    report: string;
  };
}

/**
 * Known important elements in ChatGPT UI
 */
const KNOWN_ELEMENTS = [
  {
    name: 'Deep Research Toggle',
    checks: [
      {type: 'css', selector: '[role="menuitemradio"][aria-label*="Deep"]'},
      {
        type: 'xpath',
        selector:
          '//div[@role="menuitemradio" and contains(text(), "Deep research")]',
      },
      {type: 'text', contains: 'Deep research'},
    ],
  },
  {
    name: 'Composer Textarea',
    checks: [
      {type: 'css', selector: 'textarea[placeholder*="Message"]'},
      {type: 'css', selector: '[contenteditable="true"]'},
      {type: 'css', selector: '#prompt-textarea'},
    ],
  },
  {
    name: 'Send Button',
    checks: [
      {type: 'css', selector: 'button[data-testid="send-button"]'},
      {type: 'css', selector: 'button[aria-label*="Send"]'},
      {type: 'xpath', selector: '//button[contains(@aria-label, "Send")]'},
    ],
  },
  {
    name: 'Model Selector',
    checks: [
      {type: 'css', selector: 'button[aria-label*="model"]'},
      {type: 'css', selector: '[role="combobox"]'},
      {type: 'text', contains: 'ChatGPT'},
    ],
  },
];

/**
 * Ensure snapshot directory exists
 */
async function ensureSnapshotDir(): Promise<string> {
  const snapshotDir = path.join(process.cwd(), 'docs/ui-snapshots');
  await fs.promises.mkdir(snapshotDir, {recursive: true});
  return snapshotDir;
}

/**
 * Generate timestamp-based filename
 */
function generateFilename(extension: string): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .replace('T', '-')
    .slice(2); // Remove first 2 digits of year (20YY -> YY)
  return `chatgpt-${timestamp}.${extension}`;
}

/**
 * Detect element using multiple strategies
 */
async function detectElement(
  page: any,
  elementDef: (typeof KNOWN_ELEMENTS)[0],
): Promise<ElementInfo> {
  const result: ElementInfo = {
    name: elementDef.name,
    status: 'not_found',
    selectors: {},
  };

  try {
    // Try CSS selectors
    for (const check of elementDef.checks.filter(c => c.type === 'css')) {
      try {
        const element = await page.$(check.selector);
        if (element) {
          result.status = 'found';
          result.selectors!.css = check.selector;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    // Try XPath selectors
    for (const check of elementDef.checks.filter(c => c.type === 'xpath')) {
      try {
        const elements = await page.$x(check.selector);
        if (elements.length > 0) {
          if (result.status !== 'found') {
            result.status = 'found';
          }
          result.selectors!.xpath = check.selector;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    // Try text-based detection
    for (const check of elementDef.checks.filter(c => c.type === 'text')) {
      try {
        const hasText = await page.evaluate((text: string) => {
          return document.body.innerText.includes(text);
        }, check.contains);

        if (hasText) {
          if (result.status !== 'found') {
            result.status = 'found';
          }
          result.selectors!.accessibility = `Text contains: "${check.contains}"`;
          break;
        }
      } catch {
        // Continue to next check
      }
    }

    // If we found some selectors but not all expected ones, mark as structure_changed
    if (
      result.status === 'found' &&
      Object.keys(result.selectors!).length < elementDef.checks.length
    ) {
      result.status = 'structure_changed';
      result.details = 'Some selectors work, but structure may have changed';
    }
  } catch (error) {
    result.details = `Error during detection: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

/**
 * Generate diagnostic report in Markdown format
 */
function generateReport(result: DiagnosticResult): string {
  const lines: string[] = [];

  lines.push('# ChatGPT UI Diagnosis Report');
  lines.push('');
  lines.push(`**Date**: ${result.timestamp}`);
  lines.push(`**URL**: ${result.url}`);
  lines.push('');
  lines.push('## Element Detection Results');
  lines.push('');

  for (const element of result.elements) {
    const statusEmoji =
      element.status === 'found'
        ? '✅'
        : element.status === 'structure_changed'
          ? '⚠️'
          : '❌';

    lines.push(`### ${statusEmoji} ${element.name}`);
    lines.push(`- **Status**: ${element.status.replace(/_/g, ' ')}`);

    if (element.selectors && Object.keys(element.selectors).length > 0) {
      lines.push('- **Current Selectors**:');
      if (element.selectors.css) {
        lines.push(`  - CSS: \`${element.selectors.css}\``);
      }
      if (element.selectors.xpath) {
        lines.push(`  - XPath: \`${element.selectors.xpath}\``);
      }
      if (element.selectors.accessibility) {
        lines.push(`  - Accessibility: \`${element.selectors.accessibility}\``);
      }
    }

    if (element.details) {
      lines.push(`- **Details**: ${element.details}`);
    }

    if (element.suggestion) {
      lines.push(`- **Suggestion**: ${element.suggestion}`);
    }

    lines.push('');
  }

  lines.push('## Files Generated');
  lines.push('');
  lines.push(`- **HTML**: ${result.filesGenerated.html}`);
  lines.push(`- **Screenshot**: ${result.filesGenerated.screenshot}`);
  lines.push(`- **AX Tree**: ${result.filesGenerated.axTree}`);
  lines.push(`- **Report**: ${result.filesGenerated.report}`);
  lines.push('');

  lines.push('## Next Steps');
  lines.push('');
  lines.push('1. Review the HTML snapshot to understand current DOM structure');
  lines.push('2. Check the screenshot to see visual layout changes');
  lines.push('3. Analyze the AX tree JSON for accessibility structure changes');
  lines.push('4. Update selectors in relevant tool files based on findings');
  lines.push('');

  return lines.join('\n');
}

export const diagnoseChatgptUi = defineTool({
  name: 'diagnose_chatgpt_ui',
  description: 'Diagnose ChatGPT UI. Captures AX tree, HTML, screenshot.',
  annotations: {
    title: 'Diagnose ChatGPT UI',
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    url: z
      .string()
      .default(CHATGPT_CONFIG.DEFAULT_URL)
      .describe('URL to diagnose'),
    waitForLoad: z.number().default(5000).describe('Wait time ms'),
  },
  handler: async (request, response, context) => {
    const {url, waitForLoad} = request.params;
    const page = context.getSelectedPage();

    try {
      response.appendResponseLine('🔍 Starting ChatGPT UI diagnosis...');
      response.appendResponseLine('');

      // Navigate to ChatGPT
      response.appendResponseLine(`📡 Navigating to ${url}...`);
      await page.goto(url, {waitUntil: 'networkidle0', timeout: 30000});

      // Check if login is required
      const needsLogin = await isLoginRequired(page);
      if (needsLogin) {
        response.appendResponseLine('\n❌ ChatGPTへのログインが必要です');
        response.appendResponseLine(
          '📱 ブラウザウィンドウでログインしてから再実行してください',
        );
        return;
      }
      response.appendResponseLine('✅ Login check passed');

      // Wait for page to stabilize
      response.appendResponseLine(
        `⏳ Waiting ${waitForLoad}ms for page to stabilize...`,
      );
      await new Promise(resolve => setTimeout(resolve, waitForLoad));

      // Ensure snapshot directory exists
      const snapshotDir = await ensureSnapshotDir();
      const timestamp = new Date().toISOString();

      // Generate filenames
      const htmlFilename = generateFilename('html');
      const screenshotFilename = generateFilename('png');
      const axFilename = generateFilename('ax.json');
      const reportFilename = generateFilename('report.md');

      // Capture HTML
      response.appendResponseLine('📄 Capturing HTML snapshot...');
      const htmlContent = await page.content();
      const htmlPath = path.join(snapshotDir, htmlFilename);
      await fs.promises.writeFile(htmlPath, htmlContent, 'utf-8');
      response.appendResponseLine(`✅ HTML saved: ${htmlFilename}`);

      // Take screenshot
      response.appendResponseLine('📸 Taking screenshot...');
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: 'png',
      });
      const screenshotPath = path.join(snapshotDir, screenshotFilename);
      await fs.promises.writeFile(screenshotPath, screenshotBuffer);
      response.appendResponseLine(`✅ Screenshot saved: ${screenshotFilename}`);

      // Capture full AX tree
      response.appendResponseLine('🌳 Capturing accessibility tree...');
      const snapshot = await page.accessibility.snapshot({
        interestingOnly: false,
      });
      const axPath = path.join(snapshotDir, axFilename);
      await fs.promises.writeFile(
        axPath,
        JSON.stringify(snapshot, null, 2),
        'utf-8',
      );
      response.appendResponseLine(`✅ AX tree saved: ${axFilename}`);

      // Detect known elements
      response.appendResponseLine('');
      response.appendResponseLine('🔎 Detecting important UI elements...');
      const elementResults: ElementInfo[] = [];

      for (const elementDef of KNOWN_ELEMENTS) {
        const result = await detectElement(page, elementDef);
        elementResults.push(result);

        const emoji =
          result.status === 'found'
            ? '✅'
            : result.status === 'structure_changed'
              ? '⚠️'
              : '❌';
        response.appendResponseLine(
          `${emoji} ${result.name}: ${result.status}`,
        );
      }

      // Generate diagnostic result
      const diagnosticResult: DiagnosticResult = {
        timestamp,
        url: page.url(),
        elements: elementResults,
        filesGenerated: {
          html: htmlFilename,
          screenshot: screenshotFilename,
          axTree: axFilename,
          report: reportFilename,
        },
      };

      // Generate and save report
      response.appendResponseLine('');
      response.appendResponseLine('📝 Generating diagnostic report...');
      const reportContent = generateReport(diagnosticResult);
      const reportPath = path.join(snapshotDir, reportFilename);
      await fs.promises.writeFile(reportPath, reportContent, 'utf-8');
      response.appendResponseLine(`✅ Report saved: ${reportFilename}`);

      // Output summary
      response.appendResponseLine('');
      response.appendResponseLine('✅ Diagnosis complete!');
      response.appendResponseLine('');
      response.appendResponseLine('📁 All files saved to: docs/ui-snapshots/');
      response.appendResponseLine('');
      response.appendResponseLine('Summary:');
      const foundCount = elementResults.filter(
        e => e.status === 'found',
      ).length;
      const changedCount = elementResults.filter(
        e => e.status === 'structure_changed',
      ).length;
      const notFoundCount = elementResults.filter(
        e => e.status === 'not_found',
      ).length;
      response.appendResponseLine(`- ✅ Found: ${foundCount}`);
      response.appendResponseLine(`- ⚠️  Changed: ${changedCount}`);
      response.appendResponseLine(`- ❌ Not Found: ${notFoundCount}`);

      // Attach screenshot to response
      response.attachImage({
        data: Buffer.from(screenshotBuffer).toString('base64'),
        mimeType: 'image/png',
      });
    } catch (error) {
      response.appendResponseLine('❌ Diagnosis failed:');
      response.appendResponseLine(
        error instanceof Error ? error.message : String(error),
      );

      if (error instanceof Error && error.stack) {
        response.appendResponseLine('');
        response.appendResponseLine('Stack trace:');
        response.appendResponseLine(error.stack);
      }
    }
  },
});
