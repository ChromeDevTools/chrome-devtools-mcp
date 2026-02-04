/**
 * DOM Utilities for Shadow DOM traversal
 *
 * This module provides browser-side utilities for deep DOM querying
 * that traverses Shadow DOM boundaries. These functions are designed
 * to be serialized and executed via CDP's Runtime.evaluate.
 */

/**
 * Options for deep DOM querying
 */
export interface DeepQueryOptions {
  /** Maximum number of shadow roots to visit (prevents infinite loops) */
  maxShadowRoots?: number;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Include diagnostic information */
  debug?: boolean;
}

/**
 * Result of a deep query operation with diagnostics
 */
export interface DeepQueryResult<T = Element> {
  /** Found elements */
  nodes: T[];
  /** Diagnostic information (only if debug: true) */
  stats?: {
    visitedShadowRoots: number;
    selectorHits: Record<string, number>;
    totalElementsScanned: number;
  };
}

/**
 * Browser-side code for collectDeep function.
 * This string is injected into page context via CDP evaluate.
 *
 * Usage in evaluate:
 * ```typescript
 * const code = `
 *   ${DomUtils.COLLECT_DEEP_CODE}
 *   return __collectDeep(['selector1', 'selector2']);
 * `;
 * ```
 */
export const COLLECT_DEEP_CODE = `
  const __collectDeep = (selectorList, options = {}) => {
    const maxShadowRoots = options.maxShadowRoots ?? 100;
    const maxResults = options.maxResults ?? 1000;
    const debug = options.debug ?? false;

    const results = [];
    const seen = new Set();
    let visitedShadowRoots = 0;
    let totalElementsScanned = 0;
    const selectorHits = {};

    const visit = (root) => {
      if (!root) return;
      if (results.length >= maxResults) return;
      if (visitedShadowRoots > maxShadowRoots) return;

      for (const sel of selectorList) {
        if (results.length >= maxResults) break;
        try {
          const matches = root.querySelectorAll?.(sel);
          if (matches) {
            for (const el of matches) {
              if (results.length >= maxResults) break;
              if (!seen.has(el)) {
                seen.add(el);
                results.push(el);
                if (debug) {
                  selectorHits[sel] = (selectorHits[sel] || 0) + 1;
                }
              }
            }
          }
        } catch (e) {
          // Ignore selector parsing errors
        }
      }

      const allElements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      totalElementsScanned += allElements.length;

      for (const el of allElements) {
        if (results.length >= maxResults) break;
        if (el.shadowRoot) {
          visitedShadowRoots++;
          visit(el.shadowRoot);
        }
      }
    };

    visit(document);

    if (debug) {
      return {
        nodes: results,
        stats: { visitedShadowRoots, selectorHits, totalElementsScanned }
      };
    }
    return { nodes: results };
  };
`;

/**
 * Browser-side visibility check function code
 */
export const IS_VISIBLE_CODE = `
  const __isVisible = (el) => {
    if (!el) return false;
    const rects = el.getClientRects();
    if (!rects || rects.length === 0) return false;
    const style = window.getComputedStyle(el);
    return style && style.visibility !== 'hidden' && style.display !== 'none';
  };
`;

/**
 * Browser-side disabled check function code
 */
export const IS_DISABLED_CODE = `
  const __isDisabled = (el) => {
    if (!el) return true;
    return el.disabled ||
           el.getAttribute('aria-disabled') === 'true' ||
           el.getAttribute('disabled') === 'true';
  };
`;

/**
 * Combined utility code for common DOM operations.
 * Inject this once at the start of complex evaluate blocks.
 */
export const DOM_UTILS_CODE = `
${COLLECT_DEEP_CODE}
${IS_VISIBLE_CODE}
${IS_DISABLED_CODE}
`;

/**
 * DomUtils namespace for organizing DOM utility functions
 */
export const DomUtils = {
  /**
   * Browser-side collectDeep function code
   */
  COLLECT_DEEP_CODE,

  /**
   * Browser-side visibility check code
   */
  IS_VISIBLE_CODE,

  /**
   * Browser-side disabled check code
   */
  IS_DISABLED_CODE,

  /**
   * Combined utility code
   */
  DOM_UTILS_CODE,

  /**
   * Generate evaluate code that uses collectDeep
   * @param selectorList - Array of CSS selectors
   * @param options - Query options
   * @returns String to use in evaluate()
   */
  generateCollectDeepCode(
    selectorList: string[],
    options: DeepQueryOptions = {}
  ): string {
    const optionsStr = JSON.stringify(options);
    const selectorsStr = JSON.stringify(selectorList);
    return `
      ${COLLECT_DEEP_CODE}
      return __collectDeep(${selectorsStr}, ${optionsStr}).nodes;
    `;
  },

  /**
   * Generate evaluate code that uses collectDeep with debug stats
   * @param selectorList - Array of CSS selectors
   * @param options - Query options (debug is forced to true)
   * @returns String to use in evaluate()
   */
  generateCollectDeepWithStatsCode(
    selectorList: string[],
    options: Omit<DeepQueryOptions, 'debug'> = {}
  ): string {
    const optionsStr = JSON.stringify({...options, debug: true});
    const selectorsStr = JSON.stringify(selectorList);
    return `
      ${COLLECT_DEEP_CODE}
      return __collectDeep(${selectorsStr}, ${optionsStr});
    `;
  },
};

export default DomUtils;
