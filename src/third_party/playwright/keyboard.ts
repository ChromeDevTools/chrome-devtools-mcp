/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Adapted from Playwright for use with Puppeteer's keyboard API.
 * Source: https://github.com/microsoft/playwright
 */

/**
 * Split a key combination string into individual keys.
 * Handles combinations like "Control+A" and special cases like "Control++".
 *
 * @param keyString - The key combination to split (e.g., "Control+Shift+A", "Control++")
 * @returns Array of individual key strings [modifiers..., key]
 *
 * @example
 * splitKeyCombo("Control+A") // ["Control", "A"]
 * splitKeyCombo("Control++") // ["Control", "+"]
 * splitKeyCombo("Enter") // ["Enter"]
 */
export function splitKeyCombo(keyString: string): string[] {
  const keys: string[] = [];
  let building = '';
  for (const char of keyString) {
    if (char === '+' && building) {
      // Only split if there's text before +
      keys.push(building);
      building = '';
    } else {
      building += char;
    }
  }
  keys.push(building);
  return keys;
}
