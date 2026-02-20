/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const currentYear = new Date().getFullYear();
const licenseHeader = `
/**
 * @license
 * Copyright ${currentYear} Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
`;

export default {
  name: 'check-license',
  meta: {
    type: 'layout',
    docs: {
      description: 'Validate existence of license header',
    },
    fixable: 'code',
    schema: [],
    messages: {
      licenseRule: 'Add license header.',
      emptyLine: 'Add empty line after license header.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const comments = sourceCode.getAllComments();
    let insertAfter = [0, 0];
    let header = null;
    // Check only the first 2 comments
    for (let index = 0; index < 2; index++) {
      const comment = comments[index];
      if (!comment) {
        break;
      }
      // Shebang comments should be at the top
      if (
        comment.type === 'Shebang' ||
        (comment.type === 'Line' && comment.value.startsWith('#!'))
      ) {
        insertAfter = comment.range;
        continue;
      }
      if (comment.type === 'Block') {
        header = comment;
        break;
      }
    }

    return {
      Program(node) {
        if (context.getFilename().endsWith('.json')) {
          return;
        }

        if (
          header &&
          (header.value.includes('@license') ||
            header.value.includes('License') ||
            header.value.includes('Copyright'))
        ) {
          const nextToken = sourceCode.getTokenAfter(header, {
            includeComments: true,
          });
          if (
            nextToken &&
            nextToken.loc.start.line === header.loc.end.line + 1
          ) {
            context.report({
              node: node,
              loc: header.loc,
              messageId: 'emptyLine',
              fix(fixer) {
                return fixer.insertTextAfter(header, '\n');
              },
            });
          }
          return;
        }

        // Add header license
        if (!header || !header.value.includes('@license')) {
          context.report({
            node: node,
            messageId: 'licenseRule',
            fix(fixer) {
              return fixer.insertTextAfterRange(insertAfter, licenseHeader);
            },
          });
        }
      },
    };
  },
};
