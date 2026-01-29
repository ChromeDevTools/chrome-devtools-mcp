/**
 * RelayServer - WebSocket server for Extension communication
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import http from 'http';

let sharedDiscoveryServer: http.Server | null = null;
let sharedDiscoveryHost: string | null = null;
let sharedDiscoveryPort: number | null = null;
let sharedDiscoveryState: {
  wsUrl: string;
  tabUrl?: string;
  newTab?: boolean;
  startedAt?: number;
  instanceId?: string;
} | null = null;

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
  private discoveryServer: http.Server | null = null;
  private discoveryPort: number | null = null;
  private nextId = 1;
  private pending = new Map<number, {resolve: (value: any) => void; reject: (err: Error) => void}>();
  private instanceId = crypto.randomBytes(8).toString('hex');

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
        console.log(`[RelayServer] Listening on ws://${this.host}:${this.port}`);
        resolve(this.port);
      });

      this.wss.on('error', (error) => {
        console.error('[RelayServer] Server error:', error);
        reject(error);
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
    });
  }

  /**
   * Start discovery server for extension UI auto-detect.
   */
  async startDiscoveryServer(
    wsUrl: string,
    options: {tabUrl?: string; newTab?: boolean} = {},
  ): Promise<void> {
    if (process.env.MCP_EXTENSION_DISCOVERY_DISABLED === '1') {
      return;
    }
    const envPort = process.env.MCP_EXTENSION_DISCOVERY_PORT;
    const envRange = process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE;
    let ports: number[] = [];
    if (envPort) {
      const port = Number(envPort);
      if (!port || Number.isNaN(port)) {
        return;
      }
      ports = [port];
    } else if (envRange) {
      const [startStr, endStr] = envRange.split('-');
      const start = Number(startStr);
      const end = Number(endStr);
      if (!start || !end || Number.isNaN(start) || Number.isNaN(end)) {
        return;
      }
      for (let p = start; p <= end; p++) ports.push(p);
    } else {
      // Default safe range to avoid EADDRINUSE collisions
      ports = [8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774, 8775];
    }

    sharedDiscoveryState = {
      wsUrl,
      tabUrl: options.tabUrl,
      newTab: options.newTab,
      startedAt: Date.now(),
      instanceId: this.instanceId,
    };

    for (const port of ports) {
      if (
        sharedDiscoveryServer &&
        sharedDiscoveryHost === this.host &&
        sharedDiscoveryPort === port
      ) {
        return;
      }

      const started = await new Promise<boolean>((resolve) => {
        const server = http.createServer((req, res) => {
          if (req.method !== 'GET' || req.url !== '/relay-info') {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(
          JSON.stringify({
            wsUrl: sharedDiscoveryState?.wsUrl ?? wsUrl,
            tabUrl: sharedDiscoveryState?.tabUrl ?? options.tabUrl ?? null,
            newTab: Boolean(
              sharedDiscoveryState?.newTab ?? options.newTab,
            ),
            startedAt: sharedDiscoveryState?.startedAt ?? Date.now(),
            instanceId: sharedDiscoveryState?.instanceId ?? this.instanceId,
          }),
        );
      });

        server.on('error', (error: any) => {
          if (error?.code === 'EADDRINUSE') {
            resolve(false);
            return;
          }
          console.error('[RelayServer] Discovery server error:', error);
          resolve(false);
        });

        server.listen(port, this.host, () => {
          this.discoveryServer = server;
          this.discoveryPort = port;
          sharedDiscoveryServer = server;
          sharedDiscoveryHost = this.host;
          sharedDiscoveryPort = port;
          console.log(`[RelayServer] Discovery available on http://${this.host}:${port}/relay-info`);
          resolve(true);
        });
      });

      if (started) return;
    }
  }

  /**
   * Handle WebSocket connection from Extension
   */
  private handleConnection(ws: WebSocket, req: any) {
    console.log('[RelayServer] New connection from Extension');

    // Validate token
    const url = new URL(req.url || '', `ws://${this.host}`);
    const clientToken = url.searchParams.get('token');

    if (clientToken !== this.token) {
      console.error('[RelayServer] Invalid token');
      ws.close(1008, 'Invalid token');
      return;
    }

    // Only allow one connection
    if (this.ws) {
      console.error('[RelayServer] Connection already exists');
      ws.close(1008, 'Connection already exists');
      return;
    }

    this.ws = ws;

    ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    ws.on('close', () => {
      console.log('[RelayServer] Extension disconnected');
      this.ws = null;
      this.ready = false;
      this.emit('disconnected');
    });

    ws.on('error', (error) => {
      console.error('[RelayServer] WebSocket error:', error);
    });

    console.log('[RelayServer] Extension connected');
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
          console.log(`[RelayServer] Connection ready for tab ${this.tabId}`);
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
          console.log(`[RelayServer] Tab ${message.tabId} detached: ${message.reason}`);
          this.emit('detached', message.reason);
          break;

        default:
          console.warn('[RelayServer] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[RelayServer] Failed to parse message:', error);
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
    this.ws.send(JSON.stringify(message));
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.ws || !this.ready) {
      throw new Error('Extension not connected or not ready');
    }
    const id = this.nextId++;
    const payload = {id, method, params};
    const response = new Promise<any>((resolve, reject) => {
      this.pending.set(id, {resolve, reject});
    });
    this.ws.send(JSON.stringify(payload));
    return response;
  }

  /**
   * Request Extension to connect to specific tab
   */
  requestTabConnection(tabId: number): void {
    if (!this.ws) {
      throw new Error('Extension not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'connect',
      tabId
    }));
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
          console.log('[RelayServer] Server stopped');
          resolve();
        });
      });
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
