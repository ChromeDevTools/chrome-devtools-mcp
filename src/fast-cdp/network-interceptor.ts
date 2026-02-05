/**
 * NetworkInterceptor - Captures network-layer responses from ChatGPT/Gemini
 *
 * Phase 1: Captures raw WebSocket frames and HTTP response data via CDP Network domain.
 * Provides parallel extraction path alongside existing DOM-based extraction.
 */

import type {CdpClient} from './cdp-client.js';

export interface CapturedFrame {
  timestamp: number;
  type: 'websocket' | 'eventsource' | 'xhr' | 'fetch' | 'other';
  requestId: string;
  url?: string;
  data: string;
}

export interface CaptureResult {
  frames: CapturedFrame[];
  text: string;
  rawDataSize: number;
  captureTimeMs: number;
}

export class NetworkInterceptor {
  private client: CdpClient;
  private capturing = false;
  private frames: CapturedFrame[] = [];
  private requestUrls = new Map<string, string>();
  private requestTypes = new Map<string, string>();
  private captureStart = 0;

  // Bound handler references for cleanup
  private wsFrameHandler: ((params: any) => void) | null = null;
  private responseReceivedHandler: ((params: any) => void) | null = null;
  private dataReceivedHandler: ((params: any) => void) | null = null;
  private requestWillBeSentHandler: ((params: any) => void) | null = null;
  private eventSourceHandler: ((params: any) => void) | null = null;

  // Data accumulation for chunked responses
  private responseData = new Map<string, string[]>();

  constructor(client: CdpClient) {
    this.client = client;
  }

  startCapture(): void {
    if (this.capturing) return;

    this.capturing = true;
    this.frames = [];
    this.requestUrls.clear();
    this.requestTypes.clear();
    this.responseData.clear();
    this.captureStart = Date.now();

    // Track request URLs for correlation
    this.requestWillBeSentHandler = (params: any) => {
      if (!this.capturing) return;
      const {requestId, request} = params;
      if (request?.url) {
        this.requestUrls.set(requestId, request.url);
        this.requestTypes.set(requestId, request.resourceType || params.type || 'other');
      }
    };

    // WebSocket frames (ChatGPT uses WebSocket for real-time communication)
    this.wsFrameHandler = (params: any) => {
      if (!this.capturing) return;
      const {requestId, timestamp, response} = params;
      if (response?.payloadData) {
        this.frames.push({
          timestamp: timestamp || Date.now() / 1000,
          type: 'websocket',
          requestId,
          url: this.requestUrls.get(requestId),
          data: response.payloadData,
        });
      }
    };

    // HTTP response headers (track which responses are SSE/EventSource)
    this.responseReceivedHandler = (params: any) => {
      if (!this.capturing) return;
      const {requestId, response} = params;
      if (response?.url) {
        this.requestUrls.set(requestId, response.url);
      }
      // Detect EventSource/SSE responses
      const contentType = response?.headers?.['content-type'] ||
                          response?.headers?.['Content-Type'] || '';
      if (contentType.includes('text/event-stream')) {
        this.requestTypes.set(requestId, 'eventsource');
      }
    };

    // Network data chunks (for SSE/fetch responses from Gemini)
    this.dataReceivedHandler = (params: any) => {
      if (!this.capturing) return;
      const {requestId, timestamp, dataLength} = params;
      // Network.dataReceived only gives length; actual data comes via Network.getResponseBody
      // For now, track which requestIds have data
      if (dataLength > 0) {
        if (!this.responseData.has(requestId)) {
          this.responseData.set(requestId, []);
        }
        this.responseData.get(requestId)!.push(`[chunk:${dataLength}bytes]`);
      }
    };

    // EventSource message (SSE via Network.eventSourceMessageReceived)
    this.eventSourceHandler = (params: any) => {
      if (!this.capturing) return;
      const {requestId, timestamp, eventName, data} = params;
      if (data) {
        this.frames.push({
          timestamp: timestamp || Date.now() / 1000,
          type: 'eventsource',
          requestId,
          url: this.requestUrls.get(requestId),
          data: data,
        });
      }
    };

    this.client.on('Network.requestWillBeSent', this.requestWillBeSentHandler);
    this.client.on('Network.webSocketFrameReceived', this.wsFrameHandler);
    this.client.on('Network.responseReceived', this.responseReceivedHandler);
    this.client.on('Network.dataReceived', this.dataReceivedHandler);
    this.client.on('Network.eventSourceMessageReceived', this.eventSourceHandler);

    console.error('[NetworkInterceptor] Capture started');
  }

