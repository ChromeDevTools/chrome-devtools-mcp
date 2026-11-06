import type * as Platform from '../platform/platform.js';
export declare class ResourceType {
    #private;
    constructor(name: string, title: () => Platform.UIString.LocalizedString, category: ResourceCategory, isTextType: boolean);
    static fromMimeType(mimeType: string | null): ResourceType;
    static fromMimeTypeOverride(mimeType: string | null): ResourceType | null;
    static fromURL(url: string): ResourceType | null;
    static fromName(name: string): ResourceType | null;
    static mimeFromURL(url: Platform.DevToolsPath.UrlString): string | undefined;
    static mimeFromExtension(ext: string): string | undefined;
    static simplifyContentType(contentType: string): string;
    /**
     * Checks whether the given MIME type represents JavaScript content.
     */
    static isJavaScriptMimeType(mimeType: string): boolean;
    /**
     * Adds suffixes iff the mimeType is 'text/javascript' to denote whether the JS is minified or from
     * a source map.
     */
    static mediaTypeForMetrics(mimeType: string, isFromSourceMap: boolean, isMinified: boolean, isSnippet: boolean, isDebugger: boolean): string;
    name(): string;
    title(): string;
    category(): ResourceCategory;
    isTextType(): boolean;
    isScript(): boolean;
    hasScripts(): boolean;
    isStyleSheet(): boolean;
    hasStyleSheets(): boolean;
    isDocument(): boolean;
    isDocumentOrScriptOrStyleSheet(): boolean;
    isFont(): boolean;
    isImage(): boolean;
    isFromSourceMap(): boolean;
    toString(): string;
    canonicalMimeType(): string;
}
export declare class ResourceCategory {
    readonly name: string;
    title: () => Platform.UIString.LocalizedString;
    shortTitle: () => Platform.UIString.LocalizedString;
    constructor(name: string, title: () => Platform.UIString.LocalizedString, shortTitle: () => Platform.UIString.LocalizedString);
}
export declare const resourceCategories: Record<string, ResourceCategory>;
/**
 * This enum is a superset of all types defined in WebCore::InspectorPageAgent::resourceTypeJson
 * For DevTools-only types that are based on MIME-types that are backed by other request types
 * (for example Wasm that is based on Fetch), additional types are added here.
 * For these types, make sure to update `fromMimeTypeOverride` to implement the custom logic.
 */
export declare const resourceTypes: Record<string, ResourceType>;
export declare const resourceTypeByExtension: Map<string, ResourceType>;
export declare const mimeTypeByExtension: Map<string, string>;
