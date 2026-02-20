/**
 * AST Graph Webview — Editor panel that visualizes the project's symbol graph
 * using Sigma.js (WebGL) with graphology as the data model.
 *
 * The webview communicates with the extension host via postMessage:
 *   Extension → Webview:  { type: 'graphData', payload: SymbolGraph }
 *   Webview → Extension:   { type: 'goToSymbol', filePath, line, column }
 *   Webview → Extension:   { type: 'requestRefresh' }
 *   Webview → Extension:   { type: 'filterChanged', edgeKinds, symbolKinds }
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { GraphVisualizerProvider, GraphVisualizerDelegate } from '../primarySidebar/graphVisualizer';
import type * as TsMorph from 'ts-morph';

// Re-use the shared types. Because the MCP server has its own package we
// duplicate the minimal type inline to avoid cross-package imports at build time.
interface SourceLocation {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface ASTSymbol {
  id: string;
  name: string;
  kind: string;
  location: SourceLocation;
  detail?: string;
  modifiers?: string[];
  parentId?: string;
}

interface SymbolEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string;
}

interface SymbolGraph {
  symbols: ASTSymbol[];
  edges: SymbolEdge[];
  metadata: {
    projectRoot: string;
    fileCount: number;
    symbolCount: number;
    edgeCount: number;
    analysedAt: string;
  };
}

// ============================================================================
// Webview Provider
// ============================================================================

export class ASTGraphWebviewProvider {
  public static readonly viewType = 'vscode-devtools.astGraph';

  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private isWebviewReady = false;
  private pendingGraph: SymbolGraph | undefined;
  private loadInFlight: Promise<void> | undefined;
  private graphVisualizer: GraphVisualizerProvider | undefined;
  private lastGraph: SymbolGraph | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private get extensionUri(): vscode.Uri {
    return this.context.extensionUri;
  }

  /** Connect the sidebar Graph Visualizer tree view so it can control this webview. */
  setGraphVisualizer(provider: GraphVisualizerProvider): void {
    this.graphVisualizer = provider;
    const delegate: GraphVisualizerDelegate = {
      onFilterChanged: (filter) => {
        this.postToWebview({
          type: 'filterChanged',
          visibleSymbolKinds: [...filter.visibleSymbolKinds],
          visibleEdgeKinds: [...filter.visibleEdgeKinds],
          visibleFiles: [...filter.visibleFiles],
        });
      },
      onLayoutChanged: (layoutId) => {
        this.postToWebview({ type: 'setLayout', layoutId });
      },
      onAction: (action) => {
        switch (action) {
          case 'refresh':
            void this.loadGraphData();
            break;
          case 'fit':
            this.postToWebview({ type: 'cameraFit' });
            break;
          case 'zoomIn':
            this.postToWebview({ type: 'cameraZoomIn' });
            break;
          case 'zoomOut':
            this.postToWebview({ type: 'cameraZoomOut' });
            break;
        }
      },
      onSearch: (query) => {
        this.postToWebview({ type: 'search', query });
      },
    };
    provider.setDelegate(delegate);
  }

  private postToWebview(msg: Record<string, unknown>): void {
    if (this.panel && this.isWebviewReady) {
      void this.panel.webview.postMessage(msg);
    }
  }

  private updateVisualizerStats(graph: SymbolGraph): void {
    if (!this.graphVisualizer) return;
    const symbolKindCounts = new Map<string, number>();
    for (const s of graph.symbols) {
      symbolKindCounts.set(s.kind, (symbolKindCounts.get(s.kind) ?? 0) + 1);
    }
    const edgeKindCounts = new Map<string, number>();
    for (const e of graph.edges) {
      edgeKindCounts.set(e.kind, (edgeKindCounts.get(e.kind) ?? 0) + 1);
    }
    const files = graph.symbols
      .filter(s => s.kind === 'file')
      .map(s => s.name);
    this.graphVisualizer.updateGraphStats({ symbolKindCounts, edgeKindCounts, files });
  }

  /** Open (or reveal) the AST graph panel. */
  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      // Re-set HTML so the webview picks up any code changes after rebuild
      this.isWebviewReady = false;
      this.panel.webview.html = this.getHtml(this.panel.webview);
      return;
    }

    this.isWebviewReady = false;
    this.pendingGraph = undefined;
    this.loadInFlight = undefined;

    this.panel = vscode.window.createWebviewPanel(
      ASTGraphWebviewProvider.viewType,
      'AST Graph',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.isWebviewReady = false;
        this.pendingGraph = undefined;
        this.loadInFlight = undefined;
        for (const d of this.disposables) d.dispose();
        this.disposables.length = 0;
      },
      null,
      this.disposables,
    );
  }

  /** Send graph data to the webview. */
  async sendGraphData(graph: SymbolGraph): Promise<void> {
    if (!this.panel) return;

    this.lastGraph = graph;
    this.pendingGraph = graph;
    if (!this.isWebviewReady) {
      console.log('[AST Graph] Webview not ready yet; queued graph for later delivery');
      return;
    }

    const ok = await this.panel.webview.postMessage({ type: 'graphData', payload: graph });
    if (!ok) {
      console.warn('[AST Graph] postMessage(graphData) returned false (webview not ready or message dropped)');
      return;
    }

    this.pendingGraph = undefined;
    this.updateVisualizerStats(graph);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'webviewLog':
        console.log(
          '[AST Graph][webview]',
          msg.message ?? msg,
          typeof msg.data === 'string' ? msg.data : safeStringify(msg.data),
        );
        break;
      case 'webviewError':
        console.error(
          '[AST Graph][webview]',
          msg.message ?? msg,
          typeof msg.data === 'string' ? msg.data : safeStringify(msg.data),
        );
        break;
      case 'goToSymbol': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;
        const root = workspaceFolders[0].uri;
        const fileUri = vscode.Uri.joinPath(root, msg.filePath);
        const pos = new vscode.Position(
          Math.max(0, (msg.line ?? 1) - 1),
          Math.max(0, msg.column ?? 0),
        );
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        break;
      }
      case 'requestRefresh':
        console.log('[AST Graph] Webview requested refresh');
        await this.loadGraphData();
        break;
      case 'webviewReady':
        console.log('[AST Graph] Webview reported ready');
        this.isWebviewReady = true;
        if (this.pendingGraph) {
          const graph = this.pendingGraph;
          await this.sendGraphData(graph);
        } else {
          await this.loadGraphData();
        }
        break;
      default:
        console.log('[AST Graph] Received unknown webview message:', msg);
        break;
    }
  }

  /**
   * Load graph data by calling the MCP server's get_symbol_graph tool
   * via a child-process, OR by doing in-process TS analysis.
   *
   * For simplicity we do in-process analysis using the TS Compiler API.
   */
  private async loadGraphData(): Promise<void> {
    if (this.loadInFlight) {
      await this.loadInFlight;
      return;
    }

    console.log('[AST Graph] loadGraphData() called');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    console.log('[AST Graph] Analyzing workspace:', rootPath);

    this.loadInFlight = (async () => {
      try {
        // Dynamic import to avoid bundling issues — the MCP server's parser
        // is also usable as a library.
        // However, since we bundle with esbuild for the extension, we use
        // a simpler built-in approach: spawn the MCP server CLI and call a tool.
        // For now, we build the graph in-process using the same TS APIs.
        console.log('[AST Graph] Calling buildGraphInProcess...');
        const graph = await buildGraphInProcess(rootPath);
        console.log('[AST Graph] Graph built:', graph.metadata);
        await this.sendGraphData(graph);
        console.log('[AST Graph] Graph delivery attempted');
      } catch (err) {
        console.error('[AST Graph] Error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`AST Graph: ${msg}`);
      } finally {
        this.loadInFlight = undefined;
      }
    })();

    await this.loadInFlight;
  }

  // --------------------------------------------------------------------------
  // HTML
  // --------------------------------------------------------------------------

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    const cspSource = webview.cspSource;
    const sigmaBundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'sigma-bundle.js'),
    );
    const codiconFontUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf'),
    );

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             font-src ${cspSource};
             script-src 'nonce-${nonce}' ${cspSource};
             connect-src ${cspSource};
             img-src ${cspSource} data:;"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AST Graph</title>
  <script nonce="${nonce}" src="${sigmaBundleUri}"></script>
  <style>
    @font-face {
      font-family: 'codicon';
      src: url('${codiconFontUri}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      overflow: hidden;
      height: 100vh;
    }
    #sigma-container {
      width: 100%;
      height: 100vh;
      position: relative;
    }
    #stats {
      position: fixed;
      bottom: 4px;
      right: 10px;
      font-size: 11px;
      opacity: 0.7;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 16px;
      color: var(--vscode-descriptionForeground, #999);
      z-index: 10;
    }
    /* Legend for node kinds */
    #legend {
      position: fixed;
      bottom: 24px;
      left: 10px;
      font-size: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      opacity: 0.8;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    /* Tooltip for node relationships */
    #node-tooltip {
      position: fixed;
      top: 10px;
      right: 10px;
      max-width: 350px;
      max-height: 400px;
      overflow-y: auto;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 4px;
      padding: 10px;
      font-size: 11px;
      z-index: 100;
      display: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #node-tooltip.visible { display: block; }
    #node-tooltip h3 {
      margin: 0 0 8px 0;
      font-size: 13px;
      color: var(--vscode-foreground, #ccc);
      border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
      padding-bottom: 4px;
    }
    #node-tooltip .section {
      margin-bottom: 10px;
    }
    #node-tooltip .section-title {
      font-weight: bold;
      color: var(--vscode-textLink-foreground, #3794ff);
      margin-bottom: 4px;
    }
    #node-tooltip ul {
      margin: 0;
      padding-left: 16px;
      max-height: 120px;
      overflow-y: auto;
    }
    #node-tooltip li {
      margin: 2px 0;
      color: var(--vscode-foreground, #ccc);
    }
    #node-tooltip .node-kind {
      font-size: 9px;
      opacity: 0.7;
      margin-left: 4px;
    }
    #node-tooltip .count {
      opacity: 0.6;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div id="sigma-container">
    <div id="loading">Loading AST graph\u2026</div>
  </div>
  <div id="stats"></div>
  <div id="legend"></div>
  <div id="node-tooltip"></div>

  <script nonce="${nonce}">
    // ====== VS Code API ======
    const vscode = acquireVsCodeApi();

    function webviewLog(message, data) {
      try { vscode.postMessage({ type: 'webviewLog', message, data: safeStringify(data) }); } catch {}
    }
    function webviewError(message, data) {
      try { vscode.postMessage({ type: 'webviewError', message, data: safeStringify(data) }); } catch {}
    }
    function safeStringify(value) {
      try { if (typeof value === 'string') return value; return JSON.stringify(value); }
      catch { try { return String(value); } catch { return '[unserializable]'; } }
    }

    window.addEventListener('error', (event) => {
      webviewError('window.error', { message: event.message, filename: event.filename, lineno: event.lineno, stack: event.error?.stack });
    });
    window.addEventListener('unhandledrejection', (event) => {
      webviewError('unhandledrejection', { reason: String(event.reason), stack: event.reason?.stack });
    });

    webviewLog('boot', {
      hasSigma: typeof Sigma !== 'undefined',
      hasGraph: typeof Graph !== 'undefined',
    });

    // ====== Color scheme per symbol kind ======
    const kindColors = {
      file: '#4ec9b0',
      class: '#c586c0',
      interface: '#569cd6',
      enum: '#d7ba7d',
      function: '#dcdcaa',
      method: '#dcdcaa',
      property: '#9cdcfe',
      variable: '#9cdcfe',
      constant: '#4fc1ff',
      constructor: '#c586c0',
      'type-alias': '#569cd6',
      'enum-member': '#d7ba7d',
      namespace: '#4ec9b0',
      module: '#4ec9b0',
      unknown: '#808080',
    };

    // ====== State ======
    let renderer = null;
    let graph = null;
    let currentGraphData = null;
    let highlightedNodes = new Set();
    let highlightedEdges = new Set();
    let hoveredNode = null;
    var currentLayoutId = 'forceatlas2';

    // Flow edge adjacency (populated by buildGraphView)
    let globalOutgoingFlowEdges = new Map();  // nodeId -> Set of target nodeIds
    let globalIncomingFlowEdges = new Map();  // nodeId -> Set of source nodeIds

    // ====== Recursive relationship traversal ======
    function getDownstreamNodes(startId, maxDepth) {
      // BFS to find all nodes reachable FROM this node (data flows TO)
      const visited = new Map();  // nodeId -> depth
      const queue = [[startId, 0]];
      visited.set(startId, 0);
      while (queue.length > 0) {
        const [nodeId, depth] = queue.shift();
        if (maxDepth && depth >= maxDepth) continue;
        const targets = globalOutgoingFlowEdges.get(nodeId);
        if (!targets) continue;
        for (const targetId of targets) {
          if (!visited.has(targetId)) {
            visited.set(targetId, depth + 1);
            queue.push([targetId, depth + 1]);
          }
        }
      }
      visited.delete(startId);  // Don't include self
      return visited;  // Map of nodeId -> depth from start
    }

    function getUpstreamNodes(startId, maxDepth) {
      // BFS to find all nodes that flow INTO this node (data flows FROM)
      const visited = new Map();  // nodeId -> depth
      const queue = [[startId, 0]];
      visited.set(startId, 0);
      while (queue.length > 0) {
        const [nodeId, depth] = queue.shift();
        if (maxDepth && depth >= maxDepth) continue;
        const sources = globalIncomingFlowEdges.get(nodeId);
        if (!sources) continue;
        for (const srcId of sources) {
          if (!visited.has(srcId)) {
            visited.set(srcId, depth + 1);
            queue.push([srcId, depth + 1]);
          }
        }
      }
      visited.delete(startId);  // Don't include self
      return visited;  // Map of nodeId -> depth from start
    }

    function showNodeTooltip(nodeId) {
      if (!graph || !graph.hasNode(nodeId)) return;
      const tooltip = document.getElementById('node-tooltip');
      if (!tooltip) return;

      const attrs = graph.getNodeAttributes(nodeId);
      const downstream = getDownstreamNodes(nodeId, 10);  // limit depth to 10
      const upstream = getUpstreamNodes(nodeId, 10);

      // Group by depth for hierarchical display
      function groupByDepth(nodes) {
        const byDepth = new Map();
        for (const [id, depth] of nodes) {
          if (!byDepth.has(depth)) byDepth.set(depth, []);
          byDepth.get(depth).push(id);
        }
        return byDepth;
      }

      function renderNodeList(nodes, maxShow) {
        if (nodes.size === 0) return '<span class="count">(none)</span>';
        const byDepth = groupByDepth(nodes);
        const depths = [...byDepth.keys()].sort((a, b) => a - b);
        let html = '<ul>';
        let shown = 0;
        for (const depth of depths) {
          const ids = byDepth.get(depth);
          for (const id of ids) {
            if (shown >= (maxShow || 20)) {
              html += '<li class="count">...and ' + (nodes.size - shown) + ' more</li>';
              html += '</ul>';
              return html;
            }
            const nodeAttrs = graph.hasNode(id) ? graph.getNodeAttributes(id) : {};
            const name = nodeAttrs.label || id;
            const kind = nodeAttrs.kind || '';
            html += '<li>' + escapeHtml(name) + '<span class="node-kind">[' + kind + '] d=' + depth + '</span></li>';
            shown++;
          }
        }
        html += '</ul>';
        return html;
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      const nodeName = attrs.label || nodeId;
      const nodeKind = attrs.kind || 'unknown';

      tooltip.innerHTML = 
        '<h3>' + escapeHtml(nodeName) + ' <span class="node-kind">[' + nodeKind + ']</span></h3>' +
        '<div class="section">' +
          '<div class="section-title">\u2192 Downstream (calls/uses) <span class="count">(' + downstream.size + ')</span></div>' +
          renderNodeList(downstream, 15) +
        '</div>' +
        '<div class="section">' +
          '<div class="section-title">\u2190 Upstream (called by) <span class="count">(' + upstream.size + ')</span></div>' +
          renderNodeList(upstream, 15) +
        '</div>';

      tooltip.classList.add('visible');
    }

    function hideNodeTooltip() {
      const tooltip = document.getElementById('node-tooltip');
      if (tooltip) tooltip.classList.remove('visible');
    }


    // ====== Utility: map symbols to owning file ======
    function buildSymbolToFileMap(graphData) {
      const fileIds = new Set(graphData.symbols.filter(s => s.kind === 'file').map(s => s.id));
      const parentMap = new Map();
      for (const s of graphData.symbols) {
        if (s.parentId) parentMap.set(s.id, s.parentId);
      }
      const cache = new Map();
      function getFileId(symId) {
        if (cache.has(symId)) return cache.get(symId);
        if (fileIds.has(symId)) { cache.set(symId, symId); return symId; }
        const p = parentMap.get(symId);
        if (!p) { cache.set(symId, symId); return symId; }
        const result = getFileId(p);
        cache.set(symId, result);
        return result;
      }
      for (const s of graphData.symbols) getFileId(s.id);
      return cache;
    }

    function isCrossFileEdge(edge, sym2file) {
      if (edge.kind === 'contains') return false;
      const sf = sym2file.get(edge.source);
      const tf = sym2file.get(edge.target);
      return sf && tf && sf !== tf;
    }

    // ====== Depth calculation for per-file-subtree heat normalization ======
    function buildDepthMap(graphData) {
      const parentMap = new Map();
      const childrenMap = new Map();
      for (const e of graphData.edges) {
        if (e.kind === 'contains') {
          parentMap.set(e.target, e.source);
          if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
          childrenMap.get(e.source).push(e.target);
        }
      }
      const fileIds = new Set(graphData.symbols.filter(s => s.kind === 'file').map(s => s.id));

      // Depth from file root
      const depthMap = new Map();
      function getDepth(symId) {
        if (depthMap.has(symId)) return depthMap.get(symId);
        if (fileIds.has(symId)) { depthMap.set(symId, 0); return 0; }
        const parent = parentMap.get(symId);
        if (!parent) { depthMap.set(symId, 0); return 0; }
        const d = getDepth(parent) + 1;
        depthMap.set(symId, d);
        return d;
      }
      for (const s of graphData.symbols) getDepth(s.id);

      // Map each symbol to its file root
      const fileOfMap = new Map();
      function getFileOf(symId) {
        if (fileOfMap.has(symId)) return fileOfMap.get(symId);
        if (fileIds.has(symId)) { fileOfMap.set(symId, symId); return symId; }
        const parent = parentMap.get(symId);
        if (!parent) { fileOfMap.set(symId, null); return null; }
        const result = getFileOf(parent);
        fileOfMap.set(symId, result);
        return result;
      }
      for (const s of graphData.symbols) getFileOf(s.id);

      // Max depth per file subtree
      const fileMaxDepths = new Map();
      for (const [symId, depth] of depthMap.entries()) {
        const fid = fileOfMap.get(symId);
        if (fid) {
          fileMaxDepths.set(fid, Math.max(fileMaxDepths.get(fid) || 0, depth));
        }
      }

      return { depthMap, fileMaxDepths, fileOfMap };
    }

    function getNodeHeat(symId, depthMap, fileMaxDepths, fileOfMap) {
      const depth = depthMap.get(symId) || 0;
      const fid = fileOfMap.get(symId) || symId;
      const maxD = fileMaxDepths.get(fid) || 1;
      return maxD > 0 ? Math.min(depth / maxD, 1) : 0;
    }

    // Smooth hue interpolation: green (120°) → yellow (60°) → orange (30°) → red (0°)
    // Returns hex color for WebGL floatColor compatibility
    function getHeatColor(depth, maxDepth) {
      if (maxDepth <= 0) return '#00ff00';
      var t = Math.min(depth / maxDepth, 1);
      var hue = (1 - t) * 120;
      var r, g;
      if (hue >= 60) {
        r = Math.round(255 * (120 - hue) / 60);
        g = 255;
      } else {
        r = 255;
        g = Math.round(255 * hue / 60);
      }
      var toHex = function(c) { var h = c.toString(16); return h.length < 2 ? '0' + h : h; };
      return '#' + toHex(r) + toHex(g) + '00';
    }

    // ====== View builder — populate a graphology Graph ======

    function buildGraphView(graphData, g) {
      const sym2file = buildSymbolToFileMap(graphData);
      const nodeIds = new Set(graphData.symbols.map(s => s.id));

      // Build DIRECTED adjacency for non-containment edges (data flow edges)
      // Flow edges: calls, imports, extends, implements, uses (anything except 'contains')
      // These are DIRECTIONAL: source → target means source references/calls/uses target
      const outgoingFlowEdges = new Map();  // nodeId -> Set of target nodeIds
      const incomingFlowEdges = new Map();  // nodeId -> Set of source nodeIds
      for (const e of graphData.edges) {
        if (e.kind === 'contains') continue;
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
        if (!outgoingFlowEdges.has(e.source)) outgoingFlowEdges.set(e.source, new Set());
        if (!incomingFlowEdges.has(e.target)) incomingFlowEdges.set(e.target, new Set());
        outgoingFlowEdges.get(e.source).add(e.target);
        incomingFlowEdges.get(e.target).add(e.source);
      }

      // Store globally for tooltip traversal
      globalOutgoingFlowEdges = outgoingFlowEdges;
      globalIncomingFlowEdges = incomingFlowEdges;

      // Compute "flow depth" for each node = max distance FROM this node TO any terminal
      // Terminal = node with no outgoing flow edges (end of data flow chain)
      // Depth 0 = terminal (deepest), higher depth = closer to source (origin)
      const flowDepth = new Map();  // nodeId -> depth (0 = terminal, higher = source)
      const queue = [];

      // Initialize: terminals (no outgoing flow edges) get depth 0
      for (const nodeId of nodeIds) {
        const outgoing = outgoingFlowEdges.get(nodeId);
        if (!outgoing || outgoing.size === 0) {
          flowDepth.set(nodeId, 0);
          queue.push(nodeId);
        }
      }

      // BFS backward: propagate depth from terminals toward sources
      let maxGlobalDepth = 0;
      while (queue.length > 0) {
        const nodeId = queue.shift();
        const myDepth = flowDepth.get(nodeId);
        const incoming = incomingFlowEdges.get(nodeId);
        if (!incoming) continue;
        for (const srcId of incoming) {
          const newDepth = myDepth + 1;
          if (!flowDepth.has(srcId) || flowDepth.get(srcId) < newDepth) {
            flowDepth.set(srcId, newDepth);
            maxGlobalDepth = Math.max(maxGlobalDepth, newDepth);
            queue.push(srcId);
          }
        }
      }

      // Isolated nodes (no flow edges) are terminals
      for (const nodeId of nodeIds) {
        if (!flowDepth.has(nodeId)) flowDepth.set(nodeId, 0);
      }

      // Heat: 0 = green (source/origin), 1 = red (terminal/deepest)
      // Formula: heat = 1 - (flowDepth / maxGlobalDepth)
      function getFlowHeat(nodeId) {
        if (maxGlobalDepth === 0) return 1;  // No flow edges → all terminals
        const d = flowDepth.get(nodeId) || 0;
        return 1 - (d / maxGlobalDepth);
      }

      // Check if node is a terminal (no outgoing flow edges)
      function isTerminal(nodeId) {
        const outgoing = outgoingFlowEdges.get(nodeId);
        return !outgoing || outgoing.size === 0;
      }

      // Check if node is a source (no incoming flow edges)
      function isSource(nodeId) {
        const incoming = incomingFlowEdges.get(nodeId);
        return !incoming || incoming.size === 0;
      }

      // First pass: add all nodes with heat and terminal flag
      for (const s of graphData.symbols) {
        const color = kindColors[s.kind] || kindColors.unknown;
        const heat = getFlowHeat(s.id);
        const terminal = isTerminal(s.id);
        const source = isSource(s.id);
        g.addNode(s.id, {
          label: s.name,
          size: 5,
          color,
          kind: s.kind,
          heat: heat,
          isTerminal: terminal,
          isSource: source,
          filePath: s.location.filePath,
          line: s.location.startLine,
          column: s.location.startColumn,
          fileId: sym2file.get(s.id),
          type: 'piechart',
          heat0: 0, heat1: 0, heat2: 0, heat3: 0, heat4: 0,
          heat5: 0, heat6: 0, heat7: 0, heat8: 0, heat9: 0,
          x: 0, y: 0,
        });
      }

      // Second pass: add DIRECTED edges with gradient
      // Source side = source's heat color, Target side = target's heat color
      let edgeCount = 0;
      for (const e of graphData.edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
        var srcHeat = getFlowHeat(e.source);
        var tgtHeat = getFlowHeat(e.target);
        var srcColor = getHeatColor(srcHeat, 1);
        var tgtColor = getHeatColor(tgtHeat, 1);
        var cf = isCrossFileEdge(e, sym2file);
        g.addEdge(e.source, e.target, {
          sourceColor: srcColor,
          targetColor: tgtColor,
          color: srcColor,
          size: cf ? 2 : 1,
          label: e.label || e.kind,
          kind: e.kind,
          type: 'gradient',
        });
        edgeCount++;
      }

      // Third pass: dynamic sizing by edge count
      g.forEachNode(function(id) {
        var degree = g.degree(id);
        var sz = Math.max(3, Math.min(25, 4 + Math.log2(degree + 1) * 4));
        g.setNodeAttribute(id, 'size', sz);
      });

      // Fourth pass: pie chart = THIS node's role in each DIRECTED edge
      // For each edge, determine this node's role in that specific edge:
      //   - If this node is SOURCE of edge: heat = 0 (green, origin of this flow)
      //   - If this node is TARGET of edge:
      //       - If terminal (no outgoing): heat = 1 (red, end of flow)
      //       - If intermediate: heat = 0.5 (yellow/orange, middle of flow)
      g.forEachNode(function(id) {
        var buckets = [0,0,0,0,0,0,0,0,0,0];
        var nodeIsTerminal = g.getNodeAttribute(id, 'isTerminal');

        g.forEachEdge(id, function(edge, attrs, source, target) {
          var roleHeat;
          if (source === id) {
            // This node is SOURCE of this edge = origin of this data flow
            roleHeat = 0;  // Green
          } else {
            // This node is TARGET of this edge = receiving data flow
            if (nodeIsTerminal) {
              roleHeat = 1;  // Red (terminal, deepest point)
            } else {
              roleHeat = 0.5;  // Yellow/orange (intermediate)
            }
          }
          var bucket = Math.min(9, Math.floor(roleHeat * 9.999));
          buckets[bucket]++;
        });

        for (var i = 0; i < 10; i++) {
          g.setNodeAttribute(id, 'heat' + i, buckets[i]);
        }
      });

      return { nodeCount: nodeIds.size, edgeCount };
    }

    // ====== Layout algorithms ======

    function applyCircularLayout(g) {
      const nodes = g.nodes();
      const n = nodes.length;
      const radius = Math.max(200, n * 3);
      nodes.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / n;
        g.setNodeAttribute(id, 'x', radius * Math.cos(angle));
        g.setNodeAttribute(id, 'y', radius * Math.sin(angle));
      });
    }

    function applyRandomLayout(g) {
      g.forEachNode((id) => {
        g.setNodeAttribute(id, 'x', (Math.random() - 0.5) * 1000);
        g.setNodeAttribute(id, 'y', (Math.random() - 0.5) * 1000);
      });
    }

    function applyByFileLayout(g) {
      // Group symbols by file, arrange file clusters in a grid, symbols in a circle within each cluster
      const fileGroups = new Map();
      g.forEachNode((id, attrs) => {
        const fid = attrs.fileId || id;
        if (!fileGroups.has(fid)) fileGroups.set(fid, []);
        fileGroups.get(fid).push(id);
      });

      const files = [...fileGroups.keys()];
      const cols = Math.ceil(Math.sqrt(files.length));
      const spacing = 300;

      files.forEach((fid, fi) => {
        const col = fi % cols;
        const row = Math.floor(fi / cols);
        const cx = col * spacing;
        const cy = row * spacing;
        const members = fileGroups.get(fid);
        const memberRadius = Math.max(40, members.length * 8);

        members.forEach((id, mi) => {
          if (id === fid) {
            // File node at cluster center
            g.setNodeAttribute(id, 'x', cx);
            g.setNodeAttribute(id, 'y', cy);
          } else {
            const angle = (2 * Math.PI * mi) / members.length;
            g.setNodeAttribute(id, 'x', cx + memberRadius * Math.cos(angle));
            g.setNodeAttribute(id, 'y', cy + memberRadius * Math.sin(angle));
          }
        });
      });
    }

    function applyForceAtlas2Layout(g) {
      // Seed with circular layout first for stability
      applyCircularLayout(g);
      try {
        const iterations = Math.min(200, Math.max(50, 1000 / Math.sqrt(g.order)));
        forceAtlas2.assign(g, {
          iterations: Math.round(iterations),
          settings: {
            gravity: 1,
            scalingRatio: 2,
            barnesHutOptimize: g.order > 500,
            barnesHutTheta: 0.5,
            slowDown: 5,
            strongGravityMode: true,
          },
        });
      } catch (err) {
        webviewError('forceAtlas2 failed, keeping circular', { message: err?.message });
      }
    }

    function applyLayoutById(name) {
      if (!graph) return;
      switch (name) {
        case 'circular': applyCircularLayout(graph); break;
        case 'random': applyRandomLayout(graph); break;
        case 'byfile': applyByFileLayout(graph); break;
        case 'forceatlas2':
        default:
          applyForceAtlas2Layout(graph); break;
      }
    }

    function applyLayout(g) {
      applyLayoutById(currentLayoutId || 'forceatlas2');
    }

    // ====== Node reducers for highlighting ======

    function nodeReducer(node, data) {
      const res = { ...data };

      if (highlightedNodes.size > 0) {
        if (highlightedNodes.has(node)) {
          res.highlighted = true;
          res.zIndex = 2;
        } else {
          res.color = '#333';
          res.label = '';
          res.zIndex = 0;
        }
      }

      if (hoveredNode === node) {
        res.highlighted = true;
        res.zIndex = 3;
      }

      return res;
    }

    function edgeReducer(edge, data) {
      const res = { ...data };

      if (highlightedEdges.size > 0) {
        if (!highlightedEdges.has(edge)) {
          res.color = '#222';
          res.hidden = true;
        }
      }

      return res;
    }

    // ====== Main init ======

    function initGraph(graphData) {
      try {
        webviewLog('initGraph:start', { symbols: graphData?.symbols?.length, edges: graphData?.edges?.length });
        if (typeof Graph === 'undefined' || typeof Sigma === 'undefined') {
          webviewError('Sigma or Graph not loaded', {});
          return;
        }
        currentGraphData = graphData;
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.display = 'none';

        // Destroy previous renderer
        if (renderer) { renderer.kill(); renderer = null; }
        graph = new Graph({ multi: true });

        var stats = buildGraphView(graphData, graph);

        // Apply initial layout
        applyLayout(graph);

        webviewLog('view:built', { nodes: stats.nodeCount, edges: stats.edgeCount });

        // Reset highlight state
        highlightedNodes = new Set();
        highlightedEdges = new Set();
        hoveredNode = null;

        const container = document.getElementById('sigma-container');

        // ====== Codicon glyph map (VS Code symbol icons) ======
        var kindToGlyph = {
          file: '\\uEB60', class: '\\uEB5B', interface: '\\uEB61', enum: '\\uEB5E',
          function: '\\uEB64', method: '\\uEB64', constructor: '\\uEB64',
          property: '\\uEB66', variable: '\\uEB71', constant: '\\uEB5D',
          'type-alias': '\\uEA8F', namespace: '\\uEB65', module: '\\uEB65',
          'enum-member': '\\uEB5E', unknown: '\\uEA76',
        };

        // Label renderer: draw only the codicon glyph centered on each node
        function codiconLabelRenderer(context, data, settings) {
          if (!data.label) return;
          var glyph = kindToGlyph[data.kind] || kindToGlyph.unknown;
          var fontSize = Math.max(8, data.size * 0.8);
          context.font = fontSize + 'px codicon';
          context.fillStyle = '#ffffff';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.shadowColor = '#000';
          context.shadowBlur = 2;
          context.fillText(glyph, data.x, data.y);
          context.shadowBlur = 0;
        }

        // Hover renderer: codicon glyph + text label with white background
        function customHoverRenderer(context, data, settings) {
          var size = settings.labelSize;
          var font = settings.labelFont;
          var weight = settings.labelWeight || 'normal';
          context.font = weight + ' ' + size + 'px ' + font;
          context.fillStyle = '#FFF';
          context.shadowOffsetX = 0;
          context.shadowOffsetY = 0;
          context.shadowBlur = 8;
          context.shadowColor = '#000';
          var PADDING = 2;
          if (typeof data.label === 'string') {
            var glyph = kindToGlyph[data.kind] || '';
            var labelText = glyph ? glyph + ' ' + data.label : data.label;
            context.font = weight + ' ' + size + 'px ' + font;
            var textWidth = context.measureText(labelText).width;
            var boxWidth = Math.round(textWidth + 8);
            var boxHeight = Math.round(size + 2 * PADDING + 4);
            var radius = Math.max(data.size, size / 2) + PADDING;
            var angleRadian = Math.asin(Math.min(1, boxHeight / 2 / radius));
            var xDelta = Math.sqrt(Math.abs(radius * radius - (boxHeight / 2) * (boxHeight / 2)));
            context.beginPath();
            context.moveTo(data.x + xDelta, data.y + boxHeight / 2);
            context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
            context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
            context.lineTo(data.x + xDelta, data.y - boxHeight / 2);
            context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
            context.closePath();
            context.fill();
          } else {
            context.beginPath();
            context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
            context.closePath();
            context.fill();
          }
          context.shadowBlur = 0;
          if (data.label) {
            var glyph2 = kindToGlyph[data.kind] || '';
            var displayText = glyph2 ? glyph2 + ' ' + data.label : data.label;
            context.fillStyle = '#000000';
            // Draw codicon glyph part with codicon font
            if (glyph2) {
              var glyphSize = size + 2;
              context.font = glyphSize + 'px codicon';
              context.fillText(glyph2, data.x + data.size + 4, data.y + size / 3);
              var glyphWidth = context.measureText(glyph2).width;
              context.font = weight + ' ' + size + 'px ' + font;
              context.fillText(data.label, data.x + data.size + 4 + glyphWidth + 3, data.y + size / 3);
            } else {
              context.font = weight + ' ' + size + 'px ' + font;
              context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
            }
          }
        }

        // Create pie chart node program from @sigma/node-piechart
        var piechartSlices = [];
        for (var si = 0; si < 10; si++) {
          var sliceHue = (1 - si / 9) * 120;
          var sliceR, sliceG;
          if (sliceHue >= 60) {
            sliceR = Math.round(255 * (120 - sliceHue) / 60);
            sliceG = 255;
          } else {
            sliceR = 255;
            sliceG = Math.round(255 * sliceHue / 60);
          }
          var sliceHex = function(c) { var h = c.toString(16); return h.length < 2 ? '0' + h : h; };
          var sliceColor = '#' + sliceHex(sliceR) + sliceHex(sliceG) + '00';
          piechartSlices.push({
            color: { value: sliceColor },
            value: { attribute: 'heat' + si },
          });
        }
        var NodePiechartProgram = createNodePiechartProgram({
          defaultColor: '#333333',
          slices: piechartSlices,
        });

        renderer = new Sigma(graph, container, {
          nodeReducer,
          edgeReducer,
          renderLabels: true,
          renderEdgeLabels: false,
          defaultDrawNodeLabel: codiconLabelRenderer,
          defaultDrawNodeHover: customHoverRenderer,
          labelFont: 'var(--vscode-font-family, sans-serif)',
          labelSize: 12,
          labelColor: { color: '#ffffff' },
          edgeLabelFont: 'var(--vscode-font-family, sans-serif)',
          edgeLabelSize: 9,
          edgeLabelColor: { color: '#888' },
          defaultNodeType: 'piechart',
          defaultEdgeType: 'gradient',
          defaultNodeColor: '#808080',
          defaultEdgeColor: '#555',
          nodeProgramClasses: { piechart: NodePiechartProgram },
          edgeProgramClasses: { gradient: EdgeGradientProgram },
          labelDensity: 1,
          labelGridCellSize: 40,
          labelRenderedSizeThreshold: 0,
          zIndex: true,
          minCameraRatio: 0.01,
          maxCameraRatio: 10,
        });

        // Refresh after codicon font loads to ensure glyphs render
        document.fonts.ready.then(function() {
          if (renderer) renderer.refresh();
        });

        // ---- Interactions ----

        // Hover: highlight connected neighborhood and show tooltip
        renderer.on('enterNode', ({ node }) => {
          hoveredNode = node;
          highlightedNodes = new Set([node]);
          highlightedEdges = new Set();
          graph.forEachEdge(node, (edge, attrs, source, target) => {
            highlightedEdges.add(edge);
            highlightedNodes.add(source);
            highlightedNodes.add(target);
          });
          showNodeTooltip(node);
          renderer.refresh();
        });

        renderer.on('leaveNode', () => {
          hoveredNode = null;
          highlightedNodes = new Set();
          highlightedEdges = new Set();
          hideNodeTooltip();
          renderer.refresh();
        });

        // Double-click: navigate to source
        renderer.on('doubleClickNode', ({ node, event }) => {
          event.preventSigmaDefault();
          const attrs = graph.getNodeAttributes(node);
          if (attrs.filePath && attrs.line != null) {
            vscode.postMessage({
              type: 'goToSymbol',
              filePath: attrs.filePath,
              line: attrs.line,
              column: attrs.column || 0,
            });
          }
        });

        // Click node: persistent highlight
        renderer.on('clickNode', ({ node }) => {
          highlightedNodes = new Set([node]);
          highlightedEdges = new Set();
          graph.forEachEdge(node, (edge, attrs, source, target) => {
            highlightedEdges.add(edge);
            highlightedNodes.add(source);
            highlightedNodes.add(target);
          });
          renderer.refresh();
        });

        // Click background: clear highlight
        renderer.on('clickStage', () => {
          highlightedNodes = new Set();
          highlightedEdges = new Set();
          hoveredNode = null;
          renderer.refresh();
        });

        updateStats(graphData, stats);
        buildLegend();
        webviewLog('initGraph:done', { nodes: stats.nodeCount, edges: stats.edgeCount });
      } catch (e) {
        webviewError('initGraph:exception', { message: e?.message ?? String(e), stack: e?.stack });
      }
    }

    function updateStats(graphData, stats) {
      const el = document.getElementById('stats');
      if (!el || !graphData || !graphData.metadata) return;
      el.textContent =
        graphData.metadata.fileCount + ' files | ' +
        (stats ? stats.nodeCount : graphData.metadata.symbolCount) + ' nodes | ' +
        (stats ? stats.edgeCount : graphData.metadata.edgeCount) + ' edges | ' +
        graphData.metadata.analysedAt;
    }

    function buildLegend() {
      const el = document.getElementById('legend');
      if (!el) return;
      el.innerHTML = '';

      // Node kind colors with codicon glyphs
      const kinds = ['file', 'class', 'interface', 'function', 'method', 'variable', 'property', 'enum', 'type-alias'];
      for (const k of kinds) {
        const item = document.createElement('span');
        item.className = 'legend-item';
        item.innerHTML = '<span class="legend-dot" style="background:' + (kindColors[k] || '#808080') + '"></span>' + k;
        el.appendChild(item);
      }

      // Separator
      var sep1 = document.createElement('span');
      sep1.style.cssText = 'width:1px;height:14px;background:#555;margin:0 4px;';
      el.appendChild(sep1);

      // Edge gradient bar
      var gradLabel = document.createElement('span');
      gradLabel.style.cssText = 'font-size:10px;opacity:0.8;margin-right:4px;';
      gradLabel.textContent = 'Edge gradient:';
      el.appendChild(gradLabel);

      var shallowLabel = document.createElement('span');
      shallowLabel.style.cssText = 'font-size:9px;opacity:0.6;margin:0 2px;';
      shallowLabel.textContent = 'source';
      el.appendChild(shallowLabel);

      var gradBar = document.createElement('span');
      gradBar.style.cssText = 'display:inline-block;width:80px;height:8px;border-radius:4px;background:linear-gradient(to right, hsl(120,100%,50%), hsl(60,100%,50%), hsl(30,100%,50%), hsl(0,100%,50%));vertical-align:middle;';
      el.appendChild(gradBar);

      var deepLabel = document.createElement('span');
      deepLabel.style.cssText = 'font-size:9px;opacity:0.6;margin:0 2px;';
      deepLabel.textContent = 'deep';
      el.appendChild(deepLabel);

      // Separator
      var sep2 = document.createElement('span');
      sep2.style.cssText = 'width:1px;height:14px;background:#555;margin:0 4px;';
      el.appendChild(sep2);

      // Pie chart explanation
      var pieLabel = document.createElement('span');
      pieLabel.style.cssText = 'font-size:10px;opacity:0.8;';
      pieLabel.textContent = 'Node pie = connected neighbor depth distribution';
      el.appendChild(pieLabel);
    }

    // ====== Toolbar handlers (from sidebar via postMessage) ======
    // Handled in the message handler below

    // ====== Filter state (driven by sidebar) ======
    let activeFilter = null; // null = show everything

    function applyFilter(filter) {
      if (!graph || !renderer) return;
      const symKinds = filter ? new Set(filter.visibleSymbolKinds) : null;
      const edgeKinds = filter ? new Set(filter.visibleEdgeKinds) : null;
      const files = filter ? new Set(filter.visibleFiles) : null;

      graph.forEachNode((id, attrs) => {
        var hidden = false;
        if (symKinds && !symKinds.has(attrs.kind)) hidden = true;
        if (files && attrs.kind === 'file' && !files.has(attrs.label)) hidden = true;
        if (files && attrs.kind !== 'file' && attrs.fileId) {
          // Check if the owning file is hidden
          var fileAttrs = graph.hasNode(attrs.fileId) ? graph.getNodeAttributes(attrs.fileId) : null;
          if (fileAttrs && !files.has(fileAttrs.label)) hidden = true;
        }
        graph.setNodeAttribute(id, 'hidden', hidden);
      });

      graph.forEachEdge((edge, attrs) => {
        var hidden = false;
        if (edgeKinds && !edgeKinds.has(attrs.kind)) hidden = true;
        // Also hide edge if either endpoint is hidden
        var srcHidden = graph.getNodeAttribute(graph.source(edge), 'hidden');
        var tgtHidden = graph.getNodeAttribute(graph.target(edge), 'hidden');
        if (srcHidden || tgtHidden) hidden = true;
        graph.setEdgeAttribute(edge, 'hidden', hidden);
      });

      renderer.refresh();
    }

    function doSearch(query) {
      if (!graph || !renderer) return;
      var q = (query || '').toLowerCase();
      if (!q) {
        highlightedNodes = new Set();
        highlightedEdges = new Set();
        renderer.refresh();
        return;
      }
      highlightedNodes = new Set();
      highlightedEdges = new Set();
      graph.forEachNode((id, attrs) => {
        if (attrs.label && attrs.label.toLowerCase().includes(q)) {
          highlightedNodes.add(id);
          graph.forEachEdge(id, (edge, ea, source, target) => {
            highlightedEdges.add(edge);
            highlightedNodes.add(source);
            highlightedNodes.add(target);
          });
        }
      });
      renderer.refresh();
    }

    // ====== Message handler ======

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'graphData':
          webviewLog('graphData:received', { symbols: msg.payload?.symbols?.length, edges: msg.payload?.edges?.length });
          initGraph(msg.payload);
          if (activeFilter) applyFilter(activeFilter);
          break;

        case 'filterChanged':
          activeFilter = msg;
          applyFilter(msg);
          break;

        case 'setLayout':
          currentLayoutId = msg.layoutId || 'forceatlas2';
          if (graph && renderer) {
            applyLayoutById(currentLayoutId);
            renderer.refresh();
          }
          break;

        case 'cameraFit':
          if (renderer) renderer.getCamera().animatedReset();
          break;

        case 'cameraZoomIn':
          if (renderer) renderer.getCamera().animatedZoom({ duration: 200 });
          break;

        case 'cameraZoomOut':
          if (renderer) renderer.getCamera().animatedUnzoom({ duration: 200 });
          break;

        case 'search':
          doSearch(msg.query);
          break;
      }
    });

    vscode.postMessage({ type: 'webviewReady' });
  </script>
