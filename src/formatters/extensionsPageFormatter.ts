/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {TextSnapshotNode} from '../McpContext.js';

interface ExtensionGroup {
  name: string;
  version: string;
  enabled: boolean;
  isDevelopment: boolean;
  location?: string;
  nodes: TextSnapshotNode[];
  errors: string[];
}

/**
 * Format chrome://extensions page with structured output
 */
export function formatExtensionsPage(
  root: TextSnapshotNode,
  developmentExtensionPaths: string[],
): string {
  const groups = groupExtensions(root, developmentExtensionPaths);

  let result = '# Chrome Extensions Page\n\n';

  // Developer mode section
  const devModeSwitch = findDeveloperModeSwitch(root);
  if (devModeSwitch) {
    const isChecked = devModeSwitch.checked === true;
    result += `## Developer Mode: ${isChecked ? 'ON ✓' : 'OFF ✗'}\n`;
    result += `  uid=${devModeSwitch.id} switch "${devModeSwitch.name || devModeSwitch.description || 'Developer mode'}" ${isChecked ? '[checked]' : '[unchecked]'}\n\n`;
  }

  // Development extensions first
  const devGroups = groups.filter(g => g.isDevelopment);
  const systemGroups = groups.filter(g => !g.isDevelopment);

  if (devGroups.length > 0) {
    result += `## 🔧 Development Extensions (Your Project)\n\n`;
    for (const group of devGroups) {
      result += formatExtensionGroup(group);
    }
  }

  if (systemGroups.length > 0) {
    result += `## 📦 System Extensions\n\n`;
    for (const group of systemGroups) {
      result += formatExtensionGroup(group);
    }
  }

  return result;
}

function formatExtensionGroup(group: ExtensionGroup): string {
  let result = '';

  // Header with status indicators
  const statusIcon = group.enabled ? '✓' : '✗';
  const errorIcon = group.errors.length > 0 ? ' ⚠️ HAS ERRORS' : '';
  const devIcon = group.isDevelopment ? ' ⭐' : '';

  result += `### Extension: "${group.name}" v${group.version} [${group.enabled ? 'ENABLED' : 'DISABLED'}]${statusIcon}${devIcon}${errorIcon}\n`;

  if (group.location) {
    result += `  Location: ${group.location}\n`;
  }

  // Find and label key buttons
  const buttons = {
    details: findButton(group.nodes, ['Details', 'View', 'Show details']),
    remove: findButton(group.nodes, ['Remove', 'Delete', 'Uninstall']),
    reload: findButton(group.nodes, ['Reload', 'Refresh']),
    errors: findButton(group.nodes, ['Errors', 'Error', 'View errors']),
    enabled: findSwitch(group.nodes, ['Enabled', 'Enable']),
  };

  // Display buttons with clear labels
  if (buttons.details) {
    result += `  uid=${buttons.details.id} button "Details"\n`;
  }
  if (buttons.remove) {
    result += `  uid=${buttons.remove.id} button "Remove"\n`;
  }
  if (buttons.reload) {
    result += `  uid=${buttons.reload.id} button "Reload" ${group.isDevelopment ? '← USE THIS TO RELOAD YOUR EXTENSION' : ''}\n`;
  }
  if (buttons.errors) {
    result += `  uid=${buttons.errors.id} button "Errors" [clickable]\n`;
  }
  if (buttons.enabled) {
    const isChecked = buttons.enabled.checked === true;
    result += `  uid=${buttons.enabled.id} switch "Enabled" ${isChecked ? '[checked]' : '[unchecked]'}\n`;
  }

  // Display errors if any
  if (group.errors.length > 0) {
    result += `\n  ⚠️ Errors:\n`;
    for (const error of group.errors) {
      result += `    - ${error}\n`;
    }
  }

  result += '\n';
  return result;
}

function groupExtensions(
  root: TextSnapshotNode,
  developmentPaths: string[],
): ExtensionGroup[] {
  const groups: ExtensionGroup[] = [];

  // Find extension cards (typically have role="article" or contain extension name as heading)
  const findExtensionCards = (node: TextSnapshotNode): void => {
    // Look for extension name patterns
    if (
      node.role === 'heading' &&
      node.level === 3 &&
      node.name &&
      !node.name.includes('Chrome Web Store')
    ) {
      // This is likely an extension name
      const extensionName = node.name;

      // Find sibling nodes that belong to this extension
      const siblings: TextSnapshotNode[] = [];
      let version = '';
      const enabled = true;
      let location = '';
      const errors: string[] = [];

      // Collect related nodes (buttons, switches, text)
      const collectNodes = (n: TextSnapshotNode, depth = 0): void => {
        if (depth > 5) return; // Limit depth

        siblings.push(n);

        // Extract version
        if (n.role === 'text' && n.name && /^v?\d+\.\d+/.test(n.name)) {
          version = n.name;
        }

        // Extract location for development extensions
        if (
          n.role === 'text' &&
          n.name &&
          (n.name.includes('/') || n.name.includes('\\'))
        ) {
          location = n.name;
        }

        // Extract errors
        if (
          (n.role === 'text' || n.role === 'paragraph') &&
          n.name &&
          (n.name.toLowerCase().includes('error') ||
            n.name.toLowerCase().includes('failed') ||
            n.name.toLowerCase().includes('warning'))
        ) {
          errors.push(n.name);
        }

        for (const child of n.children) {
          collectNodes(child, depth + 1);
        }
      };

      // Collect from parent's children
      collectNodes(node);

      // Determine if it's a development extension
      const isDevelopment = developmentPaths.some(
        path =>
          location.includes(path) ||
          extensionName.toLowerCase().includes('development'),
      );

      groups.push({
        name: extensionName,
        version: version || '0.0.0',
        enabled,
        isDevelopment,
        location: location || undefined,
        nodes: siblings,
        errors,
      });
    }

    for (const child of node.children) {
      findExtensionCards(child);
    }
  };

  findExtensionCards(root);
  return groups;
}

function findButton(
  nodes: TextSnapshotNode[],
  keywords: string[],
): TextSnapshotNode | null {
  for (const node of nodes) {
    if (node.role === 'button') {
      const text =
        node.name || node.description || node.roledescription || '';
      for (const keyword of keywords) {
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          return node;
        }
      }
    }
  }
  return null;
}

function findSwitch(
  nodes: TextSnapshotNode[],
  keywords: string[],
): TextSnapshotNode | null {
  for (const node of nodes) {
    if (node.role === 'switch') {
      const text =
        node.name || node.description || node.roledescription || '';
      for (const keyword of keywords) {
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          return node;
        }
      }
    }
  }
  return null;
}

function findDeveloperModeSwitch(root: TextSnapshotNode): TextSnapshotNode | null {
  const search = (node: TextSnapshotNode): TextSnapshotNode | null => {
    if (node.role === 'switch') {
      const text =
        node.name || node.description || node.roledescription || '';
      if (text.toLowerCase().includes('developer')) {
        return node;
      }
    }

    for (const child of node.children) {
      const found = search(child);
      if (found) return found;
    }

    return null;
  };

  return search(root);
}