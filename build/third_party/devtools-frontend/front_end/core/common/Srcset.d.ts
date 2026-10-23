export declare const enum TokenType {
    LITERAL = 0,
    URL = 1
}
export interface Token {
    type: TokenType;
    value: string;
}
/**
 * Parsing of
 * https://html.spec.whatwg.org/multipage/images.html#srcset-attribute and href
 * attributes to identify URLs vs other text in the srcset.
 *
 * Note: this is probably not spec compliant.
 */
export declare function parseSrcset(value: string): Token[];
