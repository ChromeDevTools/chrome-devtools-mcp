// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../../core/i18n/i18n.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { ConversationContext, } from '../agents/AiAgent.js';
const UIStringsNotTranslate = {
    /**
     * @description Heading text for context details of DevTools AI Agent.
     */
    dataUsed: 'Data used',
};
const lockedString = i18n.i18n.lockedString;
export class DOMNodeContext extends ConversationContext {
    jslogContext = 'ai-context-dom-node';
    #node;
    #opaqueOrigin;
    constructor(node) {
        super();
        this.#node = node;
    }
    /**
     * Returns the security origin of the node's owner document.
     *
     * If the node is detached from a document, returns a unique opaque origin to
     * prevent unauthorized cross-origin access in AI conversations.
     *
     * @returns The security origin of the owner document, or a unique opaque origin.
     */
    getOrigin() {
        const origin = this.#node.securityOrigin();
        if (!origin) {
            // A node that is not attached to a document has no origin; isolate it with a unique opaque origin.
            if (!this.#opaqueOrigin) {
                this.#opaqueOrigin = SDK.SecurityOrigin.SecurityOrigin.createUniqueOpaque();
            }
            return this.#opaqueOrigin;
        }
        return origin;
    }
    getItem() {
        return this.#node;
    }
    getTitle() {
        throw new Error('Not implemented');
    }
    async getSuggestions() {
        const layoutProps = await this.#node.domModel().cssModel().getLayoutPropertiesFromComputedStyle(this.#node.id);
        if (!layoutProps) {
            return;
        }
        if (layoutProps.isFlex) {
            return [
                { title: 'How can I make flex items wrap?', jslogContext: 'flex-wrap' },
                { title: 'How do I distribute flex items evenly?', jslogContext: 'flex-distribute' },
                { title: 'What is flexbox?', jslogContext: 'flex-what' },
            ];
        }
        if (layoutProps.isSubgrid) {
            return [
                { title: 'Where is this grid defined?', jslogContext: 'subgrid-where' },
                { title: 'How to overwrite parent grid properties?', jslogContext: 'subgrid-override' },
                { title: 'How do subgrids work? ', jslogContext: 'subgrid-how' },
            ];
        }
        if (layoutProps.isGrid) {
            return [
                { title: 'How do I align items in a grid?', jslogContext: 'grid-align' },
                { title: 'How to add spacing between grid items?', jslogContext: 'grid-gap' },
                { title: 'How does grid layout work?', jslogContext: 'grid-how' },
            ];
        }
        if (layoutProps.hasScroll) {
            return [
                { title: 'How do I remove scrollbars for this element?', jslogContext: 'scroll-remove' },
                { title: 'How can I style a scrollbar?', jslogContext: 'scroll-style' },
                { title: 'Why does this element scroll?', jslogContext: 'scroll-why' },
            ];
        }
        if (layoutProps.containerType) {
            return [
                { title: 'What are container queries?', jslogContext: 'container-what' },
                { title: 'How do I use container-type?', jslogContext: 'container-how' },
                { title: 'What\'s the container context for this element?', jslogContext: 'container-context' },
            ];
        }
        return;
    }
    async getPromptDetails() {
        return `# Inspected element

${await this.describe()}`;
    }
    async getUserFacingDetails() {
        return [
            {
                title: lockedString(UIStringsNotTranslate.dataUsed),
                text: await this.describe(),
            },
        ];
    }
    async describe() {
        const element = this.#node;
        let output = `* Element's uid is ${element.backendNodeId()}.
* Its selector is \`${element.simpleSelector()}\``;
        const childNodes = await element.getChildNodesPromise();
        if (childNodes) {
            const textChildNodes = childNodes.filter(childNode => childNode.nodeType() === 3 /* SDK.DOMModel.NodeType.TEXT_NODE */);
            const elementChildNodes = childNodes.filter(childNode => childNode.nodeType() === 1 /* SDK.DOMModel.NodeType.ELEMENT_NODE */);
            switch (elementChildNodes.length) {
                case 0:
                    output += '\n* It doesn\'t have any child element nodes';
                    break;
                case 1:
                    output += `\n* It only has 1 child element node: \`${elementChildNodes[0].simpleSelector()}\``;
                    break;
                default:
                    output += `\n* It has ${elementChildNodes.length} child element nodes: ${elementChildNodes.map(node => `\`${node.simpleSelector()}\` (uid=${node.backendNodeId()})`).join(', ')}`;
            }
            switch (textChildNodes.length) {
                case 0:
                    output += '\n* It doesn\'t have any child text nodes';
                    break;
                case 1:
                    output += '\n* It only has 1 child text node';
                    break;
                default:
                    output += `\n* It has ${textChildNodes.length} child text nodes`;
            }
        }
        if (element.nextSibling) {
            const elementOrNodeElementNodeText = element.nextSibling.nodeType() === 1 /* SDK.DOMModel.NodeType.ELEMENT_NODE */ ?
                `an element (uid=${element.nextSibling.backendNodeId()})` :
                'a non element';
            output += `\n* It has a next sibling and it is ${elementOrNodeElementNodeText} node`;
        }
        if (element.previousSibling) {
            const elementOrNodeElementNodeText = element.previousSibling.nodeType() === 1 /* SDK.DOMModel.NodeType.ELEMENT_NODE */ ?
                `an element (uid=${element.previousSibling.backendNodeId()})` :
                'a non element';
            output += `\n* It has a previous sibling and it is ${elementOrNodeElementNodeText} node`;
        }
        if (element.isInShadowTree()) {
            output += '\n* It is in a shadow DOM tree.';
        }
        const parentNode = element.parentNode;
        if (parentNode) {
            const parentChildrenNodes = await parentNode.getChildNodesPromise();
            output += `\n* Its parent's selector is \`${parentNode.simpleSelector()}\` (uid=${parentNode.backendNodeId()})`;
            const elementOrNodeElementNodeText = parentNode.nodeType() === 1 /* SDK.DOMModel.NodeType.ELEMENT_NODE */ ? 'an element' : 'a non element';
            output += `\n* Its parent is ${elementOrNodeElementNodeText} node`;
            if (parentNode.isShadowRoot()) {
                output += '\n* Its parent is a shadow root.';
            }
            if (parentChildrenNodes) {
                const childElementNodes = parentChildrenNodes.filter(siblingNode => siblingNode.nodeType() === 1 /* SDK.DOMModel.NodeType.ELEMENT_NODE */);
                switch (childElementNodes.length) {
                    case 0:
                        break;
                    case 1:
                        output += '\n* Its parent has only 1 child element node';
                        break;
                    default:
                        output += `\n* Its parent has ${childElementNodes.length} child element nodes: ${childElementNodes.map(node => `\`${node.simpleSelector()}\` (uid=${node.backendNodeId()})`)
                            .join(', ')}`;
                        break;
                }
                const siblingTextNodes = parentChildrenNodes.filter(siblingNode => siblingNode.nodeType() === 3 /* SDK.DOMModel.NodeType.TEXT_NODE */);
                switch (siblingTextNodes.length) {
                    case 0:
                        break;
                    case 1:
                        output += '\n* Its parent has only 1 child text node';
                        break;
                    default:
                        output += `\n* Its parent has ${siblingTextNodes.length} child text nodes: ${siblingTextNodes.map(node => `\`${node.simpleSelector()}\``).join(', ')}`;
                        break;
                }
            }
        }
        return output.trim();
    }
}
//# sourceMappingURL=DOMNodeContext.js.map