</body>
</html>`;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

// ============================================================================
// In-process graph builder (used when the MCP server isn't running)
// ============================================================================

async function buildGraphInProcess(rootPath: string): Promise<SymbolGraph> {
  const { Project, Node, SyntaxKind, VariableDeclarationKind } = await import('ts-morph');
  const pathMod = await import('node:path');
  const fs = await import('node:fs');

  const tsconfigPath = pathMod.join(rootPath, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error(`No tsconfig.json found in ${rootPath}`);
  }

  const project = new Project({ tsConfigFilePath: tsconfigPath });

  const symbols: ASTSymbol[] = [];
  const edges: SymbolEdge[] = [];
  let edgeCounter = 0;

  function makeId(fp: string, name: string, line: number): string {
    return `${fp}::${name}@${line}`;
  }

  function nextEdgeId(): string {
    return `e${++edgeCounter}`;
  }

  function toRelPath(filePath: string): string {
    return pathMod.relative(rootPath, filePath).replace(/\\/g, '/');
  }

  function getLocationFromNode(node: TsMorph.Node): SourceLocation {
    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndColumnAtPos(node.getStart());
    const end = sourceFile.getLineAndColumnAtPos(node.getEnd());
    return {
      filePath: toRelPath(sourceFile.getFilePath()),
      startLine: start.line,
      startColumn: start.column - 1,
      endLine: end.line,
      endColumn: end.column - 1,
    };
  }

  function isProjectSourceFile(sf: TsMorph.SourceFile): boolean {
    return !sf.getFilePath().includes('node_modules') && !sf.isDeclarationFile();
  }

  function resolveSymbolTarget(node: TsMorph.Node): string | null {
    try {
      const sym = node.getSymbol() ?? node.getType().getSymbol() ?? node.getType().getAliasSymbol();
      if (!sym) return null;
      const declarations = sym.getDeclarations();
      if (declarations.length === 0) return null;
      const decl = declarations[0];
      const sf = decl.getSourceFile();
      if (!isProjectSourceFile(sf)) return null;
      return makeId(toRelPath(sf.getFilePath()), sym.getName(), decl.getStartLineNumber());
    } catch {
      return null;
    }
  }

  const sourceFiles = project
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile() && !sf.getFilePath().includes('node_modules'));

  for (const sourceFile of sourceFiles) {
    const relPath = toRelPath(sourceFile.getFilePath());
    const fId = relPath;

    symbols.push({
      id: fId,
      name: pathMod.basename(sourceFile.getFilePath()),
      kind: 'file',
      location: {
        filePath: relPath,
        startLine: 1,
        startColumn: 0,
        endLine: sourceFile.getEndLineNumber(),
        endColumn: 0,
      },
    });

    // Import edges
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecValue = importDecl.getModuleSpecifierValue();
      const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile();
      if (resolvedSourceFile && isProjectSourceFile(resolvedSourceFile)) {
        edges.push({
          id: nextEdgeId(),
          source: relPath,
          target: toRelPath(resolvedSourceFile.getFilePath()),
          kind: 'imports',
          label: moduleSpecValue,
        });
      }
    }

    // Visit named declarations
    visitDeclarations(sourceFile, fId);
  }

  return {
    symbols,
    edges,
    metadata: {
      projectRoot: rootPath,
      fileCount: symbols.filter((s) => s.kind === 'file').length,
      symbolCount: symbols.length,
      edgeCount: edges.length,
      analysedAt: new Date().toISOString(),
    },
  };

  function nodeToSymbolKind(node: TsMorph.Node): string {
    if (Node.isClassDeclaration(node)) return 'class';
    if (Node.isInterfaceDeclaration(node)) return 'interface';
    if (Node.isEnumDeclaration(node)) return 'enum';
    if (Node.isFunctionDeclaration(node)) return 'function';
    if (Node.isMethodDeclaration(node)) return 'method';
    if (Node.isPropertyDeclaration(node) || Node.isPropertySignature(node)) return 'property';
    if (Node.isConstructorDeclaration(node)) return 'constructor';
    if (Node.isVariableDeclaration(node)) {
      const stmt = node.getVariableStatement();
      if (stmt && stmt.getDeclarationKind() === VariableDeclarationKind.Const) return 'constant';
      return 'variable';
    }
    if (Node.isTypeAliasDeclaration(node)) return 'type-alias';
    if (Node.isEnumMember(node)) return 'enum-member';
    if (Node.isModuleDeclaration(node)) return 'namespace';
    return 'unknown';
  }

  function visitDeclarations(container: TsMorph.Node, parentSymbolId: string): void {
    for (const child of container.getChildren()) {
      processNode(child, parentSymbolId);
    }
  }

  function processNode(node: TsMorph.Node, parentSymbolId: string): void {
    const isNamedDecl =
      Node.isClassDeclaration(node) ||
      Node.isInterfaceDeclaration(node) ||
      Node.isEnumDeclaration(node) ||
      Node.isFunctionDeclaration(node) ||
      Node.isMethodDeclaration(node) ||
      Node.isPropertyDeclaration(node) ||
      Node.isPropertySignature(node) ||
      Node.isConstructorDeclaration(node) ||
      Node.isVariableDeclaration(node) ||
      Node.isTypeAliasDeclaration(node) ||
      Node.isEnumMember(node) ||
      Node.isModuleDeclaration(node);

    if (!isNamedDecl) {
      for (const child of node.getChildren()) {
        processNode(child, parentSymbolId);
      }
      return;
    }

    const name = getNodeName(node);
    const loc = getLocationFromNode(node);
    const relPath = toRelPath(node.getSourceFile().getFilePath());
    const symId = makeId(relPath, name, loc.startLine);
    const kind = nodeToSymbolKind(node);

    symbols.push({
      id: symId,
      name,
      kind,
      location: loc,
      parentId: parentSymbolId,
    });

    edges.push({
      id: nextEdgeId(),
      source: parentSymbolId,
      target: symId,
      kind: 'contains',
    });

    // Heritage clauses (extends / implements)
    if (Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node)) {
      collectHeritageEdges(node, symId);
    }

    // Call edges for functions / methods / constructors
    if (
      Node.isFunctionDeclaration(node) ||
      Node.isMethodDeclaration(node) ||
      Node.isConstructorDeclaration(node)
    ) {
      collectCallEdges(node, symId);
    }

    // Type reference edges
    collectTypeReferenceEdges(node, symId);

    // Recurse into child declarations
    for (const child of node.getChildren()) {
      processNode(child, symId);
    }
  }

  function getNodeName(node: TsMorph.Node): string {
    if (Node.isConstructorDeclaration(node)) return 'constructor';
    const sym = node.getSymbol();
    return sym?.getName() ?? '<anonymous>';
  }

  function collectHeritageEdges(
    node: import('ts-morph').ClassDeclaration | import('ts-morph').InterfaceDeclaration,
    symId: string,
  ): void {
    for (const clause of node.getHeritageClauses()) {
      const edgeKind = clause.getToken() === SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
      for (const typeNode of clause.getTypeNodes()) {
        const targetId = resolveSymbolTarget(typeNode.getExpression());
        if (targetId) {
          edges.push({
            id: nextEdgeId(),
            source: symId,
            target: targetId,
            kind: edgeKind,
            label: typeNode.getExpression().getText(),
          });
        }
      }
    }
  }

  function collectCallEdges(node: TsMorph.Node, callerSymbolId: string): void {
    node.forEachDescendant((descendant) => {
      if (!Node.isCallExpression(descendant) && !Node.isNewExpression(descendant)) return;
      const expr = descendant.getExpression();
      const targetId = resolveSymbolTarget(expr);
      if (targetId) {
        edges.push({
          id: nextEdgeId(),
          source: callerSymbolId,
          target: targetId,
          kind: 'calls',
          label: expr.getText(),
        });
      }
    });
  }

  function collectTypeReferenceEdges(node: TsMorph.Node, ownerSymbolId: string): void {
    const currentFile = toRelPath(node.getSourceFile().getFilePath());
    const seenTargets = new Set<string>();

    function addRefEdge(typeNode: TsMorph.Node, label: string): void {
      const targetId = resolveSymbolTarget(typeNode);
      if (!targetId || seenTargets.has(targetId)) return;
      const targetFile = targetId.split('::')[0];
      if (targetFile === currentFile) return;
      seenTargets.add(targetId);
      edges.push({
        id: nextEdgeId(),
        source: ownerSymbolId,
        target: targetId,
        kind: 'references',
        label,
      });
    }

    // Function / method parameters and return type
    if (
      Node.isFunctionDeclaration(node) ||
      Node.isMethodDeclaration(node) ||
      Node.isConstructorDeclaration(node)
    ) {
      for (const param of node.getParameters()) {
        const typeNode = param.getTypeNode();
        if (typeNode) addRefEdge(typeNode, param.getName());
      }
      if (!Node.isConstructorDeclaration(node)) {
        const returnTypeNode = node.getReturnTypeNode();
        if (returnTypeNode) addRefEdge(returnTypeNode, 'return');
      }
    }

    // Variable / property type annotations
    if (
      Node.isVariableDeclaration(node) ||
      Node.isPropertyDeclaration(node) ||
      Node.isPropertySignature(node)
    ) {
      const typeNode = node.getTypeNode();
      if (typeNode) addRefEdge(typeNode, node.getName());
    }

    // Type alias — walk references inside the type
    if (Node.isTypeAliasDeclaration(node)) {
      const typeNode = node.getTypeNode();
      if (typeNode) walkTypeNode(typeNode);
    }

    function walkTypeNode(tn: TsMorph.Node): void {
      if (Node.isTypeReference(tn)) {
        addRefEdge(tn, tn.getText());
      }
      if (Node.isUnionTypeNode(tn) || Node.isIntersectionTypeNode(tn)) {
        for (const member of tn.getTypeNodes()) walkTypeNode(member);
      }
      if (Node.isArrayTypeNode(tn)) walkTypeNode(tn.getElementTypeNode());
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
