// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export var InsightWarning;
(function (InsightWarning) {
    InsightWarning["NO_FP"] = "NO_FP";
    InsightWarning["NO_LCP"] = "NO_LCP";
    // No network request could be identified as the primary HTML document.
    InsightWarning["NO_DOCUMENT_REQUEST"] = "NO_DOCUMENT_REQUEST";
    InsightWarning["NO_LAYOUT"] = "NO_LAYOUT";
})(InsightWarning || (InsightWarning = {}));
export var InsightCategory;
(function (InsightCategory) {
    InsightCategory["ALL"] = "All";
    InsightCategory["INP"] = "INP";
    InsightCategory["LCP"] = "LCP";
    InsightCategory["CLS"] = "CLS";
})(InsightCategory || (InsightCategory = {}));
export var InsightKeys;
(function (InsightKeys) {
    InsightKeys["LCP_BREAKDOWN"] = "LCPBreakdown";
    InsightKeys["INP_BREAKDOWN"] = "INPBreakdown";
    InsightKeys["CLS_CULPRITS"] = "CLSCulprits";
    InsightKeys["THIRD_PARTIES"] = "ThirdParties";
    InsightKeys["DOCUMENT_LATENCY"] = "DocumentLatency";
    InsightKeys["DOM_SIZE"] = "DOMSize";
    InsightKeys["DUPLICATE_JAVASCRIPT"] = "DuplicatedJavaScript";
    InsightKeys["FONT_DISPLAY"] = "FontDisplay";
    InsightKeys["FORCED_REFLOW"] = "ForcedReflow";
    InsightKeys["IMAGE_DELIVERY"] = "ImageDelivery";
    InsightKeys["LCP_DISCOVERY"] = "LCPDiscovery";
    InsightKeys["LEGACY_JAVASCRIPT"] = "LegacyJavaScript";
    InsightKeys["NETWORK_DEPENDENCY_TREE"] = "NetworkDependencyTree";
    InsightKeys["RENDER_BLOCKING"] = "RenderBlocking";
    InsightKeys["SLOW_CSS_SELECTOR"] = "SlowCSSSelector";
    InsightKeys["VIEWPORT"] = "Viewport";
    InsightKeys["MODERN_HTTP"] = "ModernHTTP";
    InsightKeys["CACHE"] = "Cache";
    InsightKeys["CHARACTER_SET"] = "CharacterSet";
})(InsightKeys || (InsightKeys = {}));
//# sourceMappingURL=types.js.map