// IMPORTANT: DO NOT use any VS Code proposed APIs in this file.
// Pure data types and registry — no VS Code API dependency.

import type { FileStructure } from './types';

/** Contract that every language parser must implement. */
export interface LanguageService {
  /** Unique identifier (e.g., 'typescript', 'markdown', 'json') */
  readonly id: string;

  /** Human-readable name (e.g., 'TypeScript / JavaScript') */
  readonly name: string;

  /** File extensions this service handles (e.g., ['md', 'markdown']) */
  readonly extensions: readonly string[];

  /** Extract structured file representation. */
  extractStructure(filePath: string): Promise<FileStructure>;
}

/**
 * Maps file extensions to LanguageService implementations.
 * Each extension can only be registered once — no silent overrides.
 */
export class LanguageServiceRegistry {
  private readonly services = new Map<string, LanguageService>();

  /**
   * Register a language service for its declared extensions.
   * Throws if an extension is already registered.
   */
  register(service: LanguageService): void {
    for (const ext of service.extensions) {
      const key = ext.toLowerCase();
      if (this.services.has(key)) {
        throw new Error(
          `Extension '.${key}' already registered by '${this.services.get(key)!.id}'`
        );
      }
      this.services.set(key, service);
    }
  }

  /** Get the language service for a file extension, or undefined. */
  get(ext: string): LanguageService | undefined {
    return this.services.get(ext.toLowerCase());
  }

  /** Check if a file extension has a registered language service. */
  supports(ext: string): boolean {
    return this.services.has(ext.toLowerCase());
  }

  /** List all registered service IDs (deduplicated). */
  registeredIds(): string[] {
    const seen = new Set<string>();
    for (const svc of this.services.values()) {
      seen.add(svc.id);
    }
    return [...seen];
  }
}
