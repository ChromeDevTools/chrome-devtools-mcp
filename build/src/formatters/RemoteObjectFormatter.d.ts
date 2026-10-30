/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Plain-text port of devtools-frontend's RemoteObjectPreviewFormatter
 * (front_end/ui/legacy/components/object_ui/RemoteObjectPreviewFormatter.ts)
 * at revision f7e7785de52d6f5955d6a9c5956c2fe2d520d091, the
 * third_party/devtools-frontend revision this port was written against. Compare
 * with that file when syncing. It formats the preview that CDP already attaches
 * to console arguments, so nothing is evaluated in the page.
 *
 * Intentional differences from upstream:
 * - Returns plain text instead of Lit templates, so there are no CSS classes,
 *   tooltips or localized strings ('empty' and 'empty × N' are English).
 * - No nodeDescription markup: DOM nodes print their description as is instead
 *   of splitting it into tag, id and class spans (renderNodeTitle), and trusted
 *   types print their description instead of `ClassName "value"`.
 * - 'date' and 'node' are added to the subtypes that print their description
 *   instead of a property preview.
 * - The `includeNullOrUndefined` option is dropped; null and undefined
 *   properties are always listed.
 * - Top-level strings print as their raw value (as the console does for string
 *   arguments), and unserializable primitives (NaN, -0, 1n) print from
 *   `unserializableValue`.
 * - The 400-character description limit that upstream passes to
 *   trimEndWithMaxLength() inline is named MAX_DESCRIPTION_LENGTH.
 */
import { type Protocol } from '../third_party/index.js';
/**
 * Formats a console argument from the description and preview that CDP sends
 * with it.
 */
export declare function formatRemoteObject(remoteObject: Protocol.Runtime.RemoteObject): string;
