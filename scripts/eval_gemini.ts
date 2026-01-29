/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

import {GoogleGenAI, mcpToTool} from '@google/genai';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

import {TestServer} from '../build/tests/server.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SCENARIOS_DIR = path.join(import.meta.dirname, 'eval_scenarios');
const SKILL_PATH = path.join(ROOT_DIR, 'skills', 'chrome-devtools', 'SKILL.md');

// Define schema for our test scenarios
export interface CapturedFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TestScenario {
  prompt: string;
  maxTurns: number;
  expectations: (calls: CapturedFunctionCall[]) => void;
  htmlRoute?: {
    path: string;
    htmlContent: string;
  };
}

async function loadScenario(scenarioPath: string): Promise<TestScenario> {
  const module = await import(scenarioPath);
  if (!module.scenario) {
    throw new Error(
      `Scenario file ${scenarioPath} does not export a 'scenario' object.`,
    );
  }
  return module.scenario;
}

async function runSingleScenario(
  scenarioPath: string,
  apiKey: string,
  server: TestServer,
  modelId: string,
  debug: boolean,
  includeSkill: boolean,
): Promise<void> {
  const debugLog = (...args: unknown[]) => {
    if (debug) {
      console.log(...args);
    }
  };
  const absolutePath = path.resolve(scenarioPath);
  debugLog(
    `\n### Running Scenario: ${path.relative(ROOT_DIR, absolutePath)} ###`,
  );

  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;

  try {
    const loadedScenario = await loadScenario(absolutePath);
    const scenario = {...loadedScenario};

    // Prepend skill content if requested
    if (includeSkill) {
      if (!fs.existsSync(SKILL_PATH)) {
        throw new Error(
          `Skill file not found at ${SKILL_PATH}. Please ensure the skill file exists.`,
        );
      }
      const skillContent = fs.readFileSync(SKILL_PATH, 'utf-8');
      scenario.prompt = `${skillContent}\n\n---\n\n${scenario.prompt}`;
    }

    // Append random queryid to avoid caching issues and test distinct runs
    const randomId = Math.floor(Math.random() * 1000000);
    scenario.prompt = `${scenario.prompt}\nqueryid=${randomId}`;

    if (scenario.htmlRoute) {
      server.addHtmlRoute(
        scenario.htmlRoute.path,
        scenario.htmlRoute.htmlContent,
      );
      scenario.prompt = scenario.prompt.replace(
        '<TEST_URL>',
        server.getRoute(scenario.htmlRoute.path),
      );
    }

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

    const args = [serverPath];
    if (!debug) {
      args.push('--headless');
    }

    transport = new StdioClientTransport({
      command: 'node',
      args,
      env,
      stderr: debug ? 'inherit' : 'ignore',
    });

    client = new Client(
      {name: 'gemini-eval-client', version: '1.0.0'},
      {capabilities: {}},
    );

    await client.connect(transport);

    const allCalls: CapturedFunctionCall[] = [];
    const originalCallTool = client.callTool.bind(client);
    client.callTool = async (request, schema) => {
      // NOTE: request.name is the original name as the MCP client sees it.
      // mcpToTool handles the conversion from Gemini sanitized name to original name.
      debugLog(
        `Executing tool: ${request.name} with args: ${JSON.stringify(request.arguments)}`,
      );
      allCalls.push({
        name: request.name,
        args: (request.arguments as Record<string, unknown>) || {},
      });
      return originalCallTool(request, schema);
    };

    const ai = new GoogleGenAI({apiKey});

    debugLog(`\n--- Prompt ---\n${scenario.prompt}`);

    const result = await ai.models.generateContent({
      model: modelId,
      contents: scenario.prompt,
      config: {
        tools: [mcpToTool(client)],
        automaticFunctionCalling: {
          maximumRemoteCalls: scenario.maxTurns,
        },
      },
    });

    debugLog(`\n--- Response ---\n${result.text}`);

    debugLog('\nVerifying expectations...');
    scenario.expectations(allCalls);
  } finally {
    try {
      await client?.close();
    } catch (e) {
      console.error('Error closing client:', e);
    }
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }

  const {values, positionals} = parseArgs({
    options: {
      model: {
        type: 'string',
        default: 'gemini-2.5-flash',
      },
      debug: {
        type: 'boolean',
        default: false,
      },
      repeat: {
        type: 'boolean',
        default: false,
      },
      'include-skill': {
        type: 'boolean',
        default: false,
      },
    },
    allowPositionals: true,
  });

  const modelId = values.model;
  const debug = values.debug;
  const repeat = values.repeat;
  const includeSkill = values['include-skill'];

  const scenarioFiles =
    positionals.length > 0
      ? positionals.map(p => path.resolve(p))
      : fs
          .readdirSync(SCENARIOS_DIR)
          .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
          .map(file => path.join(SCENARIOS_DIR, file));

  const server = new TestServer(TestServer.randomPort());
  await server.start();

  let successCount = 0;
  let failureCount = 0;

  try {
    for (const scenarioPath of scenarioFiles) {
      for (let i = 1; i <= (repeat ? 3 : 1); i++) {
        try {
          if (debug) {
            console.log(
              `Running scenario: ${path.relative(ROOT_DIR, scenarioPath)} (Run ${i}/3)`,
            );
          }
          await runSingleScenario(
            scenarioPath,
            apiKey,
            server,
            modelId,
            debug,
            includeSkill,
          );
          console.log(`✔ ${path.relative(ROOT_DIR, scenarioPath)} (Run ${i})`);
          successCount++;
        } catch (e) {
          console.error(
            `✖ ${path.relative(ROOT_DIR, scenarioPath)} (Run ${i})`,
          );
          console.error(e);
          failureCount++;
        } finally {
          server.restore();
        }
      }
    }
  } finally {
    await server.stop();
  }

  console.log(`\nSummary: ${successCount} passed, ${failureCount} failed`);

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
