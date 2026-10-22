import type * as Common from '../common/common.js';
import type * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import type { PageResourceLoader, PageResourceLoadInitiator } from './PageResourceLoader.js';
export declare class CompilerSourceMappingContentProvider implements TextUtils.ContentProvider.ContentProvider {
    #private;
    constructor(sourceURL: Platform.DevToolsPath.UrlString, contentType: Common.ResourceType.ResourceType, initiator: PageResourceLoadInitiator, pageResourceLoader: PageResourceLoader);
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    requestContentData(): Promise<TextUtils.ContentData.ContentDataOrError>;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
}
