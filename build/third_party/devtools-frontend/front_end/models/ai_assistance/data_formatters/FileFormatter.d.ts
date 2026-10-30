import * as Bindings from '../../bindings/bindings.js';
import * as Logs from '../../logs/logs.js';
import type * as Workspace from '../../workspace/workspace.js';
export interface FormatFileOptions {
    /**
     * Character offset in the file content to start reading from. Defaults to 0.
     * Callers that expose paging to the model pass the offset from a previous
     * truncation notice. An offset at or past the end of the content produces an
     * empty code block, so callers must validate offsets they receive from the model.
     */
    offset?: number;
}
/**
 * File that formats a file for the LLM usage.
 */
export declare class FileFormatter {
    #private;
    static formatSourceMapDetails(selectedFile: Workspace.UISourceCode.UISourceCode, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding): string;
    constructor(file: Workspace.UISourceCode.UISourceCode, debuggerWorkspaceBinding?: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, networkLog?: Logs.NetworkLog.NetworkLog);
    formatFile(options?: FormatFileOptions): string;
}
