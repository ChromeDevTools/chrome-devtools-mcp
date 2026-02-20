import * as vscode from 'vscode';

// Symbol kinds supported by the AST graph
const SYMBOL_KINDS = [
  'file', 'class', 'interface', 'enum', 'namespace', 'module',
  'function', 'method', 'constructor',
  'property', 'variable', 'constant', 'type-alias', 'enum-member',
  'unknown',
] as const;

const EDGE_KINDS = [
  'contains', 'imports', 'calls', 'extends', 'implements', 'references',
] as const;

const LAYOUTS = [
  { id: 'forceatlas2', label: 'Force-Directed' },
  { id: 'circular', label: 'Circular' },
  { id: 'byfile', label: 'Grouped by File' },
  { id: 'random', label: 'Random' },
] as const;

type LayoutId = typeof LAYOUTS[number]['id'];

// Icons for each tree group
const GROUP_ICONS: Record<string, vscode.ThemeIcon> = {
  layout: new vscode.ThemeIcon('layout'),
  symbolKinds: new vscode.ThemeIcon('symbol-misc'),
  edgeKinds: new vscode.ThemeIcon('git-commit'),
  files: new vscode.ThemeIcon('files'),
  actions: new vscode.ThemeIcon('play'),
};

// Map symbol kinds to appropriate codicons
const KIND_ICONS: Record<string, string> = {
  file: 'file-code',
  class: 'symbol-class',
  interface: 'symbol-interface',
  enum: 'symbol-enum',
  namespace: 'symbol-namespace',
  module: 'symbol-namespace',
  function: 'symbol-method',
  method: 'symbol-method',
  constructor: 'symbol-constructor',
  property: 'symbol-property',
  variable: 'symbol-variable',
  constant: 'symbol-constant',
  'type-alias': 'symbol-type-parameter',
  'enum-member': 'symbol-enum-member',
  unknown: 'question',
};

// Unique item types for contextValue (used in when clauses)
const enum ItemType {
  Group = 'group',
  Layout = 'layout',
  SymbolKind = 'symbolKind',
  EdgeKind = 'edgeKind',
  File = 'file',
  Action = 'action',
}

interface GraphStats {
  symbolKindCounts: Map<string, number>;
  edgeKindCounts: Map<string, number>;
  files: string[];
}

// Callback to notify the webview of filter/layout/action changes
export interface GraphVisualizerDelegate {
  onFilterChanged(filter: {
    visibleSymbolKinds: Set<string>;
    visibleEdgeKinds: Set<string>;
    visibleFiles: Set<string>;
  }): void;
  onLayoutChanged(layoutId: string): void;
  onAction(action: 'refresh' | 'fit' | 'zoomIn' | 'zoomOut'): void;
  onSearch(query: string): void;
}

export class GraphVisualizerProvider implements vscode.TreeDataProvider<GraphVisualizerItem> {

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<GraphVisualizerItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private delegate: GraphVisualizerDelegate | undefined;

  // Filter state — all enabled by default
  private visibleSymbolKinds = new Set<string>(SYMBOL_KINDS);
  private visibleEdgeKinds = new Set<string>(EDGE_KINDS);
  private visibleFiles = new Set<string>();
  private allFiles: string[] = [];

  // Layout state
  private activeLayout: LayoutId = 'forceatlas2';

  // Stats from last graph data
  private stats: GraphStats = {
    symbolKindCounts: new Map(),
    edgeKindCounts: new Map(),
    files: [],
  };

  setDelegate(delegate: GraphVisualizerDelegate): void {
    this.delegate = delegate;
  }

  /** Update with fresh graph data so we can show accurate counts and file list. */
  updateGraphStats(stats: GraphStats): void {
    this.stats = stats;
    this.allFiles = stats.files;
    // Ensure all files are visible by default on first load
    if (this.visibleFiles.size === 0) {
      this.visibleFiles = new Set(stats.files);
    } else {
      // Add any new files, keep existing hidden state
      for (const f of stats.files) {
        if (!this.visibleFiles.has(f) && !this.allFiles.includes(f)) {
          this.visibleFiles.add(f);
        }
      }
    }
    this._onDidChangeTreeData.fire();
  }

