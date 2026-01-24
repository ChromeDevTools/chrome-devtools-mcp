/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {Jimp} from 'jimp';
import type {Page} from 'puppeteer-core';
import z from 'zod';

import {GEMINI_CONFIG} from '../config.js';
import {DownloadManager} from '../download-manager.js';
import {
  getLoginStatus,
  waitForLoginStatus,
  LoginStatus,
} from '../login-helper.js';

import {ToolCategories} from './categories.js';
import {defineTool, type Context} from './ToolDefinition.js';

/**
 * Default crop margin in pixels (will be adjusted based on actual watermark size)
 */
const DEFAULT_CROP_MARGIN = 80;

/**
 * Navigate with retry logic
 */
async function navigateWithRetry(
  page: Page,
  url: string,
  options: {
    waitUntil: 'networkidle2' | 'domcontentloaded' | 'load';
    maxRetries?: number;
  } = {waitUntil: 'networkidle2', maxRetries: 3},
): Promise<void> {
  const {waitUntil, maxRetries = 3} = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, {waitUntil, timeout: 30000});
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRetryable =
        lastError.message.includes('ERR_ABORTED') ||
        lastError.message.includes('net::ERR_');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

/**
 * Find or create a dedicated Gemini tab
 */
async function getOrCreateGeminiPage(context: Context): Promise<Page> {
  await context.createPagesSnapshot();
  const pages = context.getPages();

  for (const page of pages) {
    const url = page.url();
    if (url.includes('gemini.google.com')) {
      await page.bringToFront();
      return page;
    }
  }

  const newPage = await context.newPage();
  return newPage;
}

/**
 * Enhance prompt for better watermark cropping
 * Adds composition requirements to center the subject and use solid background
 */
function enhancePromptForCropping(prompt: string): string {
  const compositionRequirements = `

Composition requirements:
- Center the main subject with generous padding on all sides (at least 15% margin from edges)
- Use a clean, solid background color
- Ensure no important elements touch the image edges, especially the bottom-right corner`;

  return prompt + compositionRequirements;
}

/**
 * Crop image to remove watermark (uniform crop from all sides)
 */
async function cropWatermark(
  inputPath: string,
  outputPath: string,
  margin: number = DEFAULT_CROP_MARGIN,
): Promise<{width: number; height: number}> {
  const image = await Jimp.read(inputPath);
  const {width, height} = image;

  // Crop from all sides
  const newWidth = width - margin * 2;
  const newHeight = height - margin * 2;

  if (newWidth <= 0 || newHeight <= 0) {
    throw new Error(
      `Image too small to crop: ${width}x${height} with margin ${margin}`,
    );
  }

  image.crop({x: margin, y: margin, w: newWidth, h: newHeight});
  await image.write(outputPath as `${string}.${string}`);

  return {width: newWidth, height: newHeight};
}


