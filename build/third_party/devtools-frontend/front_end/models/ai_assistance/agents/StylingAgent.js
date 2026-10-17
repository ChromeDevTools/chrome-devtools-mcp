// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Host from '../../../core/host/host.js';
import * as Root from '../../../core/root/root.js';
import { ChangeManager } from '../ChangeManager.js';
import { ExtensionScope } from '../ExtensionScope.js';
import { AI_ASSISTANCE_CSS_CLASS_NAME } from '../injected.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { AiAgent, } from './AiAgent.js';
import { executeJsCode, } from './ExecuteJavascript.js';
const preamble = `You are the most advanced CSS/DOM/HTML debugging assistant integrated into Chrome DevTools.
You always suggest considering the best web development practices and the newest platform features such as view transitions.
The user selected a DOM element in the browser's DevTools and sends a query about the page or the selected DOM element.
First, examine the provided context, then use the functions to gather additional context and resolve the user request.

# Considerations

* Meticulously investigate all potential causes for the observed behavior before moving on. Gather comprehensive information about the element's parent, siblings, children, and any overlapping elements, paying close attention to properties that are likely relevant to the query.
* Be aware of the different node types (element, text, comment, document fragment, etc.) and their properties. You will always be provided with information about node types of parent, siblings and children of the selected element.
* Avoid making assumptions without sufficient evidence, and always seek further clarification if needed.
* Always explore multiple possible explanations for the observed behavior before settling on a conclusion.
* When presenting solutions, clearly distinguish between the primary cause and contributing factors.
* Please answer only if you are sure about the answer. Otherwise, explain why you're not able to answer.
* When answering, always consider MULTIPLE possible solutions.
* When answering, remember to consider CSS concepts such as the CSS cascade, explicit and implicit stacking contexts and various CSS layout types.
* Use functions available to you to investigate and fulfill the user request.
* After applying a fix, please ask the user to confirm if the fix worked or not.
* ALWAYS OUTPUT a list of follow-up queries at the end of your text response. The format is SUGGESTIONS: ["suggestion1", "suggestion2", "suggestion3"]. Make sure that the array and the \`SUGGESTIONS: \` text is in the same line. You're also capable of executing the fix for the issue user mentioned. Reflect this in your suggestions.
* Use the precision of Strunk & White, the brevity of Hemingway, and the simple clarity of Vonnegut. Don't add repeated information, and keep the whole answer short.
* If the target element is in a cross-origin iframe, stop and ask the user to select it in the Elements panel and start a new chat with that context.
* **CRITICAL** NEVER write full Python programs - you should only write individual statements that invoke a single function from the provided library.
* **CRITICAL** NEVER output text before a function call. Always do a function call first.
* **CRITICAL** When answering questions about positioning or layout, ALWAYS inspect \`position\`, \`display\` and all other related properties. You MUST provide a specific list of CSS property names when calling functions to get styles. Do not use generic values like "all" or "*".
* **CRITICAL** You are a CSS/DOM/HTML debugging assistant. NEVER provide answers to questions of unrelated topics such as legal advice, financial advice, personal opinions, medical advice, religion, race, politics, sexuality, gender, or any other non web-development topics. Answer "Sorry, I can't answer that. I'm best at questions about debugging web pages." to such questions.

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
      - [Suggestion 2]`;
/* clang-format on */
const promptForScreenshot = `The user has provided you a screenshot of the page (as visible in the viewport) in base64-encoded format. You SHOULD use it while answering user's queries.

* Try to connect the screenshot to actual DOM elements in the page.
`;
const promptForUploadedImage = `The user has uploaded an image in base64-encoded format. You SHOULD use it while answering user's queries.
`;
const considerationsForMultimodalInputEvaluation = `# Considerations for evaluating image:
* Pay close attention to the spatial details as well as the visual appearance of the selected element in the image, particularly in relation to layout, spacing, and styling.
* Analyze the image to identify the layout structure surrounding the element, including the positioning of neighboring elements.
* Extract visual information from the image, such as colors, fonts, spacing, and sizes, that might be relevant to the user's query.
* If the image suggests responsiveness issues (e.g., cropped content, overlapping elements), consider those in your response.
* Consider the surrounding elements and overall layout in the image, but prioritize the selected element's styling and positioning.
* **CRITICAL** When the user provides image input, interpret and use content and information from the image STRICTLY for web site debugging purposes.

* As part of THOUGHT, evaluate the image to gather data that might be needed to answer the question.
In case query is related to the image, ALWAYS first use image evaluation to get all details from the image. ONLY after you have all data needed from image, you should move to other steps.

`;
/* clang-format on */
const MULTIMODAL_ENHANCEMENT_PROMPTS = {
    ["screenshot" /* MultimodalInputType.SCREENSHOT */]: promptForScreenshot + considerationsForMultimodalInputEvaluation,
    ["uploaded-image" /* MultimodalInputType.UPLOADED_IMAGE */]: promptForUploadedImage + considerationsForMultimodalInputEvaluation,
};
export const AI_ASSISTANCE_FILTER_REGEX = `\\.${AI_ASSISTANCE_CSS_CLASS_NAME}-.*&`;
/**
 * One agent instance handles one conversation. Create a new agent
 * instance for a new conversation.
 */
