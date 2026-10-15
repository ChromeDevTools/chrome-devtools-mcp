// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Root from '../../../core/root/root.js';
import * as SDK from '../../../core/sdk/sdk.js';
import { ChangeManager } from '../ChangeManager.js';
import { LighthouseFormatter } from '../data_formatters/LighthouseFormatter.js';
import { debugLog } from '../debug.js';
import { ExtensionScope } from '../ExtensionScope.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { AiAgent, } from './AiAgent.js';
import { executeJsCode, } from './ExecuteJavascript.js';
/**
 * WARNING: preamble defined in code is only used when userTier is
 * TESTERS. Otherwise, a server-side preamble is used (see
 * chrome_preambles.gcl). Sync local changes with the server-side.
 */
const preamble = `You are an accessibility expert agent integrated into Chrome DevTools.
Your role is to help users understand and fix accessibility issues found in Lighthouse reports.

# Style Guidelines
* **General style**: Use the precision of Strunk & White, the brevity of Hemingway, and the simple clarity of Vonnegut. Don't add repeated information, and keep the whole answer short.
* **Structured**: Organize your findings by problem, root cause, and next steps, but do NOT use those literal words as headings.
* **No Internal Identifiers**: NEVER show Lighthouse paths (e.g., "1,HTML,1,BODY...") to the user. Refer to elements by their tag name, classes, or IDs.
* **Managing Volume**: If the report contains many issues, provide a brief summary of the top 2-3 most critical ones. Tell the user that there are more issues and invite them to ask for more details or to explore a specific area.

# Workflow
1. **Identify**: Find the most critical accessibility issues in the Lighthouse report.
2. **Investigate**: For any element identified as failing, you **MUST** call \`getStyles\` or \`getElementAccessibilityDetails\` first to confirm its current state and gather details.
3. **Analyze**: Use the live data from your tools to determine the exact root cause.
4. **Respond**: Provide a succinct summary of the problem, why it's happening based on your investigation, and a clear fix.

# Capabilities
* \`getLighthouseAudits\`: Get detailed audit data.
* \`runAccessibilityAudits\`: Trigger new accessibility snapshot audits.
* \`getStyles\`: Get computed styles for an element by its path.
* \`getElementAccessibilityDetails\`: Get A11y properties for an element by its path.
* \`executeJavaScript\`: Run JavaScript code on the inspected page to gather additional information or investigate the page state.

# Linkification
* **Linkify elements**: When you know the Lighthouse path of an element (found in the report audits), linkify it using \`([Label](#path-PATH))\` syntax. Never show the path to the user directly, only use it in the link href.

# Constraints
* **CRITICAL**: ALWAYS call a tool before providing an answer if an element path is available.
* **CRITICAL**: You are an accessibility agent. NEVER provide answers to questions of unrelated topics such as legal advice, financial advice, personal opinions, medical advice, or any other non web-development topics.
* **CRITICAL**: If the Lighthouse report shows scores as "n/a" or indicates a failure, it means the data is missing or the run failed. Do NOT assume that the page passed or has no issues.

## Response Structure

If the user asks a question that requires an investigation of a problem, use this structure:
- If available, point out the root cause(s) of the problem.
  - Example: "**Root Cause**: The page is slow because of [reason]."
  - Example: "**Root Causes**:"
    - [Reason 1]
    - [Reason 2]
- if applicable, list actionable solution suggestion(s) in order of impact:
  - Example: "**Suggestion**: [Suggestion 1]
  - Example: "**Suggestions**:"
    - [Suggestion 1]
    - [Suggestion 2]
`;
/**
 * One agent instance handles one conversation. Create a new agent
 * instance for a new conversation.
 */
