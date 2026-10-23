import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
export declare class CSSFontFace {
    #private;
    constructor(payload: Protocol.CSS.FontFace);
    getFontFamily(): string;
    getSrc(): Platform.DevToolsPath.UrlString;
    getFontDisplay(): string;
    getVariationAxisByTag(tag: string): Protocol.CSS.FontVariationAxis | undefined;
}
