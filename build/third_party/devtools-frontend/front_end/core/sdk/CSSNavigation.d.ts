import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
export declare class CSSNavigation extends CSSQuery {
    #private;
    static parseNavigationPayload(cssModel: CSSModel, payload: Protocol.CSS.CSSNavigation[]): CSSNavigation[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSNavigation);
    reinitialize(payload: Protocol.CSS.CSSNavigation): void;
    active(): boolean;
}