  getActiveLayout(): string {
    return this.activeLayout;
  }

  getFilter() {
    return {
      visibleSymbolKinds: this.visibleSymbolKinds,
      visibleEdgeKinds: this.visibleEdgeKinds,
      visibleFiles: this.visibleFiles,
    };
  }

  // -- TreeDataProvider implementation --

  getTreeItem(element: GraphVisualizerItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GraphVisualizerItem): GraphVisualizerItem[] {
    if (!element) {
      return this.getRootItems();
    }
    return this.getGroupChildren(element);
  }

  private getRootItems(): GraphVisualizerItem[] {
    return [
      new GraphVisualizerItem('Actions', ItemType.Group, {
        icon: GROUP_ICONS.actions,
        collapsible: vscode.TreeItemCollapsibleState.Expanded,
        groupId: 'actions',
      }),
      new GraphVisualizerItem('Layout', ItemType.Group, {
        icon: GROUP_ICONS.layout,
        collapsible: vscode.TreeItemCollapsibleState.Expanded,
        groupId: 'layout',
      }),
      new GraphVisualizerItem('Symbol Kinds', ItemType.Group, {
        icon: GROUP_ICONS.symbolKinds,
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
        groupId: 'symbolKinds',
      }),
      new GraphVisualizerItem('Edge Kinds', ItemType.Group, {
        icon: GROUP_ICONS.edgeKinds,
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
        groupId: 'edgeKinds',
      }),
      new GraphVisualizerItem('Files', ItemType.Group, {
        icon: GROUP_ICONS.files,
        collapsible: vscode.TreeItemCollapsibleState.Collapsed,
        groupId: 'files',
      }),
    ];
  }

  private getGroupChildren(parent: GraphVisualizerItem): GraphVisualizerItem[] {
    switch (parent.groupId) {

      case 'actions':
        return [
          new GraphVisualizerItem('Refresh Graph', ItemType.Action, {
            icon: new vscode.ThemeIcon('refresh'),
            command: { command: 'vscode-devtools.graphVisualizer.refresh', title: 'Refresh' },
            actionId: 'refresh',
          }),
          new GraphVisualizerItem('Fit to Screen', ItemType.Action, {
            icon: new vscode.ThemeIcon('screen-full'),
            command: { command: 'vscode-devtools.graphVisualizer.fit', title: 'Fit' },
            actionId: 'fit',
          }),
          new GraphVisualizerItem('Zoom In', ItemType.Action, {
            icon: new vscode.ThemeIcon('zoom-in'),
            command: { command: 'vscode-devtools.graphVisualizer.zoomIn', title: 'Zoom In' },
            actionId: 'zoomIn',
          }),
          new GraphVisualizerItem('Zoom Out', ItemType.Action, {
            icon: new vscode.ThemeIcon('zoom-out'),
            command: { command: 'vscode-devtools.graphVisualizer.zoomOut', title: 'Zoom Out' },
            actionId: 'zoomOut',
          }),
          new GraphVisualizerItem('Search Symbols...', ItemType.Action, {
            icon: new vscode.ThemeIcon('search'),
            command: { command: 'vscode-devtools.graphVisualizer.search', title: 'Search' },
            actionId: 'search',
          }),
        ];

      case 'layout':
        return LAYOUTS.map(l => {
          const isActive = l.id === this.activeLayout;
          return new GraphVisualizerItem(l.label, ItemType.Layout, {
            icon: new vscode.ThemeIcon(isActive ? 'circle-filled' : 'circle-outline'),
            description: isActive ? 'active' : undefined,
            command: {
              command: 'vscode-devtools.graphVisualizer.setLayout',
              title: 'Set Layout',
              arguments: [l.id],
            },
            layoutId: l.id,
          });
        });

      case 'symbolKinds':
        return SYMBOL_KINDS.map(kind => {
          const count = this.stats.symbolKindCounts.get(kind) ?? 0;
          if (count === 0) return undefined;
          return new GraphVisualizerItem(kind, ItemType.SymbolKind, {
            icon: new vscode.ThemeIcon(KIND_ICONS[kind] || 'symbol-misc'),
            description: `${count}`,
            checkbox: this.visibleSymbolKinds.has(kind)
              ? vscode.TreeItemCheckboxState.Checked
              : vscode.TreeItemCheckboxState.Unchecked,
            kindId: kind,
          });
        }).filter((item): item is GraphVisualizerItem => item !== undefined);

      case 'edgeKinds':
        return EDGE_KINDS.map(kind => {
          const count = this.stats.edgeKindCounts.get(kind) ?? 0;
          if (count === 0) return undefined;
          return new GraphVisualizerItem(kind, ItemType.EdgeKind, {
            icon: new vscode.ThemeIcon('arrow-right'),
            description: `${count}`,
            checkbox: this.visibleEdgeKinds.has(kind)
              ? vscode.TreeItemCheckboxState.Checked
              : vscode.TreeItemCheckboxState.Unchecked,
            edgeKindId: kind,
          });
        }).filter((item): item is GraphVisualizerItem => item !== undefined);

      case 'files':
        return this.allFiles.map(file => {
          return new GraphVisualizerItem(file, ItemType.File, {
            icon: new vscode.ThemeIcon('file-code'),
            checkbox: this.visibleFiles.has(file)
              ? vscode.TreeItemCheckboxState.Checked
              : vscode.TreeItemCheckboxState.Unchecked,
            fileId: file,
          });
        });

      default:
        return [];
    }
  }

