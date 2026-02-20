// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure data types for the Markdown parser — no VS Code API dependency.

/** Symbol kinds for Markdown constructs. */
export const MD_KINDS = {
  section: 'section',
  frontmatter: 'frontmatter',
  code: 'code',
  table: 'table',
  list: 'list',
  item: 'item',
  blockquote: 'blockquote',
  html: 'html',
  math: 'math',
  rule: 'rule',
  directive: 'directive',
  key: 'key',
  column: 'column',
} as const;

type MdKind = typeof MD_KINDS[keyof typeof MD_KINDS];

/** GitHub callout types recognized by the parser. */
export const CALLOUT_TYPES = new Set([
  'NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION',
]);

/** Regex to detect GitHub-flavored callout syntax: `> [!TYPE]` */
export const CALLOUT_PATTERN = /^\[!(\w+)\]\s*/;

/** File extensions handled by the Markdown language service. */
export const MD_EXTENSIONS = ['md', 'markdown'] as const;
