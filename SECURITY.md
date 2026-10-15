## Security policy

The Chrome DevTools MCP project takes security very seriously. Please use [Google Open Source Software Vulnerability Reward Program](https://bughunters.google.com/about/rules/open-source/google-open-source-software-vulnerability-reward-program-rules) to report any security issues.

### Scope

In general, it is the expectation that the AI agent or client using this MCP server validates any input (including tool calls and parameters) before sending it. The server provides powerful capabilities for browser automation and inspection, and it is the responsibility of the calling agent to ensure these are used safely and as intended.

Several tools in this project have the ability to perform actions such as writing files to disk (e.g., via browser downloads or screenshots), loading source maps, or dynamically loading Chrome extensions. These are intentional, documented features and are not vulnerabilities.

The server returns web content to the client as text (Markdown-like) or
structured data (`--experimentalStructuredContent`). The web content is returned
as-is to facilitate debugging and we do not consider changes in the output
text/Markdown structure based on the web content to be vulnerabilities. If
structure is important for your use case, use structured output
(`--experimentalStructuredContent`). Prefer using this server with trusted web
content or make sure your client takes precautions against prompt injections.

We appreciate feedback and suggestions from developers on how this tool can make it easier for them to build a more secure user experience, but will treat these exclusively as feature requests, and not vulnerabilities in chrome-devtools-mcp itself.

### Trusted host environment

`chrome-devtools-mcp` is a local developer tool. It runs with the privileges of
the user who starts it and trusts the environment it is started in, in the same
way that `npm`, `npx`, `node`, or `git` do when run in that environment. In
particular, we treat the following as trusted inputs:

- The current working directory the server is started in and its contents.
- Environment variables, including `PATH`, `npm_config_*`, and proxy settings.
- The user's npm configuration at every scope (`.npmrc` files in the project,
  user, and global locations) and the `npm` executable they resolve to. We
  intentionally shell out to `npm` so that update checks respect the user's
  registry, proxy, and authentication configuration.
- The Node.js installation and the Chrome binary the server launches or
  connects to.

Reports that require an attacker to control any of these are not considered
vulnerabilities in `chrome-devtools-mcp`. This includes placing executables or
configuration files (for example `npm.cmd` or `.npmrc`) in a workspace
directory that the server is later started from. Do not start the server, or
any other developer tooling, in a workspace you do not trust. MCP clients
typically use the opened workspace as the working directory for stdio servers;
if you need to inspect untrusted repositories, run the server in an OS-level
sandbox or a dedicated VM. The startup update check can be disabled with the
`CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` environment variable.

### MCP roots

`chrome-devtools-mcp` supports [MCP roots](https://modelcontextprotocol.io/specification/2025-06-18/client/roots). If the client specifies them, the MCP server will check the roots when accessing files.
Note that the MCP server always retains access to the OS-provided tmp directory. We treat security issues in the MCP roots implementation as low-severity issues because it is an optional configuration. To have full
filesystem sandboxing, we recommend using OS sandbox mechanisms.

### Network guardrails

Optional `--allowed-url-pattern` and `--blocked-url-pattern` arguments configure the **browser** to reject access to the identified URLs. Note that this is not a complete network sandbox and it only applies to Chrome DevTools targets while `chrome-devtools-mcp` is attached to them.
To have a full network sandbox, we recommend using a separate OS/VM sandbox mechanism.

### JavaScript evaluation

The optional `--no-javascript-evaluation` argument disables specific server entry points for evaluating caller-provided JavaScript: the `evaluate_script` tool (and the slim `evaluate` tool), the `initScript` parameter of `navigate_page`, and navigations to `javascript:`, `data:`, or `vbscript:` URLs. It is not a JavaScript sandbox and does not create a browser-wide execution boundary. Scripts owned by the page, and JavaScript triggered through otherwise permitted browser interactions (for example, clicking or typing), still run.

The `--experimentalDevtools` argument enables automation of DevTools targets, including the DevTools Console, which can evaluate caller-entered JavaScript in the inspected page. `--no-javascript-evaluation` does not restrict this UI path. If both options are configured together, input tools can still cause JavaScript to be evaluated in the inspected page through DevTools. Omitting `--experimentalDevtools` removes this particular path, but does not provide complete JavaScript confinement.

As with other tools, the client is responsible for validating tool calls and parameters before sending them.
