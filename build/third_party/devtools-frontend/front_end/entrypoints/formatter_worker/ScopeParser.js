// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Acorn from '../../third_party/acorn/acorn.js';
import { ECMA_VERSION } from './AcornTokenizer.js';
export function parseScopes(expression, sourceType = 'script') {
    // Parse the expression and find variables and scopes.
    let root = null;
    try {
        root = Acorn.parse(expression, {
            ecmaVersion: ECMA_VERSION,
            allowAwaitOutsideFunction: true,
            checkPrivateFields: false,
            ranges: false,
            sourceType,
        });
    }
    catch {
        return null;
    }
    return new ScopeVariableAnalysis(root, expression).run();
}
export class Scope {
    variables = new Map();
    parent;
    start;
    end;
    kind;
    name;
    nameMappingLocations;
    children = [];
    constructor(start, end, parent, kind, name, nameMappingLocations) {
        this.start = start;
        this.end = end;
        this.parent = parent;
        this.kind = kind;
        this.name = name;
        this.nameMappingLocations = nameMappingLocations;
        if (parent) {
            parent.children.push(this);
        }
    }
    export() {
        const variables = [];
        for (const variable of this.variables) {
            const offsets = [];
            for (const use of variable[1].uses) {
                offsets.push(use.offset);
            }
            variables.push({ name: variable[0], kind: variable[1].definitionKind, offsets });
        }
        const children = this.children.map(c => c.export());
        return {
            start: this.start,
            end: this.end,
            variables,
            kind: this.kind,
            name: this.name,
            nameMappingLocations: this.nameMappingLocations,
            children,
        };
    }
    addVariable(name, offset, definitionKind, isShorthandAssignmentProperty) {
        const variable = this.variables.get(name);
        const use = { offset, scope: this, isShorthandAssignmentProperty };
        if (!variable) {
            this.variables.set(name, { definitionKind, uses: [use] });
            return;
        }
        if (variable.definitionKind === 0 /* DefinitionKind.NONE */) {
            variable.definitionKind = definitionKind;
        }
        variable.uses.push(use);
    }
    findBinders(name) {
        const result = [];
        let scope = this;
        while (scope !== null) {
            const defUse = scope.variables.get(name);
            if (defUse && defUse.definitionKind !== 0 /* DefinitionKind.NONE */) {
                result.push(defUse);
            }
            scope = scope.parent;
        }
        return result;
    }
    #mergeChildDefUses(name, defUses) {
        const variable = this.variables.get(name);
        if (!variable) {
            this.variables.set(name, defUses);
            return;
        }
        variable.uses.push(...defUses.uses);
        if (defUses.definitionKind === 2 /* DefinitionKind.VAR */) {
            console.assert(variable.definitionKind !== 1 /* DefinitionKind.LET */);
            if (variable.definitionKind === 0 /* DefinitionKind.NONE */) {
                variable.definitionKind = defUses.definitionKind;
            }
        }
        else {
            console.assert(defUses.definitionKind === 0 /* DefinitionKind.NONE */);
        }
    }
    finalizeToParent(isFunctionScope) {
        if (!this.parent) {
            console.error('Internal error: wrong nesting in scope analysis.');
            throw new Error('Internal error');
        }
        // Move all unbound variables to the parent (also move var-bound variables
        // if the parent is not a function).
        const keysToRemove = [];
        for (const [name, defUse] of this.variables.entries()) {
            if (defUse.definitionKind === 0 /* DefinitionKind.NONE */ ||
                (defUse.definitionKind === 2 /* DefinitionKind.VAR */ && !isFunctionScope)) {
                this.parent.#mergeChildDefUses(name, defUse);
                keysToRemove.push(name);
            }
        }
        keysToRemove.forEach(k => this.variables.delete(k));
    }
}
export class ScopeVariableAnalysis {
    #rootScope;
    #allNames = new Set();
    #currentScope;
    #rootNode;
    #sourceText;
    #methodName;
    #additionalMappingLocations = [];
    constructor(node, sourceText) {
        this.#rootNode = node;
        this.#sourceText = sourceText;
        this.#rootScope = new Scope(node.start, node.end, null, 3 /* ScopeKind.GLOBAL */);
        this.#currentScope = this.#rootScope;
    }
    run() {
        this.#processNode(this.#rootNode);
        return this.#rootScope;
    }
    #processNode(node) {
        if (node === null) {
            return;
        }
        switch (node.type) {
            case 'AwaitExpression':
                this.#processNode(node.argument);
                break;
            case 'ArrayExpression':
                node.elements.forEach(item => this.#processNode(item));
                break;
            case 'ExpressionStatement':
                this.#processNode(node.expression);
                break;
            case 'Program':
                console.assert(this.#currentScope === this.#rootScope);
                node.body.forEach(item => this.#processNode(item));
                console.assert(this.#currentScope === this.#rootScope);
                break;
            case 'ArrayPattern':
                node.elements.forEach(item => this.#processNode(item));
                break;
            case 'ArrowFunctionExpression': {
                this.#pushScope(node.start, node.end, 4 /* ScopeKind.ARROW_FUNCTION */, undefined, mappingLocationsForArrowFunctions(node, this.#sourceText));
                node.params.forEach(this.#processNodeAsDefinition.bind(this, 2 /* DefinitionKind.VAR */, false));
                if (node.body.type === 'BlockStatement') {
                    // Include the body of the arrow function in the same scope as the arguments.
                    node.body.body.forEach(this.#processNode.bind(this));
                }
                else {
                    this.#processNode(node.body);
                }
                this.#popScope(true);
                break;
            }
            case 'AssignmentExpression':
            case 'AssignmentPattern':
            case 'BinaryExpression':
            case 'LogicalExpression':
                this.#processNode(node.left);
                this.#processNode(node.right);
                break;
            case 'BlockStatement':
                this.#pushScope(node.start, node.end, 1 /* ScopeKind.BLOCK */);
                node.body.forEach(this.#processNode.bind(this));
                this.#popScope(false);
                break;
            case 'CallExpression':
                this.#processNode(node.callee);
                node.arguments.forEach(this.#processNode.bind(this));
                break;
            case 'VariableDeclaration': {
                const definitionKind = node.kind === 'var' ? 2 /* DefinitionKind.VAR */ : 1 /* DefinitionKind.LET */;
                node.declarations.forEach(this.#processVariableDeclarator.bind(this, definitionKind));
                break;
            }
            case 'CatchClause':
                this.#pushScope(node.start, node.end, 1 /* ScopeKind.BLOCK */);
                this.#processNodeAsDefinition(1 /* DefinitionKind.LET */, false, node.param);
                this.#processNode(node.body);
                this.#popScope(false);
                break;
            case 'ClassBody':
                node.body.forEach(this.#processNode.bind(this));
                break;
            case 'ClassDeclaration':
                this.#processNodeAsDefinition(1 /* DefinitionKind.LET */, false, node.id);
                this.#processNode(node.superClass ?? null);
                this.#processNode(node.body);
                break;
            case 'ClassExpression':
                // Intentionally ignore the id.
                this.#processNode(node.superClass ?? null);
                this.#processNode(node.body);
                break;
            case 'ChainExpression':
                this.#processNode(node.expression);
                break;
            case 'ConditionalExpression':
                this.#processNode(node.test);
                this.#processNode(node.consequent);
                this.#processNode(node.alternate);
                break;
            case 'DoWhileStatement':
                this.#processNode(node.body);
                this.#processNode(node.test);
                break;
            case 'ForInStatement':
            case 'ForOfStatement':
                this.#pushScope(node.start, node.end, 1 /* ScopeKind.BLOCK */);
                this.#processNode(node.left);
                this.#processNode(node.right);
                this.#processNode(node.body);
                this.#popScope(false);
                break;
            case 'ForStatement':
                this.#pushScope(node.start, node.end, 1 /* ScopeKind.BLOCK */);
                this.#processNode(node.init ?? null);
                this.#processNode(node.test ?? null);
                this.#processNode(node.update ?? null);
                this.#processNode(node.body);
                this.#popScope(false);
                break;
            case 'FunctionDeclaration':
                this.#processNodeAsDefinition(2 /* DefinitionKind.VAR */, false, node.id);
                this.#pushScope(node.id?.end ?? node.start, node.end, 2 /* ScopeKind.FUNCTION */, node.id.name, mappingLocationsForFunctionDeclaration(node, this.#sourceText));
                this.#addVariable('this', node.start, 3 /* DefinitionKind.FIXED */);
                this.#addVariable('arguments', node.start, 3 /* DefinitionKind.FIXED */);
                node.params.forEach(this.#processNodeAsDefinition.bind(this, 1 /* DefinitionKind.LET */, false));
                // Process the body of the block statement directly to avoid creating new scope.
                node.body.body.forEach(this.#processNode.bind(this));
                this.#popScope(true);
                break;
            case 'FunctionExpression':
                this.#pushScope(node.id?.end ?? node.start, node.end, 2 /* ScopeKind.FUNCTION */, this.#methodName ?? node.id?.name, [...this.#additionalMappingLocations, ...mappingLocationsForFunctionExpression(node, this.#sourceText)]);
                this.#additionalMappingLocations = [];
                this.#methodName = undefined;
                this.#addVariable('this', node.start, 3 /* DefinitionKind.FIXED */);
                this.#addVariable('arguments', node.start, 3 /* DefinitionKind.FIXED */);
                node.params.forEach(this.#processNodeAsDefinition.bind(this, 1 /* DefinitionKind.LET */, false));
                // Process the body of the block statement directly to avoid creating new scope.
                node.body.body.forEach(this.#processNode.bind(this));
                this.#popScope(true);
                break;
            case 'Identifier':
                this.#addVariable(node.name, node.start);
                break;
            case 'IfStatement':
                this.#processNode(node.test);
                this.#processNode(node.consequent);
                this.#processNode(node.alternate ?? null);
                break;
            case 'LabeledStatement':
                this.#processNode(node.body);
                break;
            case 'MetaProperty':
                break;
            case 'MethodDefinition':
                if (node.computed) {
                    this.#processNode(node.key);
                }
                else {
                    this.#additionalMappingLocations = mappingLocationsForMethodDefinition(node);
                    this.#methodName = nameForMethodDefinition(node);
                }
                this.#processNode(node.value);
                break;
            case 'NewExpression':
                this.#processNode(node.callee);
                node.arguments.forEach(this.#processNode.bind(this));
                break;
            case 'MemberExpression':
                this.#processNode(node.object);
                if (node.computed) {
                    this.#processNode(node.property);
                }
                break;
            case 'ObjectExpression':
                node.properties.forEach(this.#processNode.bind(this));
                break;
            case 'ObjectPattern':
                node.properties.forEach(this.#processNode.bind(this));
                break;
            case 'PrivateIdentifier':
                break;
            case 'PropertyDefinition':
                if (node.computed) {
                    this.#processNode(node.key);
                }
                this.#processNode(node.value ?? null);
                break;
            case 'Property':
                if (node.shorthand) {
                    console.assert(node.value.type === 'Identifier');
                    console.assert(node.key.type === 'Identifier');
                    console.assert(node.value.name === node.key.name);
                    this.#addVariable(node.value.name, node.value.start, 0 /* DefinitionKind.NONE */, true);
                }
                else {
                    if (node.computed) {
                        this.#processNode(node.key);
                    }
                    else if (node.value.type === 'FunctionExpression') {
                        this.#additionalMappingLocations = mappingLocationsForMethodDefinition(node);
                        this.#methodName = nameForMethodDefinition(node);
                    }
                    this.#processNode(node.value);
                }
                break;
            case 'RestElement':
                this.#processNodeAsDefinition(1 /* DefinitionKind.LET */, false, node.argument);
                break;
            case 'ReturnStatement':
                this.#processNode(node.argument ?? null);
                break;
            case 'SequenceExpression':
                node.expressions.forEach(this.#processNode.bind(this));
                break;
            case 'SpreadElement':
                this.#processNode(node.argument);
                break;
            case 'SwitchCase':
                this.#processNode(node.test ?? null);
                node.consequent.forEach(this.#processNode.bind(this));
                break;
            case 'SwitchStatement':
                this.#processNode(node.discriminant);
                node.cases.forEach(this.#processNode.bind(this));
                break;
            case 'TaggedTemplateExpression':
                this.#processNode(node.tag);
                this.#processNode(node.quasi);
                break;
            case 'TemplateLiteral':
                node.expressions.forEach(this.#processNode.bind(this));
                break;
            case 'ThisExpression':
                this.#addVariable('this', node.start);
                break;
            case 'ThrowStatement':
                this.#processNode(node.argument);
                break;
            case 'TryStatement':
                this.#processNode(node.block);
                this.#processNode(node.handler ?? null);
                this.#processNode(node.finalizer ?? null);
                break;
            case 'WithStatement':
                this.#processNode(node.object);
                // TODO jarin figure how to treat the with body.
                this.#processNode(node.body);
                break;
            case 'YieldExpression':
                this.#processNode(node.argument ?? null);
                break;
            case 'UnaryExpression':
            case 'UpdateExpression':
                this.#processNode(node.argument);
                break;
            case 'WhileStatement':
                this.#processNode(node.test);
                this.#processNode(node.body);
                break;
            // Ignore, no expressions involved.
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'DebuggerStatement':
            case 'EmptyStatement':
            case 'Literal':
            case 'Super':
            case 'TemplateElement':
                break;
            // Ignore, cannot be used outside of a module.
            case 'ImportDeclaration':
            case 'ImportDefaultSpecifier':
            case 'ImportNamespaceSpecifier':
            case 'ImportSpecifier':
            case 'ImportExpression':
            case 'ExportAllDeclaration':
            case 'ExportDefaultDeclaration':
            case 'ExportNamedDeclaration':
            case 'ExportSpecifier':
                break;
            case 'VariableDeclarator':
                console.error('Should not encounter VariableDeclarator in general traversal.');
                break;
        }
    }
    getFreeVariables() {
        const result = new Map();
        for (const [name, defUse] of this.#rootScope.variables) {
            if (defUse.definitionKind !== 0 /* DefinitionKind.NONE */) {
                // Skip bound variables.
                continue;
            }
            result.set(name, defUse.uses);
        }
        return result;
    }
    getAllNames() {
        return this.#allNames;
    }
    #pushScope(start, end, kind, name, nameMappingLocations) {
        this.#currentScope = new Scope(start, end, this.#currentScope, kind, name, nameMappingLocations);
    }
    #popScope(isFunctionContext) {
        if (this.#currentScope.parent === null) {
            console.error('Internal error: wrong nesting in scope analysis.');
            throw new Error('Internal error');
        }
        this.#currentScope.finalizeToParent(isFunctionContext);
        this.#currentScope = this.#currentScope.parent;
    }
    #addVariable(name, offset, definitionKind = 0 /* DefinitionKind.NONE */, isShorthandAssignmentProperty = false) {
        this.#allNames.add(name);
        this.#currentScope.addVariable(name, offset, definitionKind, isShorthandAssignmentProperty);
    }
    #processNodeAsDefinition(definitionKind, isShorthandAssignmentProperty, node) {
        if (node === null) {
            return;
        }
        switch (node.type) {
            case 'ArrayPattern':
                node.elements.forEach(this.#processNodeAsDefinition.bind(this, definitionKind, false));
                break;
            case 'AssignmentPattern':
                this.#processNodeAsDefinition(definitionKind, isShorthandAssignmentProperty, node.left);
                this.#processNode(node.right);
                break;
            case 'Identifier':
                this.#addVariable(node.name, node.start, definitionKind, isShorthandAssignmentProperty);
                break;
            case 'MemberExpression':
                this.#processNode(node.object);
                if (node.computed) {
                    this.#processNode(node.property);
                }
                break;
            case 'ObjectPattern':
                node.properties.forEach(this.#processNodeAsDefinition.bind(this, definitionKind, false));
                break;
            case 'Property':
                if (node.computed) {
                    this.#processNode(node.key);
                }
                this.#processNodeAsDefinition(definitionKind, node.shorthand, node.value);
                break;
            case 'RestElement':
                this.#processNodeAsDefinition(definitionKind, false, node.argument);
                break;
        }
    }
    #processVariableDeclarator(definitionKind, decl) {
        this.#processNodeAsDefinition(definitionKind, false, decl.id);
        this.#processNode(decl.init ?? null);
    }
}
function mappingLocationsForFunctionDeclaration(node, sourceText) {
    // For function declarations we prefer the position of the identifier as per spec, but we'll also return
    // the beginning of the opening parenthesis '('.
    const result = [node.id.start];
    const searchParenEndPos = node.params.length ? node.params[0].start : node.body.start;
    const parenPos = indexOfCharInBounds(sourceText, '(', node.id.end, searchParenEndPos);
    if (parenPos >= 0) {
        // Note that this is not 100% accurate as there might be a comment containing a open parenthesis between
        // the identifier the and the argument list (unlikely though).
        result.push(parenPos);
    }
    return result;
}
function mappingLocationsForFunctionExpression(node, sourceText) {
    // For function expressions we prefer the position of the identifier or '(' if none is present, as per spec.
    const result = [];
    if (node.id) {
        result.push(node.id.start);
    }
    const searchParenStartPos = node.id ? node.id.end : node.start;
    const searchParenEndPos = node.params.length ? node.params[0].start : node.body.start;
    const parenPos = indexOfCharInBounds(sourceText, '(', searchParenStartPos, searchParenEndPos);
    if (parenPos >= 0) {
        // Note that this is not 100% accurate as there might be a comment containing a open parenthesis between
        // the identifier the and the argument list (unlikely though).
        result.push(parenPos);
    }
    return result;
}
function mappingLocationsForMethodDefinition(node) {
    // Method definitions use a FunctionExpression as their "value" child. So we only
    // record the start of the "key" here and let 'mappingLocationsForFunctionExpression' handle
    // the parenthesis.
    if (node.key.type === 'Identifier' || node.key.type === 'PrivateIdentifier') {
        const id = node.key;
        return [id.start];
    }
    return [];
}
function nameForMethodDefinition(node) {
    if (node.key.type === 'Identifier') {
        return node.key.name;
    }
    if (node.key.type === 'PrivateIdentifier') {
        return '#' + node.key.name;
    }
    return undefined;
}
function mappingLocationsForArrowFunctions(node, sourceText) {
    // For arrow functions we use the `(' parenthesis if present, and the `=>` arrow as per spec.
    // Both are not 100% accurate as acorn doesn't tell us their location so we have to search, which is brittle.
    const result = [];
    const searchParenStartPos = node.async ? node.start + 5 : node.start;
    const searchParenEndPos = node.params.length ? node.params[0].start : node.body.start;
    const parenPos = indexOfCharInBounds(sourceText, '(', searchParenStartPos, searchParenEndPos);
    if (parenPos >= 0) {
        result.push(parenPos);
    }
    const searchArrowStartPos = node.params.length ? node.params[node.params.length - 1].end : node.start;
    const arrowPos = indexOfCharInBounds(sourceText, '=', searchArrowStartPos, node.body.start);
    if (arrowPos >= 0 && sourceText[arrowPos + 1] === '>') {
        result.push(arrowPos);
    }
    return result;
}
function indexOfCharInBounds(str, needle, start, end) {
    for (let i = start; i < end; ++i) {
        if (str[i] === needle) {
            return i;
        }
    }
    return -1;
}
//# sourceMappingURL=ScopeParser.js.map