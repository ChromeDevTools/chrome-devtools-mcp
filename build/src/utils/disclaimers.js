/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export function logCruxDisclaimer(args) {
    if (!args.slim && args.performanceCrux) {
        console.error(`Performance tools may send trace URLs to the Google CrUX API to fetch real-user experience data. To disable, run with --no-performance-crux.`);
    }
}
/**
 * Prints the privacy disclaimers to stderr. Both the server and the CLI
 * client call it. The CLI must not load `src/index.ts`, so this function
 * lives in its own module.
 */
export const logDisclaimers = (args) => {
    console.error(`chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`);
    logCruxDisclaimer(args);
    if (!args.slim && args.usageStatistics) {
        console.error(`
Google collects usage statistics to improve Chrome DevTools MCP. To opt-out, run with --no-usage-statistics.
For more details, visit: https://github.com/ChromeDevTools/chrome-devtools-mcp#usage-statistics`);
    }
};
//# sourceMappingURL=disclaimers.js.map