// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../core/common/common.js';
import * as Host from '../core/host/host.js';
import * as Root from '../core/root/root.js';
import * as SDK from '../core/sdk/sdk.js';
import * as AiAssistance from '../models/ai_assistance/ai_assistance.js';
import * as AutofillManager from '../models/autofill_manager/autofill_manager.js';
import * as Badges from '../models/badges/badges.js';
import * as Bindings from '../models/bindings/bindings.js';
import * as Breakpoints from '../models/breakpoints/breakpoints.js';
import * as ChangeTracker from '../models/change_tracker/change_tracker.js';
import * as CommentManager from '../models/comment_manager/comment_manager.js';
import * as CrUXManager from '../models/crux-manager/crux-manager.js';
import * as Emulation from '../models/emulation/emulation.js';
import * as IssuesManager from '../models/issues_manager/issues_manager.js';
import * as JavaScriptMetadata from '../models/javascript_metadata/javascript_metadata.js';
import * as LiveMetrics from '../models/live-metrics/live-metrics.js';
import * as Logs from '../models/logs/logs.js';
import * as Persistence from '../models/persistence/persistence.js';
import * as ProjectSettings from '../models/project_settings/project_settings.js';
import * as SourceMapScopes from '../models/source_map_scopes/source_map_scopes.js';
import * as Workspace from '../models/workspace/workspace.js';
import * as WorkspaceDiff from '../models/workspace_diff/workspace_diff.js';
export class Universe {
    // TODO(crbug.com/493763857): Once a singleton is no longer a singleton (i.e. it has no 'instance')
    //                            static method, we can move it out of the `DevToolsContext` and store it
    //                            directly on the `Universe`.
    context;
    autofillManager;
    cd4aBridge = null;
    supportsEmulation;
    initAutomaticFilesystem;
    fileSystemWorkspaceBinding;
    constructor(options) {
        const context = new Root.DevToolsContext.WritableDevToolsContext();
        this.context = context;
        const console = new Common.Console.Console();
        context.set(Common.Console.Console, console);
        const hostConfigTracker = new Host.AidaClient.HostConfigTracker();
        context.set(Host.AidaClient.HostConfigTracker, hostConfigTracker);
        const gdpClient = new Host.GdpClient.GdpClient();
        context.set(Host.GdpClient.GdpClient, gdpClient);
        // TODO(crbug.com/458180550): Store instance only on this.context instead.
        //                            For now the global is required as not everything in foundation cleanly
        //                            reads from the scoped `Settings` instance.
        const settings = Common.Settings.Settings.instance({
            forceNew: true,
            console,
            ...options.settingsCreationOptions,
        });
        context.set(Common.Settings.Settings, settings);
        const emulatedDevicesList = new Emulation.EmulatedDevices.EmulatedDevicesList(settings);
        context.set(Emulation.EmulatedDevices.EmulatedDevicesList, emulatedDevicesList);
        const isolatedFileSystemManager = new Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager(settings, console);
        context.set(Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager, isolatedFileSystemManager);
        const targetManager = new SDK.TargetManager.TargetManager(context, options.overrideAutoStartModels);
        context.set(SDK.TargetManager.TargetManager, targetManager);
        const frameManager = new SDK.FrameManager.FrameManager(targetManager);
        context.set(SDK.FrameManager.FrameManager, frameManager);
        const multitargetNetworkManager = new SDK.NetworkManager.MultitargetNetworkManager(targetManager);
        context.set(SDK.NetworkManager.MultitargetNetworkManager, multitargetNetworkManager);
        this.supportsEmulation = options.supportsEmulation;
        let deviceModeModel = null;
        if (options.supportsEmulation) {
            deviceModeModel =
                new Emulation.DeviceModeModel.DeviceModeModel(targetManager, settings, multitargetNetworkManager);
            context.set(Emulation.DeviceModeModel.DeviceModeModel, deviceModeModel);
        }
        const pageResourceLoader = new SDK.PageResourceLoader.PageResourceLoader(targetManager, settings, multitargetNetworkManager, null);
        context.set(SDK.PageResourceLoader.PageResourceLoader, pageResourceLoader);
        this.initAutomaticFilesystem = options.initAutomaticFilesystem ?? false;
        let automaticFileSystemManager = null;
        let projectSettingsModel = null;
        if (this.initAutomaticFilesystem) {
            projectSettingsModel = new ProjectSettings.ProjectSettingsModel.ProjectSettingsModel(pageResourceLoader, targetManager);
            context.set(ProjectSettings.ProjectSettingsModel.ProjectSettingsModel, projectSettingsModel);
            automaticFileSystemManager = new Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager(options.inspectorFrontendHost, projectSettingsModel);
            context.set(Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager, automaticFileSystemManager);
        }
        const cpuThrottlingManager = new SDK.CPUThrottlingManager.CPUThrottlingManager(settings, targetManager);
        context.set(SDK.CPUThrottlingManager.CPUThrottlingManager, cpuThrottlingManager);
        const domDebuggerManager = new SDK.DOMDebuggerModel.DOMDebuggerManager(targetManager);
        context.set(SDK.DOMDebuggerModel.DOMDebuggerManager, domDebuggerManager);
        const cruxManager = new CrUXManager.CrUXManager(targetManager, settings);
        context.set(CrUXManager.CrUXManager, cruxManager);
        const isolateManager = new SDK.IsolateManager.IsolateManager(targetManager);
        context.set(SDK.IsolateManager.IsolateManager, isolateManager);
        const eventBreakpointsManager = new SDK.EventBreakpointsModel.EventBreakpointsManager(targetManager);
        context.set(SDK.EventBreakpointsModel.EventBreakpointsManager, eventBreakpointsManager);
        const domModelUndoStack = new SDK.DOMModel.DOMModelUndoStack();
        context.set(SDK.DOMModel.DOMModelUndoStack, domModelUndoStack);
        const workspace = new Workspace.Workspace.WorkspaceImpl();
        context.set(Workspace.Workspace.WorkspaceImpl, workspace);
        const fileManager = new Workspace.FileManager.FileManager();
        context.set(Workspace.FileManager.FileManager, fileManager);
        if (automaticFileSystemManager) {
            const automaticFileSystemWorkspaceBinding = new Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding(automaticFileSystemManager, isolatedFileSystemManager, workspace);
            context.set(Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding, automaticFileSystemWorkspaceBinding);
        }
        this.fileSystemWorkspaceBinding =
            new Persistence.FileSystemWorkspaceBinding.FileSystemWorkspaceBinding(isolatedFileSystemManager, workspace);
        context.set(Persistence.FileSystemWorkspaceBinding.FileSystemWorkspaceBinding, this.fileSystemWorkspaceBinding);
        const ignoreListManager = new Workspace.IgnoreListManager.IgnoreListManager(settings, targetManager);
        context.set(Workspace.IgnoreListManager.IgnoreListManager, ignoreListManager);
        const resourceMapping = new Bindings.ResourceMapping.ResourceMapping(targetManager, workspace);
        const cssWorkspaceBinding = new Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding(resourceMapping, targetManager);
        context.set(Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding, cssWorkspaceBinding);
        const debuggerWorkspaceBinding = new Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding(resourceMapping, targetManager, ignoreListManager, workspace);
        context.set(Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, debuggerWorkspaceBinding);
        const scopeChainResolver = new SourceMapScopes.ScopeChainResolver.ScopeChainResolver(targetManager, debuggerWorkspaceBinding);
        context.set(SourceMapScopes.ScopeChainResolver.ScopeChainResolver, scopeChainResolver);
        const presentationConsoleMessageManager = new Bindings.PresentationConsoleMessageHelper.PresentationConsoleMessageManager(targetManager, workspace, debuggerWorkspaceBinding, cssWorkspaceBinding);
        context.set(Bindings.PresentationConsoleMessageHelper.PresentationConsoleMessageManager, presentationConsoleMessageManager);
        const networkProjectManager = new Bindings.NetworkProject.NetworkProjectManager();
        context.set(Bindings.NetworkProject.NetworkProjectManager, networkProjectManager);
        const breakpointManager = new Breakpoints.BreakpointManager.BreakpointManager(targetManager, workspace, debuggerWorkspaceBinding, settings);
        context.set(Breakpoints.BreakpointManager.BreakpointManager, breakpointManager);
        const persistence = new Persistence.Persistence.PersistenceImpl(workspace, breakpointManager);
        context.set(Persistence.Persistence.PersistenceImpl, persistence);
        const networkPersistenceManager = new Persistence.NetworkPersistenceManager.NetworkPersistenceManager(workspace, persistence, breakpointManager, targetManager, settings, isolatedFileSystemManager, multitargetNetworkManager);
        context.set(Persistence.NetworkPersistenceManager.NetworkPersistenceManager, networkPersistenceManager);
        const workspaceDiff = new WorkspaceDiff.WorkspaceDiff.WorkspaceDiffImpl(workspace, persistence, networkPersistenceManager, settings);
        context.set(WorkspaceDiff.WorkspaceDiff.WorkspaceDiffImpl, workspaceDiff);
        const networkLog = new Logs.NetworkLog.NetworkLog(targetManager, settings);
        context.set(Logs.NetworkLog.NetworkLog, networkLog);
        const logManager = new Logs.LogManager.LogManager(targetManager, networkLog);
        context.set(Logs.LogManager.LogManager, logManager);
        const issuesManager = new IssuesManager.IssuesManager.IssuesManager(IssuesManager.Issue.getShowThirdPartyIssuesSetting(settings), IssuesManager.IssuesManager.getHideIssueByCodeSetting(settings), frameManager, targetManager, workspace, debuggerWorkspaceBinding, cssWorkspaceBinding);
        context.set(IssuesManager.IssuesManager.IssuesManager, issuesManager);
        const domIssuesManager = new IssuesManager.DOMIssuesManager.DOMIssuesManager(issuesManager, targetManager);
        context.set(IssuesManager.DOMIssuesManager.DOMIssuesManager, domIssuesManager);
        const javaScriptMetadata = new JavaScriptMetadata.JavaScriptMetadata.JavaScriptMetadataImpl();
        context.set(JavaScriptMetadata.JavaScriptMetadata.JavaScriptMetadataImpl, javaScriptMetadata);
        const liveMetrics = new LiveMetrics.LiveMetrics(targetManager, settings, deviceModeModel);
        context.set(LiveMetrics.LiveMetrics, liveMetrics);
        const userBadges = new Badges.UserBadges(settings, gdpClient, options.inspectorFrontendHost);
        context.set(Badges.UserBadges, userBadges);
        const aiHistoryStorage = new AiAssistance.AiHistoryStorage.AiHistoryStorage(settings);
        context.set(AiAssistance.AiHistoryStorage.AiHistoryStorage, aiHistoryStorage);
        const builtInAi = new AiAssistance.BuiltInAi.BuiltInAi();
        context.set(AiAssistance.BuiltInAi.BuiltInAi, builtInAi);
        const commentManager = new CommentManager.CommentManager.CommentManager();
        context.set(CommentManager.CommentManager.CommentManager, commentManager);
        if (options.hostConfig.devToolsComments?.enabled ?? Root.Runtime.hostConfig.devToolsComments?.enabled) {
            this.cd4aBridge = new CommentManager.CD4ABridge.CD4ABridge(commentManager, targetManager, networkLog);
            context.set(CommentManager.CD4ABridge.CD4ABridge, this.cd4aBridge);
        }
        const changeTracker = new ChangeTracker.ChangeTracker.ChangeTracker(commentManager);
        context.set(ChangeTracker.ChangeTracker.ChangeTracker, changeTracker);
        this.autofillManager = new AutofillManager.AutofillManager.AutofillManager(targetManager, frameManager);
        context.set(AutofillManager.AutofillManager.AutofillManager, this.autofillManager);
    }
    // TODO(crbug.com/542394587): Should be `Symbol.dispose`
    dispose() {
        // TODO(crbug.com/542394587): Track these in a DisposableStack.
        this.cd4aBridge?.dispose();
        this.context.get(Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager).dispose();
        if (this.initAutomaticFilesystem) {
            this.context.get(Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager).dispose();
        }
        this.context.get(Workspace.FileManager.FileManager).dispose();
        this.context.get(SDK.TargetManager.TargetManager).dispose();
    }
    get automaticFileSystemManager() {
        return this.context.get(Persistence.AutomaticFileSystemManager.AutomaticFileSystemManager);
    }
    get automaticFileSystemWorkspaceBinding() {
        return this.context.get(Persistence.AutomaticFileSystemWorkspaceBinding.AutomaticFileSystemWorkspaceBinding);
    }
    get aiHistoryStorage() {
        return this.context.get(AiAssistance.AiHistoryStorage.AiHistoryStorage);
    }
    get builtInAi() {
        return this.context.get(AiAssistance.BuiltInAi.BuiltInAi);
    }
    get breakpointManager() {
        return this.context.get(Breakpoints.BreakpointManager.BreakpointManager);
    }
    get changeTracker() {
        return this.context.get(ChangeTracker.ChangeTracker.ChangeTracker);
    }
    get commentManager() {
        return this.context.get(CommentManager.CommentManager.CommentManager);
    }
    get cpuThrottlingManager() {
        return this.context.get(SDK.CPUThrottlingManager.CPUThrottlingManager);
    }
    get cruxManager() {
        return this.context.get(CrUXManager.CrUXManager);
    }
    get cssWorkspaceBinding() {
        return this.context.get(Bindings.CSSWorkspaceBinding.CSSWorkspaceBinding);
    }
    get debuggerWorkspaceBinding() {
        return this.context.get(Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding);
    }
    // The DeviceModeModel may not be present, as emulation is only present for the `devtools_app` entrypoint, but not for the others.
    get deviceModeModel() {
        return this.supportsEmulation ? this.context.get(Emulation.DeviceModeModel.DeviceModeModel) : null;
    }
    get domDebuggerManager() {
        return this.context.get(SDK.DOMDebuggerModel.DOMDebuggerManager);
    }
    get domIssuesManager() {
        return this.context.get(IssuesManager.DOMIssuesManager.DOMIssuesManager);
    }
    get domModelUndoStack() {
        return this.context.get(SDK.DOMModel.DOMModelUndoStack);
    }
    get emulatedDevicesList() {
        return this.context.get(Emulation.EmulatedDevices.EmulatedDevicesList);
    }
    get eventBreakpointsManager() {
        return this.context.get(SDK.EventBreakpointsModel.EventBreakpointsManager);
    }
    get fileManager() {
        return this.context.get(Workspace.FileManager.FileManager);
    }
    get gdpClient() {
        return this.context.get(Host.GdpClient.GdpClient);
    }
    get hostConfigTracker() {
        return this.context.get(Host.AidaClient.HostConfigTracker);
    }
    get isolatedFileSystemManager() {
        return this.context.get(Persistence.IsolatedFileSystemManager.IsolatedFileSystemManager);
    }
    get isolateManager() {
        return this.context.get(SDK.IsolateManager.IsolateManager);
    }
    get issuesManager() {
        return this.context.get(IssuesManager.IssuesManager.IssuesManager);
    }
    get networkPersistenceManager() {
        return this.context.get(Persistence.NetworkPersistenceManager.NetworkPersistenceManager);
    }
    get networkProjectManager() {
        return this.context.get(Bindings.NetworkProject.NetworkProjectManager);
    }
    get liveMetrics() {
        return this.context.get(LiveMetrics.LiveMetrics);
    }
    get frameManager() {
        return this.context.get(SDK.FrameManager.FrameManager);
    }
    get pageResourceLoader() {
        return this.context.get(SDK.PageResourceLoader.PageResourceLoader);
    }
    get persistence() {
        return this.context.get(Persistence.Persistence.PersistenceImpl);
    }
    get presentationConsoleMessageManager() {
        return this.context.get(Bindings.PresentationConsoleMessageHelper.PresentationConsoleMessageManager);
    }
    get projectSettingsModel() {
        return this.initAutomaticFilesystem ? this.context.get(ProjectSettings.ProjectSettingsModel.ProjectSettingsModel) :
            null;
    }
    get scopeChainResolver() {
        return this.context.get(SourceMapScopes.ScopeChainResolver.ScopeChainResolver);
    }
    get settings() {
        return this.context.get(Common.Settings.Settings);
    }
    get targetManager() {
        return this.context.get(SDK.TargetManager.TargetManager);
    }
    get userBadges() {
        return this.context.get(Badges.UserBadges);
    }
    get workspace() {
        return this.context.get(Workspace.Workspace.WorkspaceImpl);
    }
    get workspaceDiff() {
        return this.context.get(WorkspaceDiff.WorkspaceDiff.WorkspaceDiffImpl);
    }
    get(ctor) {
        return this.context.get(ctor);
    }
}
//# sourceMappingURL=Universe.js.map