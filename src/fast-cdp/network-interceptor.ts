/**
 * NetworkInterceptor - Captures network-layer responses from ChatGPT/Gemini
 *
 * Phase 1: Captures raw network data via CDP Network domain.
 * Key insight from PoC testing:
 * - ChatGPT: WebSocket carries only control messages (presence, turn-complete).
 *   Answer text is delivered via fetch/XHR streaming responses.
 * - Gemini: No WebSocket/SSE frames observed. Uses fetch responses.
 *
 * Strategy: Track all requests, capture response bodies on loadingFinished
 * for API-like URLs (conversation endpoints, streaming responses).
 */

import type {CdpClient} from './cdp-client.js';

export interface CapturedFrame {
  timestamp: number;
  type: 'websocket' | 'eventsource' | 'fetch-body' | 'other';
  requestId: string;
  url?: string;
  data: string;
}

export interface CaptureResult {
  frames: CapturedFrame[];
  /** Plain text (Markdown/LaTeX stripped) */
  text: string;
  /** Raw text with original formatting (Markdown, LaTeX) */
  rawText: string;
  rawDataSize: number;
  captureTimeMs: number;
}

// URL patterns that likely contain AI response data
const CHATGPT_API_PATTERNS = [
  '/backend-api/conversation',
  '/backend-api/f/conversation',
  '/backend-anon/conversation',
  '/backend-anon/f/conversation',
  '/api/conversation',
];

const GEMINI_API_PATTERNS = [
  '/generate_content',
  '/_/BardChatUi',
  '/stream_generate',
  '/v1beta/models',
  '/BatchExecute',
];

function isResponseUrl(url: string): boolean {
  for (const p of CHATGPT_API_PATTERNS) {
    if (url.includes(p)) return true;
  }
  for (const p of GEMINI_API_PATTERNS) {
    if (url.includes(p)) return true;
  }
  return false;
}

/**
 * Strip Markdown/LaTeX formatting to produce plain text.
 * - **bold** / __bold__ -> bold
 * - *italic* / _italic_ -> italic
 * - $O(\log n)$ / $$...$$ -> O(\log n)  (keep inner text)
 * - [Image of ...] -> (removed)
 * - \\log, \\sum etc -> log, sum
 */
