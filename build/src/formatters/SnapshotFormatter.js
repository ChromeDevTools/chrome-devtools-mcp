/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export class SnapshotFormatter {
    #snapshot;
    constructor(snapshot) {
        this.#snapshot = snapshot;
    }
    toString() {
        const chunks = [];
        const root = this.#snapshot.root;
        // Top-level content of the snapshot.
        if (!this.#snapshot.verbose &&
            this.#snapshot.hasSelectedElement &&
            !this.#snapshot.selectedElementUid) {
            chunks.push(`Note: there is a selected element in the DevTools Elements panel but it is not included into the current a11y tree snapshot.
Get a verbose snapshot to include all elements if you are interested in the selected element.\n\n`);
        }
        chunks.push(this.#formatNode(root, 0));
        return chunks.join('');
    }
    toJSON() {
        return this.#nodeToJSON(this.#snapshot.root);
    }
    #formatNode(node, depth = 0) {
        const chunks = [];
        const attributes = this.#getAttributes(node);
        const line = ' '.repeat(depth * 2) +
            attributes.join(' ') +
            (node.id === this.#snapshot.selectedElementUid
                ? ' [selected in the DevTools Elements panel]'
                : '') +
            '\n';
        chunks.push(line);
        if (!this.#hasRedundantTextChildren(node)) {
            for (const child of node.children) {
                chunks.push(this.#formatNode(child, depth + 1));
            }
        }
        return chunks.join('');
    }
    #hasRedundantTextChildren(node) {
        if (this.#snapshot.verbose || !node.name || node.children.length === 0) {
            return false;
        }
        let text = '';
        for (const child of node.children) {
            if (child.role !== 'StaticText' ||
                child.children.length !== 0 ||
                child.id === this.#snapshot.selectedElementUid) {
                return false;
            }
            text += child.name ?? '';
        }
        return stripWhitespace(text) === stripWhitespace(node.name);
    }
    #nodeToJSON(node) {
        const rawAttrs = this.#getAttributesMap(node);
        const children = node.children.map(child => this.#nodeToJSON(child));
        const result = structuredClone(rawAttrs);
        if (children.length > 0) {
            result.children = children;
        }
        return result;
    }
    #getAttributes(serializedAXNodeRoot) {
        const attributes = [`uid=${serializedAXNodeRoot.id}`];
        if (serializedAXNodeRoot.role &&
            serializedAXNodeRoot.role !== 'StaticText') {
            attributes.push(serializedAXNodeRoot.role === 'none'
                ? 'ignored'
                : serializedAXNodeRoot.role);
        }
        if (serializedAXNodeRoot.name) {
            attributes.push(`"${serializedAXNodeRoot.name}"`);
        }
        const simpleAttrs = this.#getAttributesMap(serializedAXNodeRoot, 
        /* excludeSpecial */ true);
        const isOption = serializedAXNodeRoot.role === 'option';
        for (const attr of Object.keys(serializedAXNodeRoot).sort()) {
            if (excludedAttributes.has(attr)) {
                continue;
            }
            const mapped = booleanPropertyMap[attr];
            if (mapped &&
                simpleAttrs[mapped] &&
                !(isOption && mapped === 'selectable')) {
                attributes.push(mapped);
            }
            const val = simpleAttrs[attr];
            if (isOption && attr === 'value' && val === serializedAXNodeRoot.name) {
                continue;
            }
            if (val === true) {
                attributes.push(attr);
            }
            else if (typeof val === 'string' || typeof val === 'number') {
                attributes.push(`${attr}="${val}"`);
            }
        }
        return attributes;
    }
    #getAttributesMap(node, excludeSpecial = false) {
        const result = {};
        if (!excludeSpecial) {
            result.id = node.id;
            if (node.role) {
                result.role = node.role;
            }
            if (node.name) {
                result.name = node.name;
            }
        }
        // Re-implementing the exact logic from original function for #getAttributes to be safe:
        return {
            ...result,
            ...this.#extractedAttributes(node),
        };
    }
    #extractedAttributes(node) {
        const result = {};
        for (const attr of Object.keys(node).sort()) {
            if (excludedAttributes.has(attr)) {
                continue;
            }
            const value = node[attr];
            if (typeof value === 'boolean') {
                if (booleanPropertyMap[attr]) {
                    result[booleanPropertyMap[attr]] = true;
                }
                if (value) {
                    result[attr] = true;
                }
            }
            else if (typeof value === 'string' || typeof value === 'number') {
                result[attr] = value;
            }
        }
        return result;
    }
}
const booleanPropertyMap = {
    disabled: 'disableable',
    expanded: 'expandable',
    focused: 'focusable',
    selected: 'selectable',
};
const excludedAttributes = new Set([
    'id',
    'role',
    'name',
    'elementHandle',
    'children',
    'backendNodeId',
    'loaderId',
]);
function stripWhitespace(text) {
    return text.replace(/\s+/g, '');
}
//# sourceMappingURL=SnapshotFormatter.js.map