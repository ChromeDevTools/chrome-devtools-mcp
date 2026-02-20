// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure Node.js — remark-based Markdown parser producing FileSymbol[] hierarchy.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import type { Root, Content, Heading, Code, Table, List, ListItem, Blockquote, Html, Yaml, ThematicBreak } from 'mdast';
import type { Math as MathNode } from 'mdast-util-math';
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive';
import YAML from 'yaml';
import type { FileSymbol, FileSymbolRange } from '../types';
import { MD_KINDS, CALLOUT_PATTERN } from './markdown-types';

// ── Unified Processors ───────────────────────────────────

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkDirective);

// ── Public API ───────────────────────────────────────────

/**
 * Parse Markdown text into a FileSymbol[] hierarchy.
 * Uses heading-dominance model: headings own all subsequent content
 * until a sibling or parent heading is encountered.
 */
export function parseMarkdown(text: string): FileSymbol[] {
  const ast = markdownProcessor.parse(text) as Root;
  const totalLines = text.split('\n').length;
  return buildHierarchy(ast.children, totalLines);
}

// ── Hierarchy Builder ────────────────────────────────────

interface SectionFrame {
  level: number;
  symbol: FileSymbol;
}

function buildHierarchy(nodes: Content[], totalLines: number): FileSymbol[] {
  const result: FileSymbol[] = [];
  const sectionStack: SectionFrame[] = [];

  // Collect all heading positions for section range calculation
  const headingPositions = collectHeadingPositions(nodes);

  for (const node of nodes) {
    const startLine = node.position?.start.line ?? 1;
    const endLine = node.position?.end.line ?? startLine;

    switch (node.type) {
      case 'yaml': {
        const fmSymbol = buildFrontmatter(node as Yaml);
        result.push(fmSymbol);
        break;
      }

      case 'heading': {
        const heading = node as Heading;
        const level = heading.depth;
        const title = extractText(heading);
        const sectionEnd = calculateSectionEnd(startLine, level, headingPositions, totalLines);

        const sectionSymbol: FileSymbol = {
          name: title,
          kind: MD_KINDS.section,
          detail: '#'.repeat(level),
          range: { startLine, endLine: sectionEnd },
          children: [],
        };

        // Pop stack until parent section found
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
          sectionStack.pop();
        }

        addToContext(result, sectionStack, sectionSymbol);
        sectionStack.push({ level, symbol: sectionSymbol });
        break;
      }

      case 'code': {
        const codeSymbol = buildCodeBlock(node as Code, startLine, endLine);
        addToContext(result, sectionStack, codeSymbol);
        break;
      }

      case 'table': {
        const tableSymbol = buildTable(node as Table, startLine, endLine);
        addToContext(result, sectionStack, tableSymbol);
        break;
      }

      case 'list': {
        const listSymbol = buildList(node as List, startLine, endLine);
        addToContext(result, sectionStack, listSymbol);
        break;
      }

      case 'blockquote': {
        const bqSymbol = buildBlockquote(node as Blockquote, startLine, endLine);
        addToContext(result, sectionStack, bqSymbol);
        break;
      }

      case 'html': {
        const htmlSymbol = buildHtmlBlock(node as Html, startLine, endLine);
        if (htmlSymbol) {
          addToContext(result, sectionStack, htmlSymbol);
        }
        break;
      }

      case 'math': {
        const mathSymbol = buildMathBlock(node as unknown as MathNode, startLine, endLine);
        addToContext(result, sectionStack, mathSymbol);
        break;
      }

      case 'thematicBreak': {
        const ruleSymbol: FileSymbol = {
          name: '---',
          kind: MD_KINDS.rule,
          range: { startLine, endLine },
          children: [],
        };
        addToContext(result, sectionStack, ruleSymbol);
        break;
      }

      case 'containerDirective': {
        const dirSymbol = buildContainerDirective(node as unknown as ContainerDirective, startLine, endLine);
        addToContext(result, sectionStack, dirSymbol);
        break;
      }

      case 'leafDirective': {
        const leafDir = node as unknown as LeafDirective;
        const leafSymbol: FileSymbol = {
          name: leafDir.name ?? 'directive',
          kind: MD_KINDS.directive,
          range: { startLine, endLine },
          children: [],
        };
        addToContext(result, sectionStack, leafSymbol);
        break;
      }

      default:
        // Paragraphs, definitions, etc. — not symbols (covered by parent range)
        break;
    }
  }

  return result;
}

// ── Context Management ───────────────────────────────────

