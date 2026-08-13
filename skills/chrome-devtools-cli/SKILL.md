---
name: chrome-devtools-cli
description: Use this skill to write shell scripts or run shell commands to automate tasks in the browser or otherwise use Chrome DevTools via CLI.
---

The `chrome-devtools-mcp` CLI lets you interact with the browser from your terminal.

## Setup

_Note: If this is your very first time using the CLI, see [references/installation.md](references/installation.md) for setup. Installation is a one-time prerequisite and is **not** part of the regular AI workflow._

## AI Workflow

1. **Execute**: Run tools directly (e.g., `chrome-devtools list_pages`). The background server starts implicitly; **do not** run `start`/`status`/`stop` before each use.
2. **Inspect**: Use `take_snapshot` to get an element `<uid>`.
3. **Act**: Use `click`, `fill`, etc. State persists across commands.

Snapshot example:

```
uid=1_0 RootWebArea "Example Domain" url="https://example.com/"
  uid=1_1 heading "Example Domain" level="1"
```

## Permissions & File Access

By default, the server only has access to the **OS temp directory** (as defined by Node APIs, `os.tmpdir()`). File-saving parameters (`--filePath`, `--outputDirPath`) and `upload_file` outside the temp directory require unrestricted filesystem access:

```bash
# Start daemon with full filesystem access
chrome-devtools start --allowUnrestrictedPaths=true
```

## Command Usage

```sh
chrome-devtools <tool> [arguments] [flags]
```

- Required arguments are passed positionally; optional arguments use flags.
- Use `--help` on any command for usage details.
- Output defaults to plain Markdown-like text; pass `--output-format=json` for JSON.

## Input Automation (<uid> from snapshot)

```bash
chrome-devtools take_snapshot # Take a text snapshot of the page to get UIDs for elements
chrome-devtools click "id" # Clicks on the provided element
chrome-devtools click "id" --dblClick true --includeSnapshot true # Double clicks and returns a snapshot
chrome-devtools drag "src" "dst" # Drag an element onto another element
chrome-devtools drag "src" "dst" --includeSnapshot true # Drag an element and return a snapshot
chrome-devtools fill "id" "text" # Type text into an input, textarea, or select an option
chrome-devtools fill "id" "text" --includeSnapshot true # Fill an element and return a snapshot
chrome-devtools handle_dialog accept # Handle a browser dialog (accept/dismiss)
chrome-devtools handle_dialog dismiss --promptText "hi" # Dismiss a dialog with prompt text
chrome-devtools hover "id" # Hover over the provided element
chrome-devtools hover "id" --includeSnapshot true # Hover over an element and return a snapshot
chrome-devtools press_key "Enter" # Press a key or key combination ("Control+A", "Escape")
chrome-devtools press_key "Control+A" --includeSnapshot true # Press a key and return a snapshot
chrome-devtools type_text "hello" # Type text using keyboard into a focused input
chrome-devtools type_text "hello" --submitKey "Enter" # Type text and press a submit key
chrome-devtools upload_file "id" "file.txt" # Upload a file through a provided element
chrome-devtools upload_file "id" "file.txt" --includeSnapshot true # Upload a file and return a snapshot
```

## Navigation

```bash
chrome-devtools close_page 1 # Closes the page by its index
chrome-devtools list_pages # Get a list of pages open in the browser
chrome-devtools navigate_page --url "https://example.com" # Navigates the currently selected page to a URL
chrome-devtools navigate_page --type "reload" --ignoreCache true # Reload page ignoring cache
chrome-devtools navigate_page --url "https://example.com" --timeout 5000 # Navigate with a timeout
chrome-devtools navigate_page --handleBeforeUnload "accept" # Handle before unload dialog
chrome-devtools navigate_page --type "back" --initScript "foo()" # Navigate back and run an init script
chrome-devtools new_page "https://example.com" # Creates a new page
chrome-devtools new_page "https://example.com" --background true --timeout 5000 # Create new page in background
chrome-devtools new_page "https://example.com" --isolatedContext "ctx" # Create new page with isolated context
chrome-devtools select_page 1 # Select a page as a context for future tool calls
chrome-devtools select_page 1 --bringToFront true # Select a page and bring it to front
```

## Emulation

```bash
chrome-devtools emulate --networkConditions "Offline" # Emulate network conditions
chrome-devtools emulate --cpuThrottlingRate 4 --geolocation "0x0" # Emulate CPU throttling and geolocation
chrome-devtools emulate --colorScheme "dark" --viewport "1920x1080" # Emulate color scheme and viewport
chrome-devtools emulate --userAgent "Mozilla/5.0..." # Emulate user agent
chrome-devtools resize_page 1920 1080 # Resizes the selected page's window
```

## Performance

```bash
chrome-devtools performance_analyze_insight "1" "LCPBreakdown" # Get more details on a specific Performance Insight
chrome-devtools performance_start_trace true false # Starts a performance trace recording (reload, autoStop)
chrome-devtools performance_start_trace true true --filePath "t.json.gz" # Start trace and save to a file
chrome-devtools performance_stop_trace # Stops the active performance trace
chrome-devtools performance_stop_trace --filePath "t.json.gz" # Stop trace and save to a file
```

## Memory

```bash
chrome-devtools take_heapsnapshot "./snap.heapsnapshot" # Capture a memory heap snapshot
```

### Memory Debugging (requires `--memoryDebugging=true`)

