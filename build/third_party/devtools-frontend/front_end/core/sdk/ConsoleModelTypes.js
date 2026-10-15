// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// We need these enums here as enum values of enums defined in closure land
// are typed as string, and hence provide for weaker type-checking.
export var FrontendMessageType;
(function (FrontendMessageType) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    FrontendMessageType["Result"] = "result";
    FrontendMessageType["Command"] = "command";
    FrontendMessageType["System"] = "system";
    FrontendMessageType["QueryObjectResult"] = "queryObjectResult";
    /* eslint-enable @typescript-eslint/naming-convention */
})(FrontendMessageType || (FrontendMessageType = {}));
//# sourceMappingURL=ConsoleModelTypes.js.map