// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Implements Server-Sent-Events protocl parsing as described by
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
 *
 * Webpages can use SSE over fetch/XHR and not go through EventSource. DevTools
 * only receives the raw binary data in this case, which means we have to decode
 * and parse the event stream ourselves here.
 *
 * Implementation mostly ported over from blink
 * third_party/blink/renderer/modules/eventsource/event_source_parser.cc.
 */
export class ServerSentEventsParser {
    #onEventCallback;
    #decoder;
    // Parser state.
    #isRecognizingCrLf = false;
    #line = '';
    #id = '';
    #data = '';
    #eventType = '';
    constructor(callback, encodingLabel) {
        this.#onEventCallback = callback;
        this.#decoder = new Base64TextDecoder(this.#onTextChunk.bind(this), encodingLabel);
    }
    async addBase64Chunk(raw) {
        await this.#decoder.addBase64Chunk(raw);
    }
    addTextChunk(chunk) {
        this.#onTextChunk(chunk);
    }
    #onTextChunk(chunk) {
        // A line consists of "this.#line" plus a slice of "chunk[start:<next new cr/lf>]".
        let start = 0;
        for (let i = 0; i < chunk.length; ++i) {
            if (this.#isRecognizingCrLf && chunk[i] === '\n') {
                // We found the latter part of "\r\n".
                this.#isRecognizingCrLf = false;
                ++start;
                continue;
            }
            this.#isRecognizingCrLf = false;
            if (chunk[i] === '\r' || chunk[i] === '\n') {
                this.#line += chunk.substring(start, i);
                this.#parseLine();
                this.#line = '';
                start = i + 1;
                this.#isRecognizingCrLf = chunk[i] === '\r';
            }
        }
        this.#line += chunk.substring(start);
    }
    #parseLine() {
        if (this.#line.length === 0) {
            // We dispatch an event when seeing an empty line.
            if (this.#data.length > 0) {
                const data = this.#data.slice(0, -1); // Remove the last newline.
                this.#onEventCallback(this.#eventType || 'message', data, this.#id);
                this.#data = '';
            }
            this.#eventType = '';
            return;
        }
        let fieldNameEnd = this.#line.indexOf(':');
        let fieldValueStart;
        if (fieldNameEnd < 0) {
            fieldNameEnd = this.#line.length;
            fieldValueStart = fieldNameEnd;
        }
        else {
            fieldValueStart = fieldNameEnd + 1;
            if (fieldValueStart < this.#line.length && this.#line[fieldValueStart] === ' ') {
                // Skip a single space preceeding the value.
                ++fieldValueStart;
            }
        }
        const fieldName = this.#line.substring(0, fieldNameEnd);
        if (fieldName === 'event') {
            this.#eventType = this.#line.substring(fieldValueStart);
            return;
        }
        if (fieldName === 'data') {
            this.#data += this.#line.substring(fieldValueStart);
            this.#data += '\n';
        }
        if (fieldName === 'id') {
            const id = this.#line.substring(fieldValueStart);
            if (!id.includes('\0')) {
                this.#id = id;
            }
        }
        // Ignore all other fields. Also ignore "retry", we won't forward that to the backend.
    }
}
/**
 * Small helper class that can decode a stream of base64 encoded bytes. Specify the
 * text encoding for the raw bytes via constructor. Default is utf-8.
 */
class Base64TextDecoder {
    #decoder;
    #writer;
    constructor(onTextChunk, encodingLabel) {
        this.#decoder = new TextDecoderStream(encodingLabel);
        this.#writer = this.#decoder.writable.getWriter();
        void this.#decoder.readable.pipeTo(new WritableStream({ write: onTextChunk }));
    }
    async addBase64Chunk(chunk) {
        const binString = globalThis.atob(chunk);
        const bytes = Uint8Array.from(binString, m => m.codePointAt(0));
        await this.#writer.ready;
        await this.#writer.write(bytes);
    }
}
//# sourceMappingURL=ServerSentEventsProtocol.js.map