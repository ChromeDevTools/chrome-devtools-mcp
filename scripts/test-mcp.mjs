#!/usr/bin/env node
/**
 * MCP E2E Test Runner
 *
 * MCP SDK Client + StdioClientTransport to test the full MCP protocol layer:
 *   TestScript -> MCP Client (JSON-RPC/stdio) -> MCP Server -> Tool -> fast-chat.ts -> Extension -> AI
 *
 * Usage:
 *   npm run test:mcp                    # All tests
 *   npm run test:mcp -- --chatgpt       # ChatGPT only
 *   npm run test:mcp -- --gemini        # Gemini only
 *   npm run test:mcp -- --parallel      # Parallel (both) only
 *   npm run test:mcp -- --tools-only    # Tool listing verification only (no AI calls)
 *   npm run test:mcp -- --debug         # Show server stderr output
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Validation utilities (same logic as test-suite.mjs) ---

/**
 * Extract keywords from a question for relevance checking
 */
function extractKeywords(question) {
  const keywords = [];
  const englishTerms = question.match(/[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*/g) || [];
  for (const term of englishTerms) {
    if (term.length >= 2) keywords.push(term.toLowerCase());
  }
  const katakanaTerms = question.match(/[ァ-ヶー]+/g) || [];
  for (const term of katakanaTerms) {
    if (term.length >= 2) keywords.push(term);
  }
  return [...new Set(keywords)];
}

/**
 * Calculate relevance between question and answer
 */
function calculateRelevance(question, answer) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return 1;
  const answerLower = answer.toLowerCase();
  const matched = keywords.filter((kw) => answerLower.includes(kw.toLowerCase()));
  return matched.length / keywords.length;
}

// --- CLI args ---
const args = process.argv.slice(2);
const flagChatgpt = args.includes('--chatgpt');
const flagGemini = args.includes('--gemini');
const flagParallel = args.includes('--parallel');
const flagToolsOnly = args.includes('--tools-only');
const flagDebug = args.includes('--debug');

// If no filter flags, run all
const runAll = !flagChatgpt && !flagGemini && !flagParallel && !flagToolsOnly;

// --- Constants ---
const TOOL_CALL_TIMEOUT_MS = 90_000;
const SERVER_STARTUP_TIMEOUT_MS = 10_000;

const EXPECTED_TOOLS = [
  'ask_chatgpt_web',
  'ask_gemini_web',
  'ask_chatgpt_gemini_web',
  'take_cdp_snapshot',
  'get_page_dom',
];

// Natural-sounding test questions (avoid BAN-triggering patterns)
const TEST_QUESTIONS = {
  chatgpt: 'How do I deep copy an object in JavaScript? Include a code example.',
  gemini: 'Explain the difference between concurrency and parallelism briefly.',
  parallel: 'What are the main advantages of using TypeScript over plain JavaScript?',
};

// --- Server stderr capture ---
const serverLogs = [];

// --- Utilities ---
function log(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.error(`[${ts}] ${msg}`);
}

/**
 * Start MCP server and connect client
 */
async function startServer() {
  const mockPath = path.join(__dirname, 'browser-globals-mock.mjs');
  const mainPath = path.join(__dirname, '..', 'build', 'src', 'main.js');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', mockPath, mainPath],
    stderr: 'pipe',
  });

  // Capture stderr
  transport.stderr?.on('data', (chunk) => {
    const line = chunk.toString().trim();
    if (line) {
      serverLogs.push(line);
      if (flagDebug) {
        logError(`[server] ${line}`);
      }
    }
  });

  const client = new Client({
    name: 'test-mcp',
    version: '1.0.0',
  });

  // Connect with timeout
  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Server startup timed out after ${SERVER_STARTUP_TIMEOUT_MS}ms`)), SERVER_STARTUP_TIMEOUT_MS)
  );

  await Promise.race([connectPromise, timeoutPromise]);

  return { client, transport };
}

/**
 * Call a tool with timeout
 */
async function callToolWithTimeout(client, toolName, toolArgs) {
  const callPromise = client.callTool({ name: toolName, arguments: toolArgs });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Tool call '${toolName}' timed out after ${TOOL_CALL_TIMEOUT_MS}ms`)), TOOL_CALL_TIMEOUT_MS)
  );
  return Promise.race([callPromise, timeoutPromise]);
}

/**
 * Extract text from MCP tool result
 */
