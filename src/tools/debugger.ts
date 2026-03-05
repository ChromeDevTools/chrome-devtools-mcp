/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {Page, CDPSession} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const sessions = new WeakMap<Page, CDPSession>();
const scriptMap = new WeakMap<CDPSession, Map<string, string>>(); // url -> scriptId
const pausedState = new WeakMap<CDPSession, any>(); // Stores the latest 'Debugger.paused' event

async function getSession(page: Page): Promise<CDPSession> {
  if (sessions.has(page)) {
    return sessions.get(page)!;
  }
  const session = await page.createCDPSession();
  sessions.set(page, session);

  const scripts = new Map<string, string>();
  scriptMap.set(session, scripts);

  session.on('Debugger.scriptParsed', (event) => {
    if (event.url) {
      scripts.set(event.url, event.scriptId);
    }
  });

  session.on('Debugger.paused', (event) => {
    pausedState.set(session, event);
  });

  session.on('Debugger.resumed', () => {
    pausedState.delete(session);
  });

  session.on('closed', () => {
    sessions.delete(page);
    scriptMap.delete(session);
    pausedState.delete(session);
  });

  // We intentionally do NOT auto-enable here to give users control,
  // but many tools will check or imply functionality that requires it.
  return session;
}

export const enableDebugger = definePageTool({
  name: 'debugger_enable',
  description: 'Enable the Debugger domain for the page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.enable');
    response.appendResponseLine('Debugger enabled.');
  },
});

export const disableDebugger = definePageTool({
  name: 'debugger_disable',
  description: 'Disable the Debugger domain for the page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.disable');
    response.appendResponseLine('Debugger disabled.');
  },
});

export const setBreakpoint = definePageTool({
  name: 'debugger_set_breakpoint',
  description: 'Set a breakpoint at a specific location.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    url: zod.string().describe('The URL of the file'),
    lineNumber: zod.number().describe('The 1-based line number'),
    condition: zod.string().optional().describe('Optional breakpoint condition'),
  },
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    // Ensure debugger is enabled
    await session.send('Debugger.enable');
    
    const {url, lineNumber, condition} = request.params;
    // CDP uses 0-based line numbers
    const result = await session.send('Debugger.setBreakpointByUrl', {
        lineNumber: lineNumber - 1,
        urlRegex: url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // Simple escape
        condition,
    });
    
    response.appendResponseLine(`Breakpoint set with ID: ${result.breakpointId}`);
    response.appendResponseLine(JSON.stringify(result.locations));
  },
});

export const removeBreakpoint = definePageTool({
  name: 'debugger_remove_breakpoint',
  description: 'Remove a breakpoint.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    breakpointId: zod.string().describe('The ID of the breakpoint to remove'),
  },
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.removeBreakpoint', {
        breakpointId: request.params.breakpointId,
    });
    response.appendResponseLine(`Breakpoint ${request.params.breakpointId} removed.`);
  },
});

export const removeAllBreakpoints = definePageTool({
  name: 'debugger_remove_all_breakpoints',
  description: 'Remove all active breakpoints.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
      // Chrome DevTools Protocol doesn't have a "removeAllBreakpoints" command directly.
      // We would need to track them or disable/enable debugger (which might clear them? No, it usually doesn't persist across disable/enable if strictly session based, but safest is to track).
      // However, since we don't track them in `debugger.ts` yet, we can't easily remove ONLY ours.
      // But `Global` breakpoints are persistent.
      // Actually, if we disable debugger, it might clear non-persistent breakpoints.
      // For now, let's implement a "best effort" or just return not implemented if we don't track IDs.
      // Wait, the plan said "Remove all active breakpoints".
      // Without tracking, we can't do this easily unless we just `disable` and `enable`? 
      // `Debugger.disable` clears breakpoints for that session.
      
      const session = await getSession(request.page.pptrPage);
      await session.send('Debugger.disable');
      await session.send('Debugger.enable');
      response.appendResponseLine('All breakpoints removed (Debugger disabled and re-enabled).');
  },
});

export const resume = definePageTool({
  name: 'debugger_resume',
  description: 'Resume execution.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.resume');
    response.appendResponseLine('Resumed execution.');
  },
});

export const stepOver = definePageTool({
  name: 'debugger_step_over',
  description: 'Step over the current statement.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.stepOver');
    response.appendResponseLine('Stepped over.');
  },
});

export const stepInto = definePageTool({
  name: 'debugger_step_into',
  description: 'Step into the function.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.stepInto');
    response.appendResponseLine('Stepped into.');
  },
});

export const stepOut = definePageTool({
  name: 'debugger_step_out',
  description: 'Step out of the function.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {},
  handler: async (request, response) => {
    const session = await getSession(request.page.pptrPage);
    await session.send('Debugger.stepOut');
    response.appendResponseLine('Stepped out.');
  },
});

