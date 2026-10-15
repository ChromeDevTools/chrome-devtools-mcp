// Copyright 2019 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Base64 from './Base64.js';
import * as CharacterIdMap from './CharacterIdMap.js';
import * as Color from './Color.js';
import * as ColorConverter from './ColorConverter.js';
import * as ColorUtils from './ColorUtils.js';
import * as Console from './Console.js';
import * as Debouncer from './Debouncer.js';
import * as EventTarget from './EventTarget.js';
import * as Gzip from './Gzip.js';
import * as JavaScriptMetaData from './JavaScriptMetaData.js';
import * as Lazy from './Lazy.js';
import * as MapWithDefault from './MapWithDefault.js';
import * as Mutex from './Mutex.js';
import * as ObjectWrapper from './Object.js';
import * as ParsedURL from './ParsedURL.js';
import * as Progress from './Progress.js';
import * as ResolverBase from './ResolverBase.js';
import * as ResourceType from './ResourceType.js';
import * as ReturnToPanel from './ReturnToPanel.js';
import * as Revealer from './Revealer.js';
import * as Runnable from './Runnable.js';
import * as SegmentedRange from './SegmentedRange.js';
import * as SettingRegistration from './SettingRegistration.js';
import * as Settings from './Settings.js';
import * as SimpleHistoryManager from './SimpleHistoryManager.js';
import * as Srcset from './Srcset.js';
import * as StringOutputStream from './StringOutputStream.js';
import * as TextDictionary from './TextDictionary.js';
import * as Throttler from './Throttler.js';
import * as Trie from './Trie.js';
import * as VersionController from './VersionController.js';
/*
 * This is re-exported here because we moved UIString into platform from
 * common and wanted to avoid a huge rename of imports. A future CL will
 * update all references to `Common.UIString` to `Platform.UIString`.
 */
export { UIString } from '../platform/platform.js';
export { Base64, CharacterIdMap, Color, ColorConverter, ColorUtils, Console, Debouncer, EventTarget, Gzip, JavaScriptMetaData, Lazy, MapWithDefault, Mutex, ObjectWrapper, ParsedURL, Progress, ResolverBase, ResourceType, ReturnToPanel, Revealer, Runnable, SegmentedRange, SettingRegistration, Settings, SimpleHistoryManager, Srcset, StringOutputStream, TextDictionary, Throttler, Trie, VersionController, };
//# sourceMappingURL=common.js.map