// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { AiAgent, sanitizeSuggestions, } from './agents/AiAgent.js';
import { executeJsCode } from './agents/ExecuteJavascript.js';
import { ChangeManager } from './ChangeManager.js';
import { DOMNodeContext } from './contexts/DOMNodeContext.js';
import { LighthouseContext } from './contexts/LighthouseContext.js';
import { PerformanceTraceContext } from './contexts/PerformanceTraceContext.js';
import { debugLog } from './debug.js';
import { ExtensionScope } from './ExtensionScope.js';
import { SKILLS } from './skills/SkillRegistry.js';
import { isOriginAllowedByLock, } from './tools/Tool.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
const SKILL_DISPLAY_NAMES = {
    styling: 'CSS and styling',
    network: 'Network requests',
    performance: 'Performance',
    storage: 'Storage',
    sources: 'Sources',
    lighthouse: 'Lighthouse',
};
const preamble = `You are the most advanced unified AI assistant integrated into Chrome DevTools.
Your role is to help web developers debug, analyze, and optimize web applications by learning specialized skills and utilizing tools.

# Style Guidelines
* **Precision and Brevity**: Use the precision of Strunk & White, the brevity of Hemingway, and the simple clarity of Vonnegut. Keep answers short, direct, and avoid repeated information or filler.
* **Tone**: Technical, precise, educational, and supportive.
* **No Self-Reference**: Do not mention that you are an AI, or refer to yourself in the third person. Simulate a senior web development expert.
* **No Internal Details**: Do not mention internal implementation details like the names of functions or tools you called (e.g., do not say "I called getStyles").

# Workflow
1. **Analyze**: Understand the user's intent, the context provided, and what they are trying to achieve.
2. **Investigate**: Proactively use your learned skills and tools to gather live data. Do not make assumptions or guess without sufficient evidence.
3. **Diagnose**: Explore multiple potential explanations and solutions. Distinguish between the primary root cause and contributing factors.
4. **Respond**: Provide a structured, clear, and actionable response.

# Response Structure
If the user asks a question that requires an investigation or debugging, use this structure:
* **Root Cause(s)**: Point out the root cause(s) of the problem.
  - Example: "**Root Cause**: [reason]" or "**Root Causes**:" followed by a bulleted list.
* **Suggestion(s)**: List actionable solution suggestion(s) in order of impact.
  - Example: "**Suggestion**: [Suggestion]" or "**Suggestions**:" followed by a bulleted list.

# Follow-up Suggestions
* Output a list of suggested follow-up queries or actions for the user at the very end of your response.
* The format MUST be SUGGESTIONS: ["suggestion 1", "suggestion 2"] on its own single line.
* Ensure suggestions are relevant, concise, and helpful next steps for the user.

# Constraints
* **CRITICAL**: You are a web development assistant. NEVER provide answers to questions of unrelated topics (such as legal advice, financial advice, personal opinions, medical advice, religion, race, politics, sexuality, gender, or any other non-web-development topics). If asked about these, respond with: "Sorry, I can't answer that. I'm best at questions about web development and debugging."
* **CRITICAL**: Do not write standalone scripts (such as Python or bash) or arbitrary code to interact with the environment. The only way to execute code in the inspected page is via the 'executeJavaScript' tool.
* **CRITICAL**: Do not expose raw, internal system identifiers (such as database IDs, internal node paths, or event keys) directly to the user. Use descriptive names instead.`;
/**
 * Matches the follow-up suggestions directive in plain uppercase, at the start
 * of the line or after whitespace: `SUGGESTIONS: ["a"]`, `Done. SUGGESTIONS: ["a"]`.
 * It is case-sensitive, so `Suggestions:` and `DEFAULT_SUGGESTIONS:` do not match.
 * - Group 1: the text before the directive.
 */
const PLAIN_SUGGESTIONS_REGEX = /^(.*?)(?:^|\s)SUGGESTIONS:/;
/**
 * Matches any spelling of the follow-up suggestions directive that is followed
 * by an array ending the line, for example `**Suggestions**: ["a"]`,
 * `- suggestions: ["a"]` or `` `SUGGESTIONS`: ["a"] ``. The keyword is
 * case-insensitive, must be at the start of the line or after whitespace, and
 * can have up to three markdown characters (`*`, `_` or `` ` ``) on each side
 * of it and of the colon. Only markdown characters or whitespace can follow the
 * closing `]`, so `A few suggestions: [see docs](url)` does not match.
 * - Group 1: the text before the directive. It is greedy, so the last keyword
 *   on the line is used: `**Suggestions**: [1] Fix. SUGGESTIONS: ["a"]` keeps
 *   `**Suggestions**: [1] Fix.` as answer text.
 * - Group 2: the array, from the first `[` after the keyword to the last `]`.
 */
