import type * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import { type ContentDataOrError } from './ContentData.js';
import type { ContentProvider, SearchMatch } from './ContentProvider.js';
export declare class StaticContentProvider implements ContentProvider {
    #private;
    constructor(contentURL: Platform.DevToolsPath.UrlString, contentType: Common.ResourceType.ResourceType, lazyContent: () => Promise<ContentDataOrError>);
    static fromString(contentURL: Platform.DevToolsPath.UrlString, contentType: Common.ResourceType.ResourceType, content: string): StaticContentProvider;
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    requestContentData(): Promise<ContentDataOrError>;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<SearchMatch[]>;
}
