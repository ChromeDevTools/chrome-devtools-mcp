/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Notification and Modal Interception Layer
 *
 * Detects pending VS Code notifications and modals before tool execution:
 * - BLOCKING modals (e.g., "Save file?" dialogs) → STOP tool execution, return modal info
 * - NON-BLOCKING notifications (toasts) → Prepend banner to output, let tool proceed
 *
 * This mirrors human behavior: a blocking modal stops you until addressed,
 * while toast notifications are informational and don't prevent work.
 */

import {logger} from './logger.js';
import {cdpService} from './services/index.js';

// ── Types ──

export interface UIButton {
  label: string;
  index: number;
}

export interface PendingUIElement {
  type: 'modal' | 'notification' | 'dialog';
  severity: 'info' | 'warning' | 'error' | 'blocking';
  message: string;
  source?: string;
  buttons: UIButton[];
  isBlocking: boolean;
  /** For notifications: unique ID to track dismissal */
  elementId?: string;
}

export interface NotificationCheckResult {
  /** Blocking modals that prevent tool execution */
  blocking: PendingUIElement[];
  /** Non-blocking notifications to show in output */
  nonBlocking: PendingUIElement[];
  /** True if there are any blocking elements */
  hasBlocking: boolean;
  /** True if there are any notifications at all */
  hasAny: boolean;
}

// ── Detection Logic ──

/**
 * Query the VS Code DOM for pending modals and notifications via CDP.
 * Also detects native OS dialogs by checking window focus state.
 */
