/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// Tool for generating extension screenshots automatically
export const generateExtensionScreenshots = defineTool({
  name: 'generate_extension_screenshots',
  description: `Automatically generate screenshots for Chrome Web Store submission`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionPath: z.string().describe('Path to the extension directory'),
    extensionId: z.string().optional().describe('Extension ID if already installed'),
  },
  handler: async (request, response, context) => {
    const { extensionPath, extensionId } = request.params;
    const screenshotsDir = path.join(path.dirname(extensionPath), 'screenshots');

    // Create screenshots directory
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const page = context.getSelectedPage();

    response.appendResponseLine('📸 **Generating Extension Screenshots**');
    response.appendResponseLine('=' .repeat(40));
    response.appendResponseLine('');

    try {
      // Set viewport to Chrome Web Store recommended size
      await page.setViewport({ width: 1280, height: 800 });

      // Screenshot 1: Extension in action on a popular website
      response.appendResponseLine('1️⃣ Taking screenshot of extension in action...');

      // Navigate to a demo page
      await page.goto('https://www.example.com', { waitUntil: 'networkidle0' });

      // If extension has a popup, try to capture it
      if (extensionId) {
        // Open extension popup if possible
        const extensionUrl = `chrome-extension://${extensionId}/popup.html`;

        // Try to open popup in new tab for screenshot
        const popupPage = await page.browser().newPage();
        await popupPage.setViewport({ width: 1280, height: 800 });

        try {
          await popupPage.goto(extensionUrl, { waitUntil: 'networkidle0' });

          // Take screenshot of popup
          const popupScreenshot = await popupPage.screenshot({
            type: 'png',
            fullPage: false,
          });

          const popupPath = path.join(screenshotsDir, 'screenshot-1-popup.png');
          fs.writeFileSync(popupPath, popupScreenshot);
          response.appendResponseLine(`✅ Popup screenshot saved: ${popupPath}`);

          await popupPage.close();
        } catch (error) {
          response.appendResponseLine(`⚠️ Could not capture popup: ${error}`);
        }
      }

      // Screenshot 2: Extension toolbar icon
      response.appendResponseLine('2️⃣ Taking screenshot with extension icon visible...');

      // Navigate to chrome://extensions to show the extension
      await page.goto('chrome://extensions/', { waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 1000));

      const extensionsScreenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      const extensionsPath = path.join(screenshotsDir, 'screenshot-2-extensions.png');
      fs.writeFileSync(extensionsPath, extensionsScreenshot);
      response.appendResponseLine(`✅ Extensions page screenshot saved: ${extensionsPath}`);

      // Screenshot 3: Options page (if exists)
      response.appendResponseLine('3️⃣ Taking screenshot of options page...');

      if (extensionId) {
        const optionsUrl = `chrome-extension://${extensionId}/options.html`;

        try {
          await page.goto(optionsUrl, { waitUntil: 'networkidle0' });

          const optionsScreenshot = await page.screenshot({
            type: 'png',
            fullPage: false,
          });

          const optionsPath = path.join(screenshotsDir, 'screenshot-3-options.png');
          fs.writeFileSync(optionsPath, optionsScreenshot);
          response.appendResponseLine(`✅ Options page screenshot saved: ${optionsPath}`);
        } catch (error) {
          response.appendResponseLine(`⚠️ No options page found`);
        }
      }

      // Screenshot 4: Extension working on a real website
      response.appendResponseLine('4️⃣ Taking screenshot on a real website...');

      // Navigate to a website where the extension might be useful
      await page.goto('https://www.google.com', { waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const websiteScreenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      const websitePath = path.join(screenshotsDir, 'screenshot-4-website.png');
      fs.writeFileSync(websitePath, websiteScreenshot);
      response.appendResponseLine(`✅ Website screenshot saved: ${websitePath}`);

      // Generate promotional images (smaller versions)
      response.appendResponseLine('');
      response.appendResponseLine('5️⃣ Generating promotional images...');

      // Small promo tile: 440x280
      await page.setViewport({ width: 440, height: 280 });
      await page.goto('chrome://extensions/', { waitUntil: 'networkidle0' });

      const smallPromo = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      const smallPromoPath = path.join(screenshotsDir, 'promo-small-440x280.png');
      fs.writeFileSync(smallPromoPath, smallPromo);
      response.appendResponseLine(`✅ Small promo tile saved: ${smallPromoPath}`);

      // Large promo tile: 920x680
      await page.setViewport({ width: 920, height: 680 });

      const largePromo = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      const largePromoPath = path.join(screenshotsDir, 'promo-large-920x680.png');
      fs.writeFileSync(largePromoPath, largePromo);
      response.appendResponseLine(`✅ Large promo tile saved: ${largePromoPath}`);

      // Marquee promo: 1400x560
      await page.setViewport({ width: 1400, height: 560 });

      const marqueePromo = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      const marqueePromoPath = path.join(screenshotsDir, 'promo-marquee-1400x560.png');
      fs.writeFileSync(marqueePromoPath, marqueePromo);
      response.appendResponseLine(`✅ Marquee promo saved: ${marqueePromoPath}`);

      response.appendResponseLine('');
      response.appendResponseLine('=' .repeat(40));
      response.appendResponseLine('✅ **Screenshots Generated Successfully!**');
      response.appendResponseLine('');
      response.appendResponseLine(`📁 Screenshots saved in: ${screenshotsDir}`);
      response.appendResponseLine('');
      response.appendResponseLine('**Chrome Web Store Requirements:**');
      response.appendResponseLine('• Screenshots: 1280x800 or 640x400 (PNG or JPG)');
      response.appendResponseLine('• Small promo tile: 440x280');
      response.appendResponseLine('• Large promo tile: 920x680');
      response.appendResponseLine('• Marquee promo: 1400x560');
      response.appendResponseLine('');
      response.appendResponseLine('💡 **Tip:** Edit these screenshots to highlight your extension features!');

    } catch (error) {
      response.appendResponseLine(`❌ Error generating screenshots: ${error}`);
    } finally {
      // Reset viewport
      await page.setViewport({ width: 1280, height: 800 });
    }
  },
});