# Stealth Mode Features

This fork of Chrome DevTools MCP adds **stealth mode** capabilities to bypass bot detection on websites.

## New Features

### 1. **Stealth Mode** (`--stealth`)
Enables puppeteer-extra-plugin-stealth and adds anti-detection Chrome arguments to make browser automation undetectable.

**What it does:**
- Uses `puppeteer-extra` with `puppeteer-extra-plugin-stealth` plugin
- Removes automation-related Chrome arguments
- Adds anti-detection Chrome flags:
  - `--disable-blink-features=AutomationControlled`
  - `--disable-features=IsolateOrigins,site-per-process`
  - `--no-first-run`
  - `--no-service-autorun`
  - `--password-store=basic`
- Removes `--enable-automation` flag

### 2. **Custom Chrome Arguments** (`--chromeArgs`)
Pass any additional Chrome command-line arguments (comma-separated).

## Usage

### Basic Stealth Mode
```bash
npx chrome-devtools-mcp@latest --stealth
```

### Stealth Mode with Custom Chrome Arguments
```bash
npx chrome-devtools-mcp@latest --stealth --chromeArgs="--window-size=1920,1080,--user-agent=CustomAgent"
```

### Only Custom Arguments (without stealth plugin)
```bash
npx chrome-devtools-mcp@latest --chromeArgs="--disable-gpu,--no-sandbox"
```

## MCP Configuration

### Claude Code
```bash
claude mcp add chrome-stealth npx chrome-devtools-mcp@latest -- --stealth
```

Or manually edit `.claude/config.json`:
```json
{
  "mcpServers": {
    "chrome-stealth": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--stealth"
      ]
    }
  }
}
```

### With Custom Chrome Args
```json
{
  "mcpServers": {
    "chrome-stealth": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--stealth",
        "--chromeArgs=--window-size=1920,1080"
      ]
    }
  }
}
```

### With Chromium Path
```json
{
  "mcpServers": {
    "chrome-stealth": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--stealth",
        "--executablePath",
        "/usr/bin/chromium"
      ]
    }
  }
}
```

## Technical Details

### Modified Files
- `package.json` - Added `puppeteer-extra` and `puppeteer-extra-plugin-stealth` dependencies
- `src/browser.ts` - Added stealth mode logic and custom Chrome args support
- `src/cli.ts` - Added `--stealth` and `--chromeArgs` CLI options
- `src/main.ts` - Pass stealth options to browser launcher

### How Stealth Mode Works
1. **Puppeteer-Extra Plugin**: Uses `puppeteer-extra-plugin-stealth` which applies dozens of evasion techniques:
   - Removes `navigator.webdriver` flag
   - Masks Chrome headless detection
   - Fixes `navigator.plugins` and `navigator.languages`
   - Spoofs WebGL vendor/renderer
   - And many more...

2. **Chrome Flags**: Adds critical anti-detection flags:
   - `--disable-blink-features=AutomationControlled` - Removes automation indicators
   - `ignoreDefaultArgs: ['--enable-automation']` - Prevents automation flag

3. **Conditional**: Only uses puppeteer-extra when stealth is enabled, otherwise uses standard puppeteer-core for better performance

## Testing

Test stealth mode on bot-protected sites:
```bash
# Navigate to bot-protected site
npx chrome-devtools-mcp@latest --stealth

# Then use the MCP tools to navigate to sites like:
# - https://2nabiji.ge
# - https://bot.sannysoft.com
# - https://arh.antoinevastel.com/bots/areyouheadless
```

## Comparison with Standard Chrome DevTools MCP

| Feature | Standard | With Stealth |
|---------|----------|--------------|
| Bot Detection | ❌ Detected | ✅ Bypassed |
| Performance | Fast | Slightly slower |
| Dependencies | puppeteer-core | + puppeteer-extra |
| Use Case | Development/Testing | Bot-protected sites |

## Use Cases

- **E-commerce scraping**: Access sites with Cloudflare or similar protection
- **Price monitoring**: Automated price checking without detection
- **Testing**: Test how your site appears to real users vs bots
- **Research**: Access data from protected sources

## Credits

Stealth implementation based on:
- [puppeteer-extra](https://github.com/berstend/puppeteer-extra)
- [puppeteer-extra-plugin-stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)

Original Chrome DevTools MCP by Google LLC / Chrome DevTools team.