export async function checkPendingNotifications(): Promise<NotificationCheckResult> {
  const result: NotificationCheckResult = {
    blocking: [],
    nonBlocking: [],
    hasBlocking: false,
    hasAny: false,
  };

  try {
    // Run detection script in the VS Code renderer
    const evalResult = await cdpService.sendCdp('Runtime.evaluate', {
      expression: `(function() {
        const result = {
          modals: [],
          notifications: [],
          quickInput: null,
          nativeDialog: null,
        };

        // 0. Native OS dialog detection
        // REMOVED: The !document.hasFocus() check caused too many false positives
        // (e.g., user simply clicked outside VS Code). Native dialogs are now only
        // detected by the presence of Monaco blocking dialogs that require user action.
        // If a native Save dialog is open, VS Code typically shows a Monaco overlay.

        // 1. Check for Monaco dialogs (blocking modals)
        // These are used for "Save file?", confirmations, etc.
        const dialogs = document.querySelectorAll('.monaco-dialog-box');
        for (const dialog of dialogs) {
          if (dialog.offsetParent === null) continue; // Skip hidden dialogs
          
          const messageEl = dialog.querySelector('.dialog-message-text, .dialog-message');
          const message = messageEl?.textContent?.trim() || '';
          
          const buttons = [];
          const buttonEls = dialog.querySelectorAll('.dialog-buttons .monaco-button, .dialog-buttons button');
          for (let i = 0; i < buttonEls.length; i++) {
            buttons.push({
              label: buttonEls[i].textContent?.trim() || '',
              index: i,
            });
          }
          
          // Determine severity from dialog icon (codicon class)
          const iconEl = dialog.querySelector('.dialog-icon .codicon, .dialog-icon');
          let severity = 'blocking';
          if (iconEl) {
            const classes = iconEl.className || '';
            if (classes.includes('codicon-warning')) severity = 'warning';
            else if (classes.includes('codicon-error')) severity = 'error';
            else if (classes.includes('codicon-info')) severity = 'info';
          }
          
          result.modals.push({
            type: 'modal',
            severity,
            message,
            buttons,
            isBlocking: true,
          });
        }

        // 2. Check for Quick Input dialogs (command palette, quick picks)
        // CRITICAL: VS Code uses display:none CSS, NOT .hidden class
        const quickInputs = document.querySelectorAll('.quick-input-widget');
        for (const quickInput of quickInputs) {
          const style = window.getComputedStyle(quickInput);
          const isVisible = style.display !== 'none' && quickInput.offsetHeight > 0;
          if (!isVisible) continue;
          
          const titleEl = quickInput.querySelector('.quick-input-title-label, .quick-input-title');
          const inputEl = quickInput.querySelector('.quick-input-box input, input');
          const title = titleEl?.textContent?.trim() || '';
          const placeholder = inputEl?.getAttribute('placeholder') || '';
          
          result.quickInput = {
            type: 'dialog',
            severity: 'info',
            message: title || placeholder || 'Quick input is open',
            buttons: [{ label: 'Escape to close', index: 0 }],
            isBlocking: false,  // Non-blocking: command palette shouldn't prevent MCP tools
          };
        }

        // 3. Check for notification toasts (non-blocking)
        const toastContainer = document.querySelector('.notifications-toasts');
        if (toastContainer) {
          const toasts = toastContainer.querySelectorAll('.notification-toast');
          for (const toast of toasts) {
            // Check actual visibility, not just offsetParent
            const style = window.getComputedStyle(toast);
            if (style.display === 'none' || toast.offsetHeight === 0) continue;
            
            // FIXED: Correct selector for notification message
            const messageEl = toast.querySelector('.notification-list-item-message, .notification-message');
            const message = messageEl?.textContent?.trim() || '';
            
            const sourceEl = toast.querySelector('.notification-list-item-source-label, .notification-source');
            const source = sourceEl?.textContent?.trim() || '';
            
            const buttons = [];
            // FIXED: Correct selector for action buttons
            const actionEls = toast.querySelectorAll('.notification-list-item-buttons-container button, .notification-actions-primary .monaco-button');
            for (let i = 0; i < actionEls.length; i++) {
              const label = actionEls[i].textContent?.trim() || actionEls[i].getAttribute('title') || '';
              if (label) buttons.push({ label, index: i });
            }
            
            // FIXED: Severity detection - look for codicon classes anywhere in toast
            const iconEl = toast.querySelector('.codicon');
            let severity = 'info';
            if (iconEl) {
              if (iconEl.classList.contains('codicon-warning')) severity = 'warning';
              else if (iconEl.classList.contains('codicon-error')) severity = 'error';
            }
            
            // Generate element ID for tracking
            const elementId = 'toast-' + message.substring(0, 50).replace(/\\W+/g, '-');
            
            result.notifications.push({
              type: 'notification',
              severity,
              message,
              source,
              buttons,
              isBlocking: false,
              elementId,
            });
          }
        }

        // 4. Check for notification center badge (collapsed notifications)
        const notificationBadge = document.querySelector('.notifications-center .notification-actions-container .monaco-count-badge');
        if (notificationBadge) {
          const count = parseInt(notificationBadge.textContent || '0', 10);
          if (count > 0) {
            result.notifications.push({
              type: 'notification',
              severity: 'info',
              message: count + ' notification(s) in notification center',
              buttons: [],
              isBlocking: false,
              elementId: 'notification-center-count',
            });
          }
        }

        // 5. Check for editor dirty indicator with unsaved changes modal
        // (This is shown when you try to close a dirty file)
        const dirtyModal = document.querySelector('.monaco-dialog-box .dialog-message-text');
        if (dirtyModal && dirtyModal.textContent?.includes("want to save")) {
          // Already captured by modals above, but ensure it's marked as blocking
        }

        return JSON.stringify(result);
      })()`,
      returnByValue: true,
    });

    if (evalResult?.result?.value) {
      const detected = JSON.parse(evalResult.result.value);

      // Process native OS dialog (highest priority - fully blocks UI)
      if (detected.nativeDialog) {
        result.blocking.push(detected.nativeDialog as PendingUIElement);
      }

      // Process blocking modals
      for (const modal of detected.modals) {
        result.blocking.push(modal as PendingUIElement);
      }

      // Process quick input (non-blocking - just informational)
      if (detected.quickInput) {
        result.nonBlocking.push(detected.quickInput as PendingUIElement);
      }

      // Process non-blocking notifications
      for (const notification of detected.notifications) {
        result.nonBlocking.push(notification as PendingUIElement);
      }
    }

    result.hasBlocking = result.blocking.length > 0;
    result.hasAny = result.blocking.length > 0 || result.nonBlocking.length > 0;

  } catch (error) {
    logger(`Notification check failed: ${error}`);
    // Don't throw — treat as no notifications
  }

  return result;
}

// ── Formatting ──

/**
 * Format a blocking modal as an error message for tool output.
 */