function stripFormatting(text: string): string {
  if (!text) return text;
  return text
    // Remove image references: [Image of ...]
    .replace(/\[Image of [^\]]*\]/g, '')
    // LaTeX display math: $$...$$
    .replace(/\$\$(.*?)\$\$/g, '$1')
    // LaTeX inline math: $...$
    .replace(/\$(.*?)\$/g, '$1')
    // LaTeX commands: \log -> log, \sum -> sum
    .replace(/\\([a-zA-Z]+)/g, '$1')
    // Markdown bold: **text** or __text__
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    // Markdown italic: *text* or _text_ (but not inside words)
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Collapse multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class NetworkInterceptor {
  private client: CdpClient;
  private capturing = false;
  private frames: CapturedFrame[] = [];
  private requestUrls = new Map<string, string>();
  private requestTypes = new Map<string, string>();
  private responseContentTypes = new Map<string, string>();
  private captureStart = 0;

  // Bound handler references for cleanup
  private handlers: Array<[string, (params: any) => void]> = [];

  // Pending response body fetches
  private pendingBodies = new Set<string>();

  constructor(client: CdpClient) {
    this.client = client;
  }

  startCapture(): void {
    if (this.capturing) return;

    this.capturing = true;
    this.frames = [];
    this.requestUrls.clear();
    this.requestTypes.clear();
    this.responseContentTypes.clear();
    this.pendingBodies.clear();
    this.captureStart = Date.now();

    this.addHandler('Network.requestWillBeSent', (params: any) => {
      const {requestId, request, type} = params;
      if (request?.url) {
        this.requestUrls.set(requestId, request.url);
        this.requestTypes.set(requestId, type || 'other');
      }
    });

    this.addHandler('Network.webSocketFrameReceived', (params: any) => {
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
    });

    this.addHandler('Network.responseReceived', (params: any) => {
      const {requestId, response, type} = params;
      if (response?.url) {
        this.requestUrls.set(requestId, response.url);
      }
      if (type) {
        this.requestTypes.set(requestId, type);
      }
      const contentType = response?.headers?.['content-type'] ||
                          response?.headers?.['Content-Type'] || '';
      this.responseContentTypes.set(requestId, contentType);

      if (contentType.includes('text/event-stream')) {
        this.requestTypes.set(requestId, 'EventSource');
      }
    });

    this.addHandler('Network.eventSourceMessageReceived', (params: any) => {
      const {requestId, timestamp, data} = params;
      if (data) {
        this.frames.push({
          timestamp: timestamp || Date.now() / 1000,
          type: 'eventsource',
          requestId,
          url: this.requestUrls.get(requestId),
          data,
        });
      }
    });

    // Key: When a response finishes loading, fetch its body if it's an API response
    // Also capture any text/event-stream responses (SSE) regardless of URL pattern
    this.addHandler('Network.loadingFinished', (params: any) => {
      const {requestId} = params;
      const url = this.requestUrls.get(requestId) || '';
      const contentType = this.responseContentTypes.get(requestId) || '';
      const isSSE = contentType.includes('text/event-stream');

      if (isResponseUrl(url) || isSSE) {
        this.pendingBodies.add(requestId);
        this.fetchResponseBody(requestId, url).catch(() => {
          // Best-effort; failures are expected for some responses
        });
      }
    });

    console.error('[NetworkInterceptor] Capture started');
  }

  private addHandler(event: string, handler: (params: any) => void): void {
    const wrappedHandler = (params: any) => {
      if (!this.capturing) return;
      handler(params);
    };
    this.handlers.push([event, wrappedHandler]);
    this.client.on(event, wrappedHandler);
  }

  private async fetchResponseBody(requestId: string, url: string): Promise<void> {
    try {
      const result = await this.client.send('Network.getResponseBody', {requestId});
      if (result?.body) {
        const data = result.base64Encoded
          ? Buffer.from(result.body, 'base64').toString('utf-8')
          : result.body;

        this.frames.push({
          timestamp: Date.now() / 1000,
          type: 'fetch-body',
          requestId,
          url,
          data,
        });
      }
    } catch (err) {
      // Common: "No resource with given identifier" for redirects/cancelled requests
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('No resource') && !msg.includes('No data found')) {
        console.error(`[NetworkInterceptor] getResponseBody failed for ${url.slice(0, 80)}: ${msg}`);
      }
    } finally {
      this.pendingBodies.delete(requestId);
    }
  }

  stopCapture(): void {
    if (!this.capturing) return;
    this.capturing = false;

    for (const [event, handler] of this.handlers) {
      this.client.off(event, handler);
    }
    this.handlers = [];

    const elapsed = Date.now() - this.captureStart;
    console.error(`[NetworkInterceptor] Capture stopped: ${this.frames.length} frames in ${elapsed}ms`);
  }

  /**
   * Wait for all pending response body fetches, then stop capture.
   */
  async stopCaptureAndWait(timeoutMs = 3000): Promise<void> {
    this.capturing = false; // Stop receiving new events

    // Wait for pending body fetches
    const deadline = Date.now() + timeoutMs;
    while (this.pendingBodies.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Remove handlers
    for (const [event, handler] of this.handlers) {
      this.client.off(event, handler);
    }
    this.handlers = [];

    const elapsed = Date.now() - this.captureStart;
    console.error(`[NetworkInterceptor] Capture stopped: ${this.frames.length} frames in ${elapsed}ms`);
  }

  getResult(): CaptureResult {
    const elapsed = Date.now() - this.captureStart;
    const rawText = this.extractText();
    const text = stripFormatting(rawText);
    const rawDataSize = this.frames.reduce((sum, f) => sum + f.data.length, 0);

    return {
      frames: [...this.frames],
      text,
      rawText,
      rawDataSize,
      captureTimeMs: elapsed,
    };
  }

  getRawFrames(): CapturedFrame[] {
    return [...this.frames];
  }

  getSummary(): string {
    const byType: Record<string, number> = {};
    for (const f of this.frames) {
      byType[f.type] = (byType[f.type] || 0) + 1;
    }
    const totalBytes = this.frames.reduce((sum, f) => sum + f.data.length, 0);
    const uniqueUrls = new Set(this.frames.map(f => f.url).filter(Boolean));
    const typeStr = Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(', ');

    return `frames=${this.frames.length} (${typeStr}), ` +
           `bytes=${totalBytes}, urls=${uniqueUrls.size}, ` +
           `duration=${Date.now() - this.captureStart}ms`;
  }

  /**
   * Get all tracked request URLs (for debugging which requests were seen)
   */
  getTrackedRequests(): Array<{requestId: string; url: string; type: string; contentType: string}> {
    const result: Array<{requestId: string; url: string; type: string; contentType: string}> = [];
    for (const [requestId, url] of this.requestUrls) {
      result.push({
        requestId,
        url,
        type: this.requestTypes.get(requestId) || 'unknown',
        contentType: this.responseContentTypes.get(requestId) || '',
      });
    }
    return result;
  }

  /**
   * Extract readable text from captured frames.
   */
  private extractText(): string {
    const textParts: string[] = [];

    for (const frame of this.frames) {
      try {
        if (frame.type === 'fetch-body') {
          const parsed = this.parseFetchBody(frame.data, frame.url);
          if (parsed) textParts.push(parsed);
        } else if (frame.type === 'eventsource') {
          const parsed = this.parseSSEData(frame.data);
          if (parsed) textParts.push(parsed);
        } else if (frame.type === 'websocket') {
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
   * Parse fetch response body.
   * ChatGPT uses SSE delta_encoding v1 format.
   * Gemini uses StreamGenerate chunked format with )]}' prefix.
   */
  private parseFetchBody(body: string, url?: string): string | null {
    if (!body) return null;

    // Gemini: )]}'  prefix (check first to avoid false match on 'data: ')
    if (body.startsWith(")]}'")) {
      return this.parseGeminiBody(body);
    }

    // ChatGPT: SSE format ("event: delta_encoding" / "data: {...}")
    if (body.includes('data: ')) {
      return this.parseChatGPTStreamBody(body);
    }

    // Gemini: URL-based fallback (non-)]}'  format)
    if (url && GEMINI_API_PATTERNS.some(p => url.includes(p))) {
      return this.parseGeminiBody(body);
    }

    // Try generic JSON parse
    try {
      const parsed = JSON.parse(body);
      // ChatGPT conversation response
      if (parsed?.message?.content?.parts) {
        return parsed.message.content.parts
          .filter((p: any) => typeof p === 'string')
          .join('');
      }
      // Gemini candidate response
      if (parsed?.candidates?.[0]?.content?.parts) {
        return parsed.candidates[0].content.parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join('');
      }
    } catch {
      // Not JSON
    }

    return null;
  }

  /**
   * Parse ChatGPT Web's SSE-formatted response body.
   *
   * ChatGPT Web (2026-02) uses "delta_encoding v1" format:
   * - event: delta_encoding / data: "v1"  (header)
   * - event: delta / data: {"p": "/message/content/parts/0", "o": "append", "v": "text"}
   * - event: delta / data: {"v": "text"}  (shorthand append)
   * - event: delta / data: {"p": "", "o": "patch", "v": [...]}  (batch operations)
   * - data: [DONE]
   */
  private parseChatGPTStreamBody(body: string): string | null {
    const lines = body.split('\n');
    let text = '';
    let isDeltaEncoding = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect delta_encoding v1 mode
      if (line === 'event: delta_encoding') {
        isDeltaEncoding = true;
        continue;
      }

      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]' || jsonStr === '"v1"') continue;

      try {
        const parsed = JSON.parse(jsonStr);

        if (isDeltaEncoding) {
          // Delta encoding v1: extract text from delta operations
          text += this.extractDeltaText(parsed);
        } else {
          // Legacy format: full message in each SSE line
          if (parsed?.message?.content?.parts) {
            const t = parsed.message.content.parts
              .filter((p: any) => typeof p === 'string')
              .join('');
            if (t.length > text.length) {
              text = t;
            }
          }
          // OpenAI API delta format
          if (parsed?.choices?.[0]?.delta?.content) {
            text += parsed.choices[0].delta.content;
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return text || null;
  }

  /**
   * Extract text from a ChatGPT delta_encoding v1 operation.
   *
   * Formats:
   * - {"p": "/message/content/parts/0", "o": "append", "v": "text"} - append text
   * - {"v": "text"} - shorthand append (no path/operation)
   * - {"p": "", "o": "patch", "v": [{...}, {...}]} - batch operations
   * - {"p": "", "o": "add", "v": {"message": {...}}} - initial message creation
   */
  private extractDeltaText(data: any): string {
    if (!data || typeof data !== 'object') return '';

    // Skip non-delta message types
    if (data.type && typeof data.type === 'string') return '';

    // Shorthand delta: {"v": "text"} (no "p" or "o" keys)
    if (typeof data.v === 'string' && !data.p && !data.o) {
      return data.v;
    }

    // Append operation on text parts
    if (data.o === 'append' && typeof data.v === 'string' &&
        typeof data.p === 'string' && data.p.includes('/content/parts/')) {
      return data.v;
    }

    // Batch patch operation: recurse into array
    if (data.o === 'patch' && Array.isArray(data.v)) {
      let text = '';
      for (const op of data.v) {
        if (op.o === 'append' && typeof op.v === 'string' &&
            typeof op.p === 'string' && op.p.includes('/content/parts/')) {
          text += op.v;
        }
      }
      return text;
    }

    return '';
  }

  /**
   * Parse Gemini Web's response body.
   *
   * Gemini Web (2026-02) uses StreamGenerate / BatchExecute format:
   * - Starts with ")]}'\\n"
   * - Each chunk: "<byte_count>\\n<json_array>\\n"
   * - JSON: [["wrb.fr", null, "<inner_json_string>"]]
   * - Inner JSON: nested array where [4][0][1][0] contains accumulated text
   *
   * Each streaming chunk contains the FULL accumulated text (not deltas).
   */
  private parseGeminiBody(body: string): string | null {
    // Gemini StreamGenerate/BatchExecute: starts with )]}'
    if (body.startsWith(")]}'")) {
      return this.parseGeminiStreamBody(body);
    }

    // Try direct JSON parse (API format)
    try {
      const parsed = JSON.parse(body);
      if (parsed?.candidates?.[0]?.content?.parts) {
        return parsed.candidates[0].content.parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join('');
      }
    } catch {
      // Not simple JSON
    }

    return null;
  }

  /**
   * Parse Gemini's StreamGenerate chunked response.
   *
   * Format: )]}'\\n<size>\\n[["wrb.fr",null,"<inner_json>"]]\\n<size>\\n...
   * Inner JSON at [4][0][1][0] contains the accumulated answer text.
   */
  private parseGeminiStreamBody(body: string): string | null {
    const content = body.slice(4); // Remove )]}'
    const lines = content.split('\n');
    let longestText = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || /^\d+$/.test(trimmed)) continue; // Skip empty lines and byte counts

      try {
        const outer = JSON.parse(trimmed);
        // outer = [["wrb.fr", null, "<inner_json_string>"]]
        if (!Array.isArray(outer) || !Array.isArray(outer[0])) continue;

        const innerStr = outer[0][2];
        if (typeof innerStr !== 'string') continue;

        const inner = JSON.parse(innerStr);
        // inner[4] = response content array
        // inner[4][0] = first response chunk [id, [text], ...]
        // inner[4][0][1] = text array, [0] = accumulated text
        const text = this.extractGeminiText(inner);
        if (text && text.length > longestText.length) {
          longestText = text;
        }
      } catch {
        continue;
      }
    }

    return longestText || null;
  }

  /**
   * Extract text from parsed Gemini inner JSON structure.
   * The text is at [4][0][1][0] in the parsed array.
   */
  private extractGeminiText(inner: any): string | null {
    if (!Array.isArray(inner)) return null;

    // Primary path: inner[4][0][1][0]
    const responseContent = inner[4];
    if (!Array.isArray(responseContent) || responseContent.length === 0) return null;

    const firstChunk = responseContent[0];
    if (!Array.isArray(firstChunk) || firstChunk.length < 2) return null;

    const textArray = firstChunk[1];
    if (Array.isArray(textArray) && typeof textArray[0] === 'string') {
      return textArray[0];
    }
    if (typeof textArray === 'string') {
      return textArray;
    }

    return null;
  }

  private parseSSEData(data: string): string | null {
    if (!data || data === '[DONE]') return null;
    try {
      const parsed = JSON.parse(data);
      if (parsed?.message?.content?.parts) {
        return parsed.message.content.parts.filter((p: any) => typeof p === 'string').join('');
      }
      if (parsed?.choices?.[0]?.delta?.content) {
        return parsed.choices[0].delta.content;
      }
      if (parsed?.candidates?.[0]?.content?.parts) {
        return parsed.candidates[0].content.parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseWSData(data: string): string | null {
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      if (parsed?.message?.content?.parts) {
        return parsed.message.content.parts.filter((p: any) => typeof p === 'string').join('');
      }
      if (parsed?.choices?.[0]?.delta?.content) {
        return parsed.choices[0].delta.content;
      }
      return null;
    } catch {
      return null;
    }
  }
}