export const askGeminiImage = defineTool({
  name: 'ask_gemini_image',
  description:
    'Generate image using Gemini (Nano Banana / 3 Preview) via browser. ' +
    'Automatically crops watermark from edges. ' +
    'Rate limit: ~2 images/day for free users.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: false,
  },
  schema: {
    prompt: z
      .string()
      .describe(
        'Image generation prompt. Use natural language descriptions. ' +
          'Structure: [Subject + Adjectives] doing [Action] in [Location/Context]. ' +
          '[Composition/Camera Angle]. [Lighting/Atmosphere]. [Style/Media]. ' +
          'HEX color codes like "#9F2B68" are supported.',
      ),
    outputPath: z
      .string()
      .describe(
        'Output file path for the generated image. ' +
          'Will be cropped to remove watermark. Example: /tmp/generated-image.png',
      ),
    cropMargin: z
      .number()
      .optional()
      .describe(
        `Pixels to crop from each edge to remove watermark. Default: ${DEFAULT_CROP_MARGIN}`,
      ),
    skipCrop: z
      .boolean()
      .optional()
      .describe('Skip watermark cropping (keep original image). Default: false'),
  },
  handler: async (request, response, context) => {
    const {
      prompt,
      outputPath,
      cropMargin = DEFAULT_CROP_MARGIN,
      skipCrop = false,
    } = request.params;

    const page = await getOrCreateGeminiPage(context);

    try {
      response.appendResponseLine('Geminiに接続中...');

      // Navigate to Gemini
      await navigateWithRetry(page, GEMINI_CONFIG.BASE_URL + 'app', {
        waitUntil: 'networkidle2',
      });

      // Wait for UI to stabilize
      try {
        await Promise.race([
          page.waitForSelector(
            'button[aria-label*="Account"], button[aria-label*="アカウント"]',
            {timeout: 10000},
          ),
          page.waitForSelector('[role="textbox"]', {timeout: 10000}),
        ]);
      } catch {
        response.appendResponseLine('⚠️ UI安定化待機タイムアウト（続行）');
      }

      // Check login
      const loginStatus = await getLoginStatus(page, 'gemini');

      if (loginStatus === LoginStatus.NEEDS_LOGIN) {
        response.appendResponseLine('\n❌ Geminiへのログインが必要です');
        response.appendResponseLine('📱 ブラウザでGoogleアカウントにログインしてください');

        const finalStatus = await waitForLoginStatus(page, 'gemini', 120000, msg =>
          response.appendResponseLine(msg),
        );

        if (finalStatus !== LoginStatus.LOGGED_IN) {
          response.appendResponseLine('❌ ログインタイムアウト');
          return;
        }
      }

      response.appendResponseLine('✅ ログイン確認完了');

      // Enhance prompt for better cropping
      const enhancedPrompt = enhancePromptForCropping(prompt);
      response.appendResponseLine('プロンプトを送信中...');

      // Input enhanced prompt
      const questionSent = await page.evaluate(promptText => {
        const clearElement = (el: HTMLElement) => {
          while (el.firstChild) {
            el.removeChild(el.firstChild);
          }
        };

        const textbox = document.querySelector('[role="textbox"]') as HTMLElement;
        if (textbox) {
          textbox.focus();
          clearElement(textbox);
          textbox.textContent = promptText;
          textbox.dispatchEvent(new Event('input', {bubbles: true}));
          return true;
        }
        return false;
      }, enhancedPrompt);

      if (!questionSent) {
        response.appendResponseLine('❌ 入力欄が見つかりません');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Click send button
      const sent = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const sendButton = buttons.find(
          b =>
            b.textContent?.includes('プロンプトを送信') ||
            b.textContent?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('送信') ||
            b.getAttribute('aria-label')?.includes('Send'),
        );

        if (sendButton && !sendButton.disabled) {
          (sendButton as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!sent) {
        await page.keyboard.press('Enter');
        response.appendResponseLine('⚠️ 送信ボタンが見つかりません (Enterキーを試行)');
      }

      response.appendResponseLine('🎨 画像生成中... (1-2分かかることがあります)');

      // Wait for image generation using MutationObserver + polling hybrid approach
      // MutationObserver provides instant detection, polling ensures we don't miss state
      const startTime = Date.now();
      const maxWaitTime = 180000; // 3 minutes

      // Set up MutationObserver in the page (stores result in window object)
      await page.evaluate(() => {
        // @ts-expect-error - window property
        window.__geminiImageFound = false;

        const checkCompletion = (): boolean => {
          const images = document.querySelectorAll(
            'img[src*="blob:"], img[src*="generated"]',
          );
          const buttons = Array.from(
            document.querySelectorAll('button, [role="menuitem"]'),
          );
          const hasDownload = buttons.some(b => {
            const text = b.textContent || '';
            const ariaLabel = b.getAttribute('aria-label') || '';
            const describedBy = b.getAttribute('aria-describedby');
            let desc = '';
            if (describedBy) {
              const descEl = document.getElementById(describedBy);
              desc = descEl?.textContent || '';
            }
            return (
              text.includes('ダウンロード') ||
              text.includes('Download') ||
              text.includes('フルサイズ') ||
              ariaLabel.toLowerCase().includes('download') ||
              desc.includes('フルサイズ') ||
              desc.includes('ダウンロード')
            );
          });
          return images.length > 0 || hasDownload;
        };

        // Initial check
        if (checkCompletion()) {
          // @ts-expect-error - window property
          window.__geminiImageFound = true;
          return;
        }

        // Set up MutationObserver
        const observer = new MutationObserver(() => {
          if (checkCompletion()) {
            // @ts-expect-error - window property
            window.__geminiImageFound = true;
            observer.disconnect();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['src', 'aria-label', 'aria-describedby'],
        });
      });

      // Poll for the result (short intervals to minimize latency)
      let imageFound = false;
      while (Date.now() - startTime < maxWaitTime) {
        // Check if MutationObserver detected image
        const found = await page.evaluate(() => {
          // @ts-expect-error - window property
          return window.__geminiImageFound === true;
        });

        if (found) {
          imageFound = true;
          break;
        }

        // Short wait before next check (500ms for responsiveness)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!imageFound) {
        response.appendResponseLine('❌ 画像生成タイムアウト (3分)');
        return;
      }

      response.appendResponseLine(
        `✅ 画像生成完了 (${Math.floor((Date.now() - startTime) / 1000)}秒)`,
      );

      // Try to download the image using CDP-based download manager
      response.appendResponseLine('📥 画像をダウンロード中...');

      // Set up download manager with CDP events
      const userDownloadsDir = path.join(os.homedir(), 'Downloads');
      const downloadManager = new DownloadManager(page, userDownloadsDir);

      try {
        await downloadManager.startMonitoring();

        // Track reported progress to ensure threshold-based reporting
        let lastReportedThreshold = 0;

        // Listen for progress updates with threshold-based reporting
        // This ensures 25%, 50%, 75%, 100% are always reported even if progress jumps
        downloadManager.on('progress', (percent: number, filename: string) => {
          // Calculate the next threshold to report (25, 50, 75, 100)
          const thresholds = [25, 50, 75, 100];
          for (const threshold of thresholds) {
            if (percent >= threshold && lastReportedThreshold < threshold) {
              response.appendResponseLine(
                `📥 ダウンロード中... ${threshold}% (${filename})`,
              );
              lastReportedThreshold = threshold;
            }
          }
        });

        downloadManager.on('started', (filename: string) => {
          response.appendResponseLine(`📥 ダウンロード開始: ${filename}`);
        });

        // Click download button - Gemini uses "フルサイズの画像をダウンロード" button
        // Improved selector: prioritize aria-describedby for more reliable detection
        const downloadClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));

          // First, try to find button with aria-describedby pointing to "フルサイズ"
          let downloadBtn = buttons.find(b => {
            const describedBy = b.getAttribute('aria-describedby');
            if (describedBy) {
              const descEl = document.getElementById(describedBy);
              const desc = descEl?.textContent || '';
              return desc.includes('フルサイズ') || desc.includes('ダウンロード');
            }
            return false;
          });

          // Fallback: look for text/aria-label containing download keywords
          if (!downloadBtn) {
            downloadBtn = buttons.find(b => {
              const text = b.textContent || '';
              const ariaLabel = b.getAttribute('aria-label') || '';

              // Avoid "Cancel download" buttons
              const lowerText = text.toLowerCase();
              const lowerLabel = ariaLabel.toLowerCase();
              if (lowerText.includes('cancel') || lowerLabel.includes('cancel') ||
                  lowerText.includes('キャンセル') || lowerLabel.includes('キャンセル')) {
                return false;
              }

              return (
                text.includes('フルサイズ') ||
                text.includes('ダウンロード') ||
                ariaLabel.includes('ダウンロード') ||
                ariaLabel.includes('download')
              );
            });
          }

          if (downloadBtn) {
            (downloadBtn as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!downloadClicked) {
          response.appendResponseLine('⚠️ ダウンロードボタンが見つかりません');
          response.appendResponseLine('ヒント: ブラウザで画像を右クリックして保存してください');
          return;
        }

        // Wait for download to complete using hybrid approach:
        // 1. Try CDP events first (reliable for standard downloads)
        // 2. Fall back to filesystem monitoring (for blob/JS downloads like Gemini)
        response.appendResponseLine('⏳ ダウンロード完了を待機中...');

        // Get existing Gemini images before download
        const existingFiles = await fs.promises.readdir(userDownloadsDir);
        const existingGeminiImages = new Set(
          existingFiles.filter(f => f.startsWith('Gemini_Generated_Image_') && f.endsWith('.png'))
        );

        let downloadedPath: string | null = null;
        const downloadStartTime = Date.now();
        const downloadTimeout = 60000; // 60 seconds

        // Try CDP-based detection with filesystem fallback
        while (Date.now() - downloadStartTime < downloadTimeout) {
          // Check for new Gemini image files (filesystem fallback)
          const currentFiles = await fs.promises.readdir(userDownloadsDir);
          const newGeminiImages = currentFiles.filter(
            f => f.startsWith('Gemini_Generated_Image_') &&
                 f.endsWith('.png') &&
                 !existingGeminiImages.has(f)
          );

          if (newGeminiImages.length > 0) {
            // Found new image file
            const newestImage = newGeminiImages.sort().pop()!;
            downloadedPath = path.join(userDownloadsDir, newestImage);

            // Wait a bit for file to be fully written
            await new Promise(resolve => setTimeout(resolve, 500));

            response.appendResponseLine(`✅ ダウンロード完了: ${newestImage}`);
            break;
          }

          // Also check CDP events (for standard downloads)
          const completedDownloads = Array.from(downloadManager.getPendingDownloads()).filter(
            (d: {state: string}) => d.state === 'completed'
          );
          if (completedDownloads.length > 0) {
            // CDP detected completion - but Gemini uses blob downloads so this rarely fires
            break;
          }

          // Short wait before next check
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!downloadedPath) {
          response.appendResponseLine('❌ ダウンロードタイムアウト (60秒)');
          response.appendResponseLine(
            '💡 ヒント: ブラウザで画像を右クリックして「画像を保存」してください',
          );
          return;
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        await fs.promises.mkdir(outputDir, {recursive: true});

        // Crop watermark or copy directly
        if (skipCrop) {
          await fs.promises.copyFile(downloadedPath, outputPath);
          response.appendResponseLine(`📄 画像保存（クロップなし）: ${outputPath}`);
        } else {
          response.appendResponseLine(`✂️ ウォーターマークをクロップ中 (margin: ${cropMargin}px)...`);

          try {
            const {width, height} = await cropWatermark(
              downloadedPath,
              outputPath,
              cropMargin,
            );
            response.appendResponseLine(
              `✅ クロップ完了: ${width}x${height}px → ${outputPath}`,
            );
          } catch (cropError) {
            const msg = cropError instanceof Error ? cropError.message : String(cropError);
            response.appendResponseLine(`⚠️ クロップ失敗: ${msg}`);
            response.appendResponseLine('元の画像をそのまま保存します...');
            await fs.promises.copyFile(downloadedPath, outputPath);
          }
        }

        // Cleanup temp file
        try {
          await fs.promises.unlink(downloadedPath);
        } catch {
          // Ignore cleanup errors
        }

        response.appendResponseLine('\n🎉 画像生成完了!');
        response.appendResponseLine(`📁 出力: ${outputPath}`);

      } finally {
        // Ensure download manager is always disposed
        await downloadManager.dispose();
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes('Target closed') || msg.includes('Session closed')) {
        response.appendResponseLine('❌ ブラウザ接続が切れました');
        response.appendResponseLine('→ MCPサーバーを再起動してください');
      } else {
        response.appendResponseLine(`❌ エラー: ${msg}`);
      }
    }
  },
});
