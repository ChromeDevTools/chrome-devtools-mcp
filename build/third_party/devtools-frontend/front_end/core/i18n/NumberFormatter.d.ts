export interface NumberFormatter {
    format(value: number, separator?: string): string;
    formatToParts(value: number): Intl.NumberFormatPart[];
}
/**
 * Creates an instance of NumberFormatter.
 *
 * Safe to call in top-level of a module, since the creation of Intl.NumberFormat is deferred
 * until first usage.
 */
export declare function defineFormatter(options: Intl.NumberFormatOptions): NumberFormatter;
