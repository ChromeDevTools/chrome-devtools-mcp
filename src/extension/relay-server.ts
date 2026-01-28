/**
 * RelayServer - WebSocket server for Extension communication
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';

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