function extractText(result) {
  if (!result?.content || !Array.isArray(result.content)) {
    return '';
  }
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

/**
 * Parse parallel response into { chatgpt, gemini } parts
 *
 * The ask_chatgpt_gemini_web tool returns text with "ChatGPT:" and "Gemini:" labels.
 */
function parseParallelResponse(text) {
  const result = { chatgpt: '', gemini: '' };

  // Split by ChatGPT:/Gemini: labels
  const chatgptMatch = text.match(/ChatGPT:\s*([\s\S]*?)(?=\nGemini:|$)/i);
  const geminiMatch = text.match(/Gemini:\s*([\s\S]*?)$/i);

  if (chatgptMatch) result.chatgpt = chatgptMatch[1].trim();
  if (geminiMatch) result.gemini = geminiMatch[1].trim();

  // Fallback: if no labels found, treat entire text as both
  if (!result.chatgpt && !result.gemini && text.length > 0) {
    result.chatgpt = text;
    result.gemini = text;
  }

  return result;
}

// --- Test functions ---

/**
 * Test: Verify tool listing
 */
async function testToolListing(client) {
  const name = 'tools/list';
  log(`Test: ${name}`);

  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name);

  const missing = EXPECTED_TOOLS.filter((t) => !toolNames.includes(t));
  const extra = toolNames.filter((t) => !EXPECTED_TOOLS.includes(t));

  const passed = missing.length === 0;

  log(`  Registered tools (${toolNames.length}): ${toolNames.join(', ')}`);
  if (missing.length > 0) {
    log(`  MISSING: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    log(`  Extra (OK): ${extra.join(', ')}`);
  }

  // Verify each tool has a description and inputSchema
  let schemaOk = true;
  for (const tool of tools) {
    if (!tool.description) {
      log(`  WARNING: ${tool.name} has no description`);
      schemaOk = false;
    }
    if (!tool.inputSchema) {
      log(`  WARNING: ${tool.name} has no inputSchema`);
      schemaOk = false;
    }
  }

  return { name, passed: passed && schemaOk, missing, extra, toolCount: toolNames.length };
}

/**
 * Test: ChatGPT via MCP
 */
async function testChatGPT(client) {
  const name = 'ask_chatgpt_web';
  const question = TEST_QUESTIONS.chatgpt;
  log(`Test: ${name}`);
  log(`  Question: "${question}"`);

  const startMs = Date.now();
  const result = await callToolWithTimeout(client, 'ask_chatgpt_web', { question });
  const elapsedMs = Date.now() - startMs;

  const text = extractText(result);
  const isError = result?.isError === true;

  // Validate
  const hasAnswer = text.length > 50;
  const relevance = calculateRelevance(question, text);
  const relevanceOk = relevance >= 0.2;
  const passed = !isError && hasAnswer && relevanceOk;

  log(`  Time: ${elapsedMs}ms`);
  log(`  Answer length: ${text.length} chars`);
  log(`  Relevance: ${Math.round(relevance * 100)}%`);
  log(`  Preview: "${text.slice(0, 80)}..."`);
  if (isError) log(`  ERROR: Response marked as error`);

  return { name, passed, elapsedMs, answerLength: text.length, relevance, isError };
}

/**
 * Test: Gemini via MCP
 */
async function testGemini(client) {
  const name = 'ask_gemini_web';
  const question = TEST_QUESTIONS.gemini;
  log(`Test: ${name}`);
  log(`  Question: "${question}"`);

  const startMs = Date.now();
  const result = await callToolWithTimeout(client, 'ask_gemini_web', { question });
  const elapsedMs = Date.now() - startMs;

  const text = extractText(result);
  const isError = result?.isError === true;

  const hasAnswer = text.length > 50;
  const relevance = calculateRelevance(question, text);
  const relevanceOk = relevance >= 0.2;
  const passed = !isError && hasAnswer && relevanceOk;

  log(`  Time: ${elapsedMs}ms`);
  log(`  Answer length: ${text.length} chars`);
  log(`  Relevance: ${Math.round(relevance * 100)}%`);
  log(`  Preview: "${text.slice(0, 80)}..."`);
  if (isError) log(`  ERROR: Response marked as error`);

  return { name, passed, elapsedMs, answerLength: text.length, relevance, isError };
}

/**
 * Test: Parallel (ChatGPT + Gemini) via MCP
 */
async function testParallel(client) {
  const name = 'ask_chatgpt_gemini_web';
  const question = TEST_QUESTIONS.parallel;
  log(`Test: ${name}`);
  log(`  Question: "${question}"`);

  const startMs = Date.now();
  const result = await callToolWithTimeout(client, 'ask_chatgpt_gemini_web', { question });
  const elapsedMs = Date.now() - startMs;

  const text = extractText(result);
  const isError = result?.isError === true;

  const parts = parseParallelResponse(text);
  const chatgptOk = parts.chatgpt.length > 30;
  const geminiOk = parts.gemini.length > 30;

  const chatgptRelevance = calculateRelevance(question, parts.chatgpt);
  const geminiRelevance = calculateRelevance(question, parts.gemini);

  const passed = !isError && chatgptOk && geminiOk;

  log(`  Time: ${elapsedMs}ms`);
  log(`  ChatGPT: ${parts.chatgpt.length} chars, relevance ${Math.round(chatgptRelevance * 100)}%`);
  log(`  Gemini: ${parts.gemini.length} chars, relevance ${Math.round(geminiRelevance * 100)}%`);
  if (!chatgptOk) log(`  WARNING: ChatGPT answer too short`);
  if (!geminiOk) log(`  WARNING: Gemini answer too short`);
  if (isError) log(`  ERROR: Response marked as error`);

  return {
    name, passed, elapsedMs, isError,
    chatgpt: { length: parts.chatgpt.length, relevance: chatgptRelevance },
    gemini: { length: parts.gemini.length, relevance: geminiRelevance },
  };
}

// --- Main ---

async function main() {
  console.log('');
  console.log('================================================');
  console.log('  MCP E2E Test Runner');
  console.log('================================================');
  console.log('');

  const filters = [];
  if (flagChatgpt) filters.push('chatgpt');
  if (flagGemini) filters.push('gemini');
  if (flagParallel) filters.push('parallel');
  if (flagToolsOnly) filters.push('tools-only');
  if (runAll) filters.push('all');
  log(`Filters: ${filters.join(', ')}`);
  log(`Debug: ${flagDebug ? 'ON' : 'OFF'}`);
  console.log('');

  // Start MCP server
  log('Starting MCP server via StdioClientTransport...');
  let client;
  let transport;
  try {
    ({ client, transport } = await startServer());
    log('MCP server connected');
  } catch (error) {
    logError(`Failed to start MCP server: ${error.message}`);
    if (serverLogs.length > 0) {
      console.error('\nServer logs:');
      for (const line of serverLogs.slice(-20)) {
        console.error(`  ${line}`);
      }
    }
    process.exit(1);
  }

  const results = [];

  try {
    // Always run tool listing test
    const toolResult = await testToolListing(client);
    results.push(toolResult);
    console.log(toolResult.passed ? '  -> PASS' : '  -> FAIL');
    console.log('');

    if (!flagToolsOnly) {
      // ChatGPT test
      if (runAll || flagChatgpt) {
        try {
          const r = await testChatGPT(client);
          results.push(r);
          console.log(r.passed ? '  -> PASS' : '  -> FAIL');
          console.log('');
        } catch (error) {
          log(`  ERROR: ${error.message}`);
          results.push({ name: 'ask_chatgpt_web', passed: false, error: error.message });
          console.log('  -> FAIL');
          console.log('');
        }
      }

      // Gemini test
      if (runAll || flagGemini) {
        try {
          const r = await testGemini(client);
          results.push(r);
          console.log(r.passed ? '  -> PASS' : '  -> FAIL');
          console.log('');
        } catch (error) {
          log(`  ERROR: ${error.message}`);
          results.push({ name: 'ask_gemini_web', passed: false, error: error.message });
          console.log('  -> FAIL');
          console.log('');
        }
      }

      // Parallel test
      if (runAll || flagParallel) {
        try {
          const r = await testParallel(client);
          results.push(r);
          console.log(r.passed ? '  -> PASS' : '  -> FAIL');
          console.log('');
        } catch (error) {
          log(`  ERROR: ${error.message}`);
          results.push({ name: 'ask_chatgpt_gemini_web', passed: false, error: error.message });
          console.log('  -> FAIL');
          console.log('');
        }
      }
    }
  } finally {
    // Shutdown
    log('Shutting down MCP server...');
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
    log('Server shut down');
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('');
  console.log('================================================');
  console.log('  Results');
  console.log('================================================');
  console.log('');

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    const extra = r.elapsedMs ? ` (${r.elapsedMs}ms)` : '';
    console.log(`  [${icon}] ${r.name}${extra}`);
  }

  console.log('');
  console.log(`  Total: ${total}  Passed: ${passed}  Failed: ${failed}`);
  console.log('');

  // Show server logs on failure
  if (failed > 0 && serverLogs.length > 0 && !flagDebug) {
    console.log('Server stderr (last 20 lines):');
    for (const line of serverLogs.slice(-20)) {
      console.log(`  ${line}`);
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
