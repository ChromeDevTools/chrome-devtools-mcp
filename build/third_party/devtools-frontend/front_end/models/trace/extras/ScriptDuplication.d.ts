import * as Handlers from '../handlers/handlers.js';
export declare function normalizeSource(source: string): string;
/**
 * The key is a source map `sources` entry (these are URLs/file paths), but normalized
 * via `normalizeSource`.
 *
 * The value is an object with an entry for every script that has a source map which
 * denotes that this source was used, along with the estimated resource size it takes
 * up in the script.
 */
export type ScriptDuplication = Map<string, {
    /**
     * This is the sum of all (but one) `attributedSize` in `scripts`.
     *
     * One copy of this module is treated as the canonical version - the rest will
     * have non-zero `wastedBytes`. The canonical copy is the first entry of
     * `scripts`.
     *
     * In the case of all copies being the same version, all sizes are
     * equal and the selection doesn't matter (ignoring compression ratios). When
     * the copies are different versions, it does matter. Ideally the newest
     * version would be the canonical copy, but version information is not present.
     * Instead, size is used as a heuristic for latest version. This makes the
     * value here conserative in its estimation.
     */
    estimatedDuplicateBytes: number;
    duplicates: Array<{
        script: Handlers.ModelHandlers.Scripts.Script;
        /**
         * The number of bytes in the script bundle that map back to this module,
         * in terms of estimated impact on transfer size.
         */
        attributedSize: number;
    }>;
}>;
/**
 * Sorts each array within @see ScriptDuplication by attributedSize, drops information
 * on sources that are too small, and calculates esimatedDuplicateBytes.
 */
export declare function normalizeDuplication(duplication: ScriptDuplication): void;
export declare function getNodeModuleName(source: string): string;
/**
 * Returns 2 @see ScriptDuplication for the given collection of script contents + source maps:
 *
 * 1. `duplication` keys correspond to authored files
 * 2. `duplication` keys correspond to authored files, except all files within the same
 *    node_module package are aggregated under the same entry.
 */
export declare function computeScriptDuplication(scriptsData: Handlers.ModelHandlers.Scripts.ScriptsData, compressionRatios: Map<string, number>): {
    duplication: ScriptDuplication;
    duplicationGroupedByNodeModules: ScriptDuplication;
};
