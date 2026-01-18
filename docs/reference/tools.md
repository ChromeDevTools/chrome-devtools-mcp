<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (7 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (5 tools)
  - [`ask_chatgpt_web`](#ask_chatgpt_web)
  - [`ask_gemini_web`](#ask_gemini_web)
  - [`navigate`](#navigate)
  - [`pages`](#pages)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (2 tools)
  - [`emulate`](#emulate)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (1 tools)
  - [`performance`](#performance)
- **[Network](#network)** (1 tools)
  - [`network`](#network)
- **[Debugging](#debugging)** (4 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)

## Input automation

### `click`

**Description:** [`Click`](#click) on element by uid.

**Parameters:**

- **dblClick** (boolean) _(optional)_: Double [`click`](#click)
- **uid** (string) **(required)**: Element uid

---

### `drag`

**Description:** [`Drag`](#drag) element to another element.

**Parameters:**

- **from_uid** (string) **(required)**: Source element uid
- **to_uid** (string) **(required)**: Target element uid

---

### `fill`

**Description:** [`Fill`](#fill) input, textarea, or select element.

**Parameters:**

- **uid** (string) **(required)**: Element uid
- **value** (string) **(required)**: Value to [`fill`](#fill)

---

### `fill_form`

**Description:** [`Fill`](#fill) multiple form elements.

**Parameters:**

- **elements** (array) **(required)**: Elements to [`fill`](#fill)

---

### `handle_dialog`

**Description:** Handle browser dialog: accept or dismiss.

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Action
- **promptText** (string) _(optional)_: Prompt text

---

### `hover`

**Description:** [`Hover`](#hover) over element by uid.

**Parameters:**

- **uid** (string) **(required)**: Element uid

---

### `upload_file`

**Description:** Upload file through element.

**Parameters:**

- **filePath** (string) **(required)**: Local file path
- **uid** (string) **(required)**: File input element uid

---

## Navigation automation

### `ask_chatgpt_web`

**Description:** Ask ChatGPT via browser. Logs to docs/ask/chatgpt/. IMPORTANT: Always continues existing project chat by default. Only set createNewChat=true when user explicitly says "新規で" or "new chat".

**Parameters:**

- **createNewChat** (boolean) _(optional)_: Force new chat. Only use true when user explicitly requests "新規で" or "new chat". Default false = always continue existing project chat.
- **projectName** (string) _(optional)_: Project name (default: cwd)
- **question** (string) **(required)**: Detailed question to ask. Structure with: (1) Context (tech stack, versions, constraints), (2) Current State (exact error/logs/behavior), (3) Goal (expected outcome), (4) Attempts (what was tried, why it failed), (5) Format (steps/code/table). IMPORTANT: Do not mention you are an AI/MCP. No secrets/PII. Don't guess missing facts.

---

### `ask_gemini_web`

**Description:** Ask Gemini via browser. Logs to docs/ask/gemini/. IMPORTANT: Always continues existing project chat by default. Only set createNewChat=true when user explicitly says "新規で" or "new chat".

**Parameters:**

- **createNewChat** (boolean) _(optional)_: Force new chat. Only use true when user explicitly requests "新規で" or "new chat". Default false = always continue existing project chat.
- **projectName** (string) _(optional)_: Project name (default: cwd)
- **question** (string) **(required)**: Detailed question to ask. Structure with: (1) Context (tech stack, versions, constraints), (2) Current State (exact error/logs/behavior), (3) Goal (expected outcome), (4) Attempts (what was tried, why it failed), (5) Format (steps/code/table). IMPORTANT: Do not mention you are an AI/MCP. No secrets/PII. Don't guess missing facts.

---

### `navigate`

**Description:** [`Navigate`](#navigate): goto URL, back, forward, or open new page.

**Parameters:**

- **op** (enum: "goto", "back", "forward", "new") **(required)**: Operation
- **url** (string) _(optional)_: URL (for goto/new)

---

### `pages`

**Description:** Manage browser [`pages`](#pages): list, select, or close.

**Parameters:**

- **op** (enum: "list", "select", "close") **(required)**: Operation
- **pageIdx** (number) _(optional)_: Page index (for select/close)

---

### `wait_for`

**Description:** Wait for text to appear on page.

**Parameters:**

- **text** (string) **(required)**: Text to wait for
- **timeout** (number) _(optional)_: Timeout ms (default: 30000)

---

## Emulation

### `emulate`

**Description:** [`Emulate`](#emulate) CPU or [`network`](#network) throttling.

**Parameters:**

- **target** (enum: "cpu", "network") **(required)**: Emulation target
- **throttlingOption** (enum: "No emulation", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: [`Network`](#network) option
- **throttlingRate** (number) _(optional)_: CPU rate 1-20x

---

### `resize_page`

**Description:** Resize page dimensions.

**Parameters:**

- **height** (number) **(required)**: Height
- **width** (number) **(required)**: Width

---

## Performance

### `performance`

**Description:** [`Performance`](#performance) trace: start, stop, or analyze insight.

**Parameters:**

- **autoStop** (boolean) _(optional)_: Auto-stop after 5s
- **insightName** (string) _(optional)_: Insight name (for analyze)
- **op** (enum: "start", "stop", "analyze") **(required)**: Operation
- **reload** (boolean) _(optional)_: Reload page on start

---

## Network

### `network`

**Description:** [`Network`](#network) requests: list all or get by URL.

**Parameters:**

- **op** (enum: "list", "get") **(required)**: Operation
- **pageIdx** (integer) _(optional)_: Page number
- **pageSize** (integer) _(optional)_: Max results
- **resourceTypes** (array) _(optional)_: Filter types
- **url** (string) _(optional)_: Request URL (for get)

---

## Debugging

### `evaluate_script`

**Description:** Run JavaScript in page, return JSON result.

**Parameters:**

- **args** (array) _(optional)_: Element arguments
- **function** (string) **(required)**: JS function string

---

### `list_console_messages`

**Description:** List console messages for selected page.

**Parameters:** None

---

### `take_screenshot`

**Description:** Take screenshot of page or element.

**Parameters:**

- **format** (enum: "png", "jpeg") _(optional)_: Image format
- **fullPage** (boolean) _(optional)_: Full page screenshot
- **uid** (string) _(optional)_: Element uid (optional)

---

### `take_snapshot`

**Description:** Get page elements with uids. Prefer over screenshot.

**Parameters:** None

---
