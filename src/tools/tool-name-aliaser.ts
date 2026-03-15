/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Common abbreviations for tool name segments.
 * Used to produce human-readable short aliases.
 */
const ABBREVIATIONS: Record<string, string> = {
  action: 'act',
  analyze: 'anlz',
  console: 'cons',
  evaluate: 'eval',
  experimental: 'exp',
  extension: 'ext',
  extensions: 'exts',
  insight: 'ins',
  install: 'inst',
  lighthouse: 'lh',
  memory: 'mem',
  message: 'msg',
  messages: 'msgs',
  navigate: 'nav',
  network: 'net',
  performance: 'perf',
  request: 'req',
  requests: 'reqs',
  screencast: 'scrcast',
  screenshot: 'scrn',
  snapshot: 'snap',
  trigger: 'trig',
  uninstall: 'uninst',
};

/**
 * Tool name aliaser for provider compatibility.
 *
 * Some LLM providers (e.g., AWS Bedrock) enforce character limits on tool
 * names. When MCP clients add prefixes like
 * `mcp__plugin_<pkg>_<server>__`, the full tool name can exceed these limits.
 *
 * This class provides deterministic, collision-safe shortening of tool names
 * while maintaining bidirectional mappings for dispatch.
 *
 * Example: with a Bedrock 64-char limit and a 49-char client prefix,
 * `maxLength` should be set to 15 (64 - 49). Tool names longer than 15
 * characters are automatically shortened using human-readable abbreviations.
 */
export class ToolNameAliaser {
  readonly #aliasToOriginal = new Map<string, string>();
  readonly #originalToAlias = new Map<string, string>();
  readonly #maxLength: number;

  constructor(maxLength: number) {
    if (maxLength < 1) {
      throw new Error('maxLength must be at least 1');
    }
    this.#maxLength = maxLength;
  }

  get maxLength(): number {
    return this.#maxLength;
  }

  /**
   * Register a tool name. Returns the alias (which equals the original name
   * if it already fits within the max length).
   *
   * Tool names should be registered in a deterministic order (e.g.,
   * alphabetical) to ensure stable alias generation across runs.
   */
  register(originalName: string): string {
    if (this.#originalToAlias.has(originalName)) {
      return this.#originalToAlias.get(originalName)!;
    }

    if (originalName.length <= this.#maxLength) {
      this.#aliasToOriginal.set(originalName, originalName);
      this.#originalToAlias.set(originalName, originalName);
      return originalName;
    }

    const alias = this.#shorten(originalName);
    this.#aliasToOriginal.set(alias, originalName);
    this.#originalToAlias.set(originalName, alias);
    return alias;
  }

  /**
   * Resolve an alias back to its original tool name.
   * Returns `undefined` if the alias is not registered.
   */
  resolve(alias: string): string | undefined {
    return this.#aliasToOriginal.get(alias);
  }

  /**
   * Get the alias for an original tool name.
   * Returns `undefined` if the name is not registered.
   */
  getAlias(originalName: string): string | undefined {
    return this.#originalToAlias.get(originalName);
  }

  /**
   * Get all registered (alias, original) pairs.
   */
  entries(): Array<[alias: string, original: string]> {
    return [...this.#aliasToOriginal.entries()];
  }

  #shorten(name: string): string {
    const segments = name.split('_');

    // Step 1: Apply known abbreviations to each segment.
    const abbreviated = segments.map(seg => ABBREVIATIONS[seg] ?? seg);

    let candidate = abbreviated.join('_');
    if (candidate.length <= this.#maxLength) {
      return this.#ensureUnique(candidate);
    }

    // Step 2: Progressively truncate the longest segment by one character
    // until the name fits.
    const working = [...abbreviated];
    while (working.join('_').length > this.#maxLength && working.length > 0) {
      let longestIdx = 0;
      for (let i = 1; i < working.length; i++) {
        if (working[i].length > working[longestIdx].length) {
          longestIdx = i;
        }
      }
      if (working[longestIdx].length <= 1) {
        // Cannot shorten further; drop the last segment.
        working.pop();
        continue;
      }
      working[longestIdx] = working[longestIdx].slice(0, -1);
    }

    candidate = working.join('_');

    // Step 3: Hard truncate as a safety net (shouldn't be reached by the
    // loop above for reasonable maxLength values).
    if (candidate.length > this.#maxLength) {
      candidate = candidate.slice(0, this.#maxLength);
    }

    return this.#ensureUnique(candidate);
  }

  #ensureUnique(candidate: string): string {
    if (!this.#aliasToOriginal.has(candidate)) {
      return candidate;
    }

    // Collision: append a numeric suffix while staying within maxLength.
    for (let i = 1; i < 1000; i++) {
      const suffix = `_${i}`;
      const maxBase = this.#maxLength - suffix.length;
      const base =
        candidate.length > maxBase ? candidate.slice(0, maxBase) : candidate;
      const withSuffix = base + suffix;
      if (!this.#aliasToOriginal.has(withSuffix)) {
        return withSuffix;
      }
    }

    throw new Error(
      `Cannot generate unique alias for "${candidate}" after 1000 attempts`,
    );
  }
}
