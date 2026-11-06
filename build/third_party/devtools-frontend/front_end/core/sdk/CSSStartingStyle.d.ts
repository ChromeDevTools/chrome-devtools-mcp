import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
export declare class CSSStartingStyle extends CSSQuery {
    static parseStartingStylePayload(cssModel: CSSModel, payload: Protocol.CSS.CSSStartingStyle[]): CSSStartingStyle[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSStartingStyle);
    reinitialize(payload: Protocol.CSS.CSSStartingStyle): void;
    active(): boolean;
}
