/**
 * LLM-powered browser intelligence tools.
 * Ported from Hermes's browser_tool.py vision and summarization capabilities.
 */

import {defineTool} from './ToolDefinition.js';
import {ToolCategory} from './categories.js';
import {zod} from '../third_party/index.js';
import type {SerializedAXNode} from '../third_party/index.js';
import {redact} from '../security/redact.js';
import {wrapExternalContent} from '../security/content-wrapper.js';

/**
 * Serialize an accessibility tree node into readable text.
 * Lightweight alternative to formatSnapshotNode that works with raw
 * puppeteer SerializedAXNode (no id assignment required).
 */
function serializeAXTree(node: SerializedAXNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const parts: string[] = [];
  const role = node.role ?? '';
  const name = node.name ?? '';
  const value = node.value ?? '';

  let line = `${indent}${role}`;
  if (name) line += ` "${name}"`;
  if (value && value !== name) line += ` value="${value}"`;
  parts.push(line);

  if (node.children) {
    for (const child of node.children) {
      parts.push(serializeAXTree(child, depth + 1));
    }
  }
  return parts.join('\n');
}

export const browserVision = defineTool({
  name: 'browser_vision',
  description:
    'Analyze the current page visually using AI. Takes a screenshot and sends it to the calling LLM for multimodal analysis. Useful for understanding page layout, finding UI elements, or answering visual questions about the page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    question: zod
      .string()
      .describe(
        'What to analyze about the page (e.g. "What products are shown?", "Is there a login form?", "Describe the layout")',
      ),
    includeSnapshot: zod
      .boolean()
      .optional()
      .describe(
        'Whether to also include the accessibility tree for richer analysis. Defaults to false.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    // Capture screenshot as base64
    const screenshotBuffer = await page.screenshot({
      optimizeForSpeed: true,
    });
    const screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');

    // Optionally include accessibility tree context
    let analysisContext = '';
    if (request.params.includeSnapshot) {
      const axTree = await page.accessibility.snapshot({
        includeIframes: true,
        interestingOnly: true,
      });
      if (axTree) {
        const snapshotText = serializeAXTree(axTree);
        // Truncate to 3000 chars like Hermes does
        analysisContext = `\n\nAccessibility tree (truncated):\n${snapshotText.slice(0, 3000)}`;
      }
    }

    // Attach the screenshot as an image in the response
    response.attachImage({
      data: screenshotBase64,
      mimeType: 'image/png',
    });

    // Add the question and context as text
    const questionText = redact(request.params.question);
    const pageUrl = page.url();
    response.appendResponseLine('## Vision Analysis Request');
    response.appendResponseLine(`**Page:** ${pageUrl}`);
    response.appendResponseLine(`**Question:** ${questionText}`);
    if (analysisContext) {
      response.appendResponseLine(
        wrapExternalContent(analysisContext, pageUrl),
      );
    }
    response.appendResponseLine(
      '\nPlease analyze the attached screenshot to answer the question.',
    );
  },
});

export const summarizePage = defineTool({
  name: 'summarize_page',
  description:
    'Get a task-focused summary of the current page content. Takes an accessibility snapshot and returns a concise summary focused on the specified task or question. Useful when page snapshots are too long to process.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    task: zod
      .string()
      .describe(
        'What you need from this page (e.g. "find the pricing table", "extract all product names", "locate the search functionality")',
      ),
    maxChars: zod
      .number()
      .optional()
      .describe('Maximum characters in the summary. Defaults to 4000.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const axTree = await page.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: true,
    });

    if (!axTree) {
      response.appendResponseLine('No page content available to summarize.');
      return;
    }

    const fullSnapshot = serializeAXTree(axTree);
    const maxChars = request.params.maxChars ?? 4000;
    const pageUrl = page.url();

    if (fullSnapshot.length <= maxChars) {
      response.appendResponseLine(`## Page Summary (${pageUrl})`);
      response.appendResponseLine(wrapExternalContent(fullSnapshot, pageUrl));
      return;
    }

    // For long pages, extract task-relevant sections
    response.appendResponseLine(`## Page Summary (${pageUrl})`);
    response.appendResponseLine(
      `Full page is ${fullSnapshot.length} characters. Showing task-focused extract for: "${request.params.task}"`,
    );
    response.appendResponseLine('');

    // Split into lines and score relevance by keyword overlap
    const taskWords = new Set(
      request.params.task
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2),
    );
    const lines = fullSnapshot.split('\n');
    const scoredLines: {line: string; score: number; idx: number}[] = [];

    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      let score = 0;
      for (const word of taskWords) {
        if (lower.includes(word)) score++;
      }
      // Boost interactive elements (they tend to have role names like button, link, etc.)
      if (/\b(button|link|textbox|combobox|checkbox|radio|tab)\b/.test(lower)) {
        score += 0.5;
      }
      scoredLines.push({line: lines[i], score, idx: i});
    }

    // Sort by relevance, take top lines within char budget
    scoredLines.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const relevantLines: string[] = [];
    let charCount = 0;
    for (const item of scoredLines) {
      if (item.score === 0 && charCount > maxChars * 0.5) break;
      if (charCount + item.line.length > maxChars) break;
      relevantLines.push(item.line);
      charCount += item.line.length + 1;
    }

    // Re-sort by original position for coherent output
    relevantLines.sort((a, b) => {
      const idxA = scoredLines.find(s => s.line === a)?.idx ?? 0;
      const idxB = scoredLines.find(s => s.line === b)?.idx ?? 0;
      return idxA - idxB;
    });

    response.appendResponseLine(
      wrapExternalContent(relevantLines.join('\n'), pageUrl),
    );
    response.appendResponseLine(
      `\n(Showing ${relevantLines.length} of ${lines.length} lines, ${charCount} chars)`,
    );
  },
});
