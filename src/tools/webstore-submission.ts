/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ========================================
// Chrome Web Store Submission Automation Tool
// This tool orchestrates the entire submission process
// ========================================

interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  icons?: Record<string, string>;
  action?: {
    default_popup?: string;
    default_icon?: Record<string, string>;
  };
  background?: {
    service_worker: string;
  };
  content_scripts?: Array<{
    matches: string[];
    js?: string[];
    css?: string[];
  }>;
}

// Main submission tool - now with browser automation!
export const submitToWebStore = defineTool({
  name: 'submit_to_webstore',
  description: `Automatically submit a Chrome extension to the Web Store using browser automation`,
  annotations: {
    category: ToolCategories.EXTENSION_DEVELOPMENT,
    readOnlyHint: false,
  },
  schema: {
    extensionPath: z.string().describe('Path to the extension directory'),
    autoSubmit: z.boolean().optional().default(false).describe('Automatically submit via browser (requires login)'),
  },
  handler: async (request, response, context) => {
    const { extensionPath } = request.params;
    const outputPath = path.join(path.dirname(extensionPath), `${path.basename(extensionPath)}-submission.zip`);

    response.appendResponseLine('🚀 **Chrome Web Store Submission Process**');
    response.appendResponseLine('=' .repeat(40));
    response.appendResponseLine('');

    // Step 1: Validate manifest
    response.appendResponseLine('**Step 1: Validating manifest.json...**');
    const manifestPath = path.join(extensionPath, 'manifest.json');
    let manifest: ManifestV3;
    let manifestValid = true;

    try {
      if (!fs.existsSync(manifestPath)) {
        response.appendResponseLine('❌ manifest.json not found');
        return;
      }

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);

      // Validation checks
      const errors: string[] = [];
      const warnings: string[] = [];
      const suggestions: string[] = [];

      // Required fields
      if (manifest.manifest_version !== 3) {
        errors.push('Must use Manifest V3 (manifest_version: 3)');
        manifestValid = false;
      }

      if (!manifest.name || manifest.name.length > 45) {
        errors.push('Name is required and must be <= 45 characters');
        manifestValid = false;
      }

      if (!manifest.version || !/^\d+\.\d+\.\d+(\.\d+)?$/.test(manifest.version)) {
        errors.push('Version must follow format: 1.0.0 or 1.0.0.0');
        manifestValid = false;
      }

      if (!manifest.description || manifest.description.length > 132) {
        warnings.push('Description should be provided and <= 132 characters');
      }

      // Icons
      if (!manifest.icons || !manifest.icons['128']) {
        warnings.push('Should include 128x128 icon');
      }

      // Permissions check
      const dangerousPermissions = [
        'debugger',
        'devtools',
        'management',
        'privacy',
        'proxy',
        'system.cpu',
        'system.memory',
        'vpnProvider',
      ];

      const usedDangerousPerms = manifest.permissions?.filter(p =>
        dangerousPermissions.includes(p)
      ) || [];

      if (usedDangerousPerms.length > 0) {
        warnings.push(
          `Uses sensitive permissions: ${usedDangerousPerms.join(', ')}`
        );
      }

      // Host permissions
      if (manifest.host_permissions?.includes('<all_urls>')) {
        warnings.push('Using <all_urls> requires strong justification');
      }

      // Service worker check
      if (manifest.background?.service_worker) {
        const swPath = path.join(extensionPath, manifest.background.service_worker);
        if (!fs.existsSync(swPath)) {
          errors.push(`Service worker file not found: ${manifest.background.service_worker}`);
          manifestValid = false;
        }
      }

      // Suggestions
      if (!manifest.icons?.['16'] || !manifest.icons?.['48']) {
        suggestions.push('Consider adding 16x16 and 48x48 icons');
      }

      // Display results
      if (manifestValid) {
        response.appendResponseLine('✅ Manifest is valid');
      } else {
        response.appendResponseLine('❌ Manifest has errors');
      }

      if (errors.length > 0) {
        response.appendResponseLine('\n**Errors:**');
        errors.forEach(err => response.appendResponseLine(`- ❌ ${err}`));
      }

      if (warnings.length > 0) {
        response.appendResponseLine('\n**Warnings:**');
        warnings.forEach(warn => response.appendResponseLine(`- ⚠️ ${warn}`));
      }

      if (suggestions.length > 0) {
        response.appendResponseLine('\n**Suggestions:**');
        suggestions.forEach(sug => response.appendResponseLine(`- 💡 ${sug}`));
      }

    } catch (error) {
      response.appendResponseLine(`❌ Failed to parse manifest: ${error}`);
      return;
    }

    if (!manifestValid) {
      response.appendResponseLine('');
      response.appendResponseLine('❌ **Submission blocked:** Fix manifest errors first');
      return;
    }

    response.appendResponseLine('');

    // Step 2: Generate store listing
    response.appendResponseLine('**Step 2: Generating store listing...**');

    let description = `${manifest.name} is a Chrome extension that ${manifest.description || 'enhances your browsing experience'}.\n\n`;

    description += '## Features\n\n';

    // Infer features from permissions
    if (manifest.permissions?.includes('tabs')) {
      description += '• Manage and organize your browser tabs\n';
    }
    if (manifest.permissions?.includes('storage')) {
      description += '• Save your preferences and settings\n';
    }
    if (manifest.permissions?.includes('notifications')) {
      description += '• Receive helpful notifications\n';
    }
    if (manifest.content_scripts) {
      description += '• Enhance website functionality\n';
    }
    if (manifest.action?.default_popup) {
      description += '• Quick access from toolbar\n';
    }

    // Guess category
    const { permissions = [], host_permissions = [] } = manifest;
    let category = 'Productivity'; // Default

    if (permissions.includes('tabs') || permissions.includes('bookmarks')) {
      category = 'Productivity';
    } else if (permissions.includes('downloads')) {
      category = 'Tools';
    } else if (host_permissions.some(h => h.includes('youtube') || h.includes('video'))) {
      category = 'Entertainment';
    } else if (host_permissions.some(h => h.includes('facebook') || h.includes('twitter'))) {
      category = 'Social & Communication';
    }

    response.appendResponseLine(`**Name:** ${manifest.name}`);
    response.appendResponseLine(`**Summary:** ${manifest.description || `${manifest.name} - Chrome Extension`}`);
    response.appendResponseLine(`**Category:** ${category}`);
    response.appendResponseLine('');
    response.appendResponseLine('**Generated Description Preview:**');
    response.appendResponseLine(description.substring(0, 200) + '...');

    response.appendResponseLine('');

    // Step 3: Create submission package
    response.appendResponseLine('**Step 3: Creating submission package...**');

    try {
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });

        output.on('close', () => {
          const sizeKB = (archive.pointer() / 1024).toFixed(2);
          response.appendResponseLine(`📦 Package created: ${outputPath}`);
          response.appendResponseLine(`   Size: ${sizeKB} KB`);
          resolve();
        });

        archive.on('error', (err) => {
          response.appendResponseLine(`❌ Failed to create package: ${err}`);
          reject(err);
        });

        archive.pipe(output);

        // Add extension files, excluding unnecessary ones
        archive.glob('**/*', {
          cwd: extensionPath,
          ignore: [
            'node_modules/**',
            '.git/**',
            '.gitignore',
            '*.map',
            '.DS_Store',
            'Thumbs.db',
            '*.log',
            'test/**',
            'tests/**',
            'docs/**',
          ],
        });

        archive.finalize();
      });

      response.appendResponseLine('✅ Package created successfully!');

    } catch (error) {
      response.appendResponseLine(`❌ Failed to create package: ${error}`);
      return;
    }

    response.appendResponseLine('');
    response.appendResponseLine('=' .repeat(40));
    response.appendResponseLine('**📋 Final Checklist:**');
    response.appendResponseLine('');
    response.appendResponseLine('Before submitting to Chrome Web Store:');
    response.appendResponseLine('1. ✅ Manifest validated');
    response.appendResponseLine('2. ✅ ZIP package created');
    response.appendResponseLine('3. ⬜ Add screenshots (1280x800 recommended)');
    response.appendResponseLine('4. ⬜ Add promotional images');
    response.appendResponseLine('5. ⬜ Write privacy policy (if needed)');
    response.appendResponseLine('6. ⬜ Pay $5 developer registration fee (first time only)');
    response.appendResponseLine('');
    response.appendResponseLine('**Submit at:** https://chrome.google.com/webstore/devconsole');

    // Step 4: Auto-submit via browser automation
    if (request.params.autoSubmit) {
      response.appendResponseLine('');
      response.appendResponseLine('=' .repeat(40));
      response.appendResponseLine('**🤖 Step 4: Automated Browser Submission**');
      response.appendResponseLine('');

      const page = context.getSelectedPage();

      try {
        // Navigate to Chrome Web Store Developer Dashboard
        response.appendResponseLine('Navigating to Developer Dashboard...');
        await page.goto('https://chrome.google.com/webstore/devconsole', {
          waitUntil: 'networkidle0',
        });

        // Check if user is logged in
        await new Promise(resolve => setTimeout(resolve, 2000));
        const currentUrl = page.url();

        if (currentUrl.includes('accounts.google.com')) {
          response.appendResponseLine('⚠️ Login required. Please log in manually.');
          response.appendResponseLine('After logging in, run this command again.');
          return;
        }

        // Check if this is a new submission or update
        response.appendResponseLine('Checking for existing extensions...');

        // Look for "Add new item" button
        const addNewButton = await page.$('button[aria-label="Add new item"], a[href*="register"]');

        if (addNewButton) {
          response.appendResponseLine('Creating new extension submission...');
          await addNewButton.click();
          await page.waitForNavigation({ waitUntil: 'networkidle0' });
        } else {
          response.appendResponseLine('❌ Could not find "Add new item" button');
          response.appendResponseLine('Please ensure you are on the Developer Dashboard');
          return;
        }

        // Upload the ZIP file
        response.appendResponseLine('Uploading extension package...');
        const fileInput = await page.$('input[type="file"]');

        if (fileInput) {
          await fileInput.uploadFile(outputPath);
          response.appendResponseLine('✅ Package uploaded');

          // Wait for processing
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Look for any errors
          const errorElements = await page.$$('.error-message, [role="alert"]');
          if (errorElements.length > 0) {
            const errorText = await page.evaluate(() => {
              const errors = document.querySelectorAll('.error-message, [role="alert"]');
              return Array.from(errors).map(e => e.textContent).join('\n');
            });
            response.appendResponseLine(`⚠️ Upload errors detected: ${errorText}`);
          }
        } else {
          response.appendResponseLine('❌ Could not find file upload input');
          return;
        }

        // Fill in store listing information
        response.appendResponseLine('Filling in store listing...');

        // Title field (usually pre-filled from manifest)
        const titleInput = await page.$('input[name="title"], input[aria-label*="title"]');
        if (titleInput) {
          const currentTitle = await titleInput.evaluate(el => (el as HTMLInputElement).value);
          if (!currentTitle) {
            await titleInput.type(manifest.name);
          }
        }

        // Summary/Short description
        const summaryInput = await page.$('textarea[name="summary"], textarea[aria-label*="summary"]');
        if (summaryInput) {
          await summaryInput.click({ clickCount: 3 }); // Select all
          await summaryInput.type(manifest.description || `${manifest.name} - Chrome Extension`);
        }

        // Detailed description
        const descriptionInput = await page.$('textarea[name="description"], textarea[aria-label*="description"]');
        if (descriptionInput) {
          await descriptionInput.click({ clickCount: 3 });
          await descriptionInput.type(description);
        }

        // Category selection
        const categorySelect = await page.$('select[name="category"], select[aria-label*="category"]');
        if (categorySelect) {
          await categorySelect.select(category.toLowerCase().replace(/\s+/g, '_'));
        }

        // Language
        const languageSelect = await page.$('select[name="language"], select[aria-label*="language"]');
        if (languageSelect) {
          await languageSelect.select('en');
        }

        response.appendResponseLine('✅ Store listing filled');

        // Screenshots reminder
        response.appendResponseLine('');
        response.appendResponseLine('⚠️ **Manual steps required:**');
        response.appendResponseLine('1. Add at least 1 screenshot (1280x800 or 640x400)');
        response.appendResponseLine('2. Add promotional images if needed');
        response.appendResponseLine('3. Review all information');
        response.appendResponseLine('4. Click "Save draft" or "Submit for review"');
        response.appendResponseLine('');
        response.appendResponseLine('The browser is now on the submission page.');
        response.appendResponseLine('Complete the remaining steps manually.');

      } catch (error) {
        response.appendResponseLine(`❌ Automation error: ${error}`);
        response.appendResponseLine('You may need to complete the submission manually.');
      }
    }
  },
});