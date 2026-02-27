/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const debuggerEnable = definePageTool({
  name: 'debugger_enable',
  description:
    'Enable the JavaScript debugger for the current page. Must be called before setting breakpoints or using other debugger tools.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    await context.enableDebugger(request.page);
    response.appendResponseLine('Debugger enabled for the current page.');
  },
});

export const debuggerDisable = definePageTool({
  name: 'debugger_disable',
  description:
    'Disable the JavaScript debugger for the current page. Removes all breakpoints and resumes execution if paused.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    await context.disableDebugger(request.page);
    response.appendResponseLine('Debugger disabled.');
  },
});

export const setBreakpoint = definePageTool({
  name: 'set_breakpoint',
  description:
    'Set a breakpoint at a specific URL and line number. The debugger must be enabled first.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('The URL of the script to set the breakpoint in.'),
    lineNumber: zod
      .number()
      .int()
      .describe('0-based line number to set the breakpoint at.'),
    columnNumber: zod
      .number()
      .int()
      .optional()
      .describe('0-based column number to set the breakpoint at.'),
    condition: zod
      .string()
      .optional()
      .describe('Expression that must evaluate to true for the breakpoint to pause.'),
  },
  handler: async (request, response, context) => {
    const {url, lineNumber, columnNumber, condition} = request.params;
    const info = await context.setBreakpoint(
      request.page,
      url,
      lineNumber,
      columnNumber,
      condition,
    );
    response.appendResponseLine(`Breakpoint set: ${info.breakpointId}`);
    if (info.locations.length > 0) {
      response.appendResponseLine('Resolved locations:');
      for (const loc of info.locations) {
        response.appendResponseLine(
          `  scriptId=${loc.scriptId} line=${loc.lineNumber} col=${loc.columnNumber}`,
        );
      }
    }
  },
});

export const removeBreakpoint = definePageTool({
  name: 'remove_breakpoint',
  description: 'Remove a breakpoint by its ID.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    breakpointId: zod.string().describe('The ID of the breakpoint to remove.'),
  },
  handler: async (request, response, context) => {
    await context.removeBreakpoint(request.page, request.params.breakpointId);
    response.appendResponseLine('Breakpoint removed.');
  },
});
export const listBreakpoints = definePageTool({
  name: 'list_breakpoints',
  description: 'List all active breakpoints for the current page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const breakpoints = context.getBreakpoints(request.page);
    if (breakpoints.length === 0) {
      response.appendResponseLine('No active breakpoints.');
      return;
    }
    response.appendResponseLine(`Active breakpoints (${breakpoints.length}):`);
    for (const bp of breakpoints) {
      response.appendResponseLine(
        `  ${bp.breakpointId}: ${bp.url}:${bp.lineNumber}${bp.condition ? ` (condition: ${bp.condition})` : ''}`,
      );
    }
  },
});
export const getPausedState = definePageTool({
  name: 'get_paused_state',
  description:
    'Get the current debugger paused state including call frames, pause reason, and hit breakpoints.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const state = context.getDebuggerPausedState(request.page);
    if (!state) {
      response.appendResponseLine('Debugger is not paused.');
      return;
    }
    response.appendResponseLine(`Paused. Reason: ${state.reason}`);
    if (state.hitBreakpoints?.length) {
      response.appendResponseLine(
        `Hit breakpoints: ${state.hitBreakpoints.join(', ')}`,
      );
    }
    response.appendResponseLine(`Call frames (${state.callFrames.length}):`);
    for (const frame of state.callFrames) {
      response.appendResponseLine(
        `  [${frame.callFrameId}] ${frame.functionName || '(anonymous)'} at ${frame.url}:${frame.lineNumber}:${frame.columnNumber}`,
      );
      for (const scope of frame.scopeChain) {
        response.appendResponseLine(
          `    scope: ${scope.type}${scope.name ? ` (${scope.name})` : ''}`,
        );
      }
    }
  },
});
export const debuggerResume = definePageTool({
  name: 'debugger_resume',
  description: 'Resume execution after being paused at a breakpoint.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    await context.resumeDebugger(request.page);
    response.appendResponseLine('Execution resumed.');
  },
});
export const debuggerStepOver = definePageTool({
  name: 'debugger_step_over',
  description: 'Step over the current statement while paused.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    await context.stepOver(request.page);
    response.appendResponseLine('Stepped over.');
  },
});
export const debuggerStepInto = definePageTool({
  name: 'debugger_step_into',
  description: 'Step into the next function call while paused.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    await context.stepInto(request.page);
    response.appendResponseLine('Stepped into.');
  },
});
export const debuggerStepOut = definePageTool({
  name: 'debugger_step_out',
  description: 'Step out of the current function while paused.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response, context) => {
    await context.stepOut(request.page);
    response.appendResponseLine('Stepped out.');
  },
});
export const evaluateOnCallFrame = definePageTool({
  name: 'evaluate_on_call_frame',
  description:
    'Evaluate an expression in the context of a specific call frame while paused at a breakpoint.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    callFrameId: zod
      .string()
      .describe('The ID of the call frame from get_paused_state.'),
    expression: zod
      .string()
      .describe('JavaScript expression to evaluate.'),
  },
  handler: async (request, response, context) => {
    const {callFrameId, expression} = request.params;
    const result = await context.evaluateOnCallFrame(
      request.page,
      callFrameId,
      expression,
    );
    response.appendResponseLine('Result:');
    response.appendResponseLine('```json');
    response.appendResponseLine(result);
    response.appendResponseLine('```');
  },
});
export const getScriptSource = definePageTool({
  name: 'get_script_source',
  description:
    'Get the source code of a script by its ID. Use list_scripts to find script IDs.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    scriptId: zod.string().describe('The script ID to get source for.'),
  },
  handler: async (request, response, context) => {
    const source = await context.getScriptSource(
      request.page,
      request.params.scriptId,
    );
    response.appendResponseLine('```javascript');
    response.appendResponseLine(source);
    response.appendResponseLine('```');
  },
});
export const listScripts = definePageTool({
  name: 'list_scripts',
  description:
    'List all scripts loaded in the current page. Useful for finding script IDs for breakpoints.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    filter: zod
      .string()
      .optional()
      .describe('Optional substring to filter scripts by URL.'),
  },
  handler: async (request, response, context) => {
    let scripts = context.getDebuggerScripts(request.page);
    const {filter} = request.params;
    if (filter) {
      scripts = scripts.filter(s => s.url.includes(filter));
    }
    if (scripts.length === 0) {
      response.appendResponseLine('No scripts found.');
      return;
    }
    response.appendResponseLine(`Scripts (${scripts.length}):`);
    for (const s of scripts) {
      response.appendResponseLine(
        `  [${s.scriptId}] ${s.url}`,
      );
    }
  },
});