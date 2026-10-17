// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Root from '../../../core/root/root.js';
import * as Logs from '../../logs/logs.js';
import * as NetworkTimeCalculator from '../../network_time_calculator/network_time_calculator.js';
import * as Workspace from '../../workspace/workspace.js';
import { DOMNodeContext } from '../contexts/DOMNodeContext.js';
import { FileContext } from '../contexts/FileContext.js';
import { LighthouseContext } from '../contexts/LighthouseContext.js';
import { PerformanceTraceContext } from '../contexts/PerformanceTraceContext.js';
import { RequestContext } from '../contexts/RequestContext.js';
import { StorageContext } from '../contexts/StorageContext.js';
import { formatBytesToKb, seconds } from '../data_formatters/UnitFormatters.js';
import { debugLog } from '../debug.js';
import { StorageItem } from '../StorageItem.js';
import { isOriginAllowedByLock } from '../tools/Tool.js';
import { AiAgent, } from './AiAgent.js';
const lockedString = i18n.i18n.lockedString;
/**
 * WARNING: preamble defined in code is only used when userTier is
 * TESTERS. Otherwise, a server-side preamble is used (see
 * chrome_preambles.gcl). Sync local changes with the server-side.
 */
const preamble = `
You are an advanced Web Development Assistant and AI routing agent integrated into Chrome DevTools. Your tone is educational, supportive, and technically precise. You aim to help developers of all levels, prioritizing teaching web concepts as the primary entry point for any solution.

Your role is to understand the user's query, identify the appropriate specialized agent to handle it, and select the relevant context from the page to assist that agent.

# Workflow
1.  **Analyze**: Understand the user's intent and what they are trying to achieve.
2.  **Classify**: Determine which specialized agent is best suited for the task (e.g., StylingAgent for CSS/styling issues, NetworkAgent for network requests, FileAgent for source files, PerformanceAgent for performance details, AccessibilityAgent for accessibility reports, or StorageAgent for analyzing and explaining storage but not editing).
3.  **Gather Context**: Identify what information the specialized agent will need. Proactively use your tools to find and select this context (e.g., finding the relevant DOM node, network request, file, performance trace, or storage). Always try to select a single specific context before answering the question.
4.  **Delegate**: Once context is selected, hand over to the specialized agent. If you are unable to delegate or gather more information, provide a comprehensive guide on how to fix the issue using Chrome DevTools, explaining how and why, or suggest any panel/flow that may help.

# Considerations
* Determine what is the domain of the question - styling, network, sources, performance, storage, or other part of DevTools.
* For questions about performance (e.g., general performance issues, page speed, performance metrics like LCP, INP, CLS), use performanceRecordAndReload to record a performance trace.
* Proactively try to gather additional data. If a specific piece of data can be selected, select it.
* Always try to select a single specific context before answering the question.
* Avoid making assumptions without sufficient evidence, and always seek further clarification if needed.
* When presenting solutions, clearly distinguish between the primary cause and contributing factors.
* Please answer only if you are sure about the answer. Otherwise, explain why you're not able to answer.
* If you are unable to gather more information provide a comprehensive guide to how to fix the issue using Chrome DevTools and explain how and why.
* You can suggest any panel or flow in Chrome DevTools that may help the user out.

# Formatting Guidelines
* Use Markdown for all code snippets.
* Always specify the language for code blocks (e.g., \`\`\`css, \`\`\`javascript).
* **CRITICAL**: Use the precision of Strunk & White, the brevity of Hemingway, and the simple clarity of Vonnegut. Don't add repeated information, and keep the whole answer short.

* **CRITICAL** If a tool returns an empty list, immediately pivot to the next logical tool (e.g., from sources to network).
* **CRITICAL** Always exhaust all possible ways to find and select context from different domains.
* **CRITICAL** NEVER write full Python programs - you should only write individual statements that invoke a single function from the provided library.
* **CRITICAL** NEVER output text before a function call. Always do a function call first.
* **CRITICAL** You are a debugging assistant in DevTools. NEVER provide answers to questions of unrelated topics such as legal advice, financial advice, personal opinions, medical advice, religion, race, politics, sexuality, gender, or any other non web-development topics. Answer "Sorry, I can't answer that. I'm best at questions about debugging web pages." to such questions.
* **CRITICAL** When referring to DevTools resource output a markdown link to the object using the format \`[<text>](#<type>-<ID>)\`.
* The only available types are \`#req\` for network request and \`#file\` for source files. Only use ID inside the link, never ask about user selecting by ID.
`;
/**
 * One agent instance handles one conversation. Create a new agent
 * instance for a new conversation.
 */