```bash
chrome-devtools get_heapsnapshot_summary "./snap.heapsnapshot" # Get snapshot summary stats
chrome-devtools compare_heapsnapshots "./base.heapsnapshot" "./target.heapsnapshot" # Compare two snapshots
chrome-devtools get_heapsnapshot_class_nodes "./snap.heapsnapshot" "Array" # Inspect class instances
chrome-devtools get_heapsnapshot_details "./snap.heapsnapshot" 123 # Detailed object properties
chrome-devtools get_heapsnapshot_dominators "./snap.heapsnapshot" 123 # Dominator tree for node
chrome-devtools get_heapsnapshot_duplicate_strings "./snap.heapsnapshot" # Find duplicated strings
chrome-devtools get_heapsnapshot_edges "./snap.heapsnapshot" 123 # Node edges/references
chrome-devtools get_heapsnapshot_object_details "./snap.heapsnapshot" 123 # Object details by node ID
chrome-devtools get_heapsnapshot_retainers "./snap.heapsnapshot" 123 # Retaining objects
chrome-devtools get_heapsnapshot_retaining_paths "./snap.heapsnapshot" 123 # Shortest retaining paths
chrome-devtools close_heapsnapshot "./snap.heapsnapshot" # Free memory from loaded snapshot
```

## Network

```bash
chrome-devtools get_network_request # Get the currently selected network request
chrome-devtools get_network_request --reqid 1 --requestFilePath "req.md" # Get request by id and save to file
chrome-devtools get_network_request --responseFilePath "res.md" # Save response body to file
chrome-devtools list_network_requests # List all network requests
chrome-devtools list_network_requests --pageSize 50 --pageIdx 0 # List network requests with pagination
chrome-devtools list_network_requests --resourceTypes Fetch # Filter requests by resource type
chrome-devtools list_network_requests --includePreservedRequests true # Include preserved requests
```

## Debugging & Inspection

```bash
chrome-devtools evaluate_script "() => document.title" # Evaluate a JavaScript function on the page
chrome-devtools evaluate_script "(a) => a.innerText" --args 1_4 # Evaluate JS with UID arguments
chrome-devtools get_console_message 1 # Gets a console message by its ID
chrome-devtools lighthouse_audit --mode "navigation" # Run Lighthouse audit for navigation
chrome-devtools lighthouse_audit --mode "snapshot" --device "mobile" # Run Lighthouse audit for a snapshot on mobile
chrome-devtools lighthouse_audit --outputDirPath ./out # Run Lighthouse audit and save reports
chrome-devtools list_console_messages # List all console messages
chrome-devtools list_console_messages --pageSize 20 --pageIdx 1 # List console messages with pagination
chrome-devtools list_console_messages --types error --types info # Filter console messages by type
chrome-devtools list_console_messages --includePreservedMessages true # Include preserved messages
chrome-devtools take_screenshot # Take a screenshot of the page viewport
chrome-devtools take_screenshot --fullPage true --format "jpeg" --quality 80 # Take a full page screenshot as JPEG with quality
chrome-devtools take_screenshot --uid "id" --filePath "s.png" # Take a screenshot of an element
chrome-devtools take_snapshot # Take a text snapshot of the page from the a11y tree
chrome-devtools take_snapshot --verbose true --filePath "s.txt" # Take a verbose snapshot and save to file
```

## Extensions

```bash
chrome-devtools list_extensions # Lists all the Chrome extensions installed in the browser
chrome-devtools install_extension "/path/to/extension" # Installs a Chrome extension from the given path
chrome-devtools uninstall_extension "extension_id" # Uninstalls a Chrome extension by its ID
chrome-devtools reload_extension "extension_id" # Reloads an unpacked Chrome extension by its ID
chrome-devtools trigger_extension_action "extension_id" # Triggers the default action of an extension by its ID
```

## Progressive Web Apps (requires `--categoryPwa=true`)

```bash
chrome-devtools install_pwa "https://example.com/" # Install PWA by manifest ID or URL
chrome-devtools launch_pwa "https://example.com/" # Launch installed PWA
chrome-devtools get_os_app_state "https://example.com/" # Get OS app installation state
chrome-devtools uninstall_pwa "https://example.com/" # Uninstall PWA and close windows
```

## Experimental Features

Experimental tools are disabled by default. Enable them with the corresponding flag during `start`.

```bash
chrome-devtools click_at 100 200 # Clicks at the provided coordinates (requires --experimentalVision=true)
chrome-devtools screencast_start --filePath "screen.mp4" # Starts a screencast recording (requires --experimentalScreencast=true and ffmpeg)
chrome-devtools screencast_stop # Stops the active screencast
chrome-devtools list_webmcp_tools # List all WebMCP tools (requires --categoryExperimentalWebmcp=true)
chrome-devtools execute_webmcp_tool "tool_name" '{"arg":"val"}' # Execute a WebMCP tool (requires --categoryExperimentalWebmcp=true)
chrome-devtools list_3p_developer_tools # List third-party developer tools (requires --categoryExperimentalThirdParty=true)
chrome-devtools execute_3p_developer_tool "tool_name" '{"arg":"val"}' # Execute third-party developer tool (requires --categoryExperimentalThirdParty=true)
```

## Service Management

```bash
chrome-devtools start   # Start or restart chrome-devtools-mcp
chrome-devtools start --allowUnrestrictedPaths=true # Start with full filesystem access
chrome-devtools start --headless=false # Start with visible browser window
chrome-devtools status  # Checks if chrome-devtools-mcp is running
chrome-devtools stop    # Stop chrome-devtools-mcp if any
```