export function formatBlockingModal(modal: PendingUIElement): string {
  const lines: string[] = [];
  lines.push(`## ⛔ BLOCKED: ${modal.type === 'modal' ? 'Modal Dialog' : 'Dialog'} Requires Attention`);
  lines.push('');
  lines.push(`**Message:** ${modal.message}`);
  if (modal.source) {
    lines.push(`**Source:** ${modal.source}`);
  }
  lines.push('');
  if (modal.buttons.length > 0) {
    lines.push('**Available actions:**');
    for (const btn of modal.buttons) {
      lines.push(`  - "${btn.label}"`);
    }
    lines.push('');
    lines.push('Use `click` on one of the dialog buttons, or `hotkey` with "Escape" to dismiss.');
  } else {
    lines.push('Press Escape or click outside to dismiss this dialog.');
  }
  return lines.join('\n');
}

/**
 * Format non-blocking notifications as a banner for tool output.
 */
export function formatNotificationBanner(notifications: PendingUIElement[]): string {
  if (notifications.length === 0) {return '';}

  const lines: string[] = [];
  lines.push('## ℹ️ Pending Notifications');
  lines.push('');

  for (const notif of notifications) {
    const icon = notif.severity === 'error' ? '🔴' :
                 notif.severity === 'warning' ? '🟡' : '🔵';
    let line = `${icon} ${notif.message}`;
    if (notif.source) {
      line += ` (${notif.source})`;
    }
    if (notif.buttons.length > 0) {
      line += ` [Actions: ${notif.buttons.map(b => b.label).join(', ')}]`;
    }
    lines.push(line);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// ── Tool Integration ──

/**
 * Check for blocking modals before tool execution.
 * Returns null if no blocking elements, or formatted error message if blocked.
 */
export async function checkForBlockingUI(): Promise<{
  blocked: boolean;
  blockingMessage?: string;
  notificationBanner?: string;
}> {
  const check = await checkPendingNotifications();

  if (check.hasBlocking) {
    // Tool execution is blocked
    const modal = check.blocking[0]; // Show the first blocking element
    return {
      blocked: true,
      blockingMessage: formatBlockingModal(modal),
      notificationBanner: formatNotificationBanner(check.nonBlocking),
    };
  }

  // Not blocked, but may have notifications to show
  return {
    blocked: false,
    notificationBanner: check.nonBlocking.length > 0
      ? formatNotificationBanner(check.nonBlocking)
      : undefined,
  };
}

/**
 * Click a button in a modal dialog by its label.
 */
export async function clickModalButton(buttonLabel: string): Promise<boolean> {
  try {
    const result = await cdpService.sendCdp('Runtime.evaluate', {
      expression: `(function() {
        const buttons = document.querySelectorAll('.monaco-dialog-box .dialog-buttons .monaco-button');
        for (const btn of buttons) {
          if (btn.textContent?.trim() === '${buttonLabel.replace(/'/g, "\\'")}') {
            btn.click();
            return true;
          }
        }
        return false;
      })()`,
      returnByValue: true,
    });
    return result?.result?.value === true;
  } catch {
    return false;
  }
}

/**
 * Click a button in a notification toast by its label.
 */
export async function clickNotificationButton(buttonLabel: string): Promise<boolean> {
  try {
    const result = await cdpService.sendCdp('Runtime.evaluate', {
      expression: `(function() {
        const buttons = document.querySelectorAll('.notification-toast .notification-actions-primary .monaco-button');
        for (const btn of buttons) {
          if (btn.textContent?.trim() === '${buttonLabel.replace(/'/g, "\\'")}') {
            btn.click();
            return true;
          }
        }
        return false;
      })()`,
      returnByValue: true,
    });
    return result?.result?.value === true;
  } catch {
    return false;
  }
}

/**
 * Dismiss the topmost notification toast.
 */
export async function dismissTopNotification(): Promise<boolean> {
  try {
    const result = await cdpService.sendCdp('Runtime.evaluate', {
      expression: `(function() {
        const closeBtn = document.querySelector('.notification-toast .codicon-notifications-clear');
        if (closeBtn) {
          closeBtn.click();
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
    return result?.result?.value === true;
  } catch {
    return false;
  }
}