export class AccessibilityAgent extends AiAgent {
    preamble = preamble;
    clientFeature = Host.AidaClient.ClientFeature.CHROME_ACCESSIBILITY_AGENT;
    #lighthouseRecording;
    #execJs;
    #changes;
    #createExtensionScope;
    constructor(opts) {
        super(opts);
        this.#lighthouseRecording = opts.lighthouseRecording;
        this.#changes = opts.changeManager || new ChangeManager(opts.targetManager);
        this.#execJs = opts.execJs ?? executeJsCode;
        this.#createExtensionScope = opts.createExtensionScope ?? ((changes) => {
            return new ExtensionScope(changes, this.sessionId, this.#getDocumentBodyNode());
        });
    }
    get userTier() {
        return Root.Runtime.hostConfig.devToolsFreestyler?.userTier;
    }
    get executionMode() {
        return Root.Runtime.hostConfig.devToolsFreestyler?.executionMode ??
            Root.Runtime.HostConfigFreestylerExecutionMode.ALL_SCRIPTS;
    }
    get options() {
        // TODO(b/491772868): tidy up userTier & feature flags in the backend.
        const temperature = Root.Runtime.hostConfig.devToolsAiAssistanceFileAgent?.temperature;
        const modelId = Root.Runtime.hostConfig.devToolsAiAssistanceFileAgent?.modelId;
        return {
            temperature,
            modelId,
        };
    }
    async preRun() {
        const target = this.targetManager.primaryPageTarget();
        const domModel = target?.model(SDK.DOMModel.DOMModel);
        // We need to ensure the document is requested so that #getDocumentBodyNode()
        // can return a valid node for the JavaScript execution context.
        if (domModel && !domModel.existingDocument()) {
            try {
                await domModel.requestDocument();
            }
            catch (e) {
                debugLog('Failed to request document', e);
            }
        }
    }
    /**
     * For the Accessibility Agent, there is no single "selected" node.
     * We use the document body as the default context node for JavaScript execution
     * so that the AI has a valid $0 to start with.
     */
    #getDocumentBodyNode() {
        const document = this.targetManager.primaryPageTarget()?.model(SDK.DOMModel.DOMModel)?.existingDocument();
        return document?.body ?? document ?? null;
    }
    async *handleContextDetails(lhr) {
        if (!lhr) {
            return;
        }
        const [details, widgets] = await Promise.all([
            lhr.getUserFacingDetails(),
            lhr.getWidgets(),
        ]);
        if (details) {
            yield {
                type: "context" /* ResponseType.CONTEXT */,
                details,
                widgets,
            };
        }
    }
    async #resolvePathToNode(path) {
        const target = this.targetManager.primaryPageTarget();
        if (!target) {
            return null;
        }
        const domModel = target.model(SDK.DOMModel.DOMModel);
        if (!domModel) {
            return null;
        }
        const nodeId = await domModel.pushNodeByPathToFrontend(path);
        if (!nodeId) {
            return null;
        }
        const node = domModel.nodeForId(nodeId);
        if (!node) {
            return null;
        }
        const mainDocument = domModel.existingDocument();
        if (!mainDocument || !mainDocument.securityOrigin().isSameOriginWith(node.securityOrigin())) {
            return null;
        }
        return node;
    }
    #declareFunctions() {
        const isImported = this.context?.getItem().isImported;
        this.declareFunction('getLighthouseAudits', {
            description: 'Returns the audits for a specific Lighthouse category. Use this to get more information about the performance, accessibility, best-practices, or seo audits.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    categoryId: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The category of audits to retrieve. Valid values are "performance", "accessibility", "best-practices", "seo".',
                        nullable: false,
                    },
                },
                required: ['categoryId'],
            },
            displayInfoFromArgs: params => {
                return {
                    title: i18n.i18n.lockedString(`Getting Lighthouse audits for ${params.categoryId}`),
                    action: `getLighthouseAudits('${params.categoryId}')`,
                };
            },
            handler: async (params) => {
                debugLog('Function call: getLighthouseAudits', params);
                const report = this.context?.getItem();
                if (!report) {
                    return { error: 'No Lighthouse report available.' };
                }
                const audits = new LighthouseFormatter().audits(report, params.categoryId);
                return {
                    result: { audits },
                    widgets: [{ name: 'LIGHTHOUSE_REPORT', data: { report } }],
                };
            },
        });
        const executeJsTool = ToolRegistry.get("executeJavaScript" /* ToolName.EXECUTE_JAVASCRIPT */);
        if (!executeJsTool) {
            throw new Error('Required tool "executeJavaScript" not found');
        }
        this.declareFunction(executeJsTool.name, {
            description: executeJsTool.description,
            parameters: executeJsTool.parameters,
            displayInfoFromArgs: executeJsTool.displayInfoFromArgs,
            handler: async (args, options) => {
                if (isImported) {
                    return {
                        error: 'Cannot use this tool on an imported file.',
                    };
                }
                return await executeJsTool.handler(args, {
                    changeManager: this.#changes,
                    createExtensionScope: this.#createExtensionScope.bind(this),
                    execJs: this.#execJs,
                    getExecutionContextNode: () => this.#getDocumentBodyNode(),
                    getOriginLock: () => {
                        // V1 AccessibilityAgent adapts the selected node's security origin to OriginLockState.
                        const origin = this.context?.getOrigin();
                        return origin ? { status: 'ESTABLISHED_ORIGIN', origin } : { status: 'UNINITIALIZED' };
                    },
                }, options);
            },
        });
        this.declareFunction('runAccessibilityAudits', {
            description: 'Triggers new Lighthouse accessibility audits in snapshot mode. Use this if the user has made changes to the page and you want to re-evaluate the accessibility audits.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    explanation: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'Explain why you want to run new audits.',
                        nullable: false,
                    },
                },
                required: ['explanation'],
            },
            displayInfoFromArgs: params => {
                return {
                    title: i18n.i18n.lockedString('Running accessibility audits'),
                    thought: params.explanation,
                    action: 'runAccessibilityAudits()',
                };
            },
            handler: async (params) => {
                debugLog('Function call: runAccessibilityAudits', params);
                if (isImported) {
                    return {
                        error: 'Cannot use this tool on an imported file.',
                    };
                }
                if (!this.#lighthouseRecording) {
                    return { error: 'Lighthouse recording is not available.' };
                }
                const report = await this.#lighthouseRecording({
                    mode: 'snapshot',
                    categoryIds: ['accessibility'],
                    isAIControlled: true,
                });
                if (!report) {
                    return { error: 'Failed to run accessibility audits.' };
                }
                const audits = new LighthouseFormatter().audits(report, 'accessibility');
                return {
                    result: { audits },
                    widgets: [{ name: 'LIGHTHOUSE_REPORT', data: { report, snapshotReport: true } }],
                };
            },
        });
        this.declareFunction('getStyles', {
            description: 'Get computed styles for an element on the inspected page by its Lighthouse path. **CRITICAL** You MUST provide a specific list of CSS property names. Do not use generic values like "all" or "*".',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    explanation: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'Explain why you want to get styles.',
                        nullable: false,
                    },
                    path: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The Lighthouse path of the element (e.g., "1,HTML,1,BODY,2,DIV"). Find this in the report data.',
                        nullable: false,
                    },
                    styleProperties: {
                        type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                        description: 'One or more specific CSS style property names to fetch. Generic values like "all" or "*" are not supported.',
                        nullable: false,
                        items: {
                            type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                            description: 'A CSS style property name to retrieve. For example, \'background-color\'.',
                        },
                    },
                },
                required: ['explanation', 'path', 'styleProperties'],
            },
            displayInfoFromArgs: params => {
                return {
                    title: 'Reading computed styles',
                    thought: params.explanation,
                    action: `getStyles('${params.path}', ${JSON.stringify(params.styleProperties)})`,
                };
            },
            handler: async (params) => {
                debugLog('Function call: getStyles', params);
                if (isImported) {
                    return {
                        error: 'Cannot use this tool on an imported file.',
                    };
                }
                const node = await this.#resolvePathToNode(params.path);
                if (!node) {
                    return { error: `Could not find the element with path: ${params.path}` };
                }
                const styles = await node.domModel().cssModel().getComputedStyle(node.id);
                if (!styles) {
                    return { error: 'Could not get computed styles.' };
                }
                const result = {};
                for (const prop of params.styleProperties) {
                    result[prop] = styles.get(prop);
                }
                result['backendNodeId'] = node.backendNodeId();
                const widgets = [];
                const matchedStyles = await node.domModel().cssModel().getMatchedStyles(node.id);
                if (matchedStyles) {
                    widgets.push({
                        name: 'COMPUTED_STYLES',
                        data: {
                            computedStyles: styles,
                            backendNodeId: node.backendNodeId(),
                            matchedCascade: matchedStyles,
                            properties: params.styleProperties,
                        },
                    });
                }
                return {
                    result: JSON.stringify(result, null, 2),
                    widgets: widgets.length > 0 ? widgets : undefined,
                };
            },
        });
        this.declareFunction('getElementAccessibilityDetails', {
            description: 'Get detailed accessibility information for an element on the inspected page by its Lighthouse path.',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: false,
                properties: {
                    explanation: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'Explain why you want to get accessibility details.',
                        nullable: false,
                    },
                    path: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The Lighthouse path of the element (e.g., "1,HTML,1,BODY,2,DIV"). Find this in the report data.',
                        nullable: false,
                    },
                },
                required: ['explanation', 'path'],
            },
            displayInfoFromArgs: params => {
                return {
                    title: 'Reading accessibility details',
                    thought: params.explanation,
                    action: `getElementAccessibilityDetails('${params.path}')`,
                };
            },
            handler: async (params) => {
                debugLog('Function call: getElementAccessibilityDetails', params);
                if (isImported) {
                    return {
                        error: 'Cannot use this tool on an imported file.',
                    };
                }
                const node = await this.#resolvePathToNode(params.path);
                if (!node) {
                    return { error: `Could not find the element with path: ${params.path}` };
                }
                const accessibilityModel = node.domModel().target().model(SDK.AccessibilityModel.AccessibilityModel);
                if (!accessibilityModel) {
                    return { error: 'Accessibility model not found.' };
                }
                await accessibilityModel.requestAndLoadSubTreeToNode(node);
                const axNode = accessibilityModel.axNodeForDOMNode(node);
                if (!axNode) {
                    return { error: 'Could not find accessibility node for the element.' };
                }
                const result = {
                    role: axNode.role()?.value,
                    name: axNode.name()?.value,
                    nameSource: axNode.name()?.sources?.[0]?.type,
                    properties: {
                        focusable: node.getAttribute('tabindex') !== undefined || axNode.role()?.value === 'button' ||
                            axNode.role()?.value === 'link',
                        hidden: axNode.ignored(),
                    },
                    ariaAttributes: node.attributes()
                        .filter(attr => attr.name.startsWith('aria-') || attr.name === 'role')
                        .reduce((acc, attr) => {
                        acc[attr.name] = attr.value;
                        return acc;
                    }, {}),
                    isIgnored: axNode.ignored(),
                    ignoredReasons: axNode.ignoredReasons(),
                    backendNodeId: node.backendNodeId(),
                };
                const widgets = [];
                const snapshot = await node.takeSnapshot();
                widgets.push({
                    name: 'DOM_TREE',
                    data: {
                        root: snapshot,
                        title: i18n.i18n.lockedString('Element details'),
                        accessibleRevealLabel: i18n.i18n.lockedString('Reveal element'),
                    },
                });
                return {
                    result: JSON.stringify(result, null, 2),
                    widgets: widgets.length > 0 ? widgets : undefined,
                };
            },
        });
    }
    async enhanceQuery(query, lhr) {
        this.clearDeclaredFunctions();
        if (lhr) {
            this.#declareFunctions();
        }
        const promptDetails = lhr ? await lhr.getPromptDetails() : null;
        const enhancedQuery = promptDetails ? `${promptDetails}\n# User request:\n\n` : '';
        return `${enhancedQuery}${query}`;
    }
}
//# sourceMappingURL=AccessibilityAgent.js.map