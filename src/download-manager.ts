/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CDP (Chrome DevTools Protocol) based download manager
 * Provides reliable download detection using browser events instead of filesystem polling
 */

import type {Page, CDPSession, Protocol} from 'puppeteer-core';
import {EventEmitter} from 'events';

interface DownloadInfo {
  guid: string;
  url: string;
  suggestedFilename: string;
  state: 'inProgress' | 'completed' | 'canceled';
  receivedBytes: number;
  totalBytes: number;
  resolvedPath?: string;
}

interface DownloadManagerEvents {
  progress: [percent: number, filename: string];
  started: [filename: string];
  completed: [filepath: string];
  canceled: [filename: string];
}

export class DownloadManager extends EventEmitter {
  private cdpSession: CDPSession | null = null;
  private downloadDir: string;
  private page: Page;
  private pendingDownloads: Map<string, DownloadInfo> = new Map();
  private downloadPromiseResolvers: Map<
    string,
    {resolve: (path: string) => void; reject: (err: Error) => void}
  > = new Map();
  private isMonitoring = false;

  constructor(page: Page, downloadDir: string) {
    super();
    this.page = page;
    this.downloadDir = downloadDir;
  }

  /**
   * Handle downloadWillBegin event
   */
  private handleDownloadWillBegin = (
    event: Protocol.Browser.DownloadWillBeginEvent,
  ): void => {
    const info: DownloadInfo = {
      guid: event.guid,
      url: event.url,
      suggestedFilename: event.suggestedFilename,
      state: 'inProgress',
      receivedBytes: 0,
      totalBytes: 0,
    };
    this.pendingDownloads.set(event.guid, info);
    this.emit('started', event.suggestedFilename);
  };

  /**
   * Handle downloadProgress event
   */
  private handleDownloadProgress = (
    event: Protocol.Browser.DownloadProgressEvent,
  ): void => {
    const info = this.pendingDownloads.get(event.guid);
    if (!info) return;

    info.receivedBytes = event.receivedBytes;
    info.totalBytes = event.totalBytes;
    info.state = event.state as DownloadInfo['state'];

    // Emit progress
    if (event.totalBytes > 0) {
      const percent = Math.round(
        (event.receivedBytes / event.totalBytes) * 100,
      );
      this.emit('progress', percent, info.suggestedFilename);
    }

    // Handle completion
    if (event.state === 'completed') {
      // Construct the final path
      const finalPath = `${this.downloadDir}/${info.suggestedFilename}`;
      info.resolvedPath = finalPath;

      this.emit('completed', finalPath);

      // Resolve any waiting promises
      const resolver = this.downloadPromiseResolvers.get(event.guid);
      if (resolver) {
        resolver.resolve(finalPath);
        this.downloadPromiseResolvers.delete(event.guid);
      }
    } else if (event.state === 'canceled') {
      this.emit('canceled', info.suggestedFilename);

      const resolver = this.downloadPromiseResolvers.get(event.guid);
      if (resolver) {
        resolver.reject(new Error('Download canceled'));
        this.downloadPromiseResolvers.delete(event.guid);
      }
    }
  };

  /**
   * Start monitoring downloads using CDP events
   * Event handlers are registered immediately after CDP session creation
   * to prevent race conditions
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    // Create CDP session
    this.cdpSession = await this.page.createCDPSession();

    // Register event handlers IMMEDIATELY after CDP session creation
    // This prevents race condition where events could be missed
    this.cdpSession.on('Browser.downloadWillBegin', this.handleDownloadWillBegin);
    this.cdpSession.on('Browser.downloadProgress', this.handleDownloadProgress);

    // Enable download events
    await this.cdpSession.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: this.downloadDir,
      eventsEnabled: true,
    });

    this.isMonitoring = true;
  }

  /**
   * Wait for any download to complete
   * @param timeoutMs Timeout in milliseconds
   * @returns Path to the downloaded file
   */
  async waitForDownload(timeoutMs: number = 60000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Download timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Check if there's already a pending download
      const existingDownload = Array.from(this.pendingDownloads.values()).find(
        d => d.state === 'inProgress',
      );

      const handleCompletion = (filepath: string) => {
        clearTimeout(timeoutId);
        this.off('completed', handleCompletion);
        this.off('canceled', handleCancellation);
        resolve(filepath);
      };

      const handleCancellation = (filename: string) => {
        clearTimeout(timeoutId);
        this.off('completed', handleCompletion);
        this.off('canceled', handleCancellation);
        reject(new Error(`Download canceled: ${filename}`));
      };

      this.on('completed', handleCompletion);
      this.on('canceled', handleCancellation);

      // If a download is already completed, resolve immediately
      const completedDownload = Array.from(this.pendingDownloads.values()).find(
        d => d.state === 'completed' && d.resolvedPath,
      );
      if (completedDownload?.resolvedPath) {
        clearTimeout(timeoutId);
        this.off('completed', handleCompletion);
        this.off('canceled', handleCancellation);
        resolve(completedDownload.resolvedPath);
      }
    });
  }

  /**
   * Wait for a specific download by GUID
   */
  async waitForSpecificDownload(
    guid: string,
    timeoutMs: number = 60000,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.downloadPromiseResolvers.delete(guid);
        reject(new Error(`Download timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Check if already completed
      const info = this.pendingDownloads.get(guid);
      if (info?.state === 'completed' && info.resolvedPath) {
        clearTimeout(timeoutId);
        resolve(info.resolvedPath);
        return;
      }

      this.downloadPromiseResolvers.set(guid, {
        resolve: (path: string) => {
          clearTimeout(timeoutId);
          resolve(path);
        },
        reject: (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });
    });
  }

  /**
   * Get current pending downloads
   */
  getPendingDownloads(): DownloadInfo[] {
    return Array.from(this.pendingDownloads.values()).filter(
      d => d.state === 'inProgress',
    );
  }

  /**
   * Clear download history
   */
  clearHistory(): void {
    this.pendingDownloads.clear();
  }

  /**
   * Release resources
   */
  async dispose(): Promise<void> {
    if (this.cdpSession) {
      try {
        // Reset download behavior to default
        await this.cdpSession.send('Browser.setDownloadBehavior', {
          behavior: 'default',
        });
        await this.cdpSession.detach();
      } catch {
        // Ignore errors during cleanup
      }
      this.cdpSession = null;
    }
    this.isMonitoring = false;
    this.pendingDownloads.clear();
    this.downloadPromiseResolvers.clear();
    this.removeAllListeners();
  }
}
