/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Prepares the polyfills and the DevTools frontend globals for tests.
 *
 * Import this module from each test file that uses DevTools code.
 * tests/utils.ts and tests/mocks.ts import it, so test files that import
 * them get it automatically.
 *
 * This module is not part of tests/setup.ts because it loads
 * src/third_party/index.js, which takes about 0.5 s. Many test files do not
 * need it.
 */
import '../src/utils/polyfill.js';
import { overrideDevToolsGlobals } from '../src/devtools/DevtoolsUtils.js';
overrideDevToolsGlobals({
    loadResource: async () => '',
});
//# sourceMappingURL=setupDevTools.js.map