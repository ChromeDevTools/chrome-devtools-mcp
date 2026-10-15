// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export var ExperimentName;
(function (ExperimentName) {
    ExperimentName["ALL"] = "*";
    ExperimentName["PROTOCOL_MONITOR"] = "protocol-monitor";
    ExperimentName["INSTRUMENTATION_BREAKPOINTS"] = "instrumentation-breakpoints";
    ExperimentName["DURABLE_MESSAGES"] = "durable-messages";
    ExperimentName["JPEG_XL"] = "jpeg-xl";
    ExperimentName["PLUS_BUTTON"] = "plus-button";
    ExperimentName["SOURCE_MAP_SCOPES_IN_SOURCES_PANEL"] = "source-map-scopes-in-sources-panel";
    // Adding or removing an entry from this enum?
    // You will need to update:
    // 1. DevToolsExperiments enum in host/UserMetrics.ts
    // 2. Maybe REGISTERED_EXPERIMENTS in EnvironmentHelpers.ts (to create this experiment in the test env)
})(ExperimentName || (ExperimentName = {}));
//# sourceMappingURL=ExperimentNames.js.map