// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ArrayUtilities from './ArrayUtilities.js';
import * as Brand from './Brand.js';
import * as Constructor from './Constructor.js';
import * as DateUtilities from './DateUtilities.js';
import * as DevToolsPath from './DevToolsPath.js';
import * as HostRuntime from './HostRuntime.js';
import * as KeyboardUtilities from './KeyboardUtilities.js';
import * as MapUtilities from './MapUtilities.js';
import * as MimeType from './MimeType.js';
import * as NumberUtilities from './NumberUtilities.js';
import * as StringUtilities from './StringUtilities.js';
import * as Timing from './Timing.js';
import * as TypedArrayUtilities from './TypedArrayUtilities.js';
import * as TypeScriptUtilities from './TypescriptUtilities.js';
import * as UIString from './UIString.js';
import * as UserVisibleError from './UserVisibleError.js';
export { Size } from './Size.js';
/* `assertNotNullOrUndefined` also need to be exposed, as TypeScript does
 * not allow `asserts` functions to be used with qualified access (e.g.
 * `Platform.TypeScriptUtilities.assertNotNullOrUndefined` causes a compile
 * error).
 */
export { assertNever, assertNotNullOrUndefined } from './TypescriptUtilities.js';
export { ArrayUtilities, Brand, Constructor, DateUtilities, DevToolsPath, HostRuntime, KeyboardUtilities, MapUtilities, MimeType, NumberUtilities, StringUtilities, Timing, TypedArrayUtilities, TypeScriptUtilities, UIString, UserVisibleError, };
//# sourceMappingURL=platform.js.map