export class ContextSelectionAgent extends AiAgent {
    preamble = preamble;
    clientFeature = Host.AidaClient.ClientFeature.CHROME_CONTEXT_SELECTION_AGENT;
    get userTier() {
        // TODO: Make this depend on variable.
        return Root.Runtime.hostConfig.devToolsFreestyler?.userTier;
    }
    get options() {
        const temperature = Root.Runtime.hostConfig.devToolsAiAssistanceFileAgent?.temperature;
        const modelId = Root.Runtime.hostConfig.devToolsAiAssistanceFileAgent?.modelId;
        return {
            temperature,
            modelId,
        };
    }
    #performanceRecordAndReload;
    #onInspectElement;
    #networkTimeCalculator;
    #lighthouseRecording;
    #allowedOrigin;
    #networkLog;
    #workspace;
    constructor(opts) {
        super(opts);
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        this.#networkLog = opts.networkLog ?? Logs.NetworkLog.NetworkLog.instance();
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        this.#workspace = opts.workspace ?? Workspace.Workspace.WorkspaceImpl.instance();
        this.#performanceRecordAndReload = opts.performanceRecordAndReload;
        this.#lighthouseRecording = opts.lighthouseRecording;
        this.#onInspectElement = opts.onInspectElement;
        this.#networkTimeCalculator = opts.networkTimeCalculator;
        this.#allowedOrigin = opts.allowedOrigin ?? (() => ({ origin: undefined }));
        this.declareFunction('listNetworkRequests', {
            description: `Gives a list of network requests including URL, status code, and duration.`,
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: [],
                properties: {},
            },
            displayInfoFromArgs: () => {
                return {
                    title: lockedString('Listing network requests'),
                    action: 'listNetworkRequest()',
                };
            },
            handler: async () => {
                const requests = [];
                const allowedOriginResult = this.#allowedOrigin();
                if ('blocked' in allowedOriginResult) {
                    return {
                        error: 'Cross-origin access blocked due to navigation. Please start a new chat.',
                    };
                }
                const origin = allowedOriginResult.origin;
                if (!origin || origin.isOpaque()) {
                    return {
                        error: 'No requests recorded by DevTools',
                    };
                }
                let hasCrossOriginRequest = false;
                const requestsToShow = [];
                for (const request of this.#networkLog.requests()) {
                    /**
                     * NOTE: this origin check does not ensure that all the requests are
                     * from the same origin as the target page. Instead, it ensures that
                     * the document that loaded the request is the same as the target
                     * page. This ensures that we limit the scope to all requests fetched
                     * during the loading of the target page, and do not leak URLs from
                     * other pages.
                     */
                    if (!isOriginAllowedByLock({ status: 'ESTABLISHED_ORIGIN', origin }, request.initiatorSecurityOrigin())) {
                        hasCrossOriginRequest = true;
                        continue;
                    }
                    requests.push({
                        id: request.requestId(),
                        url: request.url(),
                        statusCode: request.statusCode,
                        duration: seconds(request.duration),
                        transferSize: formatBytesToKb(request.transferSize),
                    });
                    requestsToShow.push(request);
                }
                if (requests.length === 0) {
                    return {
                        error: hasCrossOriginRequest ?
                            `No requests showing with origin ${origin.siteId()}. Tell the user to start a new chat` :
                            'No requests recorded by DevTools',
                    };
                }
                return {
                    result: requests,
                    widgets: [{
                            name: 'NETWORK_REQUESTS_LIST',
                            data: {
                                requests: requestsToShow,
                            },
                        }],
                };
            },
        });
        this.declareFunction('selectNetworkRequest', {
            description: `Selects a specific network request to further provide information about. Use this when asked about network requests issues.`,
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: ['id'],
                properties: {
                    id: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The id of the network request',
                        nullable: false,
                    },
                },
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Getting network request'),
                    action: `selectNetworkRequest(${args.id})`,
                };
            },
            handler: async ({ id }) => {
                const allowedOriginResult = this.#allowedOrigin();
                if ('blocked' in allowedOriginResult) {
                    return {
                        error: 'Cross-origin access blocked due to navigation. Please start a new chat.',
                    };
                }
                const origin = allowedOriginResult.origin;
                if (!origin || origin.isOpaque()) {
                    return {
                        error: 'No request found',
                    };
                }
                const request = this.#networkLog.requests().find(req => {
                    if (req.requestId() !== id) {
                        return false;
                    }
                    return isOriginAllowedByLock({ status: 'ESTABLISHED_ORIGIN', origin }, req.initiatorSecurityOrigin());
                });
                if (request) {
                    const calculator = this.#networkTimeCalculator ?? new NetworkTimeCalculator.NetworkTransferTimeCalculator();
                    return {
                        context: new RequestContext(request, calculator),
                        description: 'User selected a network request',
                        widgets: [{
                                name: 'NETWORK_REQUEST_GENERAL_HEADERS',
                                data: {
                                    request,
                                },
                            }],
                    };
                }
                return {
                    error: 'No request found',
                };
            },
        });
        this.declareFunction('listSourceFiles', {
            description: `Returns a list of all files in the project.`,
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: [],
                properties: {},
            },
            displayInfoFromArgs: () => {
                return {
                    title: lockedString('Listing source requests'),
                    action: 'listSourceFiles()',
                };
            },
            handler: async () => {
                const allowedOriginResult = this.#allowedOrigin();
                if ('blocked' in allowedOriginResult) {
                    return {
                        error: 'Cross-origin access blocked due to navigation. Please start a new chat.',
                    };
                }
                const origin = allowedOriginResult.origin;
                if (!origin || origin.isOpaque()) {
                    return {
                        result: [],
                    };
                }
                const files = [];
                const uiSourceCodes = [];
                for (const file of ContextSelectionAgent.getUISourceCodes(this.#workspace)) {
                    if (!isOriginAllowedByLock({ status: 'ESTABLISHED_ORIGIN', origin }, file.securityOrigin())) {
                        continue;
                    }
                    files.push({
                        file: file.fullDisplayName(),
                        id: ContextSelectionAgent.uiSourceCodeId.get(file),
                    });
                    uiSourceCodes.push(file);
                }
                return {
                    result: files,
                    widgets: [{
                            name: 'SOURCE_FILES_LIST',
                            data: {
                                uiSourceCodes,
                            },
                        }],
                };
            },
        });
        this.declareFunction('selectSourceFile', {
            description: `Selects a source file. Use this when asked about files on the page. Use listSourceFiles to find the file ID.`,
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: ['id'],
                properties: {
                    id: {
                        type: 3 /* Host.AidaClient.ParametersTypes.INTEGER */,
                        description: 'The id (URL) of the file you want to select.',
                        nullable: false,
                    },
                },
            },
            displayInfoFromArgs: args => {
                return {
                    title: lockedString('Getting source file'),
                    action: `selectSourceFile(${args.id})`,
                };
            },
            handler: async (params) => {
                const allowedOriginResult = this.#allowedOrigin();
                if ('blocked' in allowedOriginResult) {
                    return {
                        error: 'Cross-origin access blocked due to navigation. Please start a new chat.',
                    };
                }
                const origin = allowedOriginResult.origin;
                const file = ContextSelectionAgent.getSourceById(params.id, origin, this.#workspace);
                if (!file) {
                    return {
                        error: 'Unable to find file.',
                    };
                }
                return {
                    context: new FileContext(file),
                    description: 'User selected a source file',
                    widgets: [{
                            name: 'SOURCE_FILE',
                            data: {
                                uiSourceCode: file,
                            },
                        }],
                };
            },
        });
        this.declareFunction('performanceRecordAndReload', {
            description: 'Records a new performance trace. Use this to measure, analyze, and debug page performance, general performance issues, performance metrics, and Core Web Vitals like Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS).',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: [],
                properties: {},
            },
            displayInfoFromArgs: () => {
                return {
                    title: 'Recording a performance trace',
                    action: 'performanceRecordAndReload()',
                };
            },
            handler: async () => {
                if (!this.#performanceRecordAndReload) {
                    return {
                        error: 'Performance recording is not available.',
                    };
                }
                const result = await this.#performanceRecordAndReload();
                return {
                    context: PerformanceTraceContext.fromParsedTrace(result),
                    description: 'User recorded a performance trace',
                    widgets: [{ name: 'PERFORMANCE_TRACE', data: { parsedTrace: result } }],
                };
            },
        });
        const parseLighthouseMode = (mode) => {
            return mode === 'snapshot' ? 'snapshot' : 'navigation';
        };
        this.declareFunction('runLighthouseAudits', {
            description: 'Records a Lighthouse audit on the current page. Use this to debug accessibility, SEO, and best practices. (For any performance-related questions or performance issues, do NOT use this; use performanceRecordAndReload instead).',
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: ['mode'],
                properties: {
                    mode: {
                        type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                        description: 'The mode to run Lighthouse in. Your ONLY options are "navigation" or "snapshot". You should determine this based on the user\'s question. If the user is asking specifically about accessibility, you can run in "snapshot" mode which avoids reloading the page. If the user asks for a full Lighthouse report, you should run in "navigation" mode which is the default. These are the only options you can pass.',
                        nullable: false,
                    },
                },
            },
            displayInfoFromArgs: args => {
                const mode = parseLighthouseMode(args.mode);
                return {
                    title: 'Auditing your page with Lighthouse',
                    action: `runLighthouseAudits(${mode})`,
                };
            },
            handler: async (params) => {
                if (!this.#lighthouseRecording) {
                    return {
                        error: 'Lighthouse report is not available.',
                    };
                }
                const mode = parseLighthouseMode(params.mode);
                debugLog(`Recording with Lighthouse; runMode=${mode}`);
                const result = await this.#lighthouseRecording({ mode });
                if (!result) {
                    return { error: 'Failed to generate Lighthouse report.' };
                }
                return {
                    context: new LighthouseContext(result),
                    description: 'User has selected a Lighthouse report',
                    widgets: [{ name: 'LIGHTHOUSE_REPORT', data: { report: result } }],
                };
            },
        });
        this.declareFunction('inspectDom', {
            description: `Prompts user to select a DOM element from the page. Use this when you don't know which element is selected.`,
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: '',
                nullable: true,
                required: [],
                properties: {},
            },
            displayInfoFromArgs: () => {
                return {
                    title: lockedString('Select an element on the page or in the Elements panel'),
                };
            },
            handler: async (_params, options) => {
                if (!this.#onInspectElement) {
                    return {
                        error: 'The inspect element action is not available.',
                    };
                }
                if (!options?.approved) {
                    return {
                        requiresApproval: true,
                        description: null,
                    };
                }
                const node = await this.#onInspectElement();
                if (node) {
                    return {
                        context: new DOMNodeContext(node),
                        description: 'User selected an element',
                    };
                }
                return {
                    error: 'Unable to select element.',
                };
            },
        });
        if (Root.Runtime.hostConfig.devToolsAiAssistanceStorageAgent?.enabled) {
            this.declareFunction('analyzeStorage', {
                description: 'Selects the page storage. Use this when asked about browser storage (localStorage, sessionStorage, cookies) and issues related to these.',
                parameters: {
                    type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                    description: '',
                    nullable: true,
                    required: [],
                    properties: {},
                },
                displayInfoFromArgs: () => {
                    return {
                        title: lockedString('Prepare storage analysis'),
                        action: 'analyzeStorage()',
                    };
                },
                handler: async () => {
                    const allowedOriginResult = this.#allowedOrigin();
                    if ('blocked' in allowedOriginResult) {
                        return {
                            error: 'Cross-origin access blocked due to navigation. Please start a new chat.',
                        };
                    }
                    const origin = allowedOriginResult.origin;
                    if (!origin || origin.isOpaque()) {
                        return {
                            error: 'Unable to find page storage.',
                        };
                    }
                    return {
                        context: new StorageContext(new StorageItem(origin.siteId(), origin.siteId())),
                        description: 'User selected page storage',
                    };
                },
            });
        }
    }
    async *handleContextDetails() {
    }
    async enhanceQuery(query) {
        return query;
    }
    static lastSourceId = 0;
    static uiSourceCodeId = new WeakMap();
    /**
     * This is a heuristic algorithm that gets all the source files coming from the
     * network and assigns unique ids to be linked from the LLM Markdown response.
     * Steps we do:
     * 1. Get all project that are coming from the Network. This scopes down
     * sources exposed to the LLM
     * 2. Remove all ignore listed source code. We further reduce thing that the
     * user most likely does not have interest in, from global setting.
     * 3.1. Source files don't have an uniqueId so we use the URL to differentiate
     * them.
     * 3.2. In cases where we encounter a duplicated URLs we prefer the latest one
     * coming from SourceMaps (usually only one) as that has simple code and
     * usually is what the user authored.
     */
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    static getUISourceCodes(workspace = Workspace.Workspace.WorkspaceImpl.instance()) {
        const projects = workspace.projects().filter(project => project.type() === Workspace.Workspace.projectTypes.Network);
        const uiSourceCodes = new Map();
        for (const project of projects) {
            for (const uiSourceCode of project.uiSourceCodes()) {
                if (uiSourceCode.isIgnoreListed()) {
                    continue;
                }
                const url = uiSourceCode.url();
                // This helps us pick the file that is a resolved source map.
                if (!uiSourceCodes.get(url) || uiSourceCode.contentType().isFromSourceMap()) {
                    uiSourceCodes.set(url, uiSourceCode);
                    if (!ContextSelectionAgent.uiSourceCodeId.has(uiSourceCode)) {
                        ContextSelectionAgent.uiSourceCodeId.set(uiSourceCode, ++ContextSelectionAgent.lastSourceId);
                    }
                }
            }
        }
        return [...uiSourceCodes.values()];
    }
    /**
     * Resolves a workspace source file by its ID, ensuring that the file's security
     * origin is authorized by the conversation's established origin lock.
     *
     * Fails closed by returning `undefined` if the established origin is missing or opaque,
     * if the file ID is invalid, or if the file origin does not match the lock.
     */
    static getSourceById(id, establishedOrigin, 
    // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
    workspace = Workspace.Workspace.WorkspaceImpl.instance()) {
        if (!establishedOrigin || !Number.isInteger(id) || id <= 0) {
            return undefined;
        }
        return ContextSelectionAgent.getUISourceCodes(workspace).find(file => {
            if (ContextSelectionAgent.uiSourceCodeId.get(file) !== id) {
                return false;
            }
            return isOriginAllowedByLock({ status: 'ESTABLISHED_ORIGIN', origin: establishedOrigin }, file.securityOrigin());
        });
    }
}
//# sourceMappingURL=ContextSelectionAgent.js.map