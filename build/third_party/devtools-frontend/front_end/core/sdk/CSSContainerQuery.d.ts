import type * as Protocol from '../../generated/protocol.js';
import type { CSSModel } from './CSSModel.js';
import { CSSQuery } from './CSSQuery.js';
import type { DOMNode } from './DOMModel.js';
export declare class CSSContainerQuery extends CSSQuery {
    name?: string;
    physicalAxes?: Protocol.DOM.PhysicalAxes;
    logicalAxes?: Protocol.DOM.LogicalAxes;
    queriesScrollState?: boolean;
    queriesAnchored?: boolean;
    textIsConditionText?: boolean;
    static parseContainerQueriesPayload(cssModel: CSSModel, payload: Protocol.CSS.CSSContainerQuery[]): CSSContainerQuery[];
    constructor(cssModel: CSSModel, payload: Protocol.CSS.CSSContainerQuery);
    reinitialize(payload: Protocol.CSS.CSSContainerQuery): void;
    active(): boolean;
    getContainerForNode(nodeId: Protocol.DOM.NodeId): Promise<CSSContainerQueryContainer | undefined>;
}
export declare class CSSContainerQueryContainer {
    readonly containerNode: DOMNode;
    constructor(containerNode: DOMNode);
    getContainerSizeDetails(): Promise<ContainerQueriedSizeDetails | undefined>;
}
export declare const getQueryAxisFromContainerType: (propertyValue: string) => QueryAxis;
export declare const getPhysicalAxisFromQueryAxis: (queryAxis: QueryAxis, writingMode: string) => PhysicalAxis;
export interface ContainerQueriedSizeDetails {
    queryAxis: QueryAxis;
    physicalAxis: PhysicalAxis;
    width?: string;
    height?: string;
}
export declare const enum QueryAxis {
    NONE = "",
    INLINE = "inline-size",
    BLOCK = "block-size",
    BOTH = "size"
}
export declare const enum PhysicalAxis {
    NONE = "",
    HORIZONTAL = "Horizontal",
    VERTICAL = "Vertical",
    BOTH = "Both"
}
