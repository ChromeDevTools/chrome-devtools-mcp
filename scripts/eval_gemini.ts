/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, test} from 'node:test';

import {
  GoogleGenerativeAI,
  type FunctionDeclaration,
  SchemaType,
} from '@google/generative-ai';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SCENARIOS_DIR = path.join(import.meta.dirname, 'eval_scenarios');

// Define schema for our test scenarios
export interface CapturedFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TestScenario {
  prompt: string;
  maxTurns: number;
  expectations: (calls: CapturedFunctionCall[]) => void;
}

async function loadScenario(scenarioPath: string): Promise<TestScenario> {
  // Dynamic import of the test scenario
  // We assume the test file exports a 'scenario' object
  const module = await import(scenarioPath);
  if (!module.scenario) {
    throw new Error(
      `Scenario file ${scenarioPath} does not export a 'scenario' object.`,
    );
  }
  return module.scenario;
}

// Helper to sanitize schema for Gemini
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const cleanSchemaRecursive = (schema: unknown): unknown => {
  if (!isRecord(schema)) {
    return schema;
  }

  const out: Record<string, unknown> = {};
  for (const key in schema) {
    if (
      key === 'default' ||
      key === 'additionalProperties' ||
      key === 'exclusiveMinimum'
    ) {
      continue;
    }

    const value = schema[key];
    if (Array.isArray(value)) {
      out[key] = value.map(cleanSchemaRecursive);
    } else if (isRecord(value)) {
      out[key] = cleanSchemaRecursive(value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

async function runSingleScenario(
  scenarioPath: string,
  apiKey: string,
): Promise<void> {
  const absolutePath = path.resolve(scenarioPath);
  console.log(`\n### Running Scenario: ${absolutePath} ###`);

  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;

  try {
    const scenario = await loadScenario(absolutePath);

    // Path to the compiled MCP server
    const serverPath = path.join(ROOT_DIR, 'build/src/index.js');
    if (!fs.existsSync(serverPath)) {
      throw new Error(
        `MCP server not found at ${serverPath}. Please run 'npm run build' first.`,
      );
    }

    // Environment variables
    const env: Record<string, string> = {};
    Object.entries(process.env).forEach(([key, value]) => {
      if (value !== undefined) {
        env[key] = value;
      }
    });

    transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env,
    });

    client = new Client(
      {name: 'gemini-eval-client', version: '1.0.0'},
      {capabilities: {}},
    );

    await client.connect(transport);

    const toolsResult = await client.listTools();
    const mcpTools = toolsResult.tools;

    // Convert MCP tools to Gemini function declarations
    const functionDeclarations: FunctionDeclaration[] = mcpTools.map(tool => ({
      name: tool.name.replace(/-/g, '_').replace(/\./g, '_'), // Sanitize name for Gemini
      description: tool.description?.substring(0, 1024) || '',
      parameters: cleanSchemaRecursive({
        type: SchemaType.OBJECT,
        properties:
          isRecord(tool.inputSchema) && 'properties' in tool.inputSchema
            ? tool.inputSchema.properties
            : {},
        required:
          isRecord(tool.inputSchema) &&
          'required' in tool.inputSchema &&
          Array.isArray(tool.inputSchema.required)
            ? tool.inputSchema.required
            : [],
      }) as FunctionDeclaration['parameters'],
    }));

    // Keep a map of sanitized names to original names for execution
    const contentToolsMap = new Map<string, string>();
    for (const tool of mcpTools) {
      const sanitized = tool.name.replace(/-/g, '_').replace(/\./g, '_');
      contentToolsMap.set(sanitized, tool.name);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
      tools: [{functionDeclarations}],
    });

    const chat = model.startChat({
      systemInstruction: {
        role: 'system',
        parts: [{text: `Use available tools.`}],
      },
    });

    const expectations = scenario.expectations;
    const allCalls: CapturedFunctionCall[] = [];

    // Execute turns
    let turnCount = 0;
    console.log(`\n--- Turn 1 (User) ---`);
    console.log(scenario.prompt);

    let result = await chat.sendMessage(scenario.prompt);
    let response = result.response;

    while (turnCount < scenario.maxTurns) {
      turnCount++;
      console.log(`\n--- Turn ${turnCount} (Model) ---`);
      const text = response.text();
      if (text) {
        console.log(`Text: ${text}`);
      }

      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        console.log(
          `Function Calls: ${JSON.stringify(functionCalls, null, 2)}`,
        );

        const functionResponses = [];
        for (const call of functionCalls) {
          const originalName = contentToolsMap.get(call.name);
          if (!originalName) {
            console.error(`Unknown tool called: ${call.name}`);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: {error: `Unknown tool: ${call.name}`},
              },
            });
            continue;
          }

          const safeArgs = isRecord(call.args) ? call.args : {};

          console.log(
            `Executing tool: ${originalName} with args: ${JSON.stringify(call.args)}`,
          );

          allCalls.push({
            name: originalName,
            args: safeArgs,
          });

          try {
            const toolResult = await client.callTool({
              name: originalName,
              arguments: safeArgs,
            });

            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: {name: call.name, content: toolResult},
              },
            });
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error(`Error executing tool ${originalName}:`, e);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: {error: errorMessage},
              },
            });
          }
        }

        // Send tool results back
        console.log(`Sending ${functionResponses.length} tool outputs back...`);
        result = await chat.sendMessage(functionResponses);
        response = result.response;
      } else {
        console.log('No tool calls. Interaction finished.');
        break;
      }
    }

    console.log('\nVerifying expectations...');
    expectations(allCalls);
  } finally {
    await client?.close();
    await transport?.close();
  }
}
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required.');
}

void describe('Gemini Eval Scenarios', () => {
  const files = fs.readdirSync(SCENARIOS_DIR).filter(file => {
    return file.endsWith('.ts') || file.endsWith('.js');
  });

  for (const file of files) {
    void test(file, async () => {
      await runSingleScenario(path.join(SCENARIOS_DIR, file), apiKey);
    });
  }
});
