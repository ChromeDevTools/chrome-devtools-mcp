// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Markdown Language Service — wraps markdown/ module in LanguageService interface.

import type { LanguageService } from '../language-service-registry';
import type { FileStructure } from '../types';
import { extractMarkdownStructure } from '../markdown';
import { MD_EXTENSIONS } from '../markdown';

export class MarkdownLanguageService implements LanguageService {
  readonly id = 'markdown';
  readonly name = 'Markdown';
  readonly extensions: readonly string[] = MD_EXTENSIONS;

  async extractStructure(filePath: string): Promise<FileStructure> {
    return extractMarkdownStructure(filePath);
  }
}
