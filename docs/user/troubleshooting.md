# Troubleshooting Guide

## Extension Not Loading

### Symptoms
- Extension icon not visible in Chrome toolbar
- MCP server cannot connect to extension

### Solutions

1. **Install the Chrome extension**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked" and select `build/extension/` directory
   - Verify the extension appears and is enabled

2. **Validate manifest syntax**
   - Must be valid Manifest V3
   - Check for JSON syntax errors
   - Required fields: `manifest_version`, `name`, `version`

3. **Check extension errors**
   - Open `chrome://extensions/`
   - Click "Errors" under the chrome-ai-bridge extension
   - Check Service Worker console for errors

4. **Rebuild if needed**
   ```bash
   npm run build
   ```
   Then reload the extension in `chrome://extensions/`

## MCP Server Not Starting

### Check version
```bash
npx chrome-ai-bridge@latest --version
```

### Clear npx cache
```bash
npx clear-npx-cache
# or
rm -rf ~/.npm/_npx
```

### Verify MCP configuration
```bash
cat ~/.claude.json | jq '.mcpServers'
```

### Common issues

1. **Stale cache** - Clear npx cache and restart
2. **Invalid JSON** - Validate `~/.claude.json` syntax
3. **Port conflict** - Check if port 8766 is already in use:
   ```bash
   lsof -i :8766 | grep LISTEN
   ```
4. **Stale processes** - Kill old MCP server processes:
   ```bash
   pkill -f chrome-ai-bridge
   ```

## Extension Connection Issues

### Symptoms
- "Extension not connected" error
- MCP tools not responding

### Solutions

1. **Verify Discovery Server is running**
   ```bash
   curl http://127.0.0.1:8766/mcp-discovery
   ```
   Expected response:
   ```json
   {"wsUrl": "ws://127.0.0.1:XXXXX", ...}
   ```

2. **Check port 8766 availability**
   ```bash
   lsof -i :8766 | grep LISTEN
   ```

3. **Click extension icon** to trigger reconnection

4. **Restart Chrome** to reload the Service Worker

5. **Check extension permissions** in `chrome://extensions/`

## Hot-Reload Not Working (Developers)

### Verify development mode
```bash
ps aux | grep mcp-wrapper | grep MCP_ENV=development
```

### Check tsc -w is running
```bash
ps aux | grep 'tsc -w'
```

### Manually restart wrapper
```bash
pkill -f mcp-wrapper
# Then restart AI client (Cmd+R)
```

## ChatGPT/Gemini Integration Issues

### Login required
- First use requires manual login in browser
- MCP will prompt when login is needed
- Credentials are saved in browser profile

### Response not captured
- Wait for response to complete
- Check network connectivity
- Verify ChatGPT/Gemini service is available
- Try running with debug mode: `{ "question": "...", "debug": true }`

### Empty response (background tab)
- v2.1+ uses network extraction which is unaffected by background tab throttling
- If DOM fallback is used, `Page.bringToFront` handles this automatically
- See SPEC.md Section 13 Problem 4 for details

## Network Extraction Issues

### Symptoms
- Network interceptor captures frames but text is empty
- Falling back to DOM extraction when network should work

### Diagnosis
```bash
# Test network extraction directly
npm run test:network -- chatgpt
npm run test:network -- gemini
```

Check the output for:
- **Tracked requests**: Verify API URLs are being captured
- **Extracted text**: Verify text is non-empty
- **Frame count**: Should be > 0 for API responses

### Common causes

1. **`Network.enable` not called**: Ensure it's called in both tab reuse and new tab paths in `fast-chat.ts`
2. **API endpoint changed**: Check URL patterns in `network-interceptor.ts`:
   - ChatGPT: `/backend-api/f/conversation`
   - Gemini: `/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
3. **Response body unavailable**: Some redirects or cancelled requests don't have response bodies (expected)

## Performance Issues

### Slow startup
- First connection requires extension handshake (~2-3s)
- Subsequent connections reuse existing tabs (faster)

### Memory usage
- Close unused browser tabs
- Restart MCP server periodically
- Kill stale processes: `pkill -f chrome-ai-bridge`

## Debug Mode

Enable verbose logging:
```bash
DEBUG=mcp:* npx chrome-ai-bridge@latest
```

Or check debug files:
```bash
ls .local/chrome-ai-bridge/debug/
```

## Still Having Issues?

1. Check [GitHub Issues](https://github.com/usedhonda/chrome-ai-bridge/issues)
2. Search existing discussions
3. Create a new issue with:
   - Error message
   - Configuration used
   - Steps to reproduce
   - Output of `npm run test:network -- chatgpt` (if relevant)
