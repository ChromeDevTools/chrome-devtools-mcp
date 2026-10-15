// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as TextUtils from '../text_utils/text_utils.js';
import { CSSQuery } from './CSSQuery.js';
export class CSSContainerQuery extends CSSQuery {
    name;
    physicalAxes;
    logicalAxes;
    queriesScrollState;
    queriesAnchored;
    textIsConditionText;
    static parseContainerQueriesPayload(cssModel, payload) {
        return payload.map(cq => new CSSContainerQuery(cssModel, cq));
    }
    constructor(cssModel, payload) {
        super(cssModel);
        this.reinitialize(payload);
    }
    reinitialize(payload) {
        this.textIsConditionText = !!payload.conditionText;
        this.text = this.textIsConditionText ? payload.conditionText : payload.text;
        this.range = payload.range ? TextUtils.TextRange.TextRange.fromObject(payload.range) : null;
        this.styleSheetId = payload.styleSheetId;
        this.name = payload.name;
        this.physicalAxes = payload.physicalAxes;
        this.logicalAxes = payload.logicalAxes;
        this.queriesScrollState = payload.queriesScrollState;
        this.queriesAnchored = payload.queriesAnchored;
    }
    active() {
        return true;
    }
    async getContainerForNode(nodeId) {
        const containerNode = await this.cssModel.domModel().getContainerForNode(nodeId, this.name, this.physicalAxes, this.logicalAxes, this.queriesScrollState, this.queriesAnchored);
        if (!containerNode) {
            return;
        }
        return new CSSContainerQueryContainer(containerNode);
    }
}
export class CSSContainerQueryContainer {
    containerNode;
    constructor(containerNode) {
        this.containerNode = containerNode;
    }
    async getContainerSizeDetails() {
        const styles = await this.containerNode.domModel().cssModel().getComputedStyle(this.containerNode.id);
        if (!styles) {
            return;
        }
        const containerType = styles.get('container-type');
        const writingMode = styles.get('writing-mode');
        if (!containerType || !writingMode) {
            return;
        }
        const queryAxis = getQueryAxisFromContainerType(`${containerType}`);
        const physicalAxis = getPhysicalAxisFromQueryAxis(queryAxis, writingMode);
        let width, height;
        if (physicalAxis === "Both" /* PhysicalAxis.BOTH */ || physicalAxis === "Horizontal" /* PhysicalAxis.HORIZONTAL */) {
            width = styles.get('width');
        }
        if (physicalAxis === "Both" /* PhysicalAxis.BOTH */ || physicalAxis === "Vertical" /* PhysicalAxis.VERTICAL */) {
            height = styles.get('height');
        }
        return {
            queryAxis,
            physicalAxis,
            width,
            height,
        };
    }
}
export const getQueryAxisFromContainerType = (propertyValue) => {
    const segments = propertyValue.split(' ');
    let isInline = false;
    for (const segment of segments) {
        if (segment === 'size') {
            return "size" /* QueryAxis.BOTH */;
        }
        isInline = isInline || segment === 'inline-size';
    }
    if (isInline) {
        return "inline-size" /* QueryAxis.INLINE */;
    }
    return "" /* QueryAxis.NONE */;
};
export const getPhysicalAxisFromQueryAxis = (queryAxis, writingMode) => {
    const isVerticalWritingMode = writingMode.startsWith('vertical');
    switch (queryAxis) {
        case "" /* QueryAxis.NONE */:
            return "" /* PhysicalAxis.NONE */;
        case "size" /* QueryAxis.BOTH */:
            return "Both" /* PhysicalAxis.BOTH */;
        case "inline-size" /* QueryAxis.INLINE */:
            return isVerticalWritingMode ? "Vertical" /* PhysicalAxis.VERTICAL */ : "Horizontal" /* PhysicalAxis.HORIZONTAL */;
        case "block-size" /* QueryAxis.BLOCK */:
            return isVerticalWritingMode ? "Horizontal" /* PhysicalAxis.HORIZONTAL */ : "Vertical" /* PhysicalAxis.VERTICAL */;
    }
};
//# sourceMappingURL=CSSContainerQuery.js.map