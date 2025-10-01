/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Debugger} from 'debug';

export class UrlValidator {
  #allowedOrigins: string[];
  #blockedOrigins: string[];
  #logger: Debugger;

  constructor(
    options: {
      allowedOrigins?: string[];
      blockedOrigins?: string[];
    },
    logger: Debugger,
  ) {
    this.#allowedOrigins = options.allowedOrigins ?? [];
    this.#blockedOrigins = options.blockedOrigins ?? [];
    this.#logger = logger;

    if (this.#allowedOrigins.length > 0) {
      this.#logger(
        `URL validation enabled. Allowed origins: ${this.#allowedOrigins.join(', ')}`,
      );
    }
    if (this.#blockedOrigins.length > 0) {
      this.#logger(
        `URL validation enabled. Blocked origins: ${this.#blockedOrigins.join(', ')}`,
      );
    }
  }

  static parseOrigins(originsString?: string): string[] {
    if (!originsString) {
      return [];
    }
    return originsString
      .split(';')
      .map(o => o.trim())
      .filter(o => o.length > 0);
  }

  isAllowed(url: string): boolean {
    if (this.#isSpecialUrl(url)) {
      return true;
    }

    try {
      const origin = new URL(url).origin;

      if (this.#matchesAnyOrigin(origin, this.#blockedOrigins)) {
        this.#logger(`Blocked request to ${url} (origin: ${origin})`);
        return false;
      }

      if (this.#allowedOrigins.length === 0) {
        return true;
      }

      const allowed = this.#matchesAnyOrigin(origin, this.#allowedOrigins);
      if (!allowed) {
        this.#logger(
          `Blocked request to ${url} (origin: ${origin} not in allowlist)`,
        );
      }
      return allowed;
    } catch {
      return true;
    }
  }

  #isSpecialUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.startsWith('about:') ||
      lowerUrl.startsWith('data:') ||
      lowerUrl.startsWith('blob:') ||
      lowerUrl.startsWith('file:')
    );
  }

  #matchesAnyOrigin(origin: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.#matchesOriginPattern(origin, pattern)) {
        return true;
      }
    }
    return false;
  }

  #matchesOriginPattern(origin: string, pattern: string): boolean {
    if (origin === pattern) {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = this.#patternToRegex(pattern);
      return regex.test(origin);
    }

    return false;
  }

  #patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\*/g, '[^\\/]+');
    return new RegExp(`^${regexPattern}$`);
  }

  hasRestrictions(): boolean {
    return this.#allowedOrigins.length > 0 || this.#blockedOrigins.length > 0;
  }
}
