# Advanced usage

## Shared server for multiple MCP clients

A single long-lived `chrome-devtools-mcp` process can serve multiple clients
over Streamable HTTP. Start it with `--http-port=<port>`; the service listens
at `http://127.0.0.1:<port>/mcp`. The process owns one browser connection. It
can launch Chrome itself or attach to a Chrome remote-debugging endpoint.

### Launch a shared server

Choose one of these startup modes. Keep this process running while clients
connect.

**Headless Chrome launched by the server:**

```bash
npx -y chrome-devtools-mcp@latest \
  --http-port=9333 \
  --headless=true \
  --isolated=true
```

`--isolated` gives this shared service a temporary profile. It does not create
one profile per HTTP client.

**Headed (visible) Chrome launched by the server:**

```bash
npx -y chrome-devtools-mcp@latest \
  --http-port=9333 \
  --headless=false \
  --isolated=true
```

Omit `--isolated` or provide `--user-data-dir=...` when the shared service
should reuse a persistent profile. Only one Chrome instance can use a profile
at a time.

**Attach to an existing Chrome remote-debugging endpoint:**

Start Chrome with a dedicated profile and remote-debugging port, then point
the one MCP service at that endpoint:

```bash
# Use the Chrome executable for your platform.
/path/to/chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-devtools-mcp-shared

npx -y chrome-devtools-mcp@latest \
  --http-port=9333 \
  --browser-url=http://127.0.0.1:9222
```

The `--browser-url` option attaches the service to the already running
browser; it does not launch another Chrome. The existing Chrome connection
instructions below include platform-specific launch commands and the
WebSocket alternative.

### Connect native MCP clients

MCP clients with native Streamable HTTP support should use the `/mcp` URL
directly. Configure two or more independent clients with the same URL; do not
start one `chrome-devtools-mcp` process per client:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "url": "http://127.0.0.1:9333/mcp"
    }
  }
}
```

Each client performs its own MCP initialization and receives an MCP-generated
session ID. The HTTP service and its browser remain alive when one client
disconnects.

### Shared pages, isolated client state

The Chrome connection and its pages are shared. A page opened by one client is
visible to the others, and navigation, input, page closing, tracing, or other
browser mutations are observable by every client. Clients that operate on the
same page must coordinate their actions.

Each HTTP session has its own `McpServer` and `McpContext`. The following state
is isolated per client and is never reused by another session:

- selected page;
- negotiated filesystem roots;
- isolated-context names;
- trace, recording, and other tool state; and
- the request mutex.

Selecting a page in one client does not change another client's selected page.
The selected pages still refer to the shared browser, so per-client selection
does not prevent one client from changing or closing a page another client is
using. The per-session mutex serializes that client's requests; it is not a
global lock for all clients.

Clients should send an explicit HTTP `DELETE` for their session before closing
their transport. An accepted `DELETE` deterministically closes only that
session's `McpServer`/`McpContext`; closing a transport is likewise scoped to
that session, and the stdio proxy sends `DELETE` automatically on EOF. An
abandoned or otherwise inactive session expires after 30 minutes. An active
request or an open stream suspends idle expiry. Process shutdown closes all
sessions first and then closes a browser launched by the service or disconnects
from an externally attached Chrome.

### Access from another machine

The HTTP service binds to `127.0.0.1` only. It rejects requests whose `Host`
or `Origin` is not loopback, so a remote machine cannot connect directly and
the service must not be exposed on a network interface. Use SSH port
forwarding when the MCP client runs elsewhere:

```bash
# Run on the client machine; chrome-host runs the MCP service.
ssh -N -L 9333:127.0.0.1:9333 user@chrome-host
```

Then configure the remote client with
`http://127.0.0.1:9333/mcp`, the local end of the tunnel.

> [!WARNING]
> Anyone who can control this endpoint can control Chrome, including reading
> and modifying browser data. Keep the listener loopback-only. Remote hosts
> must use an SSH tunnel; do not bind or forward the service as a public
> network endpoint.

### Stdio proxy for clients without HTTP transport

