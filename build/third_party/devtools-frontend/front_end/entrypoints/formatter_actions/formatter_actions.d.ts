export declare const enum FormatterActions {
    FORMAT = "format",
    PARSE_CSS = "parseCSS",
    JAVASCRIPT_SUBSTITUTE = "javaScriptSubstitute",
    JAVASCRIPT_SCOPE_TREE = "javaScriptScopeTree"
}
export declare const enum FormattableMediaTypes {
    APPLICATION_JAVASCRIPT = "application/javascript",
    APPLICATION_JSON = "application/json",
    APPLICATION_MANIFEST_JSON = "application/manifest+json",
    TEXT_CSS = "text/css",
    TEXT_HTML = "text/html",
    TEXT_JAVASCRIPT = "text/javascript"
}
export declare const FORMATTABLE_MEDIA_TYPES: string[];
export interface FormatMapping {
    original: number[];
    formatted: number[];
}
export interface FormatResult {
    content: string;
    mapping: FormatMapping;
}
export declare const enum DefinitionKind {
    NONE = 0,
    LET = 1,
    VAR = 2,
    FIXED = 3
}
export declare const enum ScopeKind {
    BLOCK = 1,
    FUNCTION = 2,
    GLOBAL = 3,
    ARROW_FUNCTION = 4
}
/**
 * Describes a single scope for `javaScriptSubstitute`.
 */
export interface ScopeVariableMapping {
    /**
     * Authored variable name -> generated binding expression, or `null` if the variable is unavailable.
     */
    bindings: Map<string, string | null>;
    /**
     * Generated identifiers declared by this scope. Together with the free identifiers of `bindings`, these
     * shadow bindings of outer scopes that refer to the same generated identifiers.
     *
     * This is needed when a generated identifier doesn't show up in any binding expression, e.g. because
     * multiple generated identifiers map to the same authored name, or the authored name is unknown.
     */
    generatedNames: string[];
}
export interface ScopeTreeNode {
    variables: Array<{
        name: string;
        kind: DefinitionKind;
        offsets: number[];
    }>;
    start: number;
    end: number;
    nameMappingLocations?: number[];
    name?: string;
    kind: ScopeKind;
    children: ScopeTreeNode[];
}
