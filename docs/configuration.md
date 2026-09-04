# Configuration

The Chrome DevTools MCP server supports the following configuration option:

<!-- BEGIN AUTO GENERATED OPTIONS -->

- **`--categoryEmulation`/ `--category-emulation`**
  Set to false to exclude tools related to emulation.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryPerformance`/ `--category-performance`**
  Set to false to exclude tools related to performance.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryNetwork`/ `--category-network`**
  Set to false to exclude tools related to network.
  - **Type:** boolean
  - **Default:** `true`

- **`--categoryExtensions`/ `--category-extensions`**
  Set to true to include tools related to extensions. Note: This feature is currently only supported with a pipe connection. autoConnect, browserUrl, and wsEndpoint are not supported with this feature until 149 will be released.
  - **Type:** boolean
  - **Default:** `false`

- **`--categoryExperimentalThirdParty`/ `--category-experimental-third-party`**
  Set to true to enable third-party developer tools exposed by the inspected page itself
  - **Type:** boolean
  - **Default:** `false`

- **`--categoryPwa`/ `--category-pwa`**
  Set to true to include tools for automating Progressive Web Apps (install, launch, uninstall, and OS state). This feature is only supported with a pipe connection; autoConnect, browserUrl, and wsEndpoint are not supported.
  - **Type:** boolean
  - **Default:** `false`

- **`--autoConnect`/ `--auto-connect`**
  If specified, automatically connects to a browser (Chrome 144+) running locally from the user data directory identified by the channel param (default channel is stable). Requires the remote debugging server to be started in the Chrome instance via chrome://inspect/#remote-debugging.
  - **Type:** boolean
  - **Default:** `false`

- **`--browserUrl`/ `--browser-url`, `-u`**
  Connect to a running, debuggable Chrome instance (e.g. `http://127.0.0.1:9222`). For more details see: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md#connecting-to-a-running-chrome-instance.
  - **Type:** string
  - **Default:** `false`