Clients that can launch only a stdio MCP command can use the transparent proxy
mode. Point it at the shared service's absolute `http(s)` URL:

```bash
npx -y chrome-devtools-mcp@latest \
  --server-url=http://127.0.0.1:9333/mcp
```

The equivalent environment variable is useful when the client configuration
cannot add a command-line flag:

```bash
export CHROME_DEVTOOLS_MCP_SERVER_URL=http://127.0.0.1:9333/mcp
npx -y chrome-devtools-mcp@latest
```

`--server-url` and `CHROME_DEVTOOLS_MCP_SERVER_URL` select stdio-to-Streamable
HTTP proxy mode. A server URL takes precedence over `--http-port`, and
`--http-port` takes precedence over the existing stdio server mode. The proxy
does not launch or attach to Chrome. It forwards JSON-RPC transparently,
including roots requests and notifications, so the remote server sees the
original stdio client's identity and creates one remote MCP session for that
client. In proxy mode, AXI-injected local Chrome launch or attach flags are
ignored because the proxy owns no browser.

### chrome-devtools-axi

Use a `chrome-devtools-axi` version that supports
`CHROME_DEVTOOLS_AXI_MCP_SERVER_URL`. Each named AXI bridge starts its own MCP
stdio proxy, so it receives a separate remote MCP context while all bridges
use the one shared Chrome:

```bash
# In this checkout, build the MCP proxy entrypoint.
npm run build

# In another terminal, start one shared service (choose any startup mode above).
npx -y chrome-devtools-mcp@latest \
  --http-port=9333 \
  --headless=true \
  --isolated=true

# In each AXI shell, point at this unreleased MCP build and the shared service.
export CHROME_DEVTOOLS_AXI_MCP_PATH="/path/to/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"
export CHROME_DEVTOOLS_AXI_MCP_SERVER_URL="http://127.0.0.1:9333/mcp"

CHROME_DEVTOOLS_AXI_SESSION=agent-a npx -y chrome-devtools-axi pages
CHROME_DEVTOOLS_AXI_SESSION=agent-b npx -y chrome-devtools-axi pages
```

`CHROME_DEVTOOLS_AXI_MCP_PATH` is needed only to test an unreleased MCP build;
AXI otherwise resolves the installed or latest MCP package normally. AXI
forwards `CHROME_DEVTOOLS_AXI_MCP_SERVER_URL` to the spawned MCP command as
`CHROME_DEVTOOLS_MCP_SERVER_URL`, which selects stdio proxy mode. Each named
AXI bridge therefore gets its own selected page, roots, and tool state while
the remote service owns the one Chrome connection.

Do not set AXI's local browser-launch or browser-attach variables for this
arrangement. If they are injected, the MCP `--server-url` mode still wins and
the proxy does not create another browser.

> [!WARNING]
> AXI clients can control the same Chrome pages through the shared endpoint.
> Anyone who can control the endpoint can control Chrome; keep it
> loopback-only and use SSH port forwarding for remote hosts.

## Concurrent sessions

Most MCP clients start one Chrome DevTools MCP server per conversation. In
existing stdio mode, multiple independent server processes normally launch
independent Chrome instances. Pass `--isolated=true` when those processes
should each use a temporary profile instead of sharing the default profile.

If a client shares one stdio server instance across concurrent agents or
subagents, leave page-ID routing enabled (the default) with
`--page-id-routing`. This exposes `pageId` on page-scoped tools so each agent
can route tool calls to the tab it is working with. For one server shared by
native HTTP clients or stdio proxies, use the per-session selected-page
behavior described above.

## User data directory

By default, `chrome-devtools-mcp` starts a Chrome's stable channel instance using the following user
data directory:

- Linux / macOS: `$HOME/.cache/chrome-devtools-mcp/chrome-profile`
- Windows: `%USERPROFILE%\.cache\chrome-devtools-mcp\chrome-profile`

For non-stable channels, the channel name is appended to the directory name, for example
`chrome-profile-canary`.

The user data directory is not cleared between runs and is reused for subsequent
runs with the same channel. Only one browser can use it at a time. Set the `isolated`
option to `true` to use a temporary user data directory instead which will be cleared
automatically after the browser is closed.

