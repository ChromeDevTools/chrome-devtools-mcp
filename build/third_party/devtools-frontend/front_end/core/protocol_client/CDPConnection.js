// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Keep this in sync with https://source.chromium.org/chromium/chromium/src/+/main:third_party/inspector_protocol/crdtp/dispatch.h.
 */
export var CDPErrorStatus;
(function (CDPErrorStatus) {
    CDPErrorStatus[CDPErrorStatus["PARSE_ERROR"] = -32700] = "PARSE_ERROR";
    CDPErrorStatus[CDPErrorStatus["INVALID_REQUEST"] = -32600] = "INVALID_REQUEST";
    CDPErrorStatus[CDPErrorStatus["METHOD_NOT_FOUND"] = -32601] = "METHOD_NOT_FOUND";
    CDPErrorStatus[CDPErrorStatus["INVALID_PARAMS"] = -32602] = "INVALID_PARAMS";
    CDPErrorStatus[CDPErrorStatus["INTERNAL_ERROR"] = -32603] = "INTERNAL_ERROR";
    CDPErrorStatus[CDPErrorStatus["SERVER_ERROR"] = -32000] = "SERVER_ERROR";
    CDPErrorStatus[CDPErrorStatus["SESSION_NOT_FOUND"] = -32001] = "SESSION_NOT_FOUND";
    CDPErrorStatus[CDPErrorStatus["DEVTOOLS_STUB_ERROR"] = -32015] = "DEVTOOLS_STUB_ERROR";
    CDPErrorStatus[CDPErrorStatus["DEVTOOLS_REHYDRATION_ERROR"] = -32016] = "DEVTOOLS_REHYDRATION_ERROR";
})(CDPErrorStatus || (CDPErrorStatus = {}));
//# sourceMappingURL=CDPConnection.js.map