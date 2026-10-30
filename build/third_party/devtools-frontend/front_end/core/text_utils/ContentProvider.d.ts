import type * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import type { ContentDataOrError } from './ContentData.js';
import type { StreamingContentDataOrError } from './StreamingContentData.js';
import type { WasmDisassembly } from './WasmDisassembly.js';
export interface ContentProvider {
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    requestContentData(): Promise<ContentDataOrError>;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<SearchMatch[]>;
}
export declare class SearchMatch {
    readonly lineNumber: number;
    readonly lineContent: string;
    readonly columnNumber: number;
    readonly matchLength: number;
    constructor(lineNumber: number, lineContent: string, columnNumber: number, matchLength: number);
    static comparator(a: SearchMatch, b: SearchMatch): number;
}
export declare const contentAsDataURL: (content: string | null, mimeType: string, contentEncoded: boolean, charset?: string | null, limitSize?: boolean) => string | null;
export type DeferredContent = {
    content: string;
    isEncoded: boolean;
} | {
    content: '';
    isEncoded: false;
    wasmDisassemblyInfo: WasmDisassembly;
} | {
    content: null;
    error: string;
    isEncoded: boolean;
};
/**
 * Some ContentProvider like NetworkRequests might never actually be able to return
 * a fully completed "requestContentData" as the request keeps on going indefinitely.
 * Such proivders can implement the "StreamingContentProvider" addition, which allows
 * for partial/streaming content.
 **/
export interface StreamingContentProvider extends ContentProvider {
    requestStreamingContent(): Promise<StreamingContentDataOrError>;
}
export declare const isStreamingContentProvider: (provider: ContentProvider) => provider is StreamingContentProvider;