function addToContext(result: FileSymbol[], sectionStack: SectionFrame[], symbol: FileSymbol): void {
  if (sectionStack.length === 0) {
    result.push(symbol);
  } else {
    sectionStack[sectionStack.length - 1].symbol.children.push(symbol);
  }
}

// ── Heading Section Range ────────────────────────────────

interface HeadingPosition {
  line: number;
  depth: number;
}

function collectHeadingPositions(nodes: Content[]): HeadingPosition[] {
  const positions: HeadingPosition[] = [];
  for (const node of nodes) {
    if (node.type === 'heading') {
      const heading = node as Heading;
      positions.push({
        line: node.position?.start.line ?? 1,
        depth: heading.depth,
      });
    }
  }
  return positions;
}

/**
 * Calculate the end line of a section.
 * A heading's range extends from its line to the line before the next
 * heading of equal or lesser depth (or EOF).
 */
function calculateSectionEnd(
  startLine: number,
  depth: number,
  headingPositions: HeadingPosition[],
  totalLines: number,
): number {
  for (const pos of headingPositions) {
    if (pos.line > startLine && pos.depth <= depth) {
      return pos.line - 1;
    }
  }
  return totalLines;
}

// ── Symbol Builders ──────────────────────────────────────

function buildFrontmatter(node: Yaml): FileSymbol {
  const startLine = node.position?.start.line ?? 1;
  const endLine = node.position?.end.line ?? startLine;

  const symbol: FileSymbol = {
    name: 'frontmatter',
    kind: MD_KINDS.frontmatter,
    range: { startLine, endLine },
    children: [],
  };

  if (node.value) {
    symbol.children = extractYamlKeys(node.value, startLine);
  }

  return symbol;
}

function buildCodeBlock(node: Code, startLine: number, endLine: number): FileSymbol {
  const lang = node.lang ?? '';
  return {
    name: lang || 'code',
    kind: MD_KINDS.code,
    detail: lang || undefined,
    range: { startLine, endLine },
    children: [],
  };
}

function buildTable(node: Table, startLine: number, endLine: number): FileSymbol {
  const headerRow = node.children[0];
  const headers = headerRow?.children.map(cell => extractText(cell)) ?? [];

  const tableSymbol: FileSymbol = {
    name: 'table',
    kind: MD_KINDS.table,
    detail: `${headers.length} cols`,
    range: { startLine, endLine },
    children: [],
  };

  if (headers.length > 0) {
    tableSymbol.children = headers.map(h => ({
      name: h,
      kind: MD_KINDS.column,
      range: { startLine, endLine: startLine } as FileSymbolRange,
      children: [],
    }));
  }

  return tableSymbol;
}

function buildList(node: List, startLine: number, endLine: number): FileSymbol {
  const ordered = node.ordered ?? false;
  const listSymbol: FileSymbol = {
    name: ordered ? 'ordered list' : 'list',
    kind: MD_KINDS.list,
    detail: ordered ? 'ol' : 'ul',
    range: { startLine, endLine },
    children: [],
  };

  for (const item of node.children) {
    const itemSymbol = buildListItem(item, ordered);
    listSymbol.children.push(itemSymbol);
  }

  return listSymbol;
}

function buildListItem(node: ListItem, _ordered: boolean): FileSymbol {
  const itemStart = node.position?.start.line ?? 1;
  const itemEnd = node.position?.end.line ?? itemStart;
  const firstText = extractFirstLineText(node);

  const itemSymbol: FileSymbol = {
    name: firstText || 'item',
    kind: MD_KINDS.item,
    range: { startLine: itemStart, endLine: itemEnd },
    children: [],
  };

  // Recurse into container children (nested lists, code blocks)
  for (const child of node.children) {
    if (child.type === 'list') {
      const nestedList = buildList(child as List, child.position?.start.line ?? itemStart, child.position?.end.line ?? itemEnd);
      itemSymbol.children.push(nestedList);
    } else if (child.type === 'code') {
      const code = buildCodeBlock(child as Code, child.position?.start.line ?? itemStart, child.position?.end.line ?? itemEnd);
      itemSymbol.children.push(code);
    } else if (child.type === 'table') {
      const table = buildTable(child as Table, child.position?.start.line ?? itemStart, child.position?.end.line ?? itemEnd);
      itemSymbol.children.push(table);
    }
  }

  return itemSymbol;
}

