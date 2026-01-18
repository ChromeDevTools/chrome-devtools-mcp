# Common Workflows

## Create & Test Extension

```
1. "Create a Chrome extension that blocks ads"
2. "List extensions to verify it loaded"
3. "Test the extension on youtube.com"
4. "Show any errors from the extension"
```

**Tips:**
- Use `take_snapshot` to analyze page structure before writing content scripts
- Use `list_console_messages` to check for errors
- Use `reload_iframe_extension` after code changes

## Debug Extension Issues

```
1. "List extensions and show any errors"
2. "Inspect service worker for my-ad-blocker"
3. "Show console messages"
4. "Reload the extension with latest changes"
```

**Useful tools:**
- `list_console_messages` - View extension errors
- `evaluate_script` - Run JavaScript in page context
- `take_screenshot` - Capture visual state

## Publish to Web Store

```
1. "Generate screenshots for my extension"
2. "Validate manifest for Web Store compliance"
3. "Submit to Chrome Web Store"
```

**Requirements:**
- Valid Manifest V3
- Proper permissions declared
- Store-ready screenshots (1280x800 recommended)

## AI Research with ChatGPT/Gemini

```
1. "Ask ChatGPT about best practices for Chrome extension security"
2. "Ask Gemini to compare React vs Vanilla JS for popup UI"
```

**Notes:**
- Questions are logged to `docs/ask/chatgpt/` or `docs/ask/gemini/`
- Use `createNewChat: true` only when explicitly starting a new topic
- Provide detailed context for better answers

## Performance Analysis

```
1. "Start performance trace"
2. "Navigate to youtube.com"
3. "Stop performance trace"
4. "Analyze performance insights"
```

**Use cases:**
- Identify extension performance impact
- Find rendering bottlenecks
- Measure load times

## Browser Automation

```
1. "Navigate to google.com"
2. "Fill the search box with 'chrome extension tutorial'"
3. "Click the search button"
4. "Take a screenshot"
```

**Available actions:**
- `click`, `fill`, `drag`, `hover`
- `take_screenshot`, `take_snapshot`
- `navigate`, `wait_for`

## Multi-Page Testing

```
1. "List all open pages"
2. "Select page 2"
3. "Take a snapshot of current page"
4. "Navigate back to page 1"
```

**Tips:**
- Use `pages op=list` to see all tabs
- Use `pages op=select` to switch tabs
- Each tab maintains its own state
