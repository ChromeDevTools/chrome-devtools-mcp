# Changelog

All notable changes to this project will be documented in this file.

This project is a fork of [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-ai-bridge) by Google LLC, focusing on multi-AI consultation capabilities.

## [2.0.1] - 2026-01-30

### Added
- Detailed debug logging to extension for troubleshooting

### Fixed
- Prefer existing tabs for ChatGPT connections
- Add page load wait and debug output
- Auto-copy `src/extension` to `build/extension` on build
- **ChatGPT/Gemini send button**: Use JavaScript `button.click()` instead of CDP coordinate-based click (more reliable)
- **Message count detection**: Get assistant count after send success instead of before loop (fixes empty response issue)
- **Gemini mic button detection**: Add multilingual support (マイク, mic, microphone, voice)

## [2.0.0] - 2026-01-29

### Breaking Changes
- **Removed Puppeteer dependency**: The server no longer launches Chrome directly
- **Extension-only mode**: All browser communication now goes through Chrome extension
- **CLI options removed**: `--headless`, `--loadExtensionsDir`, `--channel`, etc. are no longer supported
- **Tools reduced from 20+ to 5**: Focus on AI consultation, debugging tools only

### Changed
- Architecture switched from Puppeteer to Chrome Extension + CDP
- Connection flow now uses Discovery Server (port 8766) and WebSocket relay

### Added
- `ask_chatgpt_gemini_web` - Query both AIs in parallel (recommended)
- `take_cdp_snapshot` - Debug tool for inspecting page state
- `get_page_dom` - Debug tool for querying DOM elements

## [1.1.24] - 2026-01-28

### Added
- `get_page_dom` tool for querying DOM elements with CSS selectors

## [1.1.23] - 2026-01-27

### Fixed
- Remove noisy polling log from extension

## [1.1.22] - 2026-01-27

### Fixed
- Restore discovery polling on extension startup

## [1.1.21] - 2026-01-26

### Added
- `take_cdp_snapshot` tool for debugging CDP page state

### Fixed
- Simplify background.mjs and add `ask_chatgpt_gemini_web` to FAST_TOOLS
- Clean up relay servers on timeout
- Fix Map proxy error

## [1.1.x] - 2026-01-20 to 2026-01-25

### Added
- Fast CDP architecture for ChatGPT/Gemini web automation
- CDP mouse events for improved send button reliability
- Tab reuse support for Gemini

### Fixed
- ChatGPT send button stability improvements
- Gemini send button reliability

## [1.0.22] - 2026-01-15

### Added
- Auto bring Chrome to front on login detection

## [1.0.21] - 2026-01-14

### Added
- Phase 4: `open -g` + `puppeteer.connect()` for macOS background launch

## [1.0.18] - 2026-01-12

### Added
- `--focus` option for Chrome window focus control

## [1.0.17] - 2026-01-11

### Fixed
- Use innerText + event dispatch for Gemini input

## [1.0.16] - 2026-01-10

### Fixed
- Use Shift+Enter for newlines in Gemini to prevent auto-send

## [1.0.15] - 2026-01-09

### Fixed
- Use Puppeteer keyboard.type() for Gemini text input

## [1.0.14] - 2026-01-08

### Fixed
- Prevent MCP server shutdown on Esc cancel

## [1.0.13] - 2026-01-07

### Added
- Immediate monitoring feedback on login wait start
- 5-minute timeout with progress display for login wait

## [1.0.x] - 2026-01-01 to 2026-01-06

### Added
- Extension Bridge for connecting to existing Chrome tabs
- URL-based tab connection with `--attachTabUrl`
- Multi-language login detection (12 languages)
- Session persistence across tool calls
- Auto-logging to `.local/chrome-ai-bridge/history.jsonl`

### Fixed
- Various Gemini input and response detection improvements
- ChatGPT response extraction reliability

## [0.7.0] - 2025-12-15

### Added
- Dedicated profile architecture
- Bookmark injection system
- `--loadExtension` CLI flag for Chrome extension loading

## [0.6.x] - 2025-12-01 to 2025-12-14

### Added
- Hot-reload development mode (`MCP_ENV=development`)
- Plugin architecture with `MCP_PLUGINS` environment variable

### Changed
- Simplified extension tools (list, reload, debug)

## [0.5.x] - 2025-11-15 to 2025-11-30

### Added
- Initial fork from Chrome DevTools MCP
- `ask_chatgpt_web` and `ask_gemini_web` tools
- Chrome extension development support

---

## Pre-fork History

For changes before this fork, see the [original Chrome DevTools MCP changelog](https://github.com/ChromeDevTools/chrome-ai-bridge/blob/main/CHANGELOG.md).
