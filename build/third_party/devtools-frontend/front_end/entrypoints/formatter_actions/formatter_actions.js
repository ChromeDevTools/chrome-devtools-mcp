// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export var FormatterActions;
(function (FormatterActions) {
    FormatterActions["FORMAT"] = "format";
    FormatterActions["PARSE_CSS"] = "parseCSS";
    FormatterActions["JAVASCRIPT_SUBSTITUTE"] = "javaScriptSubstitute";
    FormatterActions["JAVASCRIPT_SCOPE_TREE"] = "javaScriptScopeTree";
})(FormatterActions || (FormatterActions = {}));
export var FormattableMediaTypes;
(function (FormattableMediaTypes) {
    FormattableMediaTypes["APPLICATION_JAVASCRIPT"] = "application/javascript";
    FormattableMediaTypes["APPLICATION_JSON"] = "application/json";
    FormattableMediaTypes["APPLICATION_MANIFEST_JSON"] = "application/manifest+json";
    FormattableMediaTypes["TEXT_CSS"] = "text/css";
    FormattableMediaTypes["TEXT_HTML"] = "text/html";
    FormattableMediaTypes["TEXT_JAVASCRIPT"] = "text/javascript";
})(FormattableMediaTypes || (FormattableMediaTypes = {}));
export const FORMATTABLE_MEDIA_TYPES = [
    "application/javascript" /* FormattableMediaTypes.APPLICATION_JAVASCRIPT */,
    "application/json" /* FormattableMediaTypes.APPLICATION_JSON */,
    "application/manifest+json" /* FormattableMediaTypes.APPLICATION_MANIFEST_JSON */,
    "text/css" /* FormattableMediaTypes.TEXT_CSS */,
    "text/html" /* FormattableMediaTypes.TEXT_HTML */,
    "text/javascript" /* FormattableMediaTypes.TEXT_JAVASCRIPT */,
];
export var DefinitionKind;
(function (DefinitionKind) {
    DefinitionKind[DefinitionKind["NONE"] = 0] = "NONE";
    DefinitionKind[DefinitionKind["LET"] = 1] = "LET";
    DefinitionKind[DefinitionKind["VAR"] = 2] = "VAR";
    DefinitionKind[DefinitionKind["FIXED"] = 3] = "FIXED";
})(DefinitionKind || (DefinitionKind = {}));
export var ScopeKind;
(function (ScopeKind) {
    ScopeKind[ScopeKind["BLOCK"] = 1] = "BLOCK";
    ScopeKind[ScopeKind["FUNCTION"] = 2] = "FUNCTION";
    ScopeKind[ScopeKind["GLOBAL"] = 3] = "GLOBAL";
    ScopeKind[ScopeKind["ARROW_FUNCTION"] = 4] = "ARROW_FUNCTION";
})(ScopeKind || (ScopeKind = {}));
//# sourceMappingURL=formatter_actions.js.map