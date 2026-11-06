import type * as Protocol from '../../generated/protocol.js';
import type * as TextUtils from '../text_utils/text_utils.js';
import { CSSLocation } from './CSSLocation.js';
import type { CSSModel, Edit } from './CSSModel.js';
import type { CSSStyleSheetHeader } from './CSSStyleSheetHeader.js';
type CSSQueryPayload = Protocol.CSS.CSSMedia | Protocol.CSS.CSSContainerQuery | Protocol.CSS.CSSSupports | Protocol.CSS.CSSScope;
export declare abstract class CSSQuery {
    text: string;
    range?: TextUtils.TextRange.TextRange | null;
    styleSheetId?: Protocol.DOM.StyleSheetId;
    protected cssModel: CSSModel;
    constructor(cssModel: CSSModel);
    protected abstract reinitialize(payload: CSSQueryPayload): void;
    abstract active(): boolean;
    rebase(edit: Edit): void;
    equal(other: CSSQuery): boolean;
    lineNumberInSource(): number | undefined;
    columnNumberInSource(): number | undefined;
    header(): CSSStyleSheetHeader | null;
    rawLocation(): CSSLocation | null;
}
export {};