const FORMATTED_SUGGESTIONS_REGEX = /^(.*)(?:^|\s)[*_`]{0,3}suggestions[*_`]{0,3}:[*_`]{0,3}\s*`?(\[.*\])[*_`\s]*$/i;
/**
 * Matches the start of any spelling of the follow-up suggestions directive
 * while it is streaming: the keyword in any case, at the start of the line or
 * after whitespace, with optional markdown characters, followed by `:`. Nothing
 * after the colon is checked, because the array may still be arriving.
 * - Group 1: the text before the directive.
 */
const STREAMING_SUGGESTIONS_REGEX = /^(.*?)(?:^|\s)[*_`]{0,3}suggestions[*_`]{0,3}:/i;
/**
 * Matches a markdown list or heading marker on its own, such as `-`, `1.` or
 * `###`. The marker is dropped when the directive was the only thing after it.
 */
const LIST_OR_HEADING_MARKER_REGEX = /^(?:[-*+]|\d+\.|#{1,6})$/;
/**
 * Returns the answer text with the directive removed from the last line.
 * `textBeforeDirective` is what the last line contained before the directive.
 */
function removeDirectiveFromLastLine(lines, textBeforeDirective) {
    const keptText = textBeforeDirective.trimEnd();
    const lastLine = LIST_OR_HEADING_MARKER_REGEX.test(keptText.trim()) ? '' : keptText;
    return [...lines.slice(0, -1), lastLine].join('\n').trimEnd();
}
/**
 * Parses the JSON array of a suggestions directive. Returns `null` if `array`
 * is not valid JSON, and `{suggestions: undefined}` if it is valid but holds no
 * usable suggestions.
 */
function parseSuggestionsArray(array) {
    try {
        return { suggestions: sanitizeSuggestions(array) };
    }
    catch {
        // Invalid JSON: the caller decides whether the line is still a directive.
        return null;
    }
}
/**
 * Parses a completed response. Only the last line can be the follow-up
 * suggestions directive; every other line is always kept as answer text.
 * 1. If any spelling of the directive is followed by a valid JSON array that
 *    ends the line, it is removed and the array becomes the suggestions.
 * 2. Otherwise, if the line contains `SUGGESTIONS:` in plain uppercase, it is
 *    removed from the keyword onward even though the array is missing or not
 *    valid JSON, and no suggestions are returned.
 * 3. Otherwise, the line is kept unchanged.
 * Text before the directive on the same line is kept.
 */
function parseCompletedSuggestions(text) {
    const lines = text.split('\n');
    const lastLine = lines[lines.length - 1];
    const formatted = lastLine.match(FORMATTED_SUGGESTIONS_REGEX);
    const parsedArray = formatted ? parseSuggestionsArray(formatted[2]) : null;
    if (formatted && parsedArray) {
        const answer = removeDirectiveFromLastLine(lines, formatted[1]);
        return parsedArray.suggestions ? { answer, suggestions: parsedArray.suggestions } : { answer };
    }
    const plain = lastLine.match(PLAIN_SUGGESTIONS_REGEX);
    if (plain) {
        return { answer: removeDirectiveFromLastLine(lines, plain[1]) };
    }
    return { answer: text };
}
/**
 * Hides a follow-up suggestions directive that is still streaming on the last
 * line, from the keyword onward, without looking at its array. Hiding text by
 * mistake is temporary: the completed response is parsed again by
 * `parseCompletedSuggestions()`.
 */
function hideStreamingSuggestions(text) {
    const lines = text.split('\n');
    const match = lines[lines.length - 1].match(STREAMING_SUGGESTIONS_REGEX);
    return match ? removeDirectiveFromLastLine(lines, match[1]) : text;
}
export class AiAgent2 extends AiAgent {
    // TODO: The static preamble is a placeholder and will eventually live server-side.
    preamble = preamble;
    clientFeature = Host.AidaClient.ClientFeature.CHROME_DEVTOOLS_V2_AGENT;
    get userTier() {
        return Root.Runtime.hostConfig.devToolsAiV2Architecture?.userTier;
    }
    #changes;
    #execJs;
    #originLock;
    #lighthouseRecording;
    #performanceRecordAndReload;
    get options() {
        return {};
    }
    async preRun() {
        // One-way latch: once sensitive data enters the conversation history,
        // logging must remain disabled for the lifetime of this agent instance.
        if (this.context && !this.context.isLoggingEnabled()) {
            this.disableServerSideLogging();
        }
        const target = this.targetManager.primaryPageTarget();
        const originLock = this.#originLock();
        // Avoid fetching or caching top-level documents across origins or when
        // the origin lock is blocked/uninitialized.
        const isTargetAllowed = target && isOriginAllowedByLock(originLock, target.inspectedSecurityOrigin());
        const domModel = isTargetAllowed ? target.model(SDK.DOMModel.DOMModel) : null;
        // Ensure the DOM document is requested and cached in DOMModel so that
        // subsequent synchronous lookups via domModel.existingDocument() (e.g.,
        // in #getDocumentBodyNode()) resolve the document and body immediately.
        if (domModel) {
            if (!domModel.existingDocument()) {
                try {
                    await domModel.requestDocument();
                }
                catch (e) {
                    debugLog('AiAgent2: Failed to request document', e);
                }
            }
            if (!domModel.existingDocument()?.body) {
                try {
                    await domModel.pushNodeByPathToFrontend('1,HTML,1,BODY');
                }
                catch (e) {
                    debugLog('AiAgent2: Failed to push body node to frontend', e);
                }
            }
        }
    }
    #activeSkills = new Set();
    #declaredTools = new Set();
    constructor(opts) {
        super({
            ...opts,
            allowedOrigin: opts.allowedOrigin ?? (() => {
                const lock = opts.originLock();
                if (lock.status === 'BLOCKED_BY_NAVIGATION') {
                    return { blocked: true };
                }
                if (lock.status === 'ESTABLISHED_ORIGIN') {
                    return { origin: lock.origin };
                }
                return { origin: undefined };
            }),
        });
        this.#changes = opts.changeManager ?? new ChangeManager(opts.targetManager);
        this.#lighthouseRecording = opts.lighthouseRecording;
        this.#performanceRecordAndReload = opts.performanceRecordAndReload;
        this.#execJs = opts.execJs ?? executeJsCode;
        this.#originLock = opts.originLock;
        this.#declaredTools.add('learnSkills');
        this.declareFunction('learnSkills', {
            description: () => {
                const unloadedSkills = Object.keys(this.getSkills()).filter(name => !this.#activeSkills.has(name));
                return `Loads the specified skills to gain access to their specialized tools. Call this ONLY for skills listed under Available skills that are not yet loaded. Do not call this for skills that are already loaded. Available skills that are not yet loaded: ${unloadedSkills.join(', ')}.`;
            },
            parameters: {
                type: 6 /* Host.AidaClient.ParametersTypes.OBJECT */,
                description: 'Parameters for learning skills',
                properties: {
                    skills: {
                        type: 5 /* Host.AidaClient.ParametersTypes.ARRAY */,
                        items: {
                            type: 1 /* Host.AidaClient.ParametersTypes.STRING */,
                            description: 'Skill name',
                        },
                        description: 'List of unloaded skill names to load',
                    },
                },
                required: ['skills'],
            },
            displayInfoFromArgs: args => {
                const isSingular = args.skills.length === 1;
                const prefix = isSingular ? 'Learning skill' : 'Learning skills';
                const names = args.skills.map(name => SKILL_DISPLAY_NAMES[name] ?? name).join(', ');
                return {
                    title: `${prefix}: ${names}`,
                    action: `learnSkills(${args.skills.map(name => `'${name}'`).join(', ')})`,
                };
            },
            handler: async (args) => {
                const result = await this.learnSkill(args.skills);
                return { result };
            },
        });
    }
    async enhanceQuery(query, selected = null, 
    // TODO: support multimodal input in AiAgent2.
    _multimodalInputType) {
        let enhancedQuery = query;
        if (selected) {
            const promptDetails = await selected.getPromptDetails();
            if (promptDetails) {
                enhancedQuery = `${promptDetails}

# User request

QUERY: ${query}`;
            }
        }
        const unloadedSkills = Object.entries(this.getSkills()).filter(([name]) => !this.#activeSkills.has(name));
        if (unloadedSkills.length === 0) {
            return enhancedQuery;
        }
        // Note: Test assertion helpers in front_end/testing/AiAssistanceHelpers.ts (assertSkillLoaded,
        // assertSkillNotLoaded) rely on this formatting (`Available skills that are not yet loaded:`
        // and `- ${name}: ${skill.description}`). If this format is updated, update those helpers too.
        const skillsManifest = unloadedSkills.map(([name, skill]) => `- ${name}: ${skill.description}`).join('\n');
        return `Available skills that are not yet loaded:
${skillsManifest}

You must call \`learnSkills\` to load a skill before you can use its tools.
If the user's request requires a skill that is not currently loaded, you MUST call \`learnSkills\` to load that skill first, instead of attempting to solve the query using tools from other skills.
Do NOT call \`learnSkills\` for skills that are already loaded.

User query: ${enhancedQuery}`;
    }
    /**
     * Parses a completed response. Only the last line can be the follow-up
     * suggestions directive. See `parseCompletedSuggestions()`.
     */
    parseTextResponse(response) {
        return parseCompletedSuggestions(response.trim());
    }
    /**
     * Parses a response that is still streaming, hiding a suggestions directive
     * on the last line. See `hideStreamingSuggestions()`.
     */
    parsePartialTextResponse(response) {
        return { answer: hideStreamingSuggestions(response.trim()) };
    }
    async *handleContextDetails(selected) {
        if (selected) {
            const [details, widgets] = await Promise.all([
                selected.getUserFacingDetails(),
                selected.getWidgets(),
            ]);
            if (details) {
                yield {
                    type: "context" /* ResponseType.CONTEXT */,
                    details,
                    ...(widgets.length > 0 ? { widgets } : {}),
                };
            }
        }
    }
    getSkills() {
        return SKILLS;
    }
    async learnSkill(names) {
        let response = '';
        const skills = this.getSkills();
        for (const name of names) {
            if (this.#activeSkills.has(name)) {
                debugLog(`[AiAgent2] Skill '${name}' is already loaded`);
                response += `Error: Skill '${name}' is already loaded. Call its tools directly instead of invoking learnSkills for '${name}' again.\n`;
                continue;
            }
            const skillObj = skills[name];
            if (skillObj) {
                this.#activeSkills.add(name);
                debugLog(`[AiAgent2] Loaded skill '${name}' with tools: [${skillObj.allowedTools.join(', ')}]`);
                response += `Skill ${name} loaded. Instructions:\n${skillObj.instructions}\n`;
                for (const toolName of skillObj.allowedTools) {
                    const tool = ToolRegistry.get(toolName);
                    if (tool) {
                        this.#declareTool(tool);
                    }
                }
            }
            else {
                debugLog(`[AiAgent2] Failed to load skill '${name}'`);
                response += `Failed to load skill ${name}. Valid skills are: ${Object.keys(skills).join(', ')}.\n`;
            }
        }
        return response.trim();
    }
    #getExecutionContextNode() {
        if (this.context instanceof DOMNodeContext) {
            return this.context.getItem();
        }
        return this.#getDocumentBodyNode();
    }
    #createExtensionScope(changes) {
        return new ExtensionScope(changes, this.sessionId, this.#getExecutionContextNode());
    }
    /**
     * Declares a tool to be available to the agent model, verifying first that
     * it hasn't already been declared to prevent duplicate declaration errors.
     */
    #declareTool(tool) {
        if (this.#declaredTools.has(tool.name)) {
            return;
        }
        this.#declaredTools.add(tool.name);
        this.declareFunction(tool.name, {
            description: tool.description,
            parameters: tool.parameters,
            displayInfoFromArgs: tool.displayInfoFromArgs,
            permissionPrompt: tool.permissionPrompt,
            permissionTitle: tool.permissionTitle,
            handler: (args, options) => {
                const context = {
                    changeManager: this.#changes,
                    createExtensionScope: this.#createExtensionScope.bind(this),
                    execJs: this.#execJs,
                    getExecutionContextNode: () => this.#getExecutionContextNode(),
                    getTarget: () => this.#getTarget(),
                    getOriginLock: () => this.#originLock(),
                    getLighthouseReport: () => (this.context instanceof LighthouseContext ? this.context.getItem() : null),
                    runLighthouse: async (overrides) => await (this.#lighthouseRecording?.(overrides) ?? null),
                    getPerformanceTraceContext: () => (this.context instanceof PerformanceTraceContext ? this.context : null),
                    performanceRecordAndReload: this.#performanceRecordAndReload,
                    disableLogging: () => {
                        this.disableServerSideLogging();
                    },
                };
                return tool.handler(args, context, options);
            },
        });
    }
    /**
     * Returns the primary page target unless origin access is explicitly blocked
     * (e.g. following cross-origin navigation).
     * Tools use this target to resolve node IDs and fetch frame resources, and
     * perform their own origin checks on the resolved entities.
     */
    #getTarget() {
        if (this.#originLock().status === 'BLOCKED_BY_NAVIGATION') {
            return null;
        }
        return this.targetManager.primaryPageTarget();
    }
    /**
     * For non-DOM contexts (e.g., Lighthouse accessibility reports or storage items),
     * there is no user-selected DOM node. We fall back to the document body as the
     * default execution context node so scripts have a valid `$0` target.
     * Returns null if the conversation origin is not established or
     * does not match the primary page document's security origin.
     */
    #getDocumentBodyNode() {
        const target = this.#getTarget();
        const document = target?.model(SDK.DOMModel.DOMModel)?.existingDocument();
        if (!document) {
            return null;
        }
        const originLock = this.#originLock();
        if (!isOriginAllowedByLock(originLock, document.securityOrigin())) {
            return null;
        }
        return document.body ?? null;
    }
    get activeSkills() {
        return this.#activeSkills;
    }
}
//# sourceMappingURL=AiAgent2.js.map