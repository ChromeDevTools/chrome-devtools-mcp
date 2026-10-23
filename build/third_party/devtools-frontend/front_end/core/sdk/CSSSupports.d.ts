import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
export declare class CSSSupports extends CSSQuery {
    #private;
    static parseSupportsPayload(cssModel: CSSModel, payload: Protocol.CSS.CSSSupports[]): CSSSupports[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSSupports);
    reinitialize(payload: Protocol.CSS.CSSSupports): void;
    active(): boolean;
}
