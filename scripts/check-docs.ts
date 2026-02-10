/**
 * Minimal markdown smoke check for docs.
 *
 * Goals:
 * - Ensure all markdown files under docs/ are readable.
 * - Fail fast on obvious bad states (e.g. unresolved merge markers).
 *
 * This is intentionally lightweight and dependency-free so it can run quickly in CI.
 */

import fs from 'node:fs';
import path from 'node:path';

const DOCS_ROOT = path.join(process.cwd(), 'docs');

function isMarkdownFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

function findMarkdownFiles(root: string): string[] {
  const results: string[] = [];

  function walk(current: string) {
    const entries = fs.readdirSync(current, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(root);
  return results;
}

function checkFile(filePath: string): string[] {
  const errors: string[] = [];
  const content = fs.readFileSync(filePath, 'utf8');

  if (!content.trim()) {
    errors.push('file is empty');
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    // Detect real git conflict markers only:
    //   <<<<<<< HEAD
    //   =======
    //   >>>>>>> branch-name
    if (
      trimmed.startsWith('<<<<<<< ') ||
      trimmed === '=======' ||
      trimmed.startsWith('>>>>>>> ')
    ) {
      errors.push(`unresolved merge marker on line ${lineNumber}`);
    }
  });

  return errors;
}

function main() {
  if (!fs.existsSync(DOCS_ROOT)) {
    console.error(`Docs directory not found at ${DOCS_ROOT}`);
    process.exit(1);
  }

  const markdownFiles = findMarkdownFiles(DOCS_ROOT);
  const allErrors: string[] = [];

  for (const file of markdownFiles) {
    try {
      const errors = checkFile(file);
      for (const err of errors) {
        allErrors.push(`${path.relative(process.cwd(), file)}: ${err}`);
      }
    } catch (error) {
      allErrors.push(
        `${path.relative(process.cwd(), file)}: failed to read or parse file: ${
          (error as Error).message
        }`,
      );
    }
  }

  if (allErrors.length > 0) {
    console.error('Docs smoke check failed with the following issues:\n');
    for (const msg of allErrors) {
      console.error(`- ${msg}`);
    }
    process.exit(1);
  }

  console.log(`Docs smoke check passed for ${markdownFiles.length} markdown file(s).`);
}

main();

