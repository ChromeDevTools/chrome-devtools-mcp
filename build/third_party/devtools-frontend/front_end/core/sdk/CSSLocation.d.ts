import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
import type { CSSModel } from './CSSModel.js';
import type { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
export declare class CSSLocation {
    #private;
    styleSheetId: Protocol.DOM.StyleSheetId;
    url: Platform.DevToolsPath.UrlString;
    lineNumber: number;
    columnNumber: number;
    constructor(header: CSSStyleSheetHeader, lineNumber: number, columnNumber?: number);
    cssModel(): CSSModel;
    header(): CSSStyleSheetHeader | null;
}
