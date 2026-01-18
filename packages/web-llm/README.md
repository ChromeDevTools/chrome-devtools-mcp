# @chrome-devtools-mcp/web-llm

Web-LLM tools for chrome-devtools-mcp (ChatGPT/Gemini browser automation).

## Status: Planned

This package is planned for future extraction from the main chrome-devtools-mcp-for-extension package.

Currently, the web-llm tools are included in the main package and can be:

- **Disabled** via `MCP_DISABLE_WEB_LLM=true` environment variable
- **Loaded as plugins** via the plugin architecture (v0.26.0+)

## Current Location

The web-llm tools are currently located in the main package:

- `src/tools/chatgpt-web.ts` - ChatGPT browser automation
- `src/tools/gemini-web.ts` - Gemini browser automation
- `src/selectors/chatgpt.json` - ChatGPT UI selectors
- `src/selectors/gemini.json` - Gemini UI selectors

## Future Plan

When this package is fully extracted:

```bash
# Install as separate package
npm install @chrome-devtools-mcp/web-llm

# Use as plugin
MCP_PLUGINS=@chrome-devtools-mcp/web-llm npx chrome-devtools-mcp-for-extension
```

## Why Separate?

Web-LLM tools are:

- **Site-dependent**: They rely on specific website UIs (ChatGPT, Gemini)
- **Unstable**: May break when those UIs change
- **Optional**: Not all users need AI chat integration

Separating them allows:

- Core package to remain stable
- Faster iteration on web-llm selectors
- Optional installation for users who don't need AI integration

## Tools

| Tool              | Description                           |
| ----------------- | ------------------------------------- |
| `ask_chatgpt_web` | Send questions to ChatGPT via browser |
| `ask_gemini_web`  | Send questions to Gemini via browser  |

## Disclaimer

These tools are experimental and best-effort. They depend on specific website UIs and may break when those UIs change. For production use, consider using official APIs instead.
