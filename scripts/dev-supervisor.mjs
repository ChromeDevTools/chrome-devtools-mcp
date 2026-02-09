#!/usr/bin/env node
/**
 * Dev Supervisor for VS Code DevTools MCP Server
 *
 * This script:
 * 1. Runs tsc to compile the TypeScript source
 * 2. Spawns the compiled MCP server as a child process
 * 3. Proxies stdio between VS Code and the child
 * 4. Watches src/ for .ts file changes
 * 5. On change: kills child, recompiles, respawns
 *
 * VS Code never loses the stdio connection — this supervisor owns the pipe.
 */

import {spawn, execSync} from 'node:child_process';
import {watch} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname); // vscode-devtools-mcp/
const workspaceRoot = dirname(projectRoot); // workspace root with compile script
const srcDir = join(projectRoot, 'src');
const buildEntry = join(projectRoot, 'build', 'src', 'index.js');

// Pass through all args to the child
const childArgs = [buildEntry, ...process.argv.slice(2)];

const log = msg => process.stderr.write(`[dev-supervisor] ${msg}\n`);

let child = null;
let restarting = false;
let debounceTimer = null;
let compiling = false;

function compile() {
  if (compiling) return false;
  compiling = true;
  try {
    log('Compiling TypeScript...');
    execSync('pnpm run compile', {
      cwd: workspaceRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    log('Compilation complete');
    compiling = false;
    return true;
  } catch (err) {
    log(`Compilation failed: ${err.message}`);
    if (err.stderr) log(err.stderr.toString());
    compiling = false;
    return false;
  }
}

function spawnChild() {
  const proc = spawn(process.execPath, childArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  child = proc;

  // Forward stdin → child (MCP requests from VS Code)
  const onStdinData = chunk => {
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(chunk);
    }
  };
  process.stdin.on('data', onStdinData);

  // Forward child stdout → stdout (MCP responses to VS Code)
  proc.stdout?.on('data', chunk => {
    process.stdout.write(chunk);
  });

  proc.on('exit', (code, signal) => {
    process.stdin.removeListener('data', onStdinData);
    if (restarting) {
      // Expected kill during restart — compile and respawn
      restarting = false;
      if (compile()) {
        log('Respawning MCP server...');
        spawnChild();
      } else {
        log('Waiting for next file change to retry...');
      }
    } else {
      // Unexpected exit — propagate
      log(`Child exited: code=${code}, signal=${signal}`);
      process.exit(code ?? 1);
    }
  });

  log(`MCP server started (PID: ${proc.pid})`);
}

function restartChild() {
  if (!child) return;
  restarting = true;
  log('Killing MCP server for restart...');
  child.kill('SIGTERM');
  // If SIGTERM doesn't work after 2s, force kill (Windows compatibility)
  setTimeout(() => {
    if (restarting && child && !child.killed) {
      log('Force killing with SIGKILL...');
      child.kill('SIGKILL');
    }
  }, 2000);
}

// Watch source directory for .ts changes
watch(srcDir, {recursive: true}, (_event, filename) => {
  if (!filename?.toString().endsWith('.ts')) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    log(`File changed: ${filename}`);
    restartChild();
  }, 300);
});

// Clean exit when VS Code disconnects
process.stdin.on('end', () => {
  log('stdin ended — killing child process');
  child?.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
});

log(`Watching ${srcDir} for changes...`);

// Initial compile and start
if (compile()) {
  spawnChild();
} else {
  log('Initial compilation failed. Fix errors and save a file to retry.');
  // Keep running to watch for file changes
}