  stopCapture(): void {
    if (!this.capturing) return;
    this.capturing = false;

    if (this.requestWillBeSentHandler) {
      this.client.off('Network.requestWillBeSent', this.requestWillBeSentHandler);
    }
    if (this.wsFrameHandler) {
      this.client.off('Network.webSocketFrameReceived', this.wsFrameHandler);
    }
    if (this.responseReceivedHandler) {
      this.client.off('Network.responseReceived', this.responseReceivedHandler);
    }
    if (this.dataReceivedHandler) {
      this.client.off('Network.dataReceived', this.dataReceivedHandler);
    }
    if (this.eventSourceHandler) {
      this.client.off('Network.eventSourceMessageReceived', this.eventSourceHandler);
    }

    const elapsed = Date.now() - this.captureStart;
    console.error(`[NetworkInterceptor] Capture stopped: ${this.frames.length} frames in ${elapsed}ms`);
  }

  getResult(): CaptureResult {
    const elapsed = Date.now() - this.captureStart;
    const text = this.extractText();
    const rawDataSize = this.frames.reduce((sum, f) => sum + f.data.length, 0);

    return {
      frames: [...this.frames],
      text,
      rawDataSize,
      captureTimeMs: elapsed,
    };
  }

  /**
   * Get raw captured frames (for debugging/observation)
   */
  getRawFrames(): CapturedFrame[] {
    return [...this.frames];
  }

  /**
   * Get summary of captured data (for logging)
   */
  getSummary(): string {
    const wsFrames = this.frames.filter(f => f.type === 'websocket').length;
    const sseFrames = this.frames.filter(f => f.type === 'eventsource').length;
    const otherFrames = this.frames.length - wsFrames - sseFrames;
    const totalBytes = this.frames.reduce((sum, f) => sum + f.data.length, 0);
    const uniqueUrls = new Set(this.frames.map(f => f.url).filter(Boolean));

    return `frames=${this.frames.length} (ws=${wsFrames}, sse=${sseFrames}, other=${otherFrames}), ` +
           `bytes=${totalBytes}, urls=${uniqueUrls.size}, ` +
           `duration=${Date.now() - this.captureStart}ms`;
  }

  /**
   * Extract readable text from captured frames.
   * Phase 1: Best-effort extraction from WebSocket/SSE data.
   */
  private extractText(): string {
    const textParts: string[] = [];

    for (const frame of this.frames) {
      try {
        if (frame.type === 'eventsource') {
          // SSE data is typically JSON
          const parsed = this.parseSSEData(frame.data);
          if (parsed) textParts.push(parsed);
        } else if (frame.type === 'websocket') {
          // WebSocket frames may be JSON
          const parsed = this.parseWSData(frame.data);
          if (parsed) textParts.push(parsed);
        }
      } catch {
        // Skip unparseable frames
      }
    }

    return textParts.join('');
  }

  /**
   * Parse SSE data field, extracting text content.
   * ChatGPT and Gemini both use JSON payloads in SSE.
   */
  private parseSSEData(data: string): string | null {
    if (!data || data === '[DONE]') return null;

    try {
      const parsed = JSON.parse(data);

      // ChatGPT format: {"message":{"content":{"parts":["text"]}}}
      if (parsed?.message?.content?.parts) {
        const parts = parsed.message.content.parts;
        return parts.filter((p: any) => typeof p === 'string').join('');
      }

      // ChatGPT streaming format: {"choices":[{"delta":{"content":"text"}}]}
      if (parsed?.choices?.[0]?.delta?.content) {
        return parsed.choices[0].delta.content;
      }

      // Gemini format variations
      if (parsed?.candidates?.[0]?.content?.parts) {
        const parts = parsed.candidates[0].content.parts;
        return parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      }

      // Generic text field
      if (typeof parsed?.text === 'string') {
        return parsed.text;
      }

      return null;
    } catch {
      // Not JSON, return raw if it looks like text
      if (data.length > 5 && !data.startsWith('{') && !data.startsWith('[')) {
        return data;
      }
      return null;
    }
  }

  /**
   * Parse WebSocket frame data.
   */
  private parseWSData(data: string): string | null {
    if (!data) return null;

    try {
      const parsed = JSON.parse(data);

      // ChatGPT conversation WebSocket format
      if (parsed?.message?.content?.parts) {
        const parts = parsed.message.content.parts;
        return parts.filter((p: any) => typeof p === 'string').join('');
      }

      // Delta format
      if (parsed?.choices?.[0]?.delta?.content) {
        return parsed.choices[0].delta.content;
      }

      // Gemini WebSocket format
      if (parsed?.candidates?.[0]?.content?.parts) {
        const parts = parsed.candidates[0].content.parts;
        return parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      }

      return null;
    } catch {
      return null;
    }
  }
}
