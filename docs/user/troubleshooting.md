# Troubleshooting Guide

## Extension Not Loading

### Symptoms
- Extension doesn't appear in `list_extensions`
- Extension icon not visible in browser

### Solutions

1. **Check manifest.json location**
   ```
   /path/to/your/extension/
   └── manifest.json  <-- Must be at root
   ```

2. **Verify path in configuration**
   ```json
   "--loadExtensionsDir=/path/to/your/extensions"
   ```
   - Use absolute paths, not relative
   - Directory should contain extension folders, not manifest.json directly

3. **Validate manifest syntax**
   - Must be valid Manifest V3
   - Check for JSON syntax errors
   - Required fields: `manifest_version`, `name`, `version`

4. **Check extension errors**
   ```
   "Check extension popup for errors"
   ```

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
3. **Port conflict** - Chrome may already be running with same profile

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

### Configuration check
Ensure `~/.claude.json` has:
```json
{
  "env": {
    "MCP_ENV": "development"
  }
}
```

## Chrome Profile Issues

### "Profile already in use" error
- Close all Chrome instances using the same profile
- Use `--isolated` flag for temporary profile

### Extensions not syncing
- System extensions are loaded automatically
- Use `--loadSystemExtensions` to force reload

### Wrong profile detected
- Explicitly set profile with `--userDataDir`
- Check for multiple Chrome installations

## ChatGPT/Gemini Integration Issues

### Login required
- First use requires manual login in browser
- MCP will prompt when login is needed
- Credentials are saved in browser profile

### Response not captured
- Wait for response to complete
- Check network connectivity
- Verify ChatGPT/Gemini service is available

### Questions not logged
- Check `docs/ask/` directory exists
- Verify write permissions

## Performance Issues

### Slow startup
- First run downloads Chrome if needed
- Use `--channel=stable` for faster startup
- Consider `--headless` for CI/CD

### Memory usage
- Close unused browser tabs
- Use `--isolated` for minimal profile
- Restart MCP server periodically

## Debug Mode

Enable verbose logging:
```bash
DEBUG=mcp:* npx chrome-ai-bridge@latest
```

Or in configuration:
```json
{
  "env": {
    "DEBUG": "mcp:*"
  }
}
```

## Still Having Issues?

1. Check [GitHub Issues](https://github.com/usedhonda/chrome-ai-bridge/issues)
2. Search existing discussions
3. Create a new issue with:
   - Error message
   - Configuration used
   - Steps to reproduce
