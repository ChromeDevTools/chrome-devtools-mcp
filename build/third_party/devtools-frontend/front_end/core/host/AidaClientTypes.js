// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
export var Role;
(function (Role) {
    /** Provide this role when giving a function call response  */
    Role[Role["ROLE_UNSPECIFIED"] = 0] = "ROLE_UNSPECIFIED";
    /** Tags the content came from the user */
    Role[Role["USER"] = 1] = "USER";
    /** Tags the content came from the LLM */
    Role[Role["MODEL"] = 2] = "MODEL";
})(Role || (Role = {}));
export var FunctionalityType;
(function (FunctionalityType) {
    // Unspecified functionality type.
    FunctionalityType[FunctionalityType["FUNCTIONALITY_TYPE_UNSPECIFIED"] = 0] = "FUNCTIONALITY_TYPE_UNSPECIFIED";
    // The generic AI chatbot functionality.
    FunctionalityType[FunctionalityType["CHAT"] = 1] = "CHAT";
    // The explain error functionality.
    FunctionalityType[FunctionalityType["EXPLAIN_ERROR"] = 2] = "EXPLAIN_ERROR";
    FunctionalityType[FunctionalityType["AGENTIC_CHAT"] = 5] = "AGENTIC_CHAT";
})(FunctionalityType || (FunctionalityType = {}));
/** See: cs/aida.proto (google3). **/
export var ClientFeature;
(function (ClientFeature) {
    // Unspecified client feature.
    ClientFeature[ClientFeature["CLIENT_FEATURE_UNSPECIFIED"] = 0] = "CLIENT_FEATURE_UNSPECIFIED";
    // Chrome console insights feature.
    ClientFeature[ClientFeature["CHROME_CONSOLE_INSIGHTS"] = 1] = "CHROME_CONSOLE_INSIGHTS";
    // Chrome AI Assistance Styling Agent.
    ClientFeature[ClientFeature["CHROME_STYLING_AGENT"] = 2] = "CHROME_STYLING_AGENT";
    // Chrome AI Assistance Network Agent.
    ClientFeature[ClientFeature["CHROME_NETWORK_AGENT"] = 7] = "CHROME_NETWORK_AGENT";
    // Chrome AI Annotations Performance Agent
    ClientFeature[ClientFeature["CHROME_PERFORMANCE_ANNOTATIONS_AGENT"] = 20] = "CHROME_PERFORMANCE_ANNOTATIONS_AGENT";
    // Chrome AI Assistance File Agent.
    ClientFeature[ClientFeature["CHROME_FILE_AGENT"] = 9] = "CHROME_FILE_AGENT";
    // Chrome AI Patch Agent.
    ClientFeature[ClientFeature["CHROME_PATCH_AGENT"] = 12] = "CHROME_PATCH_AGENT";
    // Chrome AI Assistance Performance Agent.
    ClientFeature[ClientFeature["CHROME_PERFORMANCE_FULL_AGENT"] = 24] = "CHROME_PERFORMANCE_FULL_AGENT";
    // Chrome Context Selection Agent.
    ClientFeature[ClientFeature["CHROME_CONTEXT_SELECTION_AGENT"] = 25] = "CHROME_CONTEXT_SELECTION_AGENT";
    // Chrome Accessibility Agent
    ClientFeature[ClientFeature["CHROME_ACCESSIBILITY_AGENT"] = 26] = "CHROME_ACCESSIBILITY_AGENT";
    // Chrome AI Assistance Conversation Summary Agent.
    ClientFeature[ClientFeature["CHROME_CONVERSATION_SUMMARY_AGENT"] = 27] = "CHROME_CONVERSATION_SUMMARY_AGENT";
    // Chrome AI Assistance Storage Agent.
    ClientFeature[ClientFeature["CHROME_STORAGE_AGENT"] = 28] = "CHROME_STORAGE_AGENT";
    // Chrome DevTools V2 Agent.
    ClientFeature[ClientFeature["CHROME_DEVTOOLS_V2_AGENT"] = 29] = "CHROME_DEVTOOLS_V2_AGENT";
})(ClientFeature || (ClientFeature = {}));
export var UserTier;
(function (UserTier) {
    // Unspecified user tier.
    UserTier[UserTier["USER_TIER_UNSPECIFIED"] = 0] = "USER_TIER_UNSPECIFIED";
    // Users who are internal testers.
    UserTier[UserTier["TESTERS"] = 1] = "TESTERS";
    // Users who are early adopters.
    UserTier[UserTier["BETA"] = 2] = "BETA";
    // Users in the general public.
    UserTier[UserTier["PUBLIC"] = 3] = "PUBLIC";
})(UserTier || (UserTier = {}));
/* eslint-enable @typescript-eslint/naming-convention */
export var EditType;
(function (EditType) {
    // Unknown edit type
    EditType[EditType["EDIT_TYPE_UNSPECIFIED"] = 0] = "EDIT_TYPE_UNSPECIFIED";
    // User typed code/text into file
    EditType[EditType["ADD"] = 1] = "ADD";
    // User deleted code/text from file
    EditType[EditType["DELETE"] = 2] = "DELETE";
    // User pasted into file (this includes smart paste)
    EditType[EditType["PASTE"] = 3] = "PASTE";
    // User performs an undo action
    EditType[EditType["UNDO"] = 4] = "UNDO";
    // User performs a redo action
    EditType[EditType["REDO"] = 5] = "REDO";
    // User accepted a completion from AIDA
    EditType[EditType["ACCEPT_COMPLETION"] = 6] = "ACCEPT_COMPLETION";
})(EditType || (EditType = {}));
export var Reason;
(function (Reason) {
    // Unknown reason.
    Reason[Reason["UNKNOWN"] = 0] = "UNKNOWN";
    // The file is currently open.
    Reason[Reason["CURRENTLY_OPEN"] = 1] = "CURRENTLY_OPEN";
    // The file is opened recently.
    Reason[Reason["RECENTLY_OPENED"] = 2] = "RECENTLY_OPENED";
    // The file is edited recently.
    Reason[Reason["RECENTLY_EDITED"] = 3] = "RECENTLY_EDITED";
    // The file is located within the same directory.
    Reason[Reason["COLOCATED"] = 4] = "COLOCATED";
    // Included based on relation to code around the cursor (e.g: could be
    // provided by local IDE analysis)
    Reason[Reason["RELATED_FILE"] = 5] = "RELATED_FILE";
})(Reason || (Reason = {}));
/* eslint-enable @typescript-eslint/naming-convention */
export var UseCase;
(function (UseCase) {
    // Unspecified usecase.
    UseCase[UseCase["USE_CASE_UNSPECIFIED"] = 0] = "USE_CASE_UNSPECIFIED";
    // Code generation use case is expected to generate code from scratch
    UseCase[UseCase["CODE_GENERATION"] = 1] = "CODE_GENERATION";
    // Code transformation or code editing use case.
    UseCase[UseCase["CODE_TRANSFORMATION"] = 2] = "CODE_TRANSFORMATION";
})(UseCase || (UseCase = {}));
/* eslint-enable @typescript-eslint/naming-convention */
export var RecitationAction;
(function (RecitationAction) {
    RecitationAction["ACTION_UNSPECIFIED"] = "ACTION_UNSPECIFIED";
    RecitationAction["CITE"] = "CITE";
    RecitationAction["BLOCK"] = "BLOCK";
    RecitationAction["NO_ACTION"] = "NO_ACTION";
    RecitationAction["EXEMPT_FOUND_IN_PROMPT"] = "EXEMPT_FOUND_IN_PROMPT";
})(RecitationAction || (RecitationAction = {}));
export var CitationSourceType;
(function (CitationSourceType) {
    CitationSourceType["CITATION_SOURCE_TYPE_UNSPECIFIED"] = "CITATION_SOURCE_TYPE_UNSPECIFIED";
    CitationSourceType["TRAINING_DATA"] = "TRAINING_DATA";
    CitationSourceType["WORLD_FACTS"] = "WORLD_FACTS";
    CitationSourceType["LOCAL_FACTS"] = "LOCAL_FACTS";
    CitationSourceType["INDIRECT"] = "INDIRECT";
})(CitationSourceType || (CitationSourceType = {}));
export function debugLog(...log) {
    if (!Boolean(Platform.HostRuntime.HOST_RUNTIME.getLocalStorage()?.getItem('debugAiServicesEnabled'))) {
        return;
    }
    // eslint-disable-next-line no-console
    console.log(...log);
}
//# sourceMappingURL=AidaClientTypes.js.map