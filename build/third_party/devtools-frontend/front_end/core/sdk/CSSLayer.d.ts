import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
export declare class CSSLayer extends CSSQuery {
    static parseLayerPayload(cssModel: CSSModel, payload: Protocol.CSS.CSSLayer[]): CSSLayer[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSLayer);
    reinitialize(payload: Protocol.CSS.CSSLayer): void;
    active(): boolean;
}
