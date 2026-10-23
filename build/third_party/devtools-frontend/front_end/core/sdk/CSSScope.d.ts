import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
export declare class CSSScope extends CSSQuery {
    static parseScopesPayload(cssModel: CSSModel, payload: Protocol.CSS.CSSScope[]): CSSScope[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSScope);
    reinitialize(payload: Protocol.CSS.CSSScope): void;
    active(): boolean;
}
