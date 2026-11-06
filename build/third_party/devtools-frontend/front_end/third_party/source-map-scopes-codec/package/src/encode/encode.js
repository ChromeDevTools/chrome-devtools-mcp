// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Encoder } from "./encoder.js";
/**
 * Encodes the `ScopeInfo` into a source map JSON object.
 *
 * If `inputSourceMap` is provided, `encode` will augment the "names" array and
 * overwrite the "scopes" field, before returning the provided `inputSourceMap` again.
 */
export function encode(scopesInfo, inputSourceMap) {
    inputSourceMap ||= {
        version: 3,
        mappings: "",
        sources: new Array(scopesInfo.scopes.length).fill(null),
    };
    inputSourceMap.names ||= [];
    if (inputSourceMap.sources.length !== scopesInfo.scopes.length) {
        throw new Error(`SourceMapJson.sources.length must match ScopesInfo.scopes! ${inputSourceMap.sources.length} vs ${scopesInfo.scopes.length}`);
    }
    const { scopes, ranges } = new Encoder(scopesInfo, inputSourceMap.names)
        .encode();
    inputSourceMap.scopes = scopes;
    inputSourceMap.ranges = ranges;
    return inputSourceMap;
}
//# sourceMappingURL=encode.js.map