  // -- Public methods called by commands --

  setLayout(layoutId: string): void {
    this.activeLayout = layoutId as LayoutId;
    this._onDidChangeTreeData.fire();
    this.delegate?.onLayoutChanged(layoutId);
  }

  handleCheckboxChange(items: ReadonlyArray<[GraphVisualizerItem, vscode.TreeItemCheckboxState]>): void {
    for (const [item, state] of items) {
      const checked = state === vscode.TreeItemCheckboxState.Checked;
      if (item.kindId) {
        if (checked) this.visibleSymbolKinds.add(item.kindId);
        else this.visibleSymbolKinds.delete(item.kindId);
      } else if (item.edgeKindId) {
        if (checked) this.visibleEdgeKinds.add(item.edgeKindId);
        else this.visibleEdgeKinds.delete(item.edgeKindId);
      } else if (item.fileId) {
        if (checked) this.visibleFiles.add(item.fileId);
        else this.visibleFiles.delete(item.fileId);
      }
    }
    this.delegate?.onFilterChanged({
      visibleSymbolKinds: this.visibleSymbolKinds,
      visibleEdgeKinds: this.visibleEdgeKinds,
      visibleFiles: this.visibleFiles,
    });
  }

  doAction(action: 'refresh' | 'fit' | 'zoomIn' | 'zoomOut'): void {
    this.delegate?.onAction(action);
  }

  doSearch(): void {
    void vscode.window.showInputBox({ prompt: 'Search symbols', placeHolder: 'Type a symbol name...' })
      .then(query => {
        if (query !== undefined) {
          this.delegate?.onSearch(query);
        }
      });
  }
}

interface GraphVisualizerItemOptions {
  icon?: vscode.ThemeIcon;
  description?: string;
  collapsible?: vscode.TreeItemCollapsibleState;
  command?: vscode.Command;
  checkbox?: vscode.TreeItemCheckboxState;
  groupId?: string;
  layoutId?: string;
  kindId?: string;
  edgeKindId?: string;
  fileId?: string;
  actionId?: string;
}

export class GraphVisualizerItem extends vscode.TreeItem {
  readonly groupId?: string;
  readonly layoutId?: string;
  readonly kindId?: string;
  readonly edgeKindId?: string;
  readonly fileId?: string;
  readonly actionId?: string;

  constructor(label: string, itemType: ItemType, options: GraphVisualizerItemOptions = {}) {
    super(label, options.collapsible ?? vscode.TreeItemCollapsibleState.None);

    this.contextValue = itemType;
    this.iconPath = options.icon;
    this.description = options.description;
    this.command = options.command;

    if (options.checkbox !== undefined) {
      this.checkboxState = options.checkbox;
    }

    this.groupId = options.groupId;
    this.layoutId = options.layoutId;
    this.kindId = options.kindId;
    this.edgeKindId = options.edgeKindId;
    this.fileId = options.fileId;
    this.actionId = options.actionId;
  }
}