function buildBlockquote(node: Blockquote, startLine: number, endLine: number): FileSymbol {
  // Check for GitHub callout pattern: > [!NOTE]
  const firstChild = node.children[0];
  if (firstChild?.type === 'paragraph') {
    const firstInline = firstChild.children[0];
    if (firstInline && 'value' in firstInline && typeof firstInline.value === 'string') {
      const calloutMatch = CALLOUT_PATTERN.exec(firstInline.value);
      if (calloutMatch) {
        const calloutType = calloutMatch[1].toUpperCase();
        return {
          name: calloutType,
          kind: MD_KINDS.directive,
          detail: calloutType.toLowerCase(),
          range: { startLine, endLine },
          children: [],
        };
      }
    }
  }

  const bqSymbol: FileSymbol = {
    name: 'blockquote',
    kind: MD_KINDS.blockquote,
    range: { startLine, endLine },
    children: [],
  };

  // Recurse into blockquote children for nested blocks
  for (const child of node.children) {
    const childStart = child.position?.start.line ?? startLine;
    const childEnd = child.position?.end.line ?? endLine;

    if (child.type === 'code') {
      bqSymbol.children.push(buildCodeBlock(child as Code, childStart, childEnd));
    } else if (child.type === 'blockquote') {
      bqSymbol.children.push(buildBlockquote(child as Blockquote, childStart, childEnd));
    } else if (child.type === 'list') {
      bqSymbol.children.push(buildList(child as List, childStart, childEnd));
    } else if (child.type === 'table') {
      bqSymbol.children.push(buildTable(child as Table, childStart, childEnd));
    }
  }

  return bqSymbol;
}

function buildHtmlBlock(node: Html, startLine: number, endLine: number): FileSymbol | undefined {
  const value = node.value.trim();
  // Skip HTML comments — they become orphaned content
  if (value.startsWith('<!--') && value.endsWith('-->')) {
    return {
      name: 'comment',
      kind: MD_KINDS.html,
      detail: 'comment',
      range: { startLine, endLine },
      children: [],
    };
  }

  return {
    name: 'html',
    kind: MD_KINDS.html,
    range: { startLine, endLine },
    children: [],
  };
}

function buildMathBlock(node: MathNode, startLine: number, endLine: number): FileSymbol {
  return {
    name: 'math',
    kind: MD_KINDS.math,
    range: { startLine, endLine },
    children: [],
  };
}

function buildContainerDirective(node: ContainerDirective, startLine: number, endLine: number): FileSymbol {
  // Extract the label from the directive's children or attributes
  const label = extractText(node as unknown as Content) || node.name;
  return {
    name: label,
    kind: MD_KINDS.directive,
    detail: node.name,
    range: { startLine, endLine },
    children: [],
  };
}

// ── Text Extraction ──────────────────────────────────────

/** Extract plain text from an mdast node (recursive). */
function extractText(node: Content): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }
  if ('children' in node && Array.isArray(node.children)) {
    return (node.children as Content[]).map(child => extractText(child)).join('');
  }
  return '';
}

/** Extract the text from the first paragraph of a list item. */
function extractFirstLineText(node: ListItem): string {
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      const text = extractText(child);
      // Truncate long text for the symbol name
      if (text.length > 60) {
        return text.substring(0, 57) + '...';
      }
      return text;
    }
  }
  return '';
}

// ── YAML Key Extraction ──────────────────────────────────

function extractYamlKeys(yamlText: string, fmStartLine: number): FileSymbol[] {
  try {
    const doc = YAML.parseDocument(yamlText, { version: '1.1' });
    const contents = doc.contents;
    if (!contents || !('items' in contents)) {
      return [];
    }

    const results: FileSymbol[] = [];
    const yamlMap = contents as YAML.YAMLMap;
    for (const pair of yamlMap.items) {
      const key = pair.key;
      if (key === null || key === undefined) continue;

      const keyName = typeof key === 'object' && 'value' in key
        ? String((key as YAML.Scalar).value)
        : String(key);

      // YAML content starts on fmStartLine + 1
      let keyLine = fmStartLine + 1;
      if (typeof key === 'object' && key !== null && 'range' in key) {
        const range = (key as YAML.Scalar).range;
        if (range && range.length >= 1) {
          const offset = range[0];
          let lineWithinYaml = 0;
          for (let i = 0; i < offset && i < yamlText.length; i++) {
            if (yamlText[i] === '\n') lineWithinYaml++;
          }
          keyLine = fmStartLine + 1 + lineWithinYaml;
        }
      }

      results.push({
        name: keyName,
        kind: MD_KINDS.key,
        range: { startLine: keyLine, endLine: keyLine },
        children: [],
      });
    }
    return results;
  } catch {
    return [];
  }
}