export class StylingAgent extends AiAgent {
    preamble = preamble;
    clientFeature = Host.AidaClient.ClientFeature.CHROME_STYLING_AGENT;
    get userTier() {
        return Root.Runtime.hostConfig.devToolsFreestyler?.userTier;
    }
    get executionMode() {
        return Root.Runtime.hostConfig.devToolsFreestyler?.executionMode ??
            Root.Runtime.HostConfigFreestylerExecutionMode.ALL_SCRIPTS;
    }
    get options() {
        const temperature = Root.Runtime.hostConfig.devToolsFreestyler?.temperature;
        const modelId = Root.Runtime.hostConfig.devToolsFreestyler?.modelId;
        return {
            temperature,
            modelId,
        };
    }
    get multimodalInputEnabled() {
        return Boolean(Root.Runtime.hostConfig.devToolsFreestyler?.multimodal);
    }
    #execJs;
    #changes;
    #createExtensionScope;
    constructor(opts) {
        super(opts);
        this.#changes = opts.changeManager || new ChangeManager(opts.targetManager);
        this.#execJs = opts.execJs ?? executeJsCode;
        this.#createExtensionScope = opts.createExtensionScope ?? ((changes) => {
            return new ExtensionScope(changes, this.sessionId, this.context?.getItem() ?? null);
        });
        const getStylesTool = ToolRegistry.get("getStyles" /* ToolName.GET_STYLES */);
        if (!getStylesTool) {
            throw new Error('Required tool "getStyles" not found');
        }
        this.declareFunction("getStyles" /* ToolName.GET_STYLES */, {
            description: getStylesTool.description,
            parameters: getStylesTool.parameters,
            displayInfoFromArgs: getStylesTool.displayInfoFromArgs,
            handler: async (args) => {
                const context = this.context;
                if (!context) {
                    return { error: 'Error: Could not find the currently selected element.' };
                }
                return await getStylesTool.handler(args, {
                    getTarget: () => this.targetManager.primaryPageTarget() ?? context.getItem().domModel().target(),
                    getOriginLock: () => {
                        // V1 StylingAgent adapts the selected DOM node's security origin to OriginLockState.
                        const origin = context.getOrigin();
                        return origin ? { status: 'ESTABLISHED_ORIGIN', origin } : { status: 'UNINITIALIZED' };
                    },
                });
            },
        });
        const executeJsTool = ToolRegistry.get("executeJavaScript" /* ToolName.EXECUTE_JAVASCRIPT */);
        if (!executeJsTool) {
            throw new Error('Required tool "executeJavaScript" not found');
        }
        this.declareFunction("executeJavaScript" /* ToolName.EXECUTE_JAVASCRIPT */, {
            description: executeJsTool.description,
            parameters: executeJsTool.parameters,
            displayInfoFromArgs: executeJsTool.displayInfoFromArgs,
            handler: (args, options) => executeJsTool.handler(args, {
                changeManager: this.#changes,
                createExtensionScope: this.#createExtensionScope.bind(this),
                execJs: this.#execJs,
                getExecutionContextNode: () => this.context?.getItem() ?? null,
                getOriginLock: () => {
                    // V1 StylingAgent adapts the selected DOM node's security origin to OriginLockState.
                    const origin = this.context?.getOrigin();
                    return origin ? { status: 'ESTABLISHED_ORIGIN', origin } : { status: 'UNINITIALIZED' };
                },
            }, options),
        });
    }
    preambleFeatures() {
        return ['function_calling'];
    }
    async *handleContextDetails(selectedElement) {
        if (selectedElement) {
            const details = await selectedElement.getUserFacingDetails();
            if (details) {
                yield {
                    type: "context" /* ResponseType.CONTEXT */,
                    details,
                };
            }
        }
    }
    async enhanceQuery(query, selectedElement, multimodalInputType) {
        const multimodalInputEnhancementQuery = this.multimodalInputEnabled && multimodalInputType ? MULTIMODAL_ENHANCEMENT_PROMPTS[multimodalInputType] : '';
        const promptDetails = selectedElement ? await selectedElement.getPromptDetails() : null;
        const elementEnchancementQuery = promptDetails ? `${promptDetails}\n\n# User request\n\n` : '';
        return `${multimodalInputEnhancementQuery}${elementEnchancementQuery}QUERY: ${query}`;
    }
}
//# sourceMappingURL=StylingAgent.js.map