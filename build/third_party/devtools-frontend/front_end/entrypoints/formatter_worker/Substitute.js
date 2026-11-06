// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Acorn from '../../third_party/acorn/acorn.js';
import { ECMA_VERSION } from './AcornTokenizer.js';
import { ScopeVariableAnalysis } from './ScopeParser.js';
export function substituteExpression(expression, scopes) {
    const replacements = computeSubstitution(expression, scopes);
    return applySubstitution(expression, replacements);
}
function parseBindingExpression(expression) {
    const options = {
        ecmaVersion: ECMA_VERSION,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        checkPrivateFields: false,
        ranges: false,
    };
    const root = Acorn.parse(`(${expression})`, options);
    const exprAt = Acorn.Parser.parseExpressionAt(expression, 0, options);
    if (root.body.length !== 1 || root.body[0].type !== 'ExpressionStatement') {
        throw new SyntaxError(`Invalid binding expression '${expression}'`);
    }
    const expr = root.body[0].expression;
    if (exprAt.start !== expr.start - 1 || exprAt.end !== expr.end - 1) {
        throw new SyntaxError(`Invalid binding expression '${expression}'`);
    }
    const analysis = new ScopeVariableAnalysis(root, `(${expression})`);
    analysis.run();
    const needsParens = expr.type !== 'Identifier' && expr.type !== 'MemberExpression' && expr.type !== 'ThisExpression';
    return {
        replacement: needsParens ? `(${expression})` : expression,
        freeVariables: [...analysis.getFreeVariables().keys()],
        allNames: analysis.getAllNames(),
    };
}
/**
 * Given an |expression| and a list of |scopes| (from inner-most to outer-most), the |computeSubstitution|
 * function returns a list of replacements sorted by the offset. The function throws if
 * it cannot parse the expression or the substitution is impossible to perform (for example
 * if the substitution target is 'this' within a function, it would become bound there).
 **/
function computeSubstitution(expression, scopes) {
    // Parse the expression and find variables and scopes.
    const root = Acorn.parse(expression, {
        ecmaVersion: ECMA_VERSION,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        checkPrivateFields: false,
        ranges: false,
    });
    const scopeVariables = new ScopeVariableAnalysis(root, expression);
    scopeVariables.run();
    const freeVariables = scopeVariables.getFreeVariables();
    const result = [];
    // Prepare the machinery for generating fresh names (to avoid variable captures).
    const allNames = scopeVariables.getAllNames();
    const nameMap = new Map();
    const parsedBindings = new Map();
    // Generated identifiers declared by the scopes visited so far. Outer bindings referring to them are shadowed.
    const shadowedNames = new Set();
    for (const { bindings, generatedNames } of scopes) {
        const scopeNames = new Set(generatedNames);
        for (const [name, rename] of bindings.entries()) {
            let parsed;
            if (rename !== null) {
                try {
                    parsed = parseBindingExpression(rename);
                    parsed.allNames.forEach(id => allNames.add(id));
                    parsed.freeVariables.forEach(id => scopeNames.add(id));
                }
                catch (error) {
                    if (!nameMap.has(name) && freeVariables.has(name)) {
                        throw error;
                    }
                }
            }
            if (!nameMap.has(name)) {
                const isShadowed = parsed?.freeVariables.some(id => shadowedNames.has(id));
                nameMap.set(name, isShadowed ? null : rename);
                if (parsed && !isShadowed) {
                    parsedBindings.set(name, parsed);
                }
            }
        }
        scopeNames.forEach(id => shadowedNames.add(id));
    }
    function getNewName(base) {
        let i = 1;
        while (allNames.has(`${base}_${i}`)) {
            i++;
        }
        const newName = `${base}_${i}`;
        allNames.add(newName);
        return newName;
    }
    // Perform the substitutions.
    const capturedBinders = new Map();
    for (const [name, rename] of nameMap.entries()) {
        const defUse = freeVariables.get(name);
        if (!defUse) {
            continue;
        }
        if (rename === null) {
            throw new Error(`Cannot substitute '${name}' as the underlying variable '${rename}' is unavailable`);
        }
        const parsed = parsedBindings.get(name);
        if (!parsed) {
            continue;
        }
        const freeIds = [...parsed.freeVariables];
        for (const use of defUse) {
            result.push({
                from: name,
                to: parsed.replacement,
                offset: use.offset,
                isShorthandAssignmentProperty: use.isShorthandAssignmentProperty,
            });
            for (const freeId of freeIds) {
                for (const binder of use.scope.findBinders(freeId)) {
                    capturedBinders.set(binder, freeId);
                }
            }
        }
    }
    // If there is a capturing binder, rename the bound variable.
    for (const [binder, freeId] of capturedBinders.entries()) {
        if (binder.definitionKind === 3 /* DefinitionKind.FIXED */) {
            // If the identifier is bound to a fixed name, such as 'this',
            // then refuse to do the substitution.
            throw new Error(`Cannot avoid capture of '${freeId}'`);
        }
        const newName = getNewName(freeId);
        for (const use of binder.uses) {
            result.push({
                from: freeId,
                to: newName,
                offset: use.offset,
                isShorthandAssignmentProperty: use.isShorthandAssignmentProperty,
            });
        }
    }
    result.sort((l, r) => l.offset - r.offset);
    return result;
}
function applySubstitution(expression, replacements) {
    const accumulator = [];
    let last = 0;
    for (const r of replacements) {
        accumulator.push(expression.slice(last, r.offset));
        let replacement = r.to;
        if (r.isShorthandAssignmentProperty) {
            // Let us expand the shorthand to full assignment.
            replacement = `${r.from}: ${r.to}`;
        }
        accumulator.push(replacement);
        last = r.offset + r.from.length;
    }
    accumulator.push(expression.slice(last));
    return accumulator.join('');
}
//# sourceMappingURL=Substitute.js.map