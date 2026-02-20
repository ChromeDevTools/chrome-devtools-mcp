/**
 * bootstrap.js — Plain JavaScript, DO NOT convert to TypeScript
 * 
 * Safe Mode core: this file MUST always load successfully.
 * It creates a named pipe JSON-RPC 2.0 server with a pluggable handler registry.
 * 
 * Used by both Host and Client roles — role detection happens in extension.ts
 */

const net = require('net');
const fs = require('fs');

const handlers = new Map();
let server = null;
let currentSocketPath = null;

/**
 * Register an RPC handler for a method name
 * @param {string} method - Method name (e.g., 'terminal.create')
 * @param {function} fn - Handler function that receives params and returns result
 */
function registerHandler(method, fn) {
  handlers.set(method, fn);
}

/**
 * Unregister an RPC handler
 * @param {string} method - Method name to unregister
 */
function unregisterHandler(method) {
  handlers.delete(method);
}

/**
 * Handle an incoming connection
 * @param {net.Socket} conn - The socket connection
 */
function handleConnection(conn) {
  let buffer = '';
  let connAlive = true;
  conn.setEncoding('utf8');

  conn.on('data', (chunk) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        processLine(conn, line, () => connAlive);
      }
    }
  });

  conn.on('error', (err) => {
    connAlive = false;
  });

  conn.on('close', () => {
    connAlive = false;
  });
}

/**
 * Process a single JSON-RPC request line
 * @param {net.Socket} conn - The socket to write response to
 * @param {string} line - The JSON-RPC request string
 */
async function processLine(conn, line, isConnAlive) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    safeWrite(conn, isConnAlive, null, { code: -32700, message: 'Parse error' });
    return;
  }

  const id = request?.id ?? null;
  const method = request?.method;

  if (!method) {
    safeWrite(conn, isConnAlive, id, { code: -32600, message: 'Invalid request: missing method' });
    return;
  }

  // system.ping is built-in — always responds, even in Safe Mode
  if (method === 'system.ping') {
    const registeredMethods = Array.from(handlers.keys());
    writeResult(conn, id, { alive: true, registeredMethods });
    return;
  }

  const handler = handlers.get(method);
  if (!handler) {
    safeWrite(conn, isConnAlive, id, { code: -32601, message: `Method not found: ${method}` });
    return;
  }

  try {
    const result = await handler(request.params ?? {});
    if (!isConnAlive()) {
      console.log(`[bootstrap] ${method} completed but caller disconnected — response dropped`);
      return;
    }
    writeResult(conn, id, result);
    console.log(`[bootstrap] ${method} completed — response sent`);
  } catch (err) {
    console.log(`[bootstrap] ${method} handler error: ${err?.message ?? err}`);
    if (!isConnAlive()) {
      console.log(`[bootstrap] ${method} caller already disconnected — error response dropped`);
      return;
    }
    try {
      writeResponse(conn, id, { 
        code: -32603, 
        message: String(err?.message ?? err) 
      });
    } catch {
      // conn is truly dead — nothing more we can do
    }
  }
}

/**
 * Safely write a JSON-RPC error — check conn alive first
 */
function safeWrite(conn, isConnAlive, id, error) {
  if (!isConnAlive()) return;
  try {
    writeResponse(conn, id, error);
  } catch {
    // conn is dead
  }
}

/**
 * Write a successful JSON-RPC result
 * @param {net.Socket} conn - Socket to write to
 * @param {*} id - Request ID
 * @param {*} result - Result object
 */
function writeResult(conn, id, result) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  conn.write(response + '\n');
}

/**
 * Write a JSON-RPC error response
 * @param {net.Socket} conn - Socket to write to
 * @param {*} id - Request ID
 * @param {{code: number, message: string}} error - Error object
 */
function writeResponse(conn, id, error) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error });
  conn.write(response + '\n');
}

/**
 * Start the pipe server
 * @param {string} socketPath - The named pipe path (e.g., \\.\pipe\vscode-devtools-host)
 * @returns {Promise<{socketPath: string}>} Resolves when server is listening
 */
function startServer(socketPath) {
  return new Promise((resolve, reject) => {
    // Clean up existing socket file on Unix (Windows pipes are auto-cleaned)
    if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    server = net.createServer(handleConnection);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Another instance already has this pipe — reject so caller knows
        reject(err);
      } else {
        reject(err);
      }
    });

    server.listen(socketPath, () => {
      currentSocketPath = socketPath;
      resolve({ socketPath });
    });
  });
}

/**
 * Stop the pipe server
 */
function stopServer() {
  if (server) {
    server.close();
    server = null;
    currentSocketPath = null;
  }
}

/**
 * Get the current socket path
 * @returns {string|null}
 */
function getSocketPath() {
  return currentSocketPath;
}

module.exports = {
  registerHandler,
  unregisterHandler,
  startServer,
  stopServer,
  getSocketPath
};
