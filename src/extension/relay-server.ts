/**
 * RelayServer - WebSocket server for Extension communication
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';

// デバッグログをファイルに出力
const DEBUG_LOG_PATH = '/tmp/relay-server-debug.log';
function debugLog(...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}\n`;
  fs.appendFileSync(DEBUG_LOG_PATH, message);
}

export interface RelayServerOptions {
  port?: number; // 0 for auto-assign
  host?: string;
  token?: string; // Authentication token
}

export interface CDPCommand {
  id: number;
  method: string;
  params?: any;
}

export interface CDPEvent {
  method: string;
  params?: any;
}

export class RelayServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private ws: WebSocket | null = null; // Single connection (1 tab per server)
  private port: number = 0;
  private host: string;
  private token: string;
  private tabId: number | null = null;
  private ready: boolean = false;
  private nextId = 1;
  private pending = new Map<number, {resolve: (value: any) => void; reject: (err: Error) => void}>();
  private discoveryServer: http.Server | null = null;
  private discoveryPort: number | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RelayServerOptions = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.token = options.token || this.generateToken();
    this.port = options.port || 0;
  }

  /**
   * Start WebSocket server
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        host: this.host,
        port: this.port
      });

      this.wss.on('listening', () => {
        const address = this.wss!.address() as WebSocket.AddressInfo;
        this.port = address.port;
        debugLog(`[RelayServer] Listening on ws://${this.host}:${this.port}`);
        resolve(this.port);
      });

      this.wss.on('error', (error) => {
        debugLog('[RelayServer] Server error:', error);
        reject(error);
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
    });
  }

  /**
   * Handle WebSocket connection from Extension
   */
  private handleConnection(ws: WebSocket, req: any) {
    debugLog('[RelayServer] New connection from Extension');

    // Validate token
    const url = new URL(req.url || '', `ws://${this.host}`);
    const clientToken = url.searchParams.get('token');

    if (clientToken !== this.token) {
      debugLog('[RelayServer] Invalid token');
      ws.close(1008, 'Invalid token');
      return;
    }

    // Only allow one connection
    if (this.ws) {
      debugLog('[RelayServer] Connection already exists');
      ws.close(1008, 'Connection already exists');
      return;
    }

    this.ws = ws;
    this.startKeepAlive();

    ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    ws.on('close', () => {
      debugLog('[RelayServer] Extension disconnected');
      this.stopKeepAlive();
      this.ws = null;
      this.ready = false;
      this.emit('disconnected');
    });

    ws.on('error', (error) => {
      debugLog('[RelayServer] WebSocket error:', error);
    });

    debugLog('[RelayServer] Extension connected');
  }

  /**
   * Handle message from Extension
   */
  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data);

      if (typeof message.id === 'number' && (message.result !== undefined || message.error !== undefined)) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.error) {
            const error =
              typeof message.error === 'string'
                ? new Error(message.error)
                : new Error(message.error.message || 'Unknown error');
            pending.reject(error);
          } else {
            pending.resolve(message.result);
          }
          return;
        }

        if (message.error) {
          const error =
            typeof message.error === 'string'
              ? message.error
              : message.error.message || 'Unknown error';
          this.emit('cdp-error', { id: message.id, error });
        } else {
          this.emit('cdp-result', { id: message.id, result: message.result });
        }
        return;
      }

      if (message?.method === 'forwardCDPEvent' && message.params) {
        this.emit('cdp-event', {
          method: message.params.method,
          params: message.params.params,
          sessionId: message.params.sessionId,
        });
        return;
      }

      switch (message.type) {
        case 'ready':
          this.tabId = message.tabId;
          this.ready = true;
          debugLog(`[RelayServer] Connection ready for tab ${this.tabId}`);
          this.emit('ready', this.tabId);
          break;

        case 'forwardCDPResult':
          this.emit('cdp-result', { id: message.id, result: message.result });
          break;

        case 'forwardCDPError':
          this.emit('cdp-error', { id: message.id, error: message.error });
          break;

        case 'forwardCDPEvent':
          this.emit('cdp-event', {
            method: message.method,
            params: message.params
          });
          break;

        case 'detached':
          debugLog(`[RelayServer] Tab ${message.tabId} detached: ${message.reason}`);
          this.emit('detached', message.reason);
          break;

        default:
          debugLog('[RelayServer] Unknown message type:', message.type);
      }
    } catch (error) {
      debugLog('[RelayServer] Failed to parse message:', error);
    }
  }

  /**
   * Send CDP command to Extension
   */
  sendCDPCommand(id: number, method: string, params?: any): void {
    if (!this.ws || !this.ready) {
      throw new Error('Extension not connected or not ready');
    }

    this.ws.send(JSON.stringify({
      type: 'forwardCDPCommand',
      id,
      method,
      params
    }));
  }

  sendMessage(message: any): void {
    if (!this.ws || !this.ready) {
      throw new Error('Extension not connected or not ready');
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.ws.send(JSON.stringify(message));
  }

  async sendRequest(method: string, params?: any, timeoutMs = 30000): Promise<any> {
    if (!this.ws || !this.ready) {
      throw new Error('Extension not connected or not ready');
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    const id = this.nextId++;
    const payload = {id, method, params};
    const response = new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value: any) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        },
      });
    });
    this.ws.send(JSON.stringify(payload));
    return response;
  }

  /**
   * Start simple discovery HTTP server for extension to find relay URL.
   * Extension polls this endpoint when user clicks the extension icon.
   */
  async startDiscoveryServer(options: {
    tabUrl?: string;
    tabId?: number;
    newTab?: boolean;
  } = {}): Promise<number | null> {
    const ports = [8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774, 8775];
    const wsUrl = this.getConnectionURL();

    for (const port of ports) {
      const started = await new Promise<boolean>((resolve) => {
        const server = http.createServer(async (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (req.method === 'GET' && req.url === '/relay-info') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              wsUrl,
              tabUrl: options.tabUrl || null,
              tabId: options.tabId ?? null,
              newTab: Boolean(options.newTab),
            }));
            return;
          }

          if (req.method === 'POST' && req.url === '/reload-extension') {
            res.setHeader('Content-Type', 'application/json');
            if (!this.ws || !this.ready) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: 'Extension not connected' }));
              return;
            }
            try {
              await this.sendRequest('reloadExtension');
              res.end(JSON.stringify({ success: true }));
            } catch (err: any) {
              // Extension reloads and drops connection - this is expected
              res.end(JSON.stringify({ success: true, note: 'Extension reloading' }));
            }
            return;
          }

          res.statusCode = 404;
          res.end('Not Found');
        });

        server.on('error', (error: any) => {
          if (error?.code === 'EADDRINUSE') {
            resolve(false);
            return;
          }
          debugLog('[RelayServer] Discovery server error:', error);
          resolve(false);
        });

        server.listen(port, this.host, () => {
          this.discoveryServer = server;
          this.discoveryPort = port;
          debugLog(`[RelayServer] Discovery available on http://${this.host}:${port}/relay-info`);
          resolve(true);
        });
      });

      if (started) {
        return port;
      }
    }

    debugLog('[RelayServer] Could not start discovery server on any port');
    return null;
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.discoveryServer) {
      this.discoveryServer.close();
      this.discoveryServer = null;
      this.discoveryPort = null;
    }

    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          debugLog('[RelayServer] Server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Start keep-alive ping to prevent Service Worker from sleeping
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        debugLog('[RelayServer] Sent keep-alive ping');
      }
    }, 30000); // 30 seconds
    debugLog('[RelayServer] Keep-alive started');
  }

  /**
   * Stop keep-alive ping
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
      debugLog('[RelayServer] Keep-alive stopped');
    }
  }

  /**
   * Generate random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  getPort(): number {
    return this.port;
  }

  getToken(): string {
    return this.token;
  }

  getTabId(): number | null {
    return this.tabId;
  }

  isReady(): boolean {
    return this.ready;
  }

  getConnectionURL(): string {
    return `ws://${this.host}:${this.port}?token=${this.token}`;
  }
}
