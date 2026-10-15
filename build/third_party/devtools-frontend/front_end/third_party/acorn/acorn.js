// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as acorn from './package/dist/acorn.mjs';
export { defaultOptions, getLineInfo, Token, tokTypes } from './package/dist/acorn.mjs';
export const Parser = acorn.Parser;
export const tokenizer = acorn.Parser.tokenizer.bind(acorn.Parser);
export const parse = acorn.Parser.parse.bind(acorn.Parser);
//# sourceMappingURL=acorn.js.map