- **`--wsEndpoint`/ `--ws-endpoint`, `-w`**
  WebSocket endpoint to connect to a running Chrome instance (e.g., ws://127.0.0.1:9222/devtools/browser/<id>). Alternative to --browserUrl.
  - **Type:** string
  - **Default:** `false`

- **`--wsHeaders`/ `--ws-headers`**
  Custom headers for WebSocket connection in JSON format (e.g., '{"Authorization":"Bearer token"}'). Only works with --wsEndpoint.
  - **Type:** string
  - **Default:** `false`

- **`--headless`**
  Whether to run in headless (no UI) mode.
  - **Type:** boolean
  - **Default:** `false`

- **`--executablePath`/ `--executable-path`, `-e`**
  Path to custom Chrome executable.
  - **Type:** string
  - **Default:** `false`

- **`--isolated`**
  If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed. Defaults to false.
  - **Type:** boolean
  - **Default:** `false`

- **`--userDataDir`/ `--user-data-dir`**
  Path to the user data directory for Chrome. Default is $HOME/.cache/chrome-devtools-mcp/chrome-profile$CHANNEL_SUFFIX_IF_NON_STABLE
  - **Type:** string
  - **Default:** `false`

- **`--channel`**
  Specify a different Chrome channel that should be used. The default is the stable channel version.
  - **Type:** string
  - **Choices:** `canary`, `dev`, `beta`, `stable`
  - **Default:** `false`

- **`--proxyServer`/ `--proxy-server`**
  Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.
  - **Type:** string
  - **Default:** `false`

- **`--chromeArg`/ `--chrome-arg`**
  Additional arguments for Chrome. Only applies when Chrome is launched by chrome-devtools-mcp.
  - **Type:** array
  - **Default:** `false`

- **`--ignoreDefaultChromeArg`/ `--ignore-default-chrome-arg`**
  Explicitly disable default arguments for Chrome. Only applies when Chrome is launched by chrome-devtools-mcp.
  - **Type:** array
  - **Default:** `false`

- **`--logFile`/ `--log-file`**
  Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.
  - **Type:** string
  - **Default:** `false`

- **`--viewport`**
  Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.
  - **Type:** string
  - **Default:** `false`

- **`--acceptInsecureCerts`/ `--accept-insecure-certs`**
  If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.
  - **Type:** boolean
  - **Default:** `false`

- **`--pageIdRouting`/ `--page-id-routing`**
  Require pageId on page-scoped tools and route requests by page ID (useful for concurrent agent sessions). Use --no-page-id-routing to disable.
  - **Type:** boolean
  - **Default:** `true`

- **`--experimentalDevtools`/ `--experimental-devtools`**
  Whether to enable automation over DevTools targets
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalVision`/ `--experimental-vision`**
  Whether to enable coordinate-based tools such as click_at(x,y). Usually requires a computer-use model able to produce accurate coordinates by looking at screenshots.
  - **Type:** boolean
  - **Default:** `false`

- **`--memoryDebugging`/ `--memory-debugging`, `--experimentalMemory`**
  Whether to enable memory debugging tools.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalStructuredContent`/ `--experimental-structured-content`**
  Whether to output structured formatted content.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalIncludeAllPages`/ `--experimental-include-all-pages`**
  Whether to include all kinds of pages such as webviews or background pages as pages.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalScreencast`/ `--experimental-screencast`**
  Exposes experimental screencast tools (requires ffmpeg). Install ffmpeg https://www.ffmpeg.org/download.html and ensure it is available in the MCP server PATH.
  - **Type:** boolean
  - **Default:** `false`

- **`--experimentalFfmpegPath`/ `--experimental-ffmpeg-path`**
  Path to ffmpeg executable for screencast recording.
  - **Type:** string
  - **Default:** `false`

- **`--experimentalScreencastFps`/ `--experimental-screencast-fps`**
  Frames per second to use for screencast recording. Lower values can reduce memory pressure on pages that produce frames faster than ffmpeg can encode them.
  - **Type:** number
  - **Default:** `false`

- **`--blockedUrlPattern`/ `--blocked-url-pattern`**
  Restricts browser's network access by blocking specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Silently detaches from targets with blocked URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns.
  - **Type:** array
  - **Default:** `false`

- **`--allowedUrlPattern`/ `--allowed-url-pattern`**
  Restricts browser's network access by allowing only specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Requires Chrome 149+. Silently detaches from targets with unallowed URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns.
  - **Type:** array
  - **Default:** `false`

- **`--performanceCrux`/ `--performance-crux`**
  Set to false to disable sending URLs from performance traces to CrUX API to get field performance data.
  - **Type:** boolean
  - **Default:** `true`

- **`--usageStatistics`/ `--usage-statistics`**
  Set to false to opt-out of usage statistics collection. Google collects usage data to improve the tool, handled under the Google Privacy Policy (https://policies.google.com/privacy). This is independent from Chrome browser metrics. Disabled if `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` or `CI` env variables are set.
  - **Type:** boolean
  - **Default:** `true`

- **`--javascriptEvaluation`/ `--javascript-evaluation`**
  Set to false to disable JavaScript execution. When disabled, evaluation tools (evaluate_script and slim evaluate) are disabled, the initScript parameter in navigate_page is turned off, and navigating to javascript:, data:, or vbscript: URLs is disallowed.
  - **Type:** boolean
  - **Default:** `true`

- **`--screenshotFormat`/ `--screenshot-format`**
  Override the default output format used by take_screenshot when the caller does not specify one. JPEG and WebP are ~3-5x smaller than PNG, which reduces transfer and storage size. To reduce context size use --screenshotMaxWidth / --screenshotMaxHeight, since image tokens scale with dimensions rather than encoded bytes. Unset preserves the existing default ("png").
  - **Type:** string
  - **Choices:** `jpeg`, `png`, `webp`
  - **Default:** `false`

- **`--screenshotQuality`/ `--screenshot-quality`**
  Override the default compression quality (0-100) used by take_screenshot for JPEG and WebP when the caller does not specify one. Lower values mean smaller files. Ignored for PNG. Unset preserves the Puppeteer default.
  - **Type:** number
  - **Default:** `false`

- **`--screenshotMaxWidth`/ `--screenshot-max-width`**
  Maximum width in pixels for screenshots. If the captured image is wider, it is downscaled (preserving aspect ratio) before being returned. Reduces context size in AI conversations. Unset means no resize.
  - **Type:** number
  - **Default:** `false`

- **`--screenshotMaxHeight`/ `--screenshot-max-height`**
  Maximum height in pixels for screenshots. If the captured image is taller, it is downscaled (preserving aspect ratio) before being returned. Can be combined with --screenshot-max-width; the smaller scale factor wins. Unset means no resize.
  - **Type:** number
  - **Default:** `false`

- **`--slim`**
  Exposes a "slim" set of 3 tools covering navigation, script execution and screenshots only. Useful for basic browser tasks.
  - **Type:** boolean
  - **Default:** `false`

- **`--redactNetworkHeaders`/ `--redact-network-headers`**
  If true, redacts some of the network headers considered sensitive before returning to the client.
  - **Type:** boolean
  - **Default:** `false`

- **`--allowUnrestrictedPaths`/ `--allow-unrestricted-paths`**
  If set, disables the default path restriction that applies when the MCP client does not negotiate the roots capability. By default, file-writing tools are restricted to the OS temp directory when no roots are configured. Use this only when connecting a trusted local client that does not implement MCP roots and requires access to paths outside the temp directory.
  - **Type:** boolean
  - **Default:** `false`

- **`--filesystemRoot`/ `--filesystem-root`, `--workspace`**
  A directory that filesystem tools are allowed to access. May be specified more than once.
  - **Type:** array
  - **Default:** `OS temp directory`

<!-- END AUTO GENERATED OPTIONS -->

Pass them via the `args` property in the JSON configuration. For example:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--channel=canary",
        "--headless=true",
        "--isolated=true"
      ]
    }
  }
}
```

## Connecting via WebSocket with custom headers

You can connect directly to a Chrome WebSocket endpoint and include custom headers (e.g., for authentication):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--wsEndpoint=ws://127.0.0.1:9222/devtools/browser/<id>",
        "--wsHeaders={\"Authorization\":\"Bearer YOUR_TOKEN\"}"
      ]
    }
  }
}
```

To get the WebSocket endpoint from a running Chrome instance, visit `http://127.0.0.1:9222/json/version` and look for the `webSocketDebuggerUrl` field.

You can also run `npx chrome-devtools-mcp@latest --help` to see all available configuration options.
