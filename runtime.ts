/**
 * VS Code DevTools (vscode-devtools) - Runtime
 *
 * GUI features loaded dynamically by extension.ts:
 * - Workspace Root tree view — Git workspace picker
 * - Graph Visualizer (Sigma.js webview, opened via command palette)
 * - Language Model tool registrations (native VS Code toggle)
 *
 * Terminal management is handled by client-handlers.ts (Client role).
 * If this module fails to load, the extension enters Safe Mode.
 */

import * as vscode from 'vscode';
import {
    ProjectTreeProvider,
    setProjectTreeProvider,
    ASTGraphWebviewProvider,
    GraphVisualizerProvider,
} from './gui';
import { OutputReadTool } from './services/readHostOutputTool';
import {
    TerminalReadTool,
    TerminalExecuteTool,
} from './services/terminalLmTools';
import { WaitTool } from './services/waitLmTool';
import { McpStatusTool } from './services/mcpStatusTool';
import { getUserActionTracker, disposeUserActionTracker } from './services/userActionTracker';

// ============================================================================
// View Constants
// ============================================================================

const Views = {
    Container: 'vscdt',
    Project: 'vscdt.project',
};

// ============================================================================
// Runtime Activation
// ============================================================================

export async function activate(context: vscode.ExtensionContext) {
    console.log('[vscode-devtools:runtime] Runtime module loading...');

    const trackedDisposables: vscode.Disposable[] = [];
    const track = <T extends vscode.Disposable>(disposable: T): T => {
        trackedDisposables[trackedDisposables.length] = disposable;
        return disposable;
    };

    context.subscriptions.push(
        new vscode.Disposable(() => {
            for (let i = trackedDisposables.length - 1; i >= 0; i--) {
                try {
                    trackedDisposables[i].dispose();
                } catch {
                    // Ignore disposal errors
                }
            }
        }),
    );

    // ========================================================================
    // Workspace Root Tree View — Git workspace picker
    // ========================================================================

    const projectTreeProvider = new ProjectTreeProvider();
    setProjectTreeProvider(projectTreeProvider);

    const projectTreeView = vscode.window.createTreeView(Views.Project, {
        treeDataProvider: projectTreeProvider,
        canSelectMany: false,
    });
    track(projectTreeView);
    track({ dispose: () => projectTreeProvider.dispose() });

    track(vscode.commands.registerCommand('vscode-devtools.refreshProjectTree', () => {
        projectTreeProvider.refresh();
    }));

    track(vscode.commands.registerCommand('vscode-devtools.selectWorkspace', (item) => {
        projectTreeProvider.selectWorkspace(item);
    }));

    // ========================================================================
    // LM Tool Registration (all registered unconditionally, native toggle)
    // ========================================================================

    track(vscode.lm.registerTool('output_read', new OutputReadTool()));
    track(vscode.lm.registerTool('terminal_read', new TerminalReadTool()));
    track(vscode.lm.registerTool('terminal_execute', new TerminalExecuteTool()));
    track(vscode.lm.registerTool('wait', new WaitTool()));
    track(vscode.lm.registerTool('mcpStatus', new McpStatusTool()));
    console.log('[vscode-devtools:runtime] All LM tools registered');

    // ========================================================================
    // AST Graph Webview
    // ========================================================================

    const astGraphProvider = new ASTGraphWebviewProvider(context);
    track(vscode.commands.registerCommand('vscode-devtools.showASTGraph', () => {
        astGraphProvider.show();
    }));

    // ========================================================================
    // Graph Visualizer (webview-only, no sidebar tree view)
    // ========================================================================

    const graphVisualizerProvider = new GraphVisualizerProvider();
    astGraphProvider.setGraphVisualizer(graphVisualizerProvider);

    track(vscode.commands.registerCommand('vscode-devtools.graphVisualizer.refresh', () => {
        graphVisualizerProvider.doAction('refresh');
    }));
    track(vscode.commands.registerCommand('vscode-devtools.graphVisualizer.fit', () => {
        graphVisualizerProvider.doAction('fit');
    }));
    track(vscode.commands.registerCommand('vscode-devtools.graphVisualizer.zoomIn', () => {
        graphVisualizerProvider.doAction('zoomIn');
    }));
    track(vscode.commands.registerCommand('vscode-devtools.graphVisualizer.zoomOut', () => {
        graphVisualizerProvider.doAction('zoomOut');
    }));
    track(vscode.commands.registerCommand('vscode-devtools.graphVisualizer.search', () => {
        graphVisualizerProvider.doSearch();
    }));
    track(vscode.commands.registerCommand('vscode-devtools.graphVisualizer.setLayout', (layoutId: string) => {
        graphVisualizerProvider.setLayout(layoutId);
    }));

    // ========================================================================
    // User Action Tracker (detect user interventions)
    // ========================================================================

    getUserActionTracker();
    track({ dispose: () => disposeUserActionTracker() });
    console.log('[vscode-devtools:runtime] User action tracker initialized');

    console.log('[vscode-devtools:runtime] Runtime activation complete');
}

export async function deactivate() {
    console.log('[vscode-devtools:runtime] Runtime deactivating...');
}