## Connecting to a running Chrome instance

By default, the Chrome DevTools MCP server will start a new Chrome instance with a dedicated profile. This might not be ideal in all situations:

- If you would like to maintain the same application state when alternating between manual site testing and agent-driven testing.
- When the MCP needs to sign into a website. Some accounts may prevent sign-in when the browser is controlled via WebDriver (the default launch mechanism for the Chrome DevTools MCP server).
- If you're running your LLM inside a sandboxed environment, but you would like to connect to a Chrome instance that runs outside the sandbox.

In these cases, start Chrome first and let the Chrome DevTools MCP server connect to it. There are two ways to do so:

- **Automatic connection (available in Chrome 144)**: best for sharing state between manual and agent-driven testing.
- **Manual connection via remote debugging port**: best when running inside a sandboxed environment.

### Automatically connecting to a running Chrome instance

**Step 1:** Set up remote debugging in Chrome

In Chrome (\>= M144), do the following to set up remote debugging:

1.  Navigate to `chrome://inspect/#remote-debugging` to enable remote debugging.
2.  Follow the dialog UI to allow or disallow incoming debugging connections.

**Step 2:** Configure Chrome DevTools MCP server to automatically connect to a running Chrome Instance

To connect the `chrome-devtools-mcp` server to the running Chrome instance, use
`--autoConnect` command line argument for the MCP server.

The following code snippet is an example configuration for gemini-cli:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect"]
    }
  }
}
```

**Step 3:** Test your setup

Make sure your browser is running. Open gemini-cli and run the following prompt:

```none
Check the performance of https://developers.chrome.com
```

> [!NOTE]
> The <code>autoConnect</code> option requires the user to start Chrome. If the user has multiple active profiles, the MCP server will connect to the default profile (as determined by Chrome). The MCP server has access to all open windows for the selected profile.

The Chrome DevTools MCP server will try to connect to your running Chrome
instance. It shows a dialog asking for user permission.

Clicking **Allow** results in the Chrome DevTools MCP server opening
[developers.chrome.com](http://developers.chrome.com) and taking a performance
trace.

### Manual connection using port forwarding

You can connect to a running Chrome instance by using the `--browser-url` option. This is useful if you are running the MCP server in a sandboxed environment that does not allow starting a new Chrome instance.

Here is a step-by-step guide on how to connect to a running Chrome instance:

**Step 1: Configure the MCP client**

Add the `--browser-url` option to your MCP client configuration. The value of this option should be the URL of the running Chrome instance. `http://127.0.0.1:9222` is a common default.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

**Step 2: Start the Chrome browser**

> [!WARNING]
> Enabling the remote debugging port opens up a debugging port on the running browser instance. Any application on your machine can connect to this port and control the browser. Make sure that you are not browsing any sensitive websites while the debugging port is open.

Start the Chrome browser with the remote debugging port enabled. Make sure to close any running Chrome instances before starting a new one with the debugging port enabled. The port number you choose must be the same as the one you specified in the `--browser-url` option in your MCP client configuration.

For security reasons, [Chrome requires you to use a non-default user data directory](https://developer.chrome.com/blog/remote-debugging-port) when enabling the remote debugging port. You can specify a custom directory using the `--user-data-dir` flag. This ensures that your regular browsing profile and data are not exposed to the debugging session.

**macOS**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Linux**

```bash
/usr/bin/google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Windows**

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-profile-stable"
```

**Step 3: Test your setup**

After configuring the MCP client and starting the Chrome browser, you can test your setup by running a simple prompt in your MCP client:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should connect to the running Chrome instance and receive a performance report.

If you hit VM-to-host port forwarding issues, see the “Remote debugging between virtual machine (VM) and host fails” section in [`troubleshooting.md`](./troubleshooting.md#remote-debugging-between-virtual-machine-vm-and-host-fails).

For more details on remote debugging, see the [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/remote-debugging/).

## Debugging Chrome on Android

Please consult [these instructions](./debugging-android.md).
