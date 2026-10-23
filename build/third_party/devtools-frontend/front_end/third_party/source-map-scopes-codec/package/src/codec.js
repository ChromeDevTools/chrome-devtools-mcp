// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export var Tag;
(function (Tag) {
    Tag[Tag["ORIGINAL_SCOPE_START"] = 1] = "ORIGINAL_SCOPE_START";
    Tag[Tag["ORIGINAL_SCOPE_END"] = 2] = "ORIGINAL_SCOPE_END";
    Tag[Tag["ORIGINAL_SCOPE_VARIABLES"] = 3] = "ORIGINAL_SCOPE_VARIABLES";
    Tag[Tag["GENERATED_RANGE_START"] = 4] = "GENERATED_RANGE_START";
    Tag[Tag["GENERATED_RANGE_END"] = 5] = "GENERATED_RANGE_END";
    Tag[Tag["GENERATED_RANGE_BINDINGS"] = 6] = "GENERATED_RANGE_BINDINGS";
    Tag[Tag["GENERATED_RANGE_SUBRANGE_BINDING"] = 7] = "GENERATED_RANGE_SUBRANGE_BINDING";
    Tag[Tag["GENERATED_RANGE_CALL_SITE"] = 8] = "GENERATED_RANGE_CALL_SITE";
    Tag[Tag["VENDOR_EXTENSION"] = 21] = "VENDOR_EXTENSION";
})(Tag || (Tag = {}));
export var EncodedTag;
(function (EncodedTag) {
    EncodedTag["ORIGINAL_SCOPE_START"] = "B";
    EncodedTag["ORIGINAL_SCOPE_END"] = "C";
    EncodedTag["ORIGINAL_SCOPE_VARIABLES"] = "D";
    EncodedTag["GENERATED_RANGE_START"] = "E";
    EncodedTag["GENERATED_RANGE_END"] = "F";
    EncodedTag["GENERATED_RANGE_BINDINGS"] = "G";
    EncodedTag["GENERATED_RANGE_SUBRANGE_BINDING"] = "H";
    EncodedTag["GENERATED_RANGE_CALL_SITE"] = "I";
    EncodedTag["VENDOR_EXTENSION"] = "V";
})(EncodedTag || (EncodedTag = {}));
export var OriginalScopeFlags;
(function (OriginalScopeFlags) {
    OriginalScopeFlags[OriginalScopeFlags["HAS_NAME"] = 1] = "HAS_NAME";
    OriginalScopeFlags[OriginalScopeFlags["HAS_KIND"] = 2] = "HAS_KIND";
    OriginalScopeFlags[OriginalScopeFlags["IS_STACK_FRAME"] = 4] = "IS_STACK_FRAME";
})(OriginalScopeFlags || (OriginalScopeFlags = {}));
export var GeneratedRangeFlags;
(function (GeneratedRangeFlags) {
    GeneratedRangeFlags[GeneratedRangeFlags["HAS_LINE"] = 1] = "HAS_LINE";
    GeneratedRangeFlags[GeneratedRangeFlags["HAS_DEFINITION"] = 2] = "HAS_DEFINITION";
    GeneratedRangeFlags[GeneratedRangeFlags["IS_STACK_FRAME"] = 4] = "IS_STACK_FRAME";
    GeneratedRangeFlags[GeneratedRangeFlags["IS_HIDDEN"] = 8] = "IS_HIDDEN";
})(GeneratedRangeFlags || (GeneratedRangeFlags = {}));
//# sourceMappingURL=codec.js.map