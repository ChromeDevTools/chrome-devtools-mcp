# How to Push These Changes

## ⚠️ Important Note

I've made all the stealth mode modifications locally, but I **cannot push to the nimbus21/chrome-devtools-mcp repository** because:
1. I don't have GitHub authentication credentials
2. I don't have write access to that repository

## Your Options

### Option 1: Push to Your Own GitHub Fork (Recommended)

1. **Fork the repository on GitHub:**
   - Go to https://github.com/nimbus21/chrome-devtools-mcp
   - Click "Fork" button
   - Choose your GitHub account

2. **Change the remote URL to your fork:**
   ```bash
   cd /tmp/nimbus-chrome-mcp
   git remote set-url origin https://github.com/YOUR_USERNAME/chrome-devtools-mcp.git
   ```

3. **Push the changes:**
   ```bash
   git push origin main
   ```

4. **Use your fork:**
   ```bash
   claude mcp add chrome-stealth npx github:YOUR_USERNAME/chrome-devtools-mcp -- --stealth
   ```

### Option 2: Create a New Repository

1. **Create a new repository on GitHub** (e.g., `chrome-devtools-mcp-stealth`)

2. **Change the remote:**
   ```bash
   cd /tmp/nimbus-chrome-mcp
   git remote set-url origin https://github.com/YOUR_USERNAME/chrome-devtools-mcp-stealth.git
   ```

3. **Push:**
   ```bash
   git push -u origin main
   ```

### Option 3: Move to Your Project Directory

If you want to work with this locally without pushing:

```bash
# Copy to your project
cp -r /tmp/nimbus-chrome-mcp /home/coder/project/chrome-devtools-mcp-stealth

# Build and test
cd /home/coder/project/chrome-devtools-mcp-stealth
npm install
npm run build
npm start -- --stealth
```

### Option 4: Create a Pull Request to Original Repo

1. Fork the **original** Google repo: https://github.com/ChromeDevTools/chrome-devtools-mcp
2. Apply these changes to your fork
3. Submit a PR to contribute stealth mode to the official project

## What Was Changed

All changes have been committed locally:

```bash
cd /tmp/nimbus-chrome-mcp
git log -1 --stat
```

### Files Modified:
- ✅ `package.json` - Added puppeteer-extra dependencies
- ✅ `src/browser.ts` - Stealth mode implementation
- ✅ `src/cli.ts` - New CLI options
- ✅ `src/main.ts` - Pass stealth args
- ✅ `STEALTH_FEATURES.md` - Full documentation

### Commit Message:
```
Add stealth mode and custom Chrome args support

- Added puppeteer-extra and puppeteer-extra-plugin-stealth dependencies
- Implemented --stealth flag to enable bot detection bypass
- Added --chromeArgs option to pass custom Chrome arguments
- Updated browser.ts to conditionally use puppeteer-extra with stealth
- Added anti-detection Chrome flags when stealth is enabled
- Updated CLI with new options and examples
- Created comprehensive documentation in STEALTH_FEATURES.md
```

## Testing Before Pushing

Build and test locally:

```bash
cd /tmp/nimbus-chrome-mcp

# Install dependencies
npm install

# Build
npm run build

# Test with stealth mode
npm start -- --stealth --executablePath /usr/bin/chromium
```

Then in another terminal, test with an MCP client.

## View Changes

```bash
cd /tmp/nimbus-chrome-mcp

# View diff
git show HEAD

# View modified files
git diff HEAD~1

# View file tree
tree -L 2 -I 'node_modules|build'
```

## Next Steps

1. Choose which option above fits your needs
2. Set up GitHub authentication if needed
3. Push to your repository
4. Share the stealth mode features! 🎉

## Quick Command Summary

```bash
# Option 1: Fork and push
cd /tmp/nimbus-chrome-mcp
git remote set-url origin https://github.com/YOUR_USERNAME/chrome-devtools-mcp.git
git push origin main

# Option 2: New repo
cd /tmp/nimbus-chrome-mcp
git remote set-url origin https://github.com/YOUR_USERNAME/NEW_REPO_NAME.git
git push -u origin main

# Option 3: Local use
cp -r /tmp/nimbus-chrome-mcp ~/my-stealth-mcp
cd ~/my-stealth-mcp
npm install && npm run build
```

## Need Help?

The modified repository is at: `/tmp/nimbus-chrome-mcp`

All changes are committed and ready to push once you set up your remote repository!
