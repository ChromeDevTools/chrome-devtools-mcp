/**
 * Returns string for bytes with legible units.
 * If necessary, can convert bytes to Kb or MB.
 */
export declare const bytesToString: (bytes: number) => string;
/**
 * Returns a string for bytes converted to Kb.
 * This is currently used on tables/rows to maintain consistency
 * and avoid varying units.
 */
export declare const formatBytesToKb: (bytes: number) => string;