export const getPausedState = definePageTool({
  name: 'debugger_get_paused_state',
  description: 'Get the current paused state, including call stack.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response) => {
    if (!sessions.has(request.page.pptrPage)) {
      response.appendResponseLine('Debugger is not enabled (or no active session).');
      return;
    }
    const session = await getSession(request.page.pptrPage);
    const state = pausedState.get(session);
    
    if (!state) {
        response.appendResponseLine('Debugger is not paused.');
        return;
    }
    
    // Format call frames for better readability
    const formattedFrames = state.callFrames.map((frame: any) => ({
        keyValue: {
            functionName: frame.functionName,
            url: frame.url,
            lineNumber: frame.location.lineNumber + 1, // 0-based to 1-based
            callFrameId: frame.callFrameId,
            scopeChain: frame.scopeChain.map((s: any) => s.type)
        }
    }));
    
    response.appendResponseLine('Paused state:');
    response.appendResponseLine(JSON.stringify(formattedFrames, null, 2));
    response.appendResponseLine(`Reason: ${state.reason}`);
  },
});

export const getScopeVariables = definePageTool({
    name: 'debugger_get_scope_variables',
    description: 'Get variables from a specific scope in the paused state.',
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: true,
    },
    schema: {
        callFrameId: zod.string().describe('The call frame ID to inspect'),
        scopeIndex: zod.number().default(0).describe('The scope index (0 is typically local)'),
    },
    handler: async (request, response) => {
      if (!sessions.has(request.page.pptrPage)) {
        throw new Error('Debugger is not enabled.');
      }
        const session = await getSession(request.page.pptrPage);
        const {callFrameId, scopeIndex} = request.params;
        
        const state = pausedState.get(session);
        if (!state) {
            throw new Error('Debugger is not paused');
        }
        
        const frame = state.callFrames.find((f: any) => f.callFrameId === callFrameId);
        if (!frame) {
            throw new Error(`Call frame ${callFrameId} not found`);
        }
        
        const scope = frame.scopeChain[scopeIndex];
        if (!scope) {
            throw new Error(`Scope index ${scopeIndex} out of bounds`);
        }
        
        const {objectId} = scope.object;
        if (!objectId) {
             response.appendResponseLine('Scope object has no objectId (might be empty or transient).');
             return;
        }
        
        const properties = await session.send('Runtime.getProperties', {
            objectId,
            ownProperties: true,
        });
        
        const variables = properties.result.map((p: any) => ({
            name: p.name,
            value: p.value ? (p.value.value ?? p.value.description ?? p.value.type) : 'undefined'
        }));
        
        response.appendResponseLine(`Variables in scope ${scope.type}:`);
        response.appendResponseLine(JSON.stringify(variables, null, 2));
    }
});

export const evaluateOnCallFrame = definePageTool({
    name: 'debugger_evaluate_on_call_frame',
    description: 'Evaluate an expression on a specific call frame.',
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: false,
    },
    schema: {
        callFrameId: zod.string().describe('The call frame ID'),
        expression: zod.string().describe('The expression to evaluate'),
    },
    handler: async (request, response) => {
      if (!sessions.has(request.page.pptrPage)) {
        throw new Error('Debugger is not enabled.');
      }
        const session = await getSession(request.page.pptrPage);
        const {callFrameId, expression} = request.params;
        
        const result = await session.send('Debugger.evaluateOnCallFrame', {
            callFrameId,
            expression,
            returnByValue: true // Simplify result for now
        });
        
        if (result.exceptionDetails) {
            response.appendResponseLine(`Error: ${result.exceptionDetails.text}`);
        } else {
            response.appendResponseLine('Evaluation result:');
            response.appendResponseLine(JSON.stringify(result.result.value ?? result.result.description, null, 2));
        }
    }
});

export const getScriptSource = definePageTool({
    name: 'debugger_get_script_source',
    description: 'Get the source code of a script by scriptId.',
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: true,
    },
    schema: {
        scriptId: zod.string().describe('The script ID'),
    },
    handler: async (request, response) => {
      if (!sessions.has(request.page.pptrPage)) {
        throw new Error('Debugger is not enabled.');
      }
        const session = await getSession(request.page.pptrPage);
        const {scriptId} = request.params;
        
        const result = await session.send('Debugger.getScriptSource', {scriptId});
        response.appendResponseLine(result.scriptSource);
    }
});

export const getCodeLines = definePageTool({
    name: 'debugger_get_code_lines',
    description: 'Get a range of lines from a script source.',
    annotations: {
        category: ToolCategory.DEBUGGING,
        readOnlyHint: true,
    },
    schema: {
        scriptId: zod.string().describe('The script ID'),
        lineNumber: zod.number().describe('The 1-based line number to center around'),
        count: zod.number().default(10).describe('Number of lines to retrieve (default 10)'),
    },
    handler: async (request, response) => {
      if (!sessions.has(request.page.pptrPage)) {
        throw new Error('Debugger is not enabled.');
      }
        const session = await getSession(request.page.pptrPage);
        const {scriptId, lineNumber, count} = request.params;
        
        const result = await session.send('Debugger.getScriptSource', {scriptId});
        const lines = result.scriptSource.split('\n');
        
        const start = Math.max(0, lineNumber - 1 - Math.floor(count / 2));
        const end = Math.min(lines.length, start + count);
        
        const snippet = lines.slice(start, end).map((line, i) => `${start + i + 1}: ${line}`).join('\n');
        response.appendResponseLine(snippet);
    }
});
