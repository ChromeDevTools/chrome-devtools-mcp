import type * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import type { CSSModel } from './CSSModel.js';
import { DeferredDOMNode } from './DOMModel.js';
import type { FrameAssociated } from './FrameAssociated.js';
import type { PageResourceLoadInitiator } from './PageResourceLoader.js';
import type { DebugId } from './SourceMap.js';
export declare class CSSStyleSheetHeader implements TextUtils.ContentProvider.ContentProvider, FrameAssociated {
    #private;
    id: Protocol.DOM.StyleSheetId;
    frameId: Protocol.Page.FrameId;
    sourceURL: Platform.DevToolsPath.UrlString;
    hasSourceURL: boolean;
    origin: Protocol.CSS.StyleSheetOrigin;
    title: string;
    disabled: boolean;
    isInline: boolean;
    isMutable: boolean;
    isConstructed: boolean;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    contentLength: number;
    ownerNode: DeferredDOMNode | undefined;
    sourceMapURL: Platform.DevToolsPath.UrlString | undefined;
    readonly loadingFailed: boolean;
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSStyleSheetHeader);
    originalContentProvider(): TextUtils.ContentProvider.ContentProvider;
    setSourceMapURL(sourceMapURL?: Platform.DevToolsPath.UrlString): void;
    cssModel(): CSSModel;
    isAnonymousInlineStyleSheet(): boolean;
    isConstructedByNew(): boolean;
    resourceURL(): Platform.DevToolsPath.UrlString;
    private getFrameURLPath;
    private viaInspectorResourceURL;
    lineNumberInSource(lineNumberInStyleSheet: number): number;
    columnNumberInSource(lineNumberInStyleSheet: number, columnNumberInStyleSheet: number): number | undefined;
    /**
     * Checks whether the position is in this style sheet. Assumes that the
     * position's columnNumber is consistent with line endings.
     */
    containsLocation(lineNumber: number, columnNumber: number): boolean;
    contentURL(): Platform.DevToolsPath.UrlString;
    contentType(): Common.ResourceType.ResourceType;
    requestContentData(): Promise<TextUtils.ContentData.ContentDataOrError>;
    searchInContent(query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    isViaInspector(): boolean;
    createPageResourceLoadInitiator(): PageResourceLoadInitiator;
    debugId(): DebugId | null;
}
