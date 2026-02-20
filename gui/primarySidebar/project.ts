import * as vscode from 'vscode';
import { join, relative } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { parse, modify, applyEdits } from 'jsonc-parser';
import { parseIgnoreRules, applyIgnoreRules } from '../../services/codebase/ignore-rules';

// ============================================================================
// Config Persistence
// ============================================================================

const DEVTOOLS_DIR = '.devtools';
const CONFIG_FILENAME = 'host.config.jsonc';
const CONFIG_KEY = 'lmToolsWorkspace';

const ALWAYS_EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.devtools', '.vscode',
]);

function getHostWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return folders[0].uri.fsPath;
}

function getConfigPath(): string | undefined {
  const root = getHostWorkspaceRoot();
  if (!root) return undefined;
  return join(root, DEVTOOLS_DIR, CONFIG_FILENAME);
}

function readSelectedWorkspace(): string | undefined {
  const configPath = getConfigPath();
  if (!configPath || !existsSync(configPath)) return undefined;

  try {
    const content = readFileSync(configPath, 'utf8');
    const parsed = parse(content);
    return typeof parsed?.[CONFIG_KEY] === 'string' ? parsed[CONFIG_KEY] : undefined;
  } catch {
    return undefined;
  }
}

function writeSelectedWorkspace(relativePath: string): void {
  const root = getHostWorkspaceRoot();
  if (!root) return;

  const devtoolsDir = join(root, DEVTOOLS_DIR);
  const configPath = join(devtoolsDir, CONFIG_FILENAME);

  if (!existsSync(devtoolsDir)) {
    mkdirSync(devtoolsDir, { recursive: true });
  }

  let content: string;
  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf8');
  } else {
    content = '{\n}\n';
  }

  const edits = modify(content, [CONFIG_KEY], relativePath, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });
  const updated = applyEdits(content, edits);
  writeFileSync(configPath, updated, 'utf8');
}

// ============================================================================
// Workspace Item
// ============================================================================

interface WorkspaceItem {
  uri: vscode.Uri;
  name: string;
  relativePath: string;
}

// ============================================================================
// Folder Discovery Helpers
// ============================================================================

type IgnoreRules = ReturnType<typeof parseIgnoreRules>;

function getVisibleSubfolders(dir: string, root: string, ignoreRules: IgnoreRules): WorkspaceItem[] {
  const items: WorkspaceItem[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ALWAYS_EXCLUDE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = join(dir, entry.name);
      const relPath = relative(root, fullPath).replace(/\\/g, '/');
      if (ignoreRules.length > 0 && applyIgnoreRules(`${relPath}/`, ignoreRules)) continue;

      items.push({
        uri: vscode.Uri.file(fullPath),
        name: entry.name,
        relativePath: relPath,
      });
    }
  } catch {
    // Directory unreadable
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

function hasVisibleSubfolders(dir: string, root: string, ignoreRules: IgnoreRules): boolean {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ALWAYS_EXCLUDE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = join(dir, entry.name);
      const relPath = relative(root, fullPath).replace(/\\/g, '/');
      if (ignoreRules.length > 0 && applyIgnoreRules(`${relPath}/`, ignoreRules)) continue;

      return true;
    }
  } catch {
    // Directory unreadable
  }
  return false;
}

// ============================================================================
// Project Tree Provider — Workspace Root Picker
// ============================================================================

export class ProjectTreeProvider implements vscode.TreeDataProvider<WorkspaceItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<WorkspaceItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _onDidSelectWorkspace = new vscode.EventEmitter<string>();
  readonly onDidSelectWorkspace = this._onDidSelectWorkspace.event;

  private readonly disposables: vscode.Disposable[] = [];
  private selectedPath: string | undefined;
  private ignoreRules: IgnoreRules = [];
  private root: string | undefined;

  constructor() {
    this.selectedPath = readSelectedWorkspace();
    this.root = getHostWorkspaceRoot();
    if (this.root) {
      this.ignoreRules = parseIgnoreRules(this.root);
    }

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('.'),
        '*'
      ),
      false, true, false,
    );
    this.disposables.push(watcher);
    watcher.onDidCreate(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());

    console.log('[vscode-devtools] ProjectTreeProvider initialized — workspace root picker');
  }

  refresh(): void {
    if (this.root) {
      this.ignoreRules = parseIgnoreRules(this.root);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  selectWorkspace(item: WorkspaceItem): void {
    this.selectedPath = item.relativePath;
    writeSelectedWorkspace(item.relativePath);
    this._onDidSelectWorkspace.fire(item.relativePath);
    this.refresh();
    vscode.window.showInformationMessage(`Workspace root set to: ${item.name}`);
  }

  getSelectedWorkspace(): string | undefined {
    return this.selectedPath;
  }

  getTreeItem(element: WorkspaceItem): vscode.TreeItem {
    const isSelected = element.relativePath === this.selectedPath;
    const expandable = this.root
      ? hasVisibleSubfolders(element.uri.fsPath, this.root, this.ignoreRules)
      : false;

    const collapsibleState = expandable
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(element.name, collapsibleState);
    item.iconPath = new vscode.ThemeIcon(isSelected ? 'folder-active' : 'folder');
    item.tooltip = element.uri.fsPath;
    item.contextValue = isSelected ? 'workspaceActive' : 'workspaceInactive';

    item.command = {
      command: 'vscode-devtools.selectWorkspace',
      title: 'Select as Workspace Root',
      arguments: [element],
    };

    return item;
  }

  getChildren(element?: WorkspaceItem): WorkspaceItem[] {
    if (!this.root) return [];

    if (!element) {
      const rootName = this.root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? this.root;
      return [{
        uri: vscode.Uri.file(this.root),
        name: rootName,
        relativePath: '.',
      }];
    }

    return getVisibleSubfolders(element.uri.fsPath, this.root, this.ignoreRules);
  }
}

// ============================================================================
// Singleton accessor
// ============================================================================

let projectTreeProvider: ProjectTreeProvider | undefined;

export function setProjectTreeProvider(provider: ProjectTreeProvider): void {
  projectTreeProvider = provider;
}

export function getProjectTreeProvider(): ProjectTreeProvider | undefined {
  return projectTreeProvider;
}
