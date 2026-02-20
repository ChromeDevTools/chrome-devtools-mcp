// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
import * as fs from 'fs';
import * as path from 'path';

export interface IgnoreRule {
  pattern: string;
  negated: boolean;
  scope: string | null;
}

const DEVTOOLS_IGNORE_FILENAME = '.devtoolsignore';

function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, '/');
}

function escapeRegex(text: string): string {
  return text.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegex(pattern: string): RegExp {
  const normalized = normalizeRelativePath(pattern.trim());
  let source = '';
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === '*' && next === '*') {
      // `**/` means "zero or more directories" — the trailing `/` is optional
      if (normalized[i + 2] === '/') {
        source += '(.*/)?';
        i += 2;
      } else {
        source += '.*';
        i++;
      }
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
}

export function parseIgnoreRules(rootDir: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  const filePath = path.join(rootDir, DEVTOOLS_IGNORE_FILENAME);
  if (!fs.existsSync(filePath)) return rules;

  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return rules;
  }

  let currentScope: string | null = null;
  const headerRegex = /^#\s*\[(\S+)\]\s*$/;

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      const headerMatch = trimmed.match(headerRegex);
      if (headerMatch) {
        currentScope = headerMatch[1];
      }
      continue;
    }

    const negated = trimmed.startsWith('!');
    const pattern = negated ? trimmed.slice(1).trim() : trimmed;
    if (!pattern) continue;
    rules.push({ pattern, negated, scope: currentScope });
  }

  return rules;
}

export function applyIgnoreRules(relativePath: string, rules: IgnoreRule[], toolScope?: string): boolean {
  let ignored = false;
  const normalized = normalizeRelativePath(relativePath);
  for (const rule of rules) {
    if (rule.scope !== null && rule.scope !== toolScope) continue;

    const raw = normalizeRelativePath(rule.pattern);
    const directoryPattern = raw.endsWith('/');
    const basePattern = directoryPattern ? raw.slice(0, -1) : raw;

    // .gitignore semantics: patterns without / (other than trailing) match at any depth
    const hasPathSep = basePattern.includes('/');
    const prefix = hasPathSep ? '' : '**/';

    if (directoryPattern) {
      // Directory patterns match the directory itself AND anything inside it
      const selfMatcher = globToRegex(`${prefix}${basePattern}`);
      const childMatcher = globToRegex(`${prefix}${basePattern}/**`);
      if (selfMatcher.test(normalized) || childMatcher.test(normalized)) {
        ignored = !rule.negated;
      }
    } else {
      const matcher = globToRegex(`${prefix}${raw}`);
      if (matcher.test(normalized)) {
        ignored = !rule.negated;
      }
    }
  }
  return ignored;
}
