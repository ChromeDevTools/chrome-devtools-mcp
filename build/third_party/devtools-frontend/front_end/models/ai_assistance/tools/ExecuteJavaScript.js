// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Platform from '../../../core/platform/platform.js';
import * as Root from '../../../core/root/root.js';
import * as Formatter from '../../formatter/formatter.js';
import { JavascriptExecutor } from '../agents/ExecuteJavascript.js';
import { isOriginAllowedByLock, } from './Tool.js';
const lockedString = i18n.i18n.lockedString;
const MAX_FORMATTED_LINES = 40;
const MAX_LINE_LENGTH = 120;
const MAX_TOTAL_CHARACTERS = 2500;
const MAX_LONG_LINES_REPORTED = 3;
const LONG_LINE_PREVIEW_LENGTH = 60;
/**
 * Returns one message per size limit that the formatted code exceeds. Each
 * message states the actual value, the limit, and how to fix it, so the model
 * can correct every problem in a single retry.
 */
function describeSizeLimitViolations(formattedCode) {
    const violations = [];
    const lines = formattedCode.split('\n');
    if (lines.length > MAX_FORMATTED_LINES) {
        violations.push(`- The code is ${lines.length} lines (max ${MAX_FORMATTED_LINES}). ` +
            'Split the logic into smaller calls and return intermediate results in `data`.');
    }
    const longLines = lines.map((line, index) => ({ lineNumber: index + 1, line })).filter(({ line }) => line.length > MAX_LINE_LENGTH);
    if (longLines.length > 0) {
        violations.push(`- Lines longer than ${MAX_LINE_LENGTH} characters. Break them into shorter lines, ` +
            'for example by splitting long strings or selectors with concatenation, ' +
            'or by putting arguments on separate lines:');
        for (const { lineNumber, line } of longLines.slice(0, MAX_LONG_LINES_REPORTED)) {
            const preview = Platform.StringUtilities.trimEndWithMaxLength(line.trimStart(), LONG_LINE_PREVIEW_LENGTH);
            violations.push(`  - Line ${lineNumber} is ${line.length} characters: \`${preview}\``);
        }
        const unreportedCount = longLines.length - MAX_LONG_LINES_REPORTED;
        if (unreportedCount > 0) {
            violations.push(`  - ${unreportedCount} more ${unreportedCount === 1 ? 'line' : 'lines'} not shown.`);
        }
    }
    if (formattedCode.length > MAX_TOTAL_CHARACTERS) {
        violations.push(`- The code is ${formattedCode.length} characters (max ${MAX_TOTAL_CHARACTERS}). ` +
            'Remove unneeded code or split the logic into smaller calls.');
    }
    return violations;
}
export class ExecuteJavaScriptTool {
    name = "executeJavaScript" /* ToolName.EXECUTE_JAVASCRIPT */;
    permissionPrompt = "allow-once" /* PermissionPrompt.ALLOW_ONCE */;
    permissionTitle = lockedString('Allow running JavaScript on the page?');
    description = 'This function allows you to run JavaScript code on the inspected page to access the element styles and page content.\nCall this function to gather additional information or modify the page state. Call this function enough times to investigate the user request. Note: You cannot make network requests using this function.';
    /**
     * Formats the code and checks it against the size limits. This method does
     * not check syntax: if formatting fails, the formatter returns the original
     * code, and running it on the page reports any SyntaxError to the model.
     */
    static async validateAndFormatCode(code) {
        const formatted = await Formatter.ScriptFormatter.formatScriptContent('text/javascript', code, '  ');
        const formattedCode = formatted.formattedContent;
        const violations = describeSizeLimitViolations(formattedCode);
        if (violations.length > 0) {
            return {
                error: [
                    'Error: The code was not run because it exceeds size limits after formatting (indented with 2 spaces):',
                    ...violations,
                ].join('\n'),
            };
        }
        return { formattedCode };
    }
    parameters = {
        type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
        description: '',
        nullable: false,
        properties: {
            code: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: `JavaScript code snippet to run on the inspected page. Make sure the code is formatted for readability.

# Instructions

* To return data, define a top-level \`data\` variable and populate it with data you want to get. Only JSON-serializable objects can be assigned to \`data\`.
* $0 refers to the currently selected DOM node (or document body if none selected).
* **CRITICAL** Never assume a selector for the elements unless you verified your knowledge.
* **CRITICAL** Variables from previous function calls are not available in subsequent calls.
* **CRITICAL** Keep code concise (max 40 lines, 120 characters per line, and 2,500 characters). Split complex logic into multiple steps.
* **CRITICAL** Network requests (e.g., fetch, XMLHttpRequest) are disabled and cannot be made.

For example, to query DOM elements:

\`\`\`
const data = {
  title: document.title,
  elementText: $0?.textContent?.trim(),
  childCount: $0?.children.length,
};
\`\`\`
`,
            },
            explanation: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Explain why you want to run this code',
            },
            title: {
                type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                description: 'Provide a summary of what the code does. For example, "Checking related element styles".',
            },
        },
        required: ['code', 'explanation', 'title'],
    };
    displayInfoFromArgs(params) {
        return {
            title: params.title,
            thought: params.explanation,
            action: params.code,
        };
    }
    async handler(params, context, options) {
        const executionNode = context.getExecutionContextNode();
        if (!executionNode) {
            return { error: 'Error: Could not find the context node for execution.' };
        }
        if (!isOriginAllowedByLock(context.getOriginLock(), executionNode.securityOrigin())) {
            return { error: 'Error: Cannot execute JavaScript on cross-origin target.' };
        }
        if (Root.Runtime.hostConfig.devToolsAiV2Architecture?.enabled) {
            const validationResult = await ExecuteJavaScriptTool.validateAndFormatCode(params.code);
            if (validationResult.error) {
                return { error: validationResult.error };
            }
            if (validationResult.formattedCode) {
                params.code = validationResult.formattedCode;
            }
        }
        const executionMode = Root.Runtime.hostConfig.devToolsFreestyler?.executionMode ??
            Root.Runtime.HostConfigFreestylerExecutionMode.ALL_SCRIPTS;
        const executor = new JavascriptExecutor({
            executionMode,
            getContextNode: () => executionNode,
            createExtensionScope: context.createExtensionScope,
            changes: context.changeManager,
        }, context.execJs);
        return await executor.executeAction(params.code, options);
    }
}
//# sourceMappingURL=ExecuteJavaScript.js.map