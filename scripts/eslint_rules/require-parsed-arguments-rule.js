/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description: 'Ensure defineTool and definePageTool callbacks are type-annotated with ParsedArguments',
    },
    schema: [],
    messages: {
      missingAnnotation: 'The callback to {{name}} must specify its argument type as ParsedArguments.',
    }
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && (node.callee.name === 'defineTool' || node.callee.name === 'definePageTool')) {
          const arg = node.arguments[0];
          if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) {
             if (arg.params.length > 0) {
                const firstParam = arg.params[0];
                if (firstParam.typeAnnotation && firstParam.typeAnnotation.type === 'TSTypeAnnotation') {
                   const typeRef = firstParam.typeAnnotation.typeAnnotation;
                   if (typeRef.type === 'TSTypeReference' && typeRef.typeName.name === 'ParsedArguments') {
                       return;
                   }
                }
                
                context.report({
                  node: arg,
                  messageId: 'missingAnnotation',
                  data: {
                    name: node.callee.name
                  },
                  fix(fixer) {
                    const sourceCode =
                      context.sourceCode || context.getSourceCode();
                    
                    // The arrow function might start with `async`, so find the param token
                    const paramToken = sourceCode.getFirstToken(firstParam);
                    const beforeParamToken = sourceCode.getTokenBefore(paramToken);
                    
                    // If the token before the param is open paren, and that open paren is part of the arrow function
                    // Then it has parens around parameters.
                    // Wait, actually, the most reliable way is if the ArrowFunctionExpression's first token is `(`
                    // OR if it's `async (`, in which case the token before `param` is `(`.
                    // BUT it must be inside the ArrowFunctionExpression.
                    // Since it's a parameter of the function `arg`, we can check if `beforeParamToken` is within `arg.range`.
                    let hasParens = false;
                    if (beforeParamToken && beforeParamToken.value === '(' && beforeParamToken.range[0] >= arg.range[0]) {
                        hasParens = true;
                    }
                    
                    let paramName = firstParam.name;
                    if (!paramName) {
                       if (firstParam.type === 'Identifier') {
                           paramName = firstParam.name;
                       } else {
                           const text = sourceCode.getText(firstParam);
                           paramName = text.split(':')[0].trim();
                       }
                    }
                    
                    if (hasParens) {
                      return fixer.replaceText(firstParam, `${paramName}: ParsedArguments`);
                    } else {
                      return fixer.replaceText(firstParam, `(${paramName}: ParsedArguments)`);
                    }
                  }
                });
             } else {
                context.report({
                  node: arg,
                  messageId: 'missingAnnotation',
                  data: { name: node.callee.name },
                  fix(fixer) {
                    const sourceCode = context.sourceCode || context.getSourceCode();
                    const firstToken = sourceCode.getFirstToken(arg);
                    if (firstToken.value === '(') {
                        const secondToken = sourceCode.getTokenAfter(firstToken);
                        if (secondToken.value === ')') {
                            return fixer.replaceTextRange([firstToken.range[0], secondToken.range[1]], '(_args: ParsedArguments)');
                        }
                    }
                    // Handle `async () =>`
                    if (firstToken.value === 'async') {
                        const secondToken = sourceCode.getTokenAfter(firstToken);
                        if (secondToken.value === '(') {
                            const thirdToken = sourceCode.getTokenAfter(secondToken);
                            if (thirdToken.value === ')') {
                                return fixer.replaceTextRange([secondToken.range[0], thirdToken.range[1]], '(_args: ParsedArguments)');
                            }
                        }
                    }
                    return null;
                  }
                });
             }
          }
        }
      }
    };
  }
};
