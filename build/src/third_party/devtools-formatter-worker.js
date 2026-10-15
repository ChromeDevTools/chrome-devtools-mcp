import * as Fs from 'node:fs';
import * as Url from 'node:url';
import * as WorkerThreads from 'node:worker_threads';

// Copyright 2020 The Chromium Authors
const DEFAULT_COMPARATOR = (a, b) => {
    return a < b ? -1 : (a > b ? 1 : 0);
};
function lowerBound(array, needle, comparator, left, right) {
    let l = 0;
    let r = right !== undefined ? right : array.length;
    while (l < r) {
        const m = (l + r) >> 1;
        if (comparator(needle, array[m]) > 0) {
            l = m + 1;
        }
        else {
            r = m;
        }
    }
    return r;
}
function arrayDoesNotContainNullOrUndefined(arr) {
    return !arr.includes(null) && !arr.includes(undefined);
}

// Copyright 2021 The Chromium Authors
const EmptyUrlString = '';

// Copyright 2025 The Chromium Authors
class WebWorkerScope {
    postMessage(message, transfer) {
        self.postMessage(message, transfer);
    }
    set onmessage(listener) {
        self.addEventListener('message', listener);
    }
}
class WebWorker {
    #workerPromise;
    #disposed;
    #rejectWorkerPromise;
    constructor(workerLocation) {
        this.#workerPromise = new Promise((fulfill, reject) => {
            this.#rejectWorkerPromise = reject;
            const worker = new Worker(new URL(workerLocation), { type: 'module' });
            worker.onerror = event => {
                console.error(`Failed to load worker for ${workerLocation}:`, event);
            };
            worker.onmessage = (event) => {
                console.assert(event.data === 'workerReady');
                worker.onmessage = null;
                fulfill(worker);
            };
        });
    }
    postMessage(message, transfer) {
        void this.#workerPromise.then(worker => {
            if (!this.#disposed) {
                worker.postMessage(message, transfer ?? []);
            }
        });
    }
    dispose() {
        this.#disposed = true;
        void this.#workerPromise.then(worker => worker.terminate());
    }
    terminate(immediately = false) {
        if (immediately) {
            this.#rejectWorkerPromise?.(new Error('Worker terminated'));
        }
        this.dispose();
    }
    set onmessage(listener) {
        void this.#workerPromise.then(worker => {
            worker.onmessage = listener;
        });
    }
    set onerror(listener) {
        void this.#workerPromise.then(worker => {
            worker.onerror = listener;
        });
    }
}
let lastScreenshotBlobUrl = null;
function revokeLastScreenshotUrl() {
    if (lastScreenshotBlobUrl) {
        URL.revokeObjectURL(lastScreenshotBlobUrl);
        lastScreenshotBlobUrl = null;
    }
}
async function saveScreenshot(options) {
    const pageImage = new Image();
    await new Promise((resolve, reject) => {
        pageImage.onload = () => resolve();
        pageImage.onerror = () => reject(new Error('Failed to load image for screenshot'));
        pageImage.src = 'data:image/png;base64,' + options.base64Png;
    });
    let canvas;
    if (options.clip) {
        const scale = pageImage.naturalWidth / options.clip.screenRectWidth;
        const screenRectWidth = options.clip.screenRectWidth * scale;
        const screenRectHeight = options.clip.screenRectHeight * scale;
        const contentLeft = options.clip.visiblePageRectLeft * scale;
        const contentTop = options.clip.visiblePageRectTop * scale;
        canvas = new OffscreenCanvas(Math.round(screenRectWidth),
        Math.min(1 << 14, Math.round(screenRectHeight)));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            throw new Error('Could not get 2d context from canvas.');
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pageImage, Math.round(contentLeft), Math.round(contentTop));
    }
    else {
        canvas = new OffscreenCanvas(pageImage.naturalWidth, Math.min(1 << 14, Math.floor(pageImage.naturalHeight)));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            throw new Error('Could not get 2d context for base64 screenshot.');
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pageImage, 0, 0);
    }
    revokeLastScreenshotUrl();
    const link = document.createElement('a');
    link.download = options.fileName + '.png';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    lastScreenshotBlobUrl = blobUrl;
    link.href = blobUrl;
    link.click();
}
let cssEvaluationElement = null;
const HOST_RUNTIME$2 = {
    createWorker(url) {
        return new WebWorker(url);
    },
    workerScope: new WebWorkerScope(),
    getOnLine() {
        return navigator.onLine;
    },
    getUserAgent() {
        return navigator.userAgent;
    },
    getLocalStorage() {
        return 'localStorage' in globalThis ? globalThis.localStorage : undefined;
    },
    getCacheStorage() {
        return 'caches' in globalThis ? globalThis.caches : undefined;
    },
    getDevicePixelRatio() {
        return window.devicePixelRatio;
    },
    saveScreenshot,
    revokeLastScreenshotUrl,
    async loadTextFile(url) {
        const response = await fetch(url);
        return await response.text();
    },
    evaluateCSS(dataValue, customExpr) {
        if (!cssEvaluationElement || !cssEvaluationElement.isConnected) {
            cssEvaluationElement = document.getElementById('css-evaluation-element');
            if (!cssEvaluationElement) {
                cssEvaluationElement = document.createElement('div');
                cssEvaluationElement.id = 'css-evaluation-element';
                cssEvaluationElement.setAttribute('style', 'hidden: true; --evaluation: attr(data-custom-expr type(*))');
                document.body.appendChild(cssEvaluationElement);
            }
        }
        if (dataValue !== null) {
            cssEvaluationElement.setAttribute('data-value', dataValue);
        }
        else {
            cssEvaluationElement.removeAttribute('data-value');
        }
        cssEvaluationElement.setAttribute('data-custom-expr', customExpr);
        return cssEvaluationElement.computedStyleMap().get('--evaluation')?.toString() ?? null;
    },
    removeCSSEvaluationElement() {
        const element = cssEvaluationElement ?? document.getElementById('css-evaluation-element');
        if (element) {
            element.remove();
        }
        cssEvaluationElement = null;
    },
};

var HostRuntime$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HOST_RUNTIME: HOST_RUNTIME$2
});

// Copyright 2025 The Chromium Authors

var browser = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HostRuntime: HostRuntime$1
});

// Copyright 2025 The Chromium Authors
class NodeWorkerScope {
    postMessage(message, transfer) {
        WorkerThreads.parentPort?.postMessage(message, transfer);
    }
    set onmessage(listener) {
        WorkerThreads.parentPort?.addEventListener('message', msg => {
            listener(msg);
        });
    }
}
class NodeWorker {
    #worker;
    #workerPromise;
    #disposed = false;
    #rejectWorkerPromise;
    constructor(url) {
        const worker = new WorkerThreads.Worker(new URL(url));
        this.#worker = worker;
        this.#workerPromise = new Promise((resolve, reject) => {
            this.#rejectWorkerPromise = reject;
            worker.once('message', (message) => {
                if (message === 'workerReady') {
                    resolve(worker);
                }
            });
            worker.on('error', reject);
        });
        this.#workerPromise.catch(() => { });
    }
    postMessage(message, transfer) {
        void this.#workerPromise.then(worker => {
            if (!this.#disposed) {
                worker.postMessage(message, transfer);
            }
        });
    }
    dispose() {
        this.#disposed = true;
        void this.#worker.terminate();
    }
    terminate(immediately) {
        if (immediately) {
            this.#rejectWorkerPromise?.(new Error('Worker terminated'));
        }
        this.dispose();
    }
    set onmessage(listener) {
        void this.#workerPromise.then(worker => {
            worker.on('message', (data) => {
                if (!this.#disposed) {
                    listener({ data, ports: [] });
                }
            });
        });
    }
    set onerror(listener) {
        void this.#workerPromise.then(worker => {
            worker.on('error', (error) => {
                if (!this.#disposed) {
                    listener({ type: 'error', ...error });
                }
            });
        });
    }
}
class NodeCacheEntry {
    #entries = new Map();
    async put(url, response) {
        this.#entries.set(url, response.clone());
    }
    async match(url) {
        return this.#entries.get(url)?.clone();
    }
}
class NodeCacheStorage {
    #caches = new Map();
    async open(name) {
        let cache = this.#caches.get(name);
        if (!cache) {
            cache = new NodeCacheEntry();
            this.#caches.set(name, cache);
        }
        return cache;
    }
    async delete(name) {
        return this.#caches.delete(name);
    }
}
const nodeCacheStorage = new NodeCacheStorage();
const HOST_RUNTIME$1 = {
    createWorker(url) {
        return new NodeWorker(url);
    },
    workerScope: new NodeWorkerScope(),
    getOnLine() {
        return true;
    },
    getUserAgent() {
        return 'Node.js';
    },
    getLocalStorage() {
        return undefined;
    },
    getCacheStorage() {
        return nodeCacheStorage;
    },
    getDevicePixelRatio() {
        return 1;
    },
    async saveScreenshot(_options) { },
    revokeLastScreenshotUrl() { },
    async loadTextFile(url) {
        return await Fs.promises.readFile(Url.fileURLToPath(url), 'utf-8');
    },
    evaluateCSS(_dataValue, _customExpr) {
        return null;
    },
    removeCSSEvaluationElement() { },
};

var HostRuntime = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HOST_RUNTIME: HOST_RUNTIME$1
});

// Copyright 2025 The Chromium Authors

var node = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HostRuntime: HostRuntime
});

// Copyright 2025 The Chromium Authors
const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== null;
const IS_BROWSER =
typeof window !== 'undefined' || (typeof self !== 'undefined' && typeof self.postMessage === 'function');
const HOST_RUNTIME = await (async () => {
    if (IS_BROWSER) {
        return (await Promise.resolve().then(function () { return browser; })).HostRuntime.HOST_RUNTIME;
    }
    if (IS_NODE) {
        return (await Promise.resolve().then(function () { return node; })).HostRuntime.HOST_RUNTIME;
    }
    throw new Error('Unknown runtime!');
})();

// Copyright 2020 The Chromium Authors
const sprintf = (fmt, ...args) => {
    let argIndex = 0;
    const RE = /%(?:(\d+)\$)?(?:\.(\d*))?([%dfs])/g;
    return fmt.replaceAll(RE, (_, index, precision, specifier) => {
        if (specifier === '%') {
            return '%';
        }
        if (index !== undefined) {
            argIndex = parseInt(index, 10) - 1;
            if (argIndex < 0) {
                throw new RangeError(`Invalid parameter index ${argIndex + 1}`);
            }
        }
        if (argIndex >= args.length) {
            throw new RangeError(`Expected at least ${argIndex + 1} format parameters, but only ${args.length} where given.`);
        }
        if (specifier === 's') {
            const argValue = String(args[argIndex++]);
            if (precision !== undefined) {
                return argValue.substring(0, Number(precision));
            }
            return argValue;
        }
        let argValue = Number(args[argIndex++]);
        if (isNaN(argValue)) {
            argValue = 0;
        }
        if (specifier === 'd') {
            return String(Math.floor(argValue)).padStart(Number(precision), '0');
        }
        if (precision !== undefined) {
            return argValue.toFixed(Number(precision));
        }
        return String(argValue);
    });
};
const findIndexesOfSubString = (inputString, searchString) => {
    const matches = [];
    let i = inputString.indexOf(searchString);
    while (i !== -1) {
        matches.push(i);
        i = inputString.indexOf(searchString, i + searchString.length);
    }
    return matches;
};
const findLineEndingIndexes = (inputString) => {
    const endings = findIndexesOfSubString(inputString, '\n');
    endings.push(inputString.length);
    return endings;
};
const isWhitespace = (inputString) => {
    return /^\s*$/.test(inputString);
};
const trimEndWithMaxLength = (str, maxLength) => {
    if (str.length <= maxLength) {
        return str;
    }
    const ellipsis = '…';
    const ellipsisLength = 1;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const iterator = segmenter.segment(str)[Symbol.iterator]();
    let lastSegmentIndex = 0;
    for (let i = 0; i <= maxLength - ellipsisLength; i++) {
        const result = iterator.next();
        if (result.done) {
            return str;
        }
        lastSegmentIndex = result.value.index;
    }
    for (let i = 0; i < ellipsisLength; i++) {
        if (iterator.next().done) {
            return str;
        }
    }
    return str.slice(0, lastSegmentIndex) + ellipsis;
};
const stringifyWithPrecision = function stringifyWithPrecision(s, precision = 2) {
    if (precision === 0) {
        return s.toFixed(0);
    }
    const string = s.toFixed(precision).replace(/\.?0*$/, '');
    return string === '-0' ? '0' : string;
};

// Copyright 2020 The Chromium Authors
function assertNever(_type, message) {
    throw new Error(message);
}

(function () {
  function copyObj(obj, target, overwrite) {
    if (!target) { target = {}; }
    for (var prop in obj)
      { if (obj.hasOwnProperty(prop) && (overwrite !== false))
        { target[prop] = obj[prop]; } }
    return target
  }
  function countColumn(string, end, tabSize, startIndex, startValue) {
    if (end == null) {
      end = string.search(/[^\s\u00a0]/);
      if (end == -1) { end = string.length; }
    }
    for (var i = startIndex || 0, n = startValue || 0;;) {
      var nextTab = string.indexOf("\t", i);
      if (nextTab < 0 || nextTab >= end)
        { return n + (end - i) }
      n += nextTab - i;
      n += tabSize - (n % tabSize);
      i = nextTab + 1;
    }
  }
  function nothing() {}
  function createObj(base, props) {
    var inst;
    if (Object.create) {
      inst = Object.create(base);
    } else {
      nothing.prototype = base;
      inst = new nothing();
    }
    if (props) { copyObj(props, inst); }
    return inst
  }
  var StringStream = function(string, tabSize, lineOracle) {
    this.pos = this.start = 0;
    this.string = string;
    this.tabSize = tabSize || 8;
    this.lastColumnPos = this.lastColumnValue = 0;
    this.lineStart = 0;
    this.lineOracle = lineOracle;
  };
  StringStream.prototype.eol = function () {return this.pos >= this.string.length};
  StringStream.prototype.sol = function () {return this.pos == this.lineStart};
  StringStream.prototype.peek = function () {return this.string.charAt(this.pos) || undefined};
  StringStream.prototype.next = function () {
    if (this.pos < this.string.length)
      { return this.string.charAt(this.pos++) }
  };
  StringStream.prototype.eat = function (match) {
    var ch = this.string.charAt(this.pos);
    var ok;
    if (typeof match == "string") { ok = ch == match; }
    else { ok = ch && (match.test ? match.test(ch) : match(ch)); }
    if (ok) {++this.pos; return ch}
  };
  StringStream.prototype.eatWhile = function (match) {
    var start = this.pos;
    while (this.eat(match)){}
    return this.pos > start
  };
  StringStream.prototype.eatSpace = function () {
    var start = this.pos;
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) { ++this.pos; }
    return this.pos > start
  };
  StringStream.prototype.skipToEnd = function () {this.pos = this.string.length;};
  StringStream.prototype.skipTo = function (ch) {
    var found = this.string.indexOf(ch, this.pos);
    if (found > -1) {this.pos = found; return true}
  };
  StringStream.prototype.backUp = function (n) {this.pos -= n;};
  StringStream.prototype.column = function () {
    if (this.lastColumnPos < this.start) {
      this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
      this.lastColumnPos = this.start;
    }
    return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
  };
  StringStream.prototype.indentation = function () {
    return countColumn(this.string, null, this.tabSize) -
      (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
  };
  StringStream.prototype.match = function (pattern, consume, caseInsensitive) {
    if (typeof pattern == "string") {
      var cased = function (str) { return caseInsensitive ? str.toLowerCase() : str; };
      var substr = this.string.substr(this.pos, pattern.length);
      if (cased(substr) == cased(pattern)) {
        if (consume !== false) { this.pos += pattern.length; }
        return true
      }
    } else {
      var match = this.string.slice(this.pos).match(pattern);
      if (match && match.index > 0) { return null }
      if (match && consume !== false) { this.pos += match[0].length; }
      return match
    }
  };
  StringStream.prototype.current = function (){return this.string.slice(this.start, this.pos)};
  StringStream.prototype.hideFirstChars = function (n, inner) {
    this.lineStart += n;
    try { return inner() }
    finally { this.lineStart -= n; }
  };
  StringStream.prototype.lookAhead = function (n) {
    var oracle = this.lineOracle;
    return oracle && oracle.lookAhead(n)
  };
  StringStream.prototype.baseToken = function () {
    var oracle = this.lineOracle;
    return oracle && oracle.baseToken(this.pos)
  };
  var modes = {}, mimeModes = {};
  function defineMode(name, mode) {
    if (arguments.length > 2)
      { mode.dependencies = Array.prototype.slice.call(arguments, 2); }
    modes[name] = mode;
  }
  function defineMIME(mime, spec) {
    mimeModes[mime] = spec;
  }
  function resolveMode(spec) {
    if (typeof spec == "string" && mimeModes.hasOwnProperty(spec)) {
      spec = mimeModes[spec];
    } else if (spec && typeof spec.name == "string" && mimeModes.hasOwnProperty(spec.name)) {
      var found = mimeModes[spec.name];
      if (typeof found == "string") { found = {name: found}; }
      spec = createObj(found, spec);
      spec.name = found.name;
    } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec)) {
      return resolveMode("application/xml")
    } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+json$/.test(spec)) {
      return resolveMode("application/json")
    }
    if (typeof spec == "string") { return {name: spec} }
    else { return spec || {name: "null"} }
  }
  function getMode(options, spec) {
    spec = resolveMode(spec);
    var mfactory = modes[spec.name];
    if (!mfactory) { return getMode(options, "text/plain") }
    var modeObj = mfactory(options, spec);
    if (modeExtensions.hasOwnProperty(spec.name)) {
      var exts = modeExtensions[spec.name];
      for (var prop in exts) {
        if (!exts.hasOwnProperty(prop)) { continue }
        if (modeObj.hasOwnProperty(prop)) { modeObj["_" + prop] = modeObj[prop]; }
        modeObj[prop] = exts[prop];
      }
    }
    modeObj.name = spec.name;
    if (spec.helperType) { modeObj.helperType = spec.helperType; }
    if (spec.modeProps) { for (var prop$1 in spec.modeProps)
      { modeObj[prop$1] = spec.modeProps[prop$1]; } }
    return modeObj
  }
  var modeExtensions = {};
  function extendMode(mode, properties) {
    var exts = modeExtensions.hasOwnProperty(mode) ? modeExtensions[mode] : (modeExtensions[mode] = {});
    copyObj(properties, exts);
  }
  function copyState(mode, state) {
    if (state === true) { return state }
    if (mode.copyState) { return mode.copyState(state) }
    var nstate = {};
    for (var n in state) {
      var val = state[n];
      if (val instanceof Array) { val = val.concat([]); }
      nstate[n] = val;
    }
    return nstate
  }
  function innerMode(mode, state) {
    var info;
    while (mode.innerMode) {
      info = mode.innerMode(state);
      if (!info || info.mode == mode) { break }
      state = info.state;
      mode = info.mode;
    }
    return info || {mode: mode, state: state}
  }
  function startState(mode, a1, a2) {
    return mode.startState ? mode.startState(a1, a2) : true
  }
  var modeMethods = ({
    __proto__: null,
    modes: modes,
    mimeModes: mimeModes,
    defineMode: defineMode,
    defineMIME: defineMIME,
    resolveMode: resolveMode,
    getMode: getMode,
    modeExtensions: modeExtensions,
    extendMode: extendMode,
    copyState: copyState,
    innerMode: innerMode,
    startState: startState
  });
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.CodeMirror = {};
  CodeMirror.StringStream = StringStream;
  for (var exported in modeMethods) { CodeMirror[exported] = modeMethods[exported]; }
  CodeMirror.defineMode("null", function () { return ({token: function (stream) { return stream.skipToEnd(); }}); });
  CodeMirror.defineMIME("text/plain", "null");
  CodeMirror.registerHelper = CodeMirror.registerGlobalHelper = Math.min;
  CodeMirror.splitLines = function(string) { return string.split(/\r?\n|\r/) };
  CodeMirror.countColumn = countColumn;
  CodeMirror.defaults = { indentUnit: 2 };
  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  (function(mod) {
    if (typeof exports == "object" && typeof module == "object")
      { mod(require("../../lib/codemirror")); }
    else if (typeof define == "function" && define.amd)
      { define(["../../lib/codemirror"], mod); }
    else
      { mod(CodeMirror); }
  })(function(CodeMirror) {
  CodeMirror.runMode = function(string, modespec, callback, options) {
    var mode = CodeMirror.getMode(CodeMirror.defaults, modespec);
    var tabSize = (options && options.tabSize) || CodeMirror.defaults.tabSize;
    if (callback.appendChild) {
      var ie = /MSIE \d/.test(navigator.userAgent);
      var ie_lt9 = ie && (document.documentMode == null || document.documentMode < 9);
      var node = callback, col = 0;
      node.innerHTML = "";
      callback = function(text, style) {
        if (text == "\n") {
          node.appendChild(document.createTextNode(ie_lt9 ? '\r' : text));
          col = 0;
          return;
        }
        var content = "";
        for (var pos = 0;;) {
          var idx = text.indexOf("\t", pos);
          if (idx == -1) {
            content += text.slice(pos);
            col += text.length - pos;
            break;
          } else {
            col += idx - pos;
            content += text.slice(pos, idx);
            var size = tabSize - col % tabSize;
            col += size;
            for (var i = 0; i < size; ++i) { content += " "; }
            pos = idx + 1;
          }
        }
        if (style) {
          var sp = node.appendChild(document.createElement("span"));
          sp.className = "cm-" + style.replace(/ +/g, " cm-");
          sp.appendChild(document.createTextNode(content));
        } else {
          node.appendChild(document.createTextNode(content));
        }
      };
    }
    var lines = CodeMirror.splitLines(string), state = (options && options.state) || CodeMirror.startState(mode);
    for (var i = 0, e = lines.length; i < e; ++i) {
      if (i) { callback("\n"); }
      var stream = new CodeMirror.StringStream(lines[i], null, {
        lookAhead: function(n) { return lines[i + n] },
        baseToken: function() {}
      });
      if (!stream.string && mode.blankLine) { mode.blankLine(state); }
      while (!stream.eol()) {
        var style = mode.token(stream, state);
        callback(stream.current(), style, i, stream.start, state, mode);
        stream.start = stream.pos;
      }
    }
  };
  });
}());

// CodeMirror, copyright (c) by Marijn Haverbeke and others
(function(mod) {
  if (typeof exports == "object" && typeof module == "object")
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd)
    define(["../../lib/codemirror"], mod);
  else
    mod(CodeMirror);
})(function(CodeMirror) {
CodeMirror.defineMode("css", function(config, parserConfig) {
  var inline = parserConfig.inline;
  if (!parserConfig.propertyKeywords) parserConfig = CodeMirror.resolveMode("text/css");
  var indentUnit = config.indentUnit,
      tokenHooks = parserConfig.tokenHooks,
      documentTypes = parserConfig.documentTypes || {},
      mediaTypes = parserConfig.mediaTypes || {},
      mediaFeatures = parserConfig.mediaFeatures || {},
      mediaValueKeywords = parserConfig.mediaValueKeywords || {},
      propertyKeywords = parserConfig.propertyKeywords || {},
      nonStandardPropertyKeywords = parserConfig.nonStandardPropertyKeywords || {},
      fontProperties = parserConfig.fontProperties || {},
      counterDescriptors = parserConfig.counterDescriptors || {},
      colorKeywords = parserConfig.colorKeywords || {},
      valueKeywords = parserConfig.valueKeywords || {},
      allowNested = parserConfig.allowNested,
      lineComment = parserConfig.lineComment,
      supportsAtComponent = parserConfig.supportsAtComponent === true,
      highlightNonStandardPropertyKeywords = config.highlightNonStandardPropertyKeywords !== false;
  var type, override;
  function ret(style, tp) { type = tp; return style; }
  function tokenBase(stream, state) {
    var ch = stream.next();
    if (tokenHooks[ch]) {
      var result = tokenHooks[ch](stream, state);
      if (result !== false) return result;
    }
    if (ch == "@") {
      stream.eatWhile(/[\w\\\-]/);
      return ret("def", stream.current());
    } else if (ch == "=" || (ch == "~" || ch == "|") && stream.eat("=")) {
      return ret(null, "compare");
    } else if (ch == "\"" || ch == "'") {
      state.tokenize = tokenString(ch);
      return state.tokenize(stream, state);
    } else if (ch == "#") {
      stream.eatWhile(/[\w\\\-]/);
      return ret("atom", "hash");
    } else if (ch == "!") {
      stream.match(/^\s*\w*/);
      return ret("keyword", "important");
    } else if (/\d/.test(ch) || ch == "." && stream.eat(/\d/)) {
      stream.eatWhile(/[\w.%]/);
      return ret("number", "unit");
    } else if (ch === "-") {
      if (/[\d.]/.test(stream.peek())) {
        stream.eatWhile(/[\w.%]/);
        return ret("number", "unit");
      } else if (stream.match(/^-[\w\\\-]*/)) {
        stream.eatWhile(/[\w\\\-]/);
        if (stream.match(/^\s*:/, false))
          return ret("variable-2", "variable-definition");
        return ret("variable-2", "variable");
      } else if (stream.match(/^\w+-/)) {
        return ret("meta", "meta");
      }
    } else if (/[,+>*\/]/.test(ch)) {
      return ret(null, "select-op");
    } else if (ch == "." && stream.match(/^-?[_a-z][_a-z0-9-]*/i)) {
      return ret("qualifier", "qualifier");
    } else if (/[:;{}\[\]\(\)]/.test(ch)) {
      return ret(null, ch);
    } else if (stream.match(/^[\w-.]+(?=\()/)) {
      if (/^(url(-prefix)?|domain|regexp)$/i.test(stream.current())) {
        state.tokenize = tokenParenthesized;
      }
      return ret("variable callee", "variable");
    } else if (/[\w\\\-]/.test(ch)) {
      stream.eatWhile(/[\w\\\-]/);
      return ret("property", "word");
    } else {
      return ret(null, null);
    }
  }
  function tokenString(quote) {
    return function(stream, state) {
      var escaped = false, ch;
      while ((ch = stream.next()) != null) {
        if (ch == quote && !escaped) {
          if (quote == ")") stream.backUp(1);
          break;
        }
        escaped = !escaped && ch == "\\";
      }
      if (ch == quote || !escaped && quote != ")") state.tokenize = null;
      return ret("string", "string");
    };
  }
  function tokenParenthesized(stream, state) {
    stream.next();
    if (!stream.match(/^\s*[\"\')]/, false))
      state.tokenize = tokenString(")");
    else
      state.tokenize = null;
    return ret(null, "(");
  }
  function Context(type, indent, prev) {
    this.type = type;
    this.indent = indent;
    this.prev = prev;
  }
  function pushContext(state, stream, type, indent) {
    state.context = new Context(type, stream.indentation() + (indent === false ? 0 : indentUnit), state.context);
    return type;
  }
  function popContext(state) {
    if (state.context.prev)
      state.context = state.context.prev;
    return state.context.type;
  }
  function pass(type, stream, state) {
    return states[state.context.type](type, stream, state);
  }
  function popAndPass(type, stream, state, n) {
    for (var i = n || 1; i > 0; i--)
      state.context = state.context.prev;
    return pass(type, stream, state);
  }
  function wordAsValue(stream) {
    var word = stream.current().toLowerCase();
    if (valueKeywords.hasOwnProperty(word))
      override = "atom";
    else if (colorKeywords.hasOwnProperty(word))
      override = "keyword";
    else
      override = "variable";
  }
  var states = {};
  states.top = function(type, stream, state) {
    if (type == "{") {
      return pushContext(state, stream, "block");
    } else if (type == "}" && state.context.prev) {
      return popContext(state);
    } else if (supportsAtComponent && /@component/i.test(type)) {
      return pushContext(state, stream, "atComponentBlock");
    } else if (/^@(-moz-)?document$/i.test(type)) {
      return pushContext(state, stream, "documentTypes");
    } else if (/^@(media|supports|(-moz-)?document|import)$/i.test(type)) {
      return pushContext(state, stream, "atBlock");
    } else if (/^@(font-face|counter-style)/i.test(type)) {
      state.stateArg = type;
      return "restricted_atBlock_before";
    } else if (/^@(-(moz|ms|o|webkit)-)?keyframes$/i.test(type)) {
      return "keyframes";
    } else if (type && type.charAt(0) == "@") {
      return pushContext(state, stream, "at");
    } else if (type == "hash") {
      override = "builtin";
    } else if (type == "word") {
      override = "tag";
    } else if (type == "variable-definition") {
      return "maybeprop";
    } else if (type == "interpolation") {
      return pushContext(state, stream, "interpolation");
    } else if (type == ":") {
      return "pseudo";
    } else if (allowNested && type == "(") {
      return pushContext(state, stream, "parens");
    }
    return state.context.type;
  };
  states.block = function(type, stream, state) {
    if (type == "word") {
      var word = stream.current().toLowerCase();
      if (propertyKeywords.hasOwnProperty(word)) {
        override = "property";
        return "maybeprop";
      } else if (nonStandardPropertyKeywords.hasOwnProperty(word)) {
        override = highlightNonStandardPropertyKeywords ? "string-2" : "property";
        return "maybeprop";
      } else if (allowNested) {
        override = stream.match(/^\s*:(?:\s|$)/, false) ? "property" : "tag";
        return "block";
      } else {
        override += " error";
        return "maybeprop";
      }
    } else if (type == "meta") {
      return "block";
    } else if (!allowNested && (type == "hash" || type == "qualifier")) {
      override = "error";
      return "block";
    } else {
      return states.top(type, stream, state);
    }
  };
  states.maybeprop = function(type, stream, state) {
    if (type == ":") return pushContext(state, stream, "prop");
    return pass(type, stream, state);
  };
  states.prop = function(type, stream, state) {
    if (type == ";") return popContext(state);
    if (type == "{" && allowNested) return pushContext(state, stream, "propBlock");
    if (type == "}" || type == "{") return popAndPass(type, stream, state);
    if (type == "(") return pushContext(state, stream, "parens");
    if (type == "hash" && !/^#([0-9a-fA-f]{3,4}|[0-9a-fA-f]{6}|[0-9a-fA-f]{8})$/.test(stream.current())) {
      override += " error";
    } else if (type == "word") {
      wordAsValue(stream);
    } else if (type == "interpolation") {
      return pushContext(state, stream, "interpolation");
    }
    return "prop";
  };
  states.propBlock = function(type, _stream, state) {
    if (type == "}") return popContext(state);
    if (type == "word") { override = "property"; return "maybeprop"; }
    return state.context.type;
  };
  states.parens = function(type, stream, state) {
    if (type == "{" || type == "}") return popAndPass(type, stream, state);
    if (type == ")") return popContext(state);
    if (type == "(") return pushContext(state, stream, "parens");
    if (type == "interpolation") return pushContext(state, stream, "interpolation");
    if (type == "word") wordAsValue(stream);
    return "parens";
  };
  states.pseudo = function(type, stream, state) {
    if (type == "meta") return "pseudo";
    if (type == "word") {
      override = "variable-3";
      return state.context.type;
    }
    return pass(type, stream, state);
  };
  states.documentTypes = function(type, stream, state) {
    if (type == "word" && documentTypes.hasOwnProperty(stream.current())) {
      override = "tag";
      return state.context.type;
    } else {
      return states.atBlock(type, stream, state);
    }
  };
  states.atBlock = function(type, stream, state) {
    if (type == "(") return pushContext(state, stream, "atBlock_parens");
    if (type == "}" || type == ";") return popAndPass(type, stream, state);
    if (type == "{") return popContext(state) && pushContext(state, stream, allowNested ? "block" : "top");
    if (type == "interpolation") return pushContext(state, stream, "interpolation");
    if (type == "word") {
      var word = stream.current().toLowerCase();
      if (word == "only" || word == "not" || word == "and" || word == "or")
        override = "keyword";
      else if (mediaTypes.hasOwnProperty(word))
        override = "attribute";
      else if (mediaFeatures.hasOwnProperty(word))
        override = "property";
      else if (mediaValueKeywords.hasOwnProperty(word))
        override = "keyword";
      else if (propertyKeywords.hasOwnProperty(word))
        override = "property";
      else if (nonStandardPropertyKeywords.hasOwnProperty(word))
        override = highlightNonStandardPropertyKeywords ? "string-2" : "property";
      else if (valueKeywords.hasOwnProperty(word))
        override = "atom";
      else if (colorKeywords.hasOwnProperty(word))
        override = "keyword";
      else
        override = "error";
    }
    return state.context.type;
  };
  states.atComponentBlock = function(type, stream, state) {
    if (type == "}")
      return popAndPass(type, stream, state);
    if (type == "{")
      return popContext(state) && pushContext(state, stream, allowNested ? "block" : "top", false);
    if (type == "word")
      override = "error";
    return state.context.type;
  };
  states.atBlock_parens = function(type, stream, state) {
    if (type == ")") return popContext(state);
    if (type == "{" || type == "}") return popAndPass(type, stream, state, 2);
    return states.atBlock(type, stream, state);
  };
  states.restricted_atBlock_before = function(type, stream, state) {
    if (type == "{")
      return pushContext(state, stream, "restricted_atBlock");
    if (type == "word" && state.stateArg == "@counter-style") {
      override = "variable";
      return "restricted_atBlock_before";
    }
    return pass(type, stream, state);
  };
  states.restricted_atBlock = function(type, stream, state) {
    if (type == "}") {
      state.stateArg = null;
      return popContext(state);
    }
    if (type == "word") {
      if ((state.stateArg == "@font-face" && !fontProperties.hasOwnProperty(stream.current().toLowerCase())) ||
          (state.stateArg == "@counter-style" && !counterDescriptors.hasOwnProperty(stream.current().toLowerCase())))
        override = "error";
      else
        override = "property";
      return "maybeprop";
    }
    return "restricted_atBlock";
  };
  states.keyframes = function(type, stream, state) {
    if (type == "word") { override = "variable"; return "keyframes"; }
    if (type == "{") return pushContext(state, stream, "top");
    return pass(type, stream, state);
  };
  states.at = function(type, stream, state) {
    if (type == ";") return popContext(state);
    if (type == "{" || type == "}") return popAndPass(type, stream, state);
    if (type == "word") override = "tag";
    else if (type == "hash") override = "builtin";
    return "at";
  };
  states.interpolation = function(type, stream, state) {
    if (type == "}") return popContext(state);
    if (type == "{" || type == ";") return popAndPass(type, stream, state);
    if (type == "word") override = "variable";
    else if (type != "variable" && type != "(" && type != ")") override = "error";
    return "interpolation";
  };
  return {
    startState: function(base) {
      return {tokenize: null,
              state: inline ? "block" : "top",
              stateArg: null,
              context: new Context(inline ? "block" : "top", base || 0, null)};
    },
    token: function(stream, state) {
      if (!state.tokenize && stream.eatSpace()) return null;
      var style = (state.tokenize || tokenBase)(stream, state);
      if (style && typeof style == "object") {
        type = style[1];
        style = style[0];
      }
      override = style;
      if (type != "comment")
        state.state = states[state.state](type, stream, state);
      return override;
    },
    indent: function(state, textAfter) {
      var cx = state.context, ch = textAfter && textAfter.charAt(0);
      var indent = cx.indent;
      if (cx.type == "prop" && (ch == "}" || ch == ")")) cx = cx.prev;
      if (cx.prev) {
        if (ch == "}" && (cx.type == "block" || cx.type == "top" ||
                          cx.type == "interpolation" || cx.type == "restricted_atBlock")) {
          cx = cx.prev;
          indent = cx.indent;
        } else if (ch == ")" && (cx.type == "parens" || cx.type == "atBlock_parens") ||
            ch == "{" && (cx.type == "at" || cx.type == "atBlock")) {
          indent = Math.max(0, cx.indent - indentUnit);
        }
      }
      return indent;
    },
    electricChars: "}",
    blockCommentStart: "/*",
    blockCommentEnd: "*/",
    blockCommentContinue: " * ",
    lineComment: lineComment,
    fold: "brace"
  };
});
  function keySet(array) {
    var keys = {};
    for (var i = 0; i < array.length; ++i) {
      keys[array[i].toLowerCase()] = true;
    }
    return keys;
  }
  var documentTypes_ = [
    "domain", "regexp", "url", "url-prefix"
  ], documentTypes = keySet(documentTypes_);
  var mediaTypes_ = [
    "all", "aural", "braille", "handheld", "print", "projection", "screen",
    "tty", "tv", "embossed"
  ], mediaTypes = keySet(mediaTypes_);
  var mediaFeatures_ = [
    "width", "min-width", "max-width", "height", "min-height", "max-height",
    "device-width", "min-device-width", "max-device-width", "device-height",
    "min-device-height", "max-device-height", "aspect-ratio",
    "min-aspect-ratio", "max-aspect-ratio", "device-aspect-ratio",
    "min-device-aspect-ratio", "max-device-aspect-ratio", "color", "min-color",
    "max-color", "color-index", "min-color-index", "max-color-index",
    "monochrome", "min-monochrome", "max-monochrome", "resolution",
    "min-resolution", "max-resolution", "scan", "grid", "orientation",
    "device-pixel-ratio", "min-device-pixel-ratio", "max-device-pixel-ratio",
    "pointer", "any-pointer", "hover", "any-hover", "prefers-color-scheme"
  ], mediaFeatures = keySet(mediaFeatures_);
  var mediaValueKeywords_ = [
    "landscape", "portrait", "none", "coarse", "fine", "on-demand", "hover",
    "interlace", "progressive",
    "dark", "light"
  ], mediaValueKeywords = keySet(mediaValueKeywords_);
  var propertyKeywords_ = [
    "align-content", "align-items", "align-self", "alignment-adjust",
    "alignment-baseline", "all", "anchor-point", "animation", "animation-delay",
    "animation-direction", "animation-duration", "animation-fill-mode",
    "animation-iteration-count", "animation-name", "animation-play-state",
    "animation-timing-function", "appearance", "azimuth", "backdrop-filter",
    "backface-visibility", "background", "background-attachment",
    "background-blend-mode", "background-clip", "background-color",
    "background-image", "background-origin", "background-position",
    "background-position-x", "background-position-y", "background-repeat",
    "background-size", "baseline-shift", "binding", "bleed", "block-size",
    "bookmark-label", "bookmark-level", "bookmark-state", "bookmark-target",
    "border", "border-bottom", "border-bottom-color", "border-bottom-left-radius",
    "border-bottom-right-radius", "border-bottom-style", "border-bottom-width",
    "border-collapse", "border-color", "border-image", "border-image-outset",
    "border-image-repeat", "border-image-slice", "border-image-source",
    "border-image-width", "border-left", "border-left-color", "border-left-style",
    "border-left-width", "border-radius", "border-right", "border-right-color",
    "border-right-style", "border-right-width", "border-spacing", "border-style",
    "border-top", "border-top-color", "border-top-left-radius",
    "border-top-right-radius", "border-top-style", "border-top-width",
    "border-width", "bottom", "box-decoration-break", "box-shadow", "box-sizing",
    "break-after", "break-before", "break-inside", "caption-side", "caret-color",
    "clear", "clip", "color", "color-profile", "column-count", "column-fill",
    "column-gap", "column-rule", "column-rule-color", "column-rule-style",
    "column-rule-width", "column-span", "column-width", "columns", "contain",
    "content", "counter-increment", "counter-reset", "crop", "cue", "cue-after",
    "cue-before", "cursor", "direction", "display", "dominant-baseline",
    "drop-initial-after-adjust", "drop-initial-after-align",
    "drop-initial-before-adjust", "drop-initial-before-align", "drop-initial-size",
    "drop-initial-value", "elevation", "empty-cells", "fit", "fit-position",
    "flex", "flex-basis", "flex-direction", "flex-flow", "flex-grow",
    "flex-shrink", "flex-wrap", "float", "float-offset", "flow-from", "flow-into",
    "font", "font-family", "font-feature-settings", "font-kerning",
    "font-language-override", "font-optical-sizing", "font-size",
    "font-size-adjust", "font-stretch", "font-style", "font-synthesis",
    "font-variant", "font-variant-alternates", "font-variant-caps",
    "font-variant-east-asian", "font-variant-ligatures", "font-variant-numeric",
    "font-variant-position", "font-variation-settings", "font-weight", "gap",
    "grid", "grid-area", "grid-auto-columns", "grid-auto-flow", "grid-auto-rows",
    "grid-column", "grid-column-end", "grid-column-gap", "grid-column-start",
    "grid-gap", "grid-row", "grid-row-end", "grid-row-gap", "grid-row-start",
    "grid-template", "grid-template-areas", "grid-template-columns",
    "grid-template-rows", "hanging-punctuation", "height", "hyphens", "icon",
    "image-orientation", "image-rendering", "image-resolution", "inline-box-align",
    "inset", "inset-block", "inset-block-end", "inset-block-start", "inset-inline",
    "inset-inline-end", "inset-inline-start", "isolation", "justify-content",
    "justify-items", "justify-self", "left", "letter-spacing", "line-break",
    "line-height", "line-height-step", "line-stacking", "line-stacking-ruby",
    "line-stacking-shift", "line-stacking-strategy", "list-style",
    "list-style-image", "list-style-position", "list-style-type", "margin",
    "margin-bottom", "margin-left", "margin-right", "margin-top", "marks",
    "marquee-direction", "marquee-loop", "marquee-play-count", "marquee-speed",
    "marquee-style", "mask-clip", "mask-composite", "mask-image", "mask-mode",
    "mask-origin", "mask-position", "mask-repeat", "mask-size","mask-type",
    "max-block-size", "max-height", "max-inline-size",
    "max-width", "min-block-size", "min-height", "min-inline-size", "min-width",
    "mix-blend-mode", "move-to", "nav-down", "nav-index", "nav-left", "nav-right",
    "nav-up", "object-fit", "object-position", "offset", "offset-anchor",
    "offset-distance", "offset-path", "offset-position", "offset-rotate",
    "opacity", "order", "orphans", "outline", "outline-color", "outline-offset",
    "outline-style", "outline-width", "overflow", "overflow-style",
    "overflow-wrap", "overflow-x", "overflow-y", "padding", "padding-bottom",
    "padding-left", "padding-right", "padding-top", "page", "page-break-after",
    "page-break-before", "page-break-inside", "page-policy", "pause",
    "pause-after", "pause-before", "perspective", "perspective-origin", "pitch",
    "pitch-range", "place-content", "place-items", "place-self", "play-during",
    "position", "presentation-level", "punctuation-trim", "quotes",
    "region-break-after", "region-break-before", "region-break-inside",
    "region-fragment", "rendering-intent", "resize", "rest", "rest-after",
    "rest-before", "richness", "right", "rotate", "rotation", "rotation-point",
    "row-gap", "ruby-align", "ruby-overhang", "ruby-position", "ruby-span",
    "scale", "scroll-behavior", "scroll-margin", "scroll-margin-block",
    "scroll-margin-block-end", "scroll-margin-block-start", "scroll-margin-bottom",
    "scroll-margin-inline", "scroll-margin-inline-end",
    "scroll-margin-inline-start", "scroll-margin-left", "scroll-margin-right",
    "scroll-margin-top", "scroll-padding", "scroll-padding-block",
    "scroll-padding-block-end", "scroll-padding-block-start",
    "scroll-padding-bottom", "scroll-padding-inline", "scroll-padding-inline-end",
    "scroll-padding-inline-start", "scroll-padding-left", "scroll-padding-right",
    "scroll-padding-top", "scroll-snap-align", "scroll-snap-type",
    "shape-image-threshold", "shape-inside", "shape-margin", "shape-outside",
    "size", "speak", "speak-as", "speak-header", "speak-numeral",
    "speak-punctuation", "speech-rate", "stress", "string-set", "tab-size",
    "table-layout", "target", "target-name", "target-new", "target-position",
    "text-align", "text-align-last", "text-combine-upright", "text-decoration",
    "text-decoration-color", "text-decoration-line", "text-decoration-skip",
    "text-decoration-skip-ink", "text-decoration-style", "text-emphasis",
    "text-emphasis-color", "text-emphasis-position", "text-emphasis-style",
    "text-height", "text-indent", "text-justify", "text-orientation",
    "text-outline", "text-overflow", "text-rendering", "text-shadow",
    "text-size-adjust", "text-space-collapse", "text-transform",
    "text-underline-position", "text-wrap", "top", "touch-action", "transform", "transform-origin",
    "transform-style", "transition", "transition-delay", "transition-duration",
    "transition-property", "transition-timing-function", "translate",
    "unicode-bidi", "user-select", "vertical-align", "visibility", "voice-balance",
    "voice-duration", "voice-family", "voice-pitch", "voice-range", "voice-rate",
    "voice-stress", "voice-volume", "volume", "white-space", "widows", "width",
    "will-change", "word-break", "word-spacing", "word-wrap", "writing-mode", "z-index",
    "clip-path", "clip-rule", "mask", "enable-background", "filter", "flood-color",
    "flood-opacity", "lighting-color", "stop-color", "stop-opacity", "pointer-events",
    "color-interpolation", "color-interpolation-filters",
    "color-rendering", "fill", "fill-opacity", "fill-rule", "image-rendering",
    "marker", "marker-end", "marker-mid", "marker-start", "paint-order", "shape-rendering", "stroke",
    "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
    "stroke-miterlimit", "stroke-opacity", "stroke-width", "text-rendering",
    "baseline-shift", "dominant-baseline", "glyph-orientation-horizontal",
    "glyph-orientation-vertical", "text-anchor", "writing-mode",
  ], propertyKeywords = keySet(propertyKeywords_);
  var nonStandardPropertyKeywords_ = [
    "border-block", "border-block-color", "border-block-end",
    "border-block-end-color", "border-block-end-style", "border-block-end-width",
    "border-block-start", "border-block-start-color", "border-block-start-style",
    "border-block-start-width", "border-block-style", "border-block-width",
    "border-inline", "border-inline-color", "border-inline-end",
    "border-inline-end-color", "border-inline-end-style",
    "border-inline-end-width", "border-inline-start", "border-inline-start-color",
    "border-inline-start-style", "border-inline-start-width",
    "border-inline-style", "border-inline-width", "margin-block",
    "margin-block-end", "margin-block-start", "margin-inline", "margin-inline-end",
    "margin-inline-start", "padding-block", "padding-block-end",
    "padding-block-start", "padding-inline", "padding-inline-end",
    "padding-inline-start", "scroll-snap-stop", "scrollbar-3d-light-color",
    "scrollbar-arrow-color", "scrollbar-base-color", "scrollbar-dark-shadow-color",
    "scrollbar-face-color", "scrollbar-highlight-color", "scrollbar-shadow-color",
    "scrollbar-track-color", "searchfield-cancel-button", "searchfield-decoration",
    "searchfield-results-button", "searchfield-results-decoration", "shape-inside", "zoom"
  ], nonStandardPropertyKeywords = keySet(nonStandardPropertyKeywords_);
  var fontProperties_ = [
    "font-display", "font-family", "src", "unicode-range", "font-variant",
     "font-feature-settings", "font-stretch", "font-weight", "font-style"
  ], fontProperties = keySet(fontProperties_);
  var counterDescriptors_ = [
    "additive-symbols", "fallback", "negative", "pad", "prefix", "range",
    "speak-as", "suffix", "symbols", "system"
  ], counterDescriptors = keySet(counterDescriptors_);
  var colorKeywords_ = [
    "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
    "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
    "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue",
    "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod",
    "darkgray", "darkgreen", "darkkhaki", "darkmagenta", "darkolivegreen",
    "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkturquoise", "darkviolet",
    "deeppink", "deepskyblue", "dimgray", "dodgerblue", "firebrick",
    "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite",
    "gold", "goldenrod", "gray", "grey", "green", "greenyellow", "honeydew",
    "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
    "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
    "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightpink",
    "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
    "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta",
    "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple",
    "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
    "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin",
    "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered",
    "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
    "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
    "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown",
    "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue",
    "slateblue", "slategray", "snow", "springgreen", "steelblue", "tan",
    "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white",
    "whitesmoke", "yellow", "yellowgreen"
  ], colorKeywords = keySet(colorKeywords_);
  var valueKeywords_ = [
    "above", "absolute", "activeborder", "additive", "activecaption", "afar",
    "after-white-space", "ahead", "alias", "all", "all-scroll", "alphabetic", "alternate",
    "always", "amharic", "amharic-abegede", "antialiased", "appworkspace",
    "arabic-indic", "armenian", "asterisks", "attr", "auto", "auto-flow", "avoid", "avoid-column", "avoid-page",
    "avoid-region", "axis-pan", "background", "backwards", "baseline", "below", "bidi-override", "binary",
    "bengali", "blink", "block", "block-axis", "bold", "bolder", "border", "border-box",
    "both", "bottom", "break", "break-all", "break-word", "bullets", "button", "button-bevel",
    "buttonface", "buttonhighlight", "buttonshadow", "buttontext", "calc", "cambodian",
    "capitalize", "caps-lock-indicator", "caption", "captiontext", "caret",
    "cell", "center", "checkbox", "circle", "cjk-decimal", "cjk-earthly-branch",
    "cjk-heavenly-stem", "cjk-ideographic", "clear", "clip", "close-quote",
    "col-resize", "collapse", "color", "color-burn", "color-dodge", "column", "column-reverse",
    "compact", "condensed", "contain", "content", "contents",
    "content-box", "context-menu", "continuous", "copy", "counter", "counters", "cover", "crop",
    "cross", "crosshair", "currentcolor", "cursive", "cyclic", "darken", "dashed", "decimal",
    "decimal-leading-zero", "default", "default-button", "dense", "destination-atop",
    "destination-in", "destination-out", "destination-over", "devanagari", "difference",
    "disc", "discard", "disclosure-closed", "disclosure-open", "document",
    "dot-dash", "dot-dot-dash",
    "dotted", "double", "down", "e-resize", "ease", "ease-in", "ease-in-out", "ease-out",
    "element", "ellipse", "ellipsis", "embed", "end", "ethiopic", "ethiopic-abegede",
    "ethiopic-abegede-am-et", "ethiopic-abegede-gez", "ethiopic-abegede-ti-er",
    "ethiopic-abegede-ti-et", "ethiopic-halehame-aa-er",
    "ethiopic-halehame-aa-et", "ethiopic-halehame-am-et",
    "ethiopic-halehame-gez", "ethiopic-halehame-om-et",
    "ethiopic-halehame-sid-et", "ethiopic-halehame-so-et",
    "ethiopic-halehame-ti-er", "ethiopic-halehame-ti-et", "ethiopic-halehame-tig",
    "ethiopic-numeric", "ew-resize", "exclusion", "expanded", "extends", "extra-condensed",
    "extra-expanded", "fantasy", "fast", "fill", "fill-box", "fixed", "flat", "flex", "flex-end", "flex-start", "footnotes",
    "forwards", "from", "geometricPrecision", "georgian", "graytext", "grid", "groove",
    "gujarati", "gurmukhi", "hand", "hangul", "hangul-consonant", "hard-light", "hebrew",
    "help", "hidden", "hide", "higher", "highlight", "highlighttext",
    "hiragana", "hiragana-iroha", "horizontal", "hsl", "hsla", "hue", "icon", "ignore",
    "inactiveborder", "inactivecaption", "inactivecaptiontext", "infinite",
    "infobackground", "infotext", "inherit", "initial", "inline", "inline-axis",
    "inline-block", "inline-flex", "inline-grid", "inline-table", "inset", "inside", "intrinsic", "invert",
    "italic", "japanese-formal", "japanese-informal", "justify", "kannada",
    "katakana", "katakana-iroha", "keep-all", "khmer",
    "korean-hangul-formal", "korean-hanja-formal", "korean-hanja-informal",
    "landscape", "lao", "large", "larger", "left", "level", "lighter", "lighten",
    "line-through", "linear", "linear-gradient", "lines", "list-item", "listbox", "listitem",
    "local", "logical", "loud", "lower", "lower-alpha", "lower-armenian",
    "lower-greek", "lower-hexadecimal", "lower-latin", "lower-norwegian",
    "lower-roman", "lowercase", "ltr", "luminosity", "malayalam", "manipulation", "match", "matrix", "matrix3d",
    "media-controls-background", "media-current-time-display",
    "media-fullscreen-button", "media-mute-button", "media-play-button",
    "media-return-to-realtime-button", "media-rewind-button",
    "media-seek-back-button", "media-seek-forward-button", "media-slider",
    "media-sliderthumb", "media-time-remaining-display", "media-volume-slider",
    "media-volume-slider-container", "media-volume-sliderthumb", "medium",
    "menu", "menulist", "menulist-button", "menulist-text",
    "menulist-textfield", "menutext", "message-box", "middle", "min-intrinsic",
    "mix", "mongolian", "monospace", "move", "multiple", "multiple_mask_images", "multiply", "myanmar", "n-resize",
    "narrower", "ne-resize", "nesw-resize", "no-close-quote", "no-drop",
    "no-open-quote", "no-repeat", "none", "normal", "not-allowed", "nowrap",
    "ns-resize", "numbers", "numeric", "nw-resize", "nwse-resize", "oblique", "octal", "opacity", "open-quote",
    "optimizeLegibility", "optimizeSpeed", "oriya", "oromo", "outset",
    "outside", "outside-shape", "overlay", "overline", "padding", "padding-box",
    "painted", "page", "paused", "persian", "perspective", "pinch-zoom", "plus-darker", "plus-lighter",
    "pointer", "polygon", "portrait", "pre", "pre-line", "pre-wrap", "preserve-3d",
    "progress", "push-button", "radial-gradient", "radio", "read-only",
    "read-write", "read-write-plaintext-only", "rectangle", "region",
    "relative", "repeat", "repeating-linear-gradient",
    "repeating-radial-gradient", "repeat-x", "repeat-y", "reset", "reverse",
    "rgb", "rgba", "ridge", "right", "rotate", "rotate3d", "rotateX", "rotateY",
    "rotateZ", "round", "row", "row-resize", "row-reverse", "rtl", "run-in", "running",
    "s-resize", "sans-serif", "saturation", "scale", "scale3d", "scaleX", "scaleY", "scaleZ", "screen",
    "scroll", "scrollbar", "scroll-position", "se-resize", "searchfield",
    "searchfield-cancel-button", "searchfield-decoration",
    "searchfield-results-button", "searchfield-results-decoration", "self-start", "self-end",
    "semi-condensed", "semi-expanded", "separate", "serif", "show", "sidama",
    "simp-chinese-formal", "simp-chinese-informal", "single",
    "skew", "skewX", "skewY", "skip-white-space", "slide", "slider-horizontal",
    "slider-vertical", "sliderthumb-horizontal", "sliderthumb-vertical", "slow",
    "small", "small-caps", "small-caption", "smaller", "soft-light", "solid", "somali",
    "source-atop", "source-in", "source-out", "source-over", "space", "space-around", "space-between", "space-evenly", "spell-out", "square",
    "square-button", "start", "static", "status-bar", "stretch", "stroke", "stroke-box", "sub",
    "subpixel-antialiased", "svg_masks", "super", "sw-resize", "symbolic", "symbols", "system-ui", "table",
    "table-caption", "table-cell", "table-column", "table-column-group",
    "table-footer-group", "table-header-group", "table-row", "table-row-group",
    "tamil",
    "telugu", "text", "text-bottom", "text-top", "textarea", "textfield", "thai",
    "thick", "thin", "threeddarkshadow", "threedface", "threedhighlight",
    "threedlightshadow", "threedshadow", "tibetan", "tigre", "tigrinya-er",
    "tigrinya-er-abegede", "tigrinya-et", "tigrinya-et-abegede", "to", "top",
    "trad-chinese-formal", "trad-chinese-informal", "transform",
    "translate", "translate3d", "translateX", "translateY", "translateZ",
    "transparent", "ultra-condensed", "ultra-expanded", "underline", "unidirectional-pan", "unset", "up",
    "upper-alpha", "upper-armenian", "upper-greek", "upper-hexadecimal",
    "upper-latin", "upper-norwegian", "upper-roman", "uppercase", "urdu", "url",
    "var", "vertical", "vertical-text", "view-box", "visible", "visibleFill", "visiblePainted",
    "visibleStroke", "visual", "w-resize", "wait", "wave", "wider",
    "window", "windowframe", "windowtext", "words", "wrap", "wrap-reverse", "x-large", "x-small", "xor",
    "xx-large", "xx-small"
  ], valueKeywords = keySet(valueKeywords_);
  var allWords = documentTypes_.concat(mediaTypes_).concat(mediaFeatures_).concat(mediaValueKeywords_)
    .concat(propertyKeywords_).concat(nonStandardPropertyKeywords_).concat(colorKeywords_)
    .concat(valueKeywords_);
  CodeMirror.registerHelper("hintWords", "css", allWords);
  function tokenCComment(stream, state) {
    var maybeEnd = false, ch;
    while ((ch = stream.next()) != null) {
      if (maybeEnd && ch == "/") {
        state.tokenize = null;
        break;
      }
      maybeEnd = (ch == "*");
    }
    return ["comment", "comment"];
  }
  CodeMirror.defineMIME("text/css", {
    documentTypes: documentTypes,
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    mediaValueKeywords: mediaValueKeywords,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    fontProperties: fontProperties,
    counterDescriptors: counterDescriptors,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    tokenHooks: {
      "/": function(stream, state) {
        if (!stream.eat("*")) return false;
        state.tokenize = tokenCComment;
        return tokenCComment(stream, state);
      }
    },
    name: "css"
  });
  CodeMirror.defineMIME("text/x-scss", {
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    mediaValueKeywords: mediaValueKeywords,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    fontProperties: fontProperties,
    allowNested: true,
    lineComment: "//",
    tokenHooks: {
      "/": function(stream, state) {
        if (stream.eat("/")) {
          stream.skipToEnd();
          return ["comment", "comment"];
        } else if (stream.eat("*")) {
          state.tokenize = tokenCComment;
          return tokenCComment(stream, state);
        } else {
          return ["operator", "operator"];
        }
      },
      ":": function(stream) {
        if (stream.match(/^\s*\{/, false))
          return [null, null]
        return false;
      },
      "$": function(stream) {
        stream.match(/^[\w-]+/);
        if (stream.match(/^\s*:/, false))
          return ["variable-2", "variable-definition"];
        return ["variable-2", "variable"];
      },
      "#": function(stream) {
        if (!stream.eat("{")) return false;
        return [null, "interpolation"];
      }
    },
    name: "css",
    helperType: "scss"
  });
  CodeMirror.defineMIME("text/x-less", {
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    mediaValueKeywords: mediaValueKeywords,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    fontProperties: fontProperties,
    allowNested: true,
    lineComment: "//",
    tokenHooks: {
      "/": function(stream, state) {
        if (stream.eat("/")) {
          stream.skipToEnd();
          return ["comment", "comment"];
        } else if (stream.eat("*")) {
          state.tokenize = tokenCComment;
          return tokenCComment(stream, state);
        } else {
          return ["operator", "operator"];
        }
      },
      "@": function(stream) {
        if (stream.eat("{")) return [null, "interpolation"];
        if (stream.match(/^(charset|document|font-face|import|(-(moz|ms|o|webkit)-)?keyframes|media|namespace|page|supports)\b/i, false)) return false;
        stream.eatWhile(/[\w\\\-]/);
        if (stream.match(/^\s*:/, false))
          return ["variable-2", "variable-definition"];
        return ["variable-2", "variable"];
      },
      "&": function() {
        return ["atom", "atom"];
      }
    },
    name: "css",
    helperType: "less"
  });
  CodeMirror.defineMIME("text/x-gss", {
    documentTypes: documentTypes,
    mediaTypes: mediaTypes,
    mediaFeatures: mediaFeatures,
    propertyKeywords: propertyKeywords,
    nonStandardPropertyKeywords: nonStandardPropertyKeywords,
    fontProperties: fontProperties,
    counterDescriptors: counterDescriptors,
    colorKeywords: colorKeywords,
    valueKeywords: valueKeywords,
    supportsAtComponent: true,
    tokenHooks: {
      "/": function(stream, state) {
        if (!stream.eat("*")) return false;
        state.tokenize = tokenCComment;
        return tokenCComment(stream, state);
      }
    },
    name: "css",
    helperType: "gss"
  });
});

// CodeMirror, copyright (c) by Marijn Haverbeke and others
(function(mod) {
  if (typeof exports == "object" && typeof module == "object")
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd)
    define(["../../lib/codemirror"], mod);
  else
    mod(CodeMirror);
})(function(CodeMirror) {
var htmlConfig = {
  autoSelfClosers: {'area': true, 'base': true, 'br': true, 'col': true, 'command': true,
                    'embed': true, 'frame': true, 'hr': true, 'img': true, 'input': true,
                    'keygen': true, 'link': true, 'meta': true, 'param': true, 'source': true,
                    'track': true, 'wbr': true, 'menuitem': true},
  implicitlyClosed: {'dd': true, 'li': true, 'optgroup': true, 'option': true, 'p': true,
                     'rp': true, 'rt': true, 'tbody': true, 'td': true, 'tfoot': true,
                     'th': true, 'tr': true},
  contextGrabbers: {
    'dd': {'dd': true, 'dt': true},
    'dt': {'dd': true, 'dt': true},
    'li': {'li': true},
    'option': {'option': true, 'optgroup': true},
    'optgroup': {'optgroup': true},
    'p': {'address': true, 'article': true, 'aside': true, 'blockquote': true, 'dir': true,
          'div': true, 'dl': true, 'fieldset': true, 'footer': true, 'form': true,
          'h1': true, 'h2': true, 'h3': true, 'h4': true, 'h5': true, 'h6': true,
          'header': true, 'hgroup': true, 'hr': true, 'menu': true, 'nav': true, 'ol': true,
          'p': true, 'pre': true, 'section': true, 'table': true, 'ul': true},
    'rp': {'rp': true, 'rt': true},
    'rt': {'rp': true, 'rt': true},
    'tbody': {'tbody': true, 'tfoot': true},
    'td': {'td': true, 'th': true},
    'tfoot': {'tbody': true},
    'th': {'td': true, 'th': true},
    'thead': {'tbody': true, 'tfoot': true},
    'tr': {'tr': true}
  },
  doNotIndent: {"pre": true},
  allowUnquoted: true,
  allowMissing: true,
  caseFold: true
};
var xmlConfig = {
  autoSelfClosers: {},
  implicitlyClosed: {},
  contextGrabbers: {},
  doNotIndent: {},
  allowUnquoted: false,
  allowMissing: false,
  allowMissingTagName: false,
  caseFold: false
};
CodeMirror.defineMode("xml", function(editorConf, config_) {
  var indentUnit = editorConf.indentUnit;
  var config = {};
  var defaults = config_.htmlMode ? htmlConfig : xmlConfig;
  for (var prop in defaults) config[prop] = defaults[prop];
  for (var prop in config_) config[prop] = config_[prop];
  var type, setStyle;
  function inText(stream, state) {
    function chain(parser) {
      state.tokenize = parser;
      return parser(stream, state);
    }
    var ch = stream.next();
    if (ch == "<") {
      if (stream.eat("!")) {
        if (stream.eat("[")) {
          if (stream.match("CDATA[")) return chain(inBlock("atom", "]]>"));
          else return null;
        } else if (stream.match("--")) {
          return chain(inBlock("comment", "-->"));
        } else if (stream.match("DOCTYPE", true, true)) {
          stream.eatWhile(/[\w\._\-]/);
          return chain(doctype(1));
        } else {
          return null;
        }
      } else if (stream.eat("?")) {
        stream.eatWhile(/[\w\._\-]/);
        state.tokenize = inBlock("meta", "?>");
        return "meta";
      } else {
        type = stream.eat("/") ? "closeTag" : "openTag";
        state.tokenize = inTag;
        return "tag bracket";
      }
    } else if (ch == "&") {
      var ok;
      if (stream.eat("#")) {
        if (stream.eat("x")) {
          ok = stream.eatWhile(/[a-fA-F\d]/) && stream.eat(";");
        } else {
          ok = stream.eatWhile(/[\d]/) && stream.eat(";");
        }
      } else {
        ok = stream.eatWhile(/[\w\.\-:]/) && stream.eat(";");
      }
      return ok ? "atom" : "error";
    } else {
      stream.eatWhile(/[^&<]/);
      return null;
    }
  }
  inText.isInText = true;
  function inTag(stream, state) {
    var ch = stream.next();
    if (ch == ">" || (ch == "/" && stream.eat(">"))) {
      state.tokenize = inText;
      type = ch == ">" ? "endTag" : "selfcloseTag";
      return "tag bracket";
    } else if (ch == "=") {
      type = "equals";
      return null;
    } else if (ch == "<") {
      state.tokenize = inText;
      state.state = baseState;
      state.tagName = state.tagStart = null;
      var next = state.tokenize(stream, state);
      return next ? next + " tag error" : "tag error";
    } else if (/[\'\"]/.test(ch)) {
      state.tokenize = inAttribute(ch);
      state.stringStartCol = stream.column();
      return state.tokenize(stream, state);
    } else {
      stream.match(/^[^\s\u00a0=<>\"\']*[^\s\u00a0=<>\"\'\/]/);
      return "word";
    }
  }
  function inAttribute(quote) {
    var closure = function(stream, state) {
      while (!stream.eol()) {
        if (stream.next() == quote) {
          state.tokenize = inTag;
          break;
        }
      }
      return "string";
    };
    closure.isInAttribute = true;
    return closure;
  }
  function inBlock(style, terminator) {
    return function(stream, state) {
      while (!stream.eol()) {
        if (stream.match(terminator)) {
          state.tokenize = inText;
          break;
        }
        stream.next();
      }
      return style;
    }
  }
  function doctype(depth) {
    return function(stream, state) {
      var ch;
      while ((ch = stream.next()) != null) {
        if (ch == "<") {
          state.tokenize = doctype(depth + 1);
          return state.tokenize(stream, state);
        } else if (ch == ">") {
          if (depth == 1) {
            state.tokenize = inText;
            break;
          } else {
            state.tokenize = doctype(depth - 1);
            return state.tokenize(stream, state);
          }
        }
      }
      return "meta";
    };
  }
  function Context(state, tagName, startOfLine) {
    this.prev = state.context;
    this.tagName = tagName || "";
    this.indent = state.indented;
    this.startOfLine = startOfLine;
    if (config.doNotIndent.hasOwnProperty(tagName) || (state.context && state.context.noIndent))
      this.noIndent = true;
  }
  function popContext(state) {
    if (state.context) state.context = state.context.prev;
  }
  function maybePopContext(state, nextTagName) {
    var parentTagName;
    while (true) {
      if (!state.context) {
        return;
      }
      parentTagName = state.context.tagName;
      if (!config.contextGrabbers.hasOwnProperty(parentTagName) ||
          !config.contextGrabbers[parentTagName].hasOwnProperty(nextTagName)) {
        return;
      }
      popContext(state);
    }
  }
  function baseState(type, stream, state) {
    if (type == "openTag") {
      state.tagStart = stream.column();
      return tagNameState;
    } else if (type == "closeTag") {
      return closeTagNameState;
    } else {
      return baseState;
    }
  }
  function tagNameState(type, stream, state) {
    if (type == "word") {
      state.tagName = stream.current();
      setStyle = "tag";
      return attrState;
    } else if (config.allowMissingTagName && type == "endTag") {
      setStyle = "tag bracket";
      return attrState(type, stream, state);
    } else {
      setStyle = "error";
      return tagNameState;
    }
  }
  function closeTagNameState(type, stream, state) {
    if (type == "word") {
      var tagName = stream.current();
      if (state.context && state.context.tagName != tagName &&
          config.implicitlyClosed.hasOwnProperty(state.context.tagName))
        popContext(state);
      if ((state.context && state.context.tagName == tagName) || config.matchClosing === false) {
        setStyle = "tag";
        return closeState;
      } else {
        setStyle = "tag error";
        return closeStateErr;
      }
    } else if (config.allowMissingTagName && type == "endTag") {
      setStyle = "tag bracket";
      return closeState(type, stream, state);
    } else {
      setStyle = "error";
      return closeStateErr;
    }
  }
  function closeState(type, _stream, state) {
    if (type != "endTag") {
      setStyle = "error";
      return closeState;
    }
    popContext(state);
    return baseState;
  }
  function closeStateErr(type, stream, state) {
    setStyle = "error";
    return closeState(type, stream, state);
  }
  function attrState(type, _stream, state) {
    if (type == "word") {
      setStyle = "attribute";
      return attrEqState;
    } else if (type == "endTag" || type == "selfcloseTag") {
      var tagName = state.tagName, tagStart = state.tagStart;
      state.tagName = state.tagStart = null;
      if (type == "selfcloseTag" ||
          config.autoSelfClosers.hasOwnProperty(tagName)) {
        maybePopContext(state, tagName);
      } else {
        maybePopContext(state, tagName);
        state.context = new Context(state, tagName, tagStart == state.indented);
      }
      return baseState;
    }
    setStyle = "error";
    return attrState;
  }
  function attrEqState(type, stream, state) {
    if (type == "equals") return attrValueState;
    if (!config.allowMissing) setStyle = "error";
    return attrState(type, stream, state);
  }
  function attrValueState(type, stream, state) {
    if (type == "string") return attrContinuedState;
    if (type == "word" && config.allowUnquoted) {setStyle = "string"; return attrState;}
    setStyle = "error";
    return attrState(type, stream, state);
  }
  function attrContinuedState(type, stream, state) {
    if (type == "string") return attrContinuedState;
    return attrState(type, stream, state);
  }
  return {
    startState: function(baseIndent) {
      var state = {tokenize: inText,
                   state: baseState,
                   indented: baseIndent || 0,
                   tagName: null, tagStart: null,
                   context: null};
      if (baseIndent != null) state.baseIndent = baseIndent;
      return state
    },
    token: function(stream, state) {
      if (!state.tagName && stream.sol())
        state.indented = stream.indentation();
      if (stream.eatSpace()) return null;
      type = null;
      var style = state.tokenize(stream, state);
      if ((style || type) && style != "comment") {
        setStyle = null;
        state.state = state.state(type || style, stream, state);
        if (setStyle)
          style = setStyle == "error" ? style + " error" : setStyle;
      }
      return style;
    },
    indent: function(state, textAfter, fullLine) {
      var context = state.context;
      if (state.tokenize.isInAttribute) {
        if (state.tagStart == state.indented)
          return state.stringStartCol + 1;
        else
          return state.indented + indentUnit;
      }
      if (context && context.noIndent) return CodeMirror.Pass;
      if (state.tokenize != inTag && state.tokenize != inText)
        return fullLine ? fullLine.match(/^(\s*)/)[0].length : 0;
      if (state.tagName) {
        if (config.multilineTagIndentPastTag !== false)
          return state.tagStart + state.tagName.length + 2;
        else
          return state.tagStart + indentUnit * (config.multilineTagIndentFactor || 1);
      }
      if (config.alignCDATA && /<!\[CDATA\[/.test(textAfter)) return 0;
      var tagAfter = textAfter && /^<(\/)?([\w_:\.-]*)/.exec(textAfter);
      if (tagAfter && tagAfter[1]) {
        while (context) {
          if (context.tagName == tagAfter[2]) {
            context = context.prev;
            break;
          } else if (config.implicitlyClosed.hasOwnProperty(context.tagName)) {
            context = context.prev;
          } else {
            break;
          }
        }
      } else if (tagAfter) {
        while (context) {
          var grabbers = config.contextGrabbers[context.tagName];
          if (grabbers && grabbers.hasOwnProperty(tagAfter[2]))
            context = context.prev;
          else
            break;
        }
      }
      while (context && context.prev && !context.startOfLine)
        context = context.prev;
      if (context) return context.indent + indentUnit;
      else return state.baseIndent || 0;
    },
    electricInput: /<\/[\s\w:]+>$/,
    blockCommentStart: "<!--",
    blockCommentEnd: "-->",
    configuration: config.htmlMode ? "html" : "xml",
    helperType: config.htmlMode ? "html" : "xml",
    skipAttribute: function(state) {
      if (state.state == attrValueState)
        state.state = attrState;
    },
    xmlCurrentTag: function(state) {
      return state.tagName ? {name: state.tagName, close: state.type == "closeTag"} : null
    },
    xmlCurrentContext: function(state) {
      var context = [];
      for (var cx = state.context; cx; cx = cx.prev)
        context.push(cx.tagName);
      return context.reverse()
    }
  };
});
CodeMirror.defineMIME("text/xml", "xml");
CodeMirror.defineMIME("application/xml", "xml");
if (!CodeMirror.mimeModes.hasOwnProperty("text/html"))
  CodeMirror.defineMIME("text/html", {name: "xml", htmlMode: true});
});

// CodeMirror, copyright (c) by Marijn Haverbeke and others
(function(mod) {
  if (typeof exports == "object" && typeof module == "object")
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd)
    define(["../../lib/codemirror"], mod);
  else
    mod(CodeMirror);
})(function(CodeMirror) {
CodeMirror.defineMode("javascript", function(config, parserConfig) {
  var indentUnit = config.indentUnit;
  var statementIndent = parserConfig.statementIndent;
  var jsonldMode = parserConfig.jsonld;
  var jsonMode = parserConfig.json || jsonldMode;
  var trackScope = parserConfig.trackScope !== false;
  var isTS = parserConfig.typescript;
  var wordRE = parserConfig.wordCharacters || /[\w$\xa1-\uffff]/;
  var keywords = function(){
    function kw(type) {return {type: type, style: "keyword"};}
    var A = kw("keyword a"), B = kw("keyword b"), C = kw("keyword c"), D = kw("keyword d");
    var operator = kw("operator"), atom = {type: "atom", style: "atom"};
    return {
      "if": kw("if"), "while": A, "with": A, "else": B, "do": B, "try": B, "finally": B,
      "return": D, "break": D, "continue": D, "new": kw("new"), "delete": C, "void": C, "throw": C,
      "debugger": kw("debugger"), "var": kw("var"), "const": kw("var"), "let": kw("var"),
      "function": kw("function"), "catch": kw("catch"),
      "for": kw("for"), "switch": kw("switch"), "case": kw("case"), "default": kw("default"),
      "in": operator, "typeof": operator, "instanceof": operator,
      "true": atom, "false": atom, "null": atom, "undefined": atom, "NaN": atom, "Infinity": atom,
      "this": kw("this"), "class": kw("class"), "super": kw("atom"),
      "yield": C, "export": kw("export"), "import": kw("import"), "extends": C,
      "await": C
    };
  }();
  var isOperatorChar = /[+\-*&%=<>!?|~^@]/;
  var isJsonldKeyword = /^@(context|id|value|language|type|container|list|set|reverse|index|base|vocab|graph)"/;
  function readRegexp(stream) {
    var escaped = false, next, inSet = false;
    while ((next = stream.next()) != null) {
      if (!escaped) {
        if (next == "/" && !inSet) return;
        if (next == "[") inSet = true;
        else if (inSet && next == "]") inSet = false;
      }
      escaped = !escaped && next == "\\";
    }
  }
  var type, content;
  function ret(tp, style, cont) {
    type = tp; content = cont;
    return style;
  }
  function tokenBase(stream, state) {
    var ch = stream.next();
    if (ch == '"' || ch == "'") {
      state.tokenize = tokenString(ch);
      return state.tokenize(stream, state);
    } else if (ch == "." && stream.match(/^\d[\d_]*(?:[eE][+\-]?[\d_]+)?/)) {
      return ret("number", "number");
    } else if (ch == "." && stream.match("..")) {
      return ret("spread", "meta");
    } else if (/[\[\]{}\(\),;\:\.]/.test(ch)) {
      return ret(ch);
    } else if (ch == "=" && stream.eat(">")) {
      return ret("=>", "operator");
    } else if (ch == "0" && stream.match(/^(?:x[\dA-Fa-f_]+|o[0-7_]+|b[01_]+)n?/)) {
      return ret("number", "number");
    } else if (/\d/.test(ch)) {
      stream.match(/^[\d_]*(?:n|(?:\.[\d_]*)?(?:[eE][+\-]?[\d_]+)?)?/);
      return ret("number", "number");
    } else if (ch == "/") {
      if (stream.eat("*")) {
        state.tokenize = tokenComment;
        return tokenComment(stream, state);
      } else if (stream.eat("/")) {
        stream.skipToEnd();
        return ret("comment", "comment");
      } else if (expressionAllowed(stream, state, 1)) {
        readRegexp(stream);
        stream.match(/^\b(([gimyus])(?![gimyus]*\2))+\b/);
        return ret("regexp", "string-2");
      } else {
        stream.eat("=");
        return ret("operator", "operator", stream.current());
      }
    } else if (ch == "`") {
      state.tokenize = tokenQuasi;
      return tokenQuasi(stream, state);
    } else if (ch == "#" && stream.peek() == "!") {
      stream.skipToEnd();
      return ret("meta", "meta");
    } else if (ch == "#" && stream.eatWhile(wordRE)) {
      return ret("variable", "property")
    } else if (ch == "<" && stream.match("!--") ||
               (ch == "-" && stream.match("->") && !/\S/.test(stream.string.slice(0, stream.start)))) {
      stream.skipToEnd();
      return ret("comment", "comment")
    } else if (isOperatorChar.test(ch)) {
      if (ch != ">" || !state.lexical || state.lexical.type != ">") {
        if (stream.eat("=")) {
          if (ch == "!" || ch == "=") stream.eat("=");
        } else if (/[<>*+\-|&?]/.test(ch)) {
          stream.eat(ch);
          if (ch == ">") stream.eat(ch);
        }
      }
      if (ch == "?" && stream.eat(".")) return ret(".")
      return ret("operator", "operator", stream.current());
    } else if (wordRE.test(ch)) {
      stream.eatWhile(wordRE);
      var word = stream.current();
      if (state.lastType != ".") {
        if (keywords.propertyIsEnumerable(word)) {
          var kw = keywords[word];
          return ret(kw.type, kw.style, word)
        }
        if (word == "async" && stream.match(/^(\s|\/\*([^*]|\*(?!\/))*?\*\/)*[\[\(\w]/, false))
          return ret("async", "keyword", word)
      }
      return ret("variable", "variable", word)
    }
  }
  function tokenString(quote) {
    return function(stream, state) {
      var escaped = false, next;
      if (jsonldMode && stream.peek() == "@" && stream.match(isJsonldKeyword)){
        state.tokenize = tokenBase;
        return ret("jsonld-keyword", "meta");
      }
      while ((next = stream.next()) != null) {
        if (next == quote && !escaped) break;
        escaped = !escaped && next == "\\";
      }
      if (!escaped) state.tokenize = tokenBase;
      return ret("string", "string");
    };
  }
  function tokenComment(stream, state) {
    var maybeEnd = false, ch;
    while (ch = stream.next()) {
      if (ch == "/" && maybeEnd) {
        state.tokenize = tokenBase;
        break;
      }
      maybeEnd = (ch == "*");
    }
    return ret("comment", "comment");
  }
  function tokenQuasi(stream, state) {
    var escaped = false, next;
    while ((next = stream.next()) != null) {
      if (!escaped && (next == "`" || next == "$" && stream.eat("{"))) {
        state.tokenize = tokenBase;
        break;
      }
      escaped = !escaped && next == "\\";
    }
    return ret("quasi", "string-2", stream.current());
  }
  var brackets = "([{}])";
  function findFatArrow(stream, state) {
    if (state.fatArrowAt) state.fatArrowAt = null;
    var arrow = stream.string.indexOf("=>", stream.start);
    if (arrow < 0) return;
    if (isTS) {
      var m = /:\s*(?:\w+(?:<[^>]*>|\[\])?|\{[^}]*\})\s*$/.exec(stream.string.slice(stream.start, arrow));
      if (m) arrow = m.index;
    }
    var depth = 0, sawSomething = false;
    for (var pos = arrow - 1; pos >= 0; --pos) {
      var ch = stream.string.charAt(pos);
      var bracket = brackets.indexOf(ch);
      if (bracket >= 0 && bracket < 3) {
        if (!depth) { ++pos; break; }
        if (--depth == 0) { if (ch == "(") sawSomething = true; break; }
      } else if (bracket >= 3 && bracket < 6) {
        ++depth;
      } else if (wordRE.test(ch)) {
        sawSomething = true;
      } else if (/["'\/`]/.test(ch)) {
        for (;; --pos) {
          if (pos == 0) return
          var next = stream.string.charAt(pos - 1);
          if (next == ch && stream.string.charAt(pos - 2) != "\\") { pos--; break }
        }
      } else if (sawSomething && !depth) {
        ++pos;
        break;
      }
    }
    if (sawSomething && !depth) state.fatArrowAt = pos;
  }
  var atomicTypes = {"atom": true, "number": true, "variable": true, "string": true,
                     "regexp": true, "this": true, "import": true, "jsonld-keyword": true};
  function JSLexical(indented, column, type, align, prev, info) {
    this.indented = indented;
    this.column = column;
    this.type = type;
    this.prev = prev;
    this.info = info;
    if (align != null) this.align = align;
  }
  function inScope(state, varname) {
    if (!trackScope) return false
    for (var v = state.localVars; v; v = v.next)
      if (v.name == varname) return true;
    for (var cx = state.context; cx; cx = cx.prev) {
      for (var v = cx.vars; v; v = v.next)
        if (v.name == varname) return true;
    }
  }
  function parseJS(state, style, type, content, stream) {
    var cc = state.cc;
    cx.state = state; cx.stream = stream; cx.marked = null, cx.cc = cc; cx.style = style;
    if (!state.lexical.hasOwnProperty("align"))
      state.lexical.align = true;
    while(true) {
      var combinator = cc.length ? cc.pop() : jsonMode ? expression : statement;
      if (combinator(type, content)) {
        while(cc.length && cc[cc.length - 1].lex)
          cc.pop()();
        if (cx.marked) return cx.marked;
        if (type == "variable" && inScope(state, content)) return "variable-2";
        return style;
      }
    }
  }
  var cx = {state: null, marked: null, cc: null};
  function pass() {
    for (var i = arguments.length - 1; i >= 0; i--) cx.cc.push(arguments[i]);
  }
  function cont() {
    pass.apply(null, arguments);
    return true;
  }
  function inList(name, list) {
    for (var v = list; v; v = v.next) if (v.name == name) return true
    return false;
  }
  function register(varname) {
    var state = cx.state;
    cx.marked = "def";
    if (!trackScope) return
    if (state.context) {
      if (state.lexical.info == "var" && state.context && state.context.block) {
        var newContext = registerVarScoped(varname, state.context);
        if (newContext != null) {
          state.context = newContext;
          return
        }
      } else if (!inList(varname, state.localVars)) {
        state.localVars = new Var(varname, state.localVars);
        return
      }
    }
    if (parserConfig.globalVars && !inList(varname, state.globalVars))
      state.globalVars = new Var(varname, state.globalVars);
  }
  function registerVarScoped(varname, context) {
    if (!context) {
      return null
    } else if (context.block) {
      var inner = registerVarScoped(varname, context.prev);
      if (!inner) return null
      if (inner == context.prev) return context
      return new Context(inner, context.vars, true)
    } else if (inList(varname, context.vars)) {
      return context
    } else {
      return new Context(context.prev, new Var(varname, context.vars), false)
    }
  }
  function isModifier(name) {
    return name == "public" || name == "private" || name == "protected" || name == "abstract" || name == "readonly"
  }
  function Context(prev, vars, block) { this.prev = prev; this.vars = vars; this.block = block; }
  function Var(name, next) { this.name = name; this.next = next; }
  var defaultVars = new Var("this", new Var("arguments", null));
  function pushcontext() {
    cx.state.context = new Context(cx.state.context, cx.state.localVars, false);
    cx.state.localVars = defaultVars;
  }
  function pushblockcontext() {
    cx.state.context = new Context(cx.state.context, cx.state.localVars, true);
    cx.state.localVars = null;
  }
  function popcontext() {
    cx.state.localVars = cx.state.context.vars;
    cx.state.context = cx.state.context.prev;
  }
  popcontext.lex = true;
  function pushlex(type, info) {
    var result = function() {
      var state = cx.state, indent = state.indented;
      if (state.lexical.type == "stat") indent = state.lexical.indented;
      else for (var outer = state.lexical; outer && outer.type == ")" && outer.align; outer = outer.prev)
        indent = outer.indented;
      state.lexical = new JSLexical(indent, cx.stream.column(), type, null, state.lexical, info);
    };
    result.lex = true;
    return result;
  }
  function poplex() {
    var state = cx.state;
    if (state.lexical.prev) {
      if (state.lexical.type == ")")
        state.indented = state.lexical.indented;
      state.lexical = state.lexical.prev;
    }
  }
  poplex.lex = true;
  function expect(wanted) {
    function exp(type) {
      if (type == wanted) return cont();
      else if (wanted == ";" || type == "}" || type == ")" || type == "]") return pass();
      else return cont(exp);
    }    return exp;
  }
  function statement(type, value) {
    if (type == "var") return cont(pushlex("vardef", value), vardef, expect(";"), poplex);
    if (type == "keyword a") return cont(pushlex("form"), parenExpr, statement, poplex);
    if (type == "keyword b") return cont(pushlex("form"), statement, poplex);
    if (type == "keyword d") return cx.stream.match(/^\s*$/, false) ? cont() : cont(pushlex("stat"), maybeexpression, expect(";"), poplex);
    if (type == "debugger") return cont(expect(";"));
    if (type == "{") return cont(pushlex("}"), pushblockcontext, block, poplex, popcontext);
    if (type == ";") return cont();
    if (type == "if") {
      if (cx.state.lexical.info == "else" && cx.state.cc[cx.state.cc.length - 1] == poplex)
        cx.state.cc.pop()();
      return cont(pushlex("form"), parenExpr, statement, poplex, maybeelse);
    }
    if (type == "function") return cont(functiondef);
    if (type == "for") return cont(pushlex("form"), pushblockcontext, forspec, statement, popcontext, poplex);
    if (type == "class" || (isTS && value == "interface")) {
      cx.marked = "keyword";
      return cont(pushlex("form", type == "class" ? type : value), className, poplex)
    }
    if (type == "variable") {
      if (isTS && value == "declare") {
        cx.marked = "keyword";
        return cont(statement)
      } else if (isTS && (value == "module" || value == "enum" || value == "type") && cx.stream.match(/^\s*\w/, false)) {
        cx.marked = "keyword";
        if (value == "enum") return cont(enumdef);
        else if (value == "type") return cont(typename, expect("operator"), typeexpr, expect(";"));
        else return cont(pushlex("form"), pattern, expect("{"), pushlex("}"), block, poplex, poplex)
      } else if (isTS && value == "namespace") {
        cx.marked = "keyword";
        return cont(pushlex("form"), expression, statement, poplex)
      } else if (isTS && value == "abstract") {
        cx.marked = "keyword";
        return cont(statement)
      } else {
        return cont(pushlex("stat"), maybelabel);
      }
    }
    if (type == "switch") return cont(pushlex("form"), parenExpr, expect("{"), pushlex("}", "switch"), pushblockcontext,
                                      block, poplex, poplex, popcontext);
    if (type == "case") return cont(expression, expect(":"));
    if (type == "default") return cont(expect(":"));
    if (type == "catch") return cont(pushlex("form"), pushcontext, maybeCatchBinding, statement, poplex, popcontext);
    if (type == "export") return cont(pushlex("stat"), afterExport, poplex);
    if (type == "import") return cont(pushlex("stat"), afterImport, poplex);
    if (type == "async") return cont(statement)
    if (value == "@") return cont(expression, statement)
    return pass(pushlex("stat"), expression, expect(";"), poplex);
  }
  function maybeCatchBinding(type) {
    if (type == "(") return cont(funarg, expect(")"))
  }
  function expression(type, value) {
    return expressionInner(type, value, false);
  }
  function expressionNoComma(type, value) {
    return expressionInner(type, value, true);
  }
  function parenExpr(type) {
    if (type != "(") return pass()
    return cont(pushlex(")"), maybeexpression, expect(")"), poplex)
  }
  function expressionInner(type, value, noComma) {
    if (cx.state.fatArrowAt == cx.stream.start) {
      var body = noComma ? arrowBodyNoComma : arrowBody;
      if (type == "(") return cont(pushcontext, pushlex(")"), commasep(funarg, ")"), poplex, expect("=>"), body, popcontext);
      else if (type == "variable") return pass(pushcontext, pattern, expect("=>"), body, popcontext);
    }
    var maybeop = noComma ? maybeoperatorNoComma : maybeoperatorComma;
    if (atomicTypes.hasOwnProperty(type)) return cont(maybeop);
    if (type == "function") return cont(functiondef, maybeop);
    if (type == "class" || (isTS && value == "interface")) { cx.marked = "keyword"; return cont(pushlex("form"), classExpression, poplex); }
    if (type == "keyword c" || type == "async") return cont(noComma ? expressionNoComma : expression);
    if (type == "(") return cont(pushlex(")"), maybeexpression, expect(")"), poplex, maybeop);
    if (type == "operator" || type == "spread") return cont(noComma ? expressionNoComma : expression);
    if (type == "[") return cont(pushlex("]"), arrayLiteral, poplex, maybeop);
    if (type == "{") return contCommasep(objprop, "}", null, maybeop);
    if (type == "quasi") return pass(quasi, maybeop);
    if (type == "new") return cont(maybeTarget(noComma));
    return cont();
  }
  function maybeexpression(type) {
    if (type.match(/[;\}\)\],]/)) return pass();
    return pass(expression);
  }
  function maybeoperatorComma(type, value) {
    if (type == ",") return cont(maybeexpression);
    return maybeoperatorNoComma(type, value, false);
  }
  function maybeoperatorNoComma(type, value, noComma) {
    var me = noComma == false ? maybeoperatorComma : maybeoperatorNoComma;
    var expr = noComma == false ? expression : expressionNoComma;
    if (type == "=>") return cont(pushcontext, noComma ? arrowBodyNoComma : arrowBody, popcontext);
    if (type == "operator") {
      if (/\+\+|--/.test(value) || isTS && value == "!") return cont(me);
      if (isTS && value == "<" && cx.stream.match(/^([^<>]|<[^<>]*>)*>\s*\(/, false))
        return cont(pushlex(">"), commasep(typeexpr, ">"), poplex, me);
      if (value == "?") return cont(expression, expect(":"), expr);
      return cont(expr);
    }
    if (type == "quasi") { return pass(quasi, me); }
    if (type == ";") return;
    if (type == "(") return contCommasep(expressionNoComma, ")", "call", me);
    if (type == ".") return cont(property, me);
    if (type == "[") return cont(pushlex("]"), maybeexpression, expect("]"), poplex, me);
    if (isTS && value == "as") { cx.marked = "keyword"; return cont(typeexpr, me) }
    if (type == "regexp") {
      cx.state.lastType = cx.marked = "operator";
      cx.stream.backUp(cx.stream.pos - cx.stream.start - 1);
      return cont(expr)
    }
  }
  function quasi(type, value) {
    if (type != "quasi") return pass();
    if (value.slice(value.length - 2) != "${") return cont(quasi);
    return cont(expression, continueQuasi);
  }
  function continueQuasi(type) {
    if (type == "}") {
      cx.marked = "string-2";
      cx.state.tokenize = tokenQuasi;
      return cont(quasi);
    }
  }
  function arrowBody(type) {
    findFatArrow(cx.stream, cx.state);
    return pass(type == "{" ? statement : expression);
  }
  function arrowBodyNoComma(type) {
    findFatArrow(cx.stream, cx.state);
    return pass(type == "{" ? statement : expressionNoComma);
  }
  function maybeTarget(noComma) {
    return function(type) {
      if (type == ".") return cont(noComma ? targetNoComma : target);
      else if (type == "variable" && isTS) return cont(maybeTypeArgs, noComma ? maybeoperatorNoComma : maybeoperatorComma)
      else return pass(noComma ? expressionNoComma : expression);
    };
  }
  function target(_, value) {
    if (value == "target") { cx.marked = "keyword"; return cont(maybeoperatorComma); }
  }
  function targetNoComma(_, value) {
    if (value == "target") { cx.marked = "keyword"; return cont(maybeoperatorNoComma); }
  }
  function maybelabel(type) {
    if (type == ":") return cont(poplex, statement);
    return pass(maybeoperatorComma, expect(";"), poplex);
  }
  function property(type) {
    if (type == "variable") {cx.marked = "property"; return cont();}
  }
  function objprop(type, value) {
    if (type == "async") {
      cx.marked = "property";
      return cont(objprop);
    } else if (type == "variable" || cx.style == "keyword") {
      cx.marked = "property";
      if (value == "get" || value == "set") return cont(getterSetter);
      var m;
      if (isTS && cx.state.fatArrowAt == cx.stream.start && (m = cx.stream.match(/^\s*:\s*/, false)))
        cx.state.fatArrowAt = cx.stream.pos + m[0].length;
      return cont(afterprop);
    } else if (type == "number" || type == "string") {
      cx.marked = jsonldMode ? "property" : (cx.style + " property");
      return cont(afterprop);
    } else if (type == "jsonld-keyword") {
      return cont(afterprop);
    } else if (isTS && isModifier(value)) {
      cx.marked = "keyword";
      return cont(objprop)
    } else if (type == "[") {
      return cont(expression, maybetype, expect("]"), afterprop);
    } else if (type == "spread") {
      return cont(expressionNoComma, afterprop);
    } else if (value == "*") {
      cx.marked = "keyword";
      return cont(objprop);
    } else if (type == ":") {
      return pass(afterprop)
    }
  }
  function getterSetter(type) {
    if (type != "variable") return pass(afterprop);
    cx.marked = "property";
    return cont(functiondef);
  }
  function afterprop(type) {
    if (type == ":") return cont(expressionNoComma);
    if (type == "(") return pass(functiondef);
  }
  function commasep(what, end, sep) {
    function proceed(type, value) {
      if (sep ? sep.indexOf(type) > -1 : type == ",") {
        var lex = cx.state.lexical;
        if (lex.info == "call") lex.pos = (lex.pos || 0) + 1;
        return cont(function(type, value) {
          if (type == end || value == end) return pass()
          return pass(what)
        }, proceed);
      }
      if (type == end || value == end) return cont();
      if (sep && sep.indexOf(";") > -1) return pass(what)
      return cont(expect(end));
    }
    return function(type, value) {
      if (type == end || value == end) return cont();
      return pass(what, proceed);
    };
  }
  function contCommasep(what, end, info) {
    for (var i = 3; i < arguments.length; i++)
      cx.cc.push(arguments[i]);
    return cont(pushlex(end, info), commasep(what, end), poplex);
  }
  function block(type) {
    if (type == "}") return cont();
    return pass(statement, block);
  }
  function maybetype(type, value) {
    if (isTS) {
      if (type == ":") return cont(typeexpr);
      if (value == "?") return cont(maybetype);
    }
  }
  function maybetypeOrIn(type, value) {
    if (isTS && (type == ":" || value == "in")) return cont(typeexpr)
  }
  function mayberettype(type) {
    if (isTS && type == ":") {
      if (cx.stream.match(/^\s*\w+\s+is\b/, false)) return cont(expression, isKW, typeexpr)
      else return cont(typeexpr)
    }
  }
  function isKW(_, value) {
    if (value == "is") {
      cx.marked = "keyword";
      return cont()
    }
  }
  function typeexpr(type, value) {
    if (value == "keyof" || value == "typeof" || value == "infer" || value == "readonly") {
      cx.marked = "keyword";
      return cont(value == "typeof" ? expressionNoComma : typeexpr)
    }
    if (type == "variable" || value == "void") {
      cx.marked = "type";
      return cont(afterType)
    }
    if (value == "|" || value == "&") return cont(typeexpr)
    if (type == "string" || type == "number" || type == "atom") return cont(afterType);
    if (type == "[") return cont(pushlex("]"), commasep(typeexpr, "]", ","), poplex, afterType)
    if (type == "{") return cont(pushlex("}"), typeprops, poplex, afterType)
    if (type == "(") return cont(commasep(typearg, ")"), maybeReturnType, afterType)
    if (type == "<") return cont(commasep(typeexpr, ">"), typeexpr)
  }
  function maybeReturnType(type) {
    if (type == "=>") return cont(typeexpr)
  }
  function typeprops(type) {
    if (type.match(/[\}\)\]]/)) return cont()
    if (type == "," || type == ";") return cont(typeprops)
    return pass(typeprop, typeprops)
  }
  function typeprop(type, value) {
    if (type == "variable" || cx.style == "keyword") {
      cx.marked = "property";
      return cont(typeprop)
    } else if (value == "?" || type == "number" || type == "string") {
      return cont(typeprop)
    } else if (type == ":") {
      return cont(typeexpr)
    } else if (type == "[") {
      return cont(expect("variable"), maybetypeOrIn, expect("]"), typeprop)
    } else if (type == "(") {
      return pass(functiondecl, typeprop)
    } else if (!type.match(/[;\}\)\],]/)) {
      return cont()
    }
  }
  function typearg(type, value) {
    if (type == "variable" && cx.stream.match(/^\s*[?:]/, false) || value == "?") return cont(typearg)
    if (type == ":") return cont(typeexpr)
    if (type == "spread") return cont(typearg)
    return pass(typeexpr)
  }
  function afterType(type, value) {
    if (value == "<") return cont(pushlex(">"), commasep(typeexpr, ">"), poplex, afterType)
    if (value == "|" || type == "." || value == "&") return cont(typeexpr)
    if (type == "[") return cont(typeexpr, expect("]"), afterType)
    if (value == "extends" || value == "implements") { cx.marked = "keyword"; return cont(typeexpr) }
    if (value == "?") return cont(typeexpr, expect(":"), typeexpr)
  }
  function maybeTypeArgs(_, value) {
    if (value == "<") return cont(pushlex(">"), commasep(typeexpr, ">"), poplex, afterType)
  }
  function typeparam() {
    return pass(typeexpr, maybeTypeDefault)
  }
  function maybeTypeDefault(_, value) {
    if (value == "=") return cont(typeexpr)
  }
  function vardef(_, value) {
    if (value == "enum") {cx.marked = "keyword"; return cont(enumdef)}
    return pass(pattern, maybetype, maybeAssign, vardefCont);
  }
  function pattern(type, value) {
    if (isTS && isModifier(value)) { cx.marked = "keyword"; return cont(pattern) }
    if (type == "variable") { register(value); return cont(); }
    if (type == "spread") return cont(pattern);
    if (type == "[") return contCommasep(eltpattern, "]");
    if (type == "{") return contCommasep(proppattern, "}");
  }
  function proppattern(type, value) {
    if (type == "variable" && !cx.stream.match(/^\s*:/, false)) {
      register(value);
      return cont(maybeAssign);
    }
    if (type == "variable") cx.marked = "property";
    if (type == "spread") return cont(pattern);
    if (type == "}") return pass();
    if (type == "[") return cont(expression, expect(']'), expect(':'), proppattern);
    return cont(expect(":"), pattern, maybeAssign);
  }
  function eltpattern() {
    return pass(pattern, maybeAssign)
  }
  function maybeAssign(_type, value) {
    if (value == "=") return cont(expressionNoComma);
  }
  function vardefCont(type) {
    if (type == ",") return cont(vardef);
  }
  function maybeelse(type, value) {
    if (type == "keyword b" && value == "else") return cont(pushlex("form", "else"), statement, poplex);
  }
  function forspec(type, value) {
    if (value == "await") return cont(forspec);
    if (type == "(") return cont(pushlex(")"), forspec1, poplex);
  }
  function forspec1(type) {
    if (type == "var") return cont(vardef, forspec2);
    if (type == "variable") return cont(forspec2);
    return pass(forspec2)
  }
  function forspec2(type, value) {
    if (type == ")") return cont()
    if (type == ";") return cont(forspec2)
    if (value == "in" || value == "of") { cx.marked = "keyword"; return cont(expression, forspec2) }
    return pass(expression, forspec2)
  }
  function functiondef(type, value) {
    if (value == "*") {cx.marked = "keyword"; return cont(functiondef);}
    if (type == "variable") {register(value); return cont(functiondef);}
    if (type == "(") return cont(pushcontext, pushlex(")"), commasep(funarg, ")"), poplex, mayberettype, statement, popcontext);
    if (isTS && value == "<") return cont(pushlex(">"), commasep(typeparam, ">"), poplex, functiondef)
  }
  function functiondecl(type, value) {
    if (value == "*") {cx.marked = "keyword"; return cont(functiondecl);}
    if (type == "variable") {register(value); return cont(functiondecl);}
    if (type == "(") return cont(pushcontext, pushlex(")"), commasep(funarg, ")"), poplex, mayberettype, popcontext);
    if (isTS && value == "<") return cont(pushlex(">"), commasep(typeparam, ">"), poplex, functiondecl)
  }
  function typename(type, value) {
    if (type == "keyword" || type == "variable") {
      cx.marked = "type";
      return cont(typename)
    } else if (value == "<") {
      return cont(pushlex(">"), commasep(typeparam, ">"), poplex)
    }
  }
  function funarg(type, value) {
    if (value == "@") cont(expression, funarg);
    if (type == "spread") return cont(funarg);
    if (isTS && isModifier(value)) { cx.marked = "keyword"; return cont(funarg); }
    if (isTS && type == "this") return cont(maybetype, maybeAssign)
    return pass(pattern, maybetype, maybeAssign);
  }
  function classExpression(type, value) {
    if (type == "variable") return className(type, value);
    return classNameAfter(type, value);
  }
  function className(type, value) {
    if (type == "variable") {register(value); return cont(classNameAfter);}
  }
  function classNameAfter(type, value) {
    if (value == "<") return cont(pushlex(">"), commasep(typeparam, ">"), poplex, classNameAfter)
    if (value == "extends" || value == "implements" || (isTS && type == ",")) {
      if (value == "implements") cx.marked = "keyword";
      return cont(isTS ? typeexpr : expression, classNameAfter);
    }
    if (type == "{") return cont(pushlex("}"), classBody, poplex);
  }
  function classBody(type, value) {
    if (type == "async" ||
        (type == "variable" &&
         (value == "static" || value == "get" || value == "set" || (isTS && isModifier(value))) &&
         cx.stream.match(/^\s+[\w$\xa1-\uffff]/, false))) {
      cx.marked = "keyword";
      return cont(classBody);
    }
    if (type == "variable" || cx.style == "keyword") {
      cx.marked = "property";
      return cont(classfield, classBody);
    }
    if (type == "number" || type == "string") return cont(classfield, classBody);
    if (type == "[")
      return cont(expression, maybetype, expect("]"), classfield, classBody)
    if (value == "*") {
      cx.marked = "keyword";
      return cont(classBody);
    }
    if (isTS && type == "(") return pass(functiondecl, classBody)
    if (type == ";" || type == ",") return cont(classBody);
    if (type == "}") return cont();
    if (value == "@") return cont(expression, classBody)
  }
  function classfield(type, value) {
    if (value == "?") return cont(classfield)
    if (type == ":") return cont(typeexpr, maybeAssign)
    if (value == "=") return cont(expressionNoComma)
    var context = cx.state.lexical.prev, isInterface = context && context.info == "interface";
    return pass(isInterface ? functiondecl : functiondef)
  }
  function afterExport(type, value) {
    if (value == "*") { cx.marked = "keyword"; return cont(maybeFrom, expect(";")); }
    if (value == "default") { cx.marked = "keyword"; return cont(expression, expect(";")); }
    if (type == "{") return cont(commasep(exportField, "}"), maybeFrom, expect(";"));
    return pass(statement);
  }
  function exportField(type, value) {
    if (value == "as") { cx.marked = "keyword"; return cont(expect("variable")); }
    if (type == "variable") return pass(expressionNoComma, exportField);
  }
  function afterImport(type) {
    if (type == "string") return cont();
    if (type == "(") return pass(expression);
    if (type == ".") return pass(maybeoperatorComma);
    return pass(importSpec, maybeMoreImports, maybeFrom);
  }
  function importSpec(type, value) {
    if (type == "{") return contCommasep(importSpec, "}");
    if (type == "variable") register(value);
    if (value == "*") cx.marked = "keyword";
    return cont(maybeAs);
  }
  function maybeMoreImports(type) {
    if (type == ",") return cont(importSpec, maybeMoreImports)
  }
  function maybeAs(_type, value) {
    if (value == "as") { cx.marked = "keyword"; return cont(importSpec); }
  }
  function maybeFrom(_type, value) {
    if (value == "from") { cx.marked = "keyword"; return cont(expression); }
  }
  function arrayLiteral(type) {
    if (type == "]") return cont();
    return pass(commasep(expressionNoComma, "]"));
  }
  function enumdef() {
    return pass(pushlex("form"), pattern, expect("{"), pushlex("}"), commasep(enummember, "}"), poplex, poplex)
  }
  function enummember() {
    return pass(pattern, maybeAssign);
  }
  function isContinuedStatement(state, textAfter) {
    return state.lastType == "operator" || state.lastType == "," ||
      isOperatorChar.test(textAfter.charAt(0)) ||
      /[,.]/.test(textAfter.charAt(0));
  }
  function expressionAllowed(stream, state, backUp) {
    return state.tokenize == tokenBase &&
      /^(?:operator|sof|keyword [bcd]|case|new|export|default|spread|[\[{}\(,;:]|=>)$/.test(state.lastType) ||
      (state.lastType == "quasi" && /\{\s*$/.test(stream.string.slice(0, stream.pos - (backUp || 0))))
  }
  return {
    startState: function(basecolumn) {
      var state = {
        tokenize: tokenBase,
        lastType: "sof",
        cc: [],
        lexical: new JSLexical((basecolumn || 0) - indentUnit, 0, "block", false),
        localVars: parserConfig.localVars,
        context: parserConfig.localVars && new Context(null, null, false),
        indented: basecolumn || 0
      };
      if (parserConfig.globalVars && typeof parserConfig.globalVars == "object")
        state.globalVars = parserConfig.globalVars;
      return state;
    },
    token: function(stream, state) {
      if (stream.sol()) {
        if (!state.lexical.hasOwnProperty("align"))
          state.lexical.align = false;
        state.indented = stream.indentation();
        findFatArrow(stream, state);
      }
      if (state.tokenize != tokenComment && stream.eatSpace()) return null;
      var style = state.tokenize(stream, state);
      if (type == "comment") return style;
      state.lastType = type == "operator" && (content == "++" || content == "--") ? "incdec" : type;
      return parseJS(state, style, type, content, stream);
    },
    indent: function(state, textAfter) {
      if (state.tokenize == tokenComment || state.tokenize == tokenQuasi) return CodeMirror.Pass;
      if (state.tokenize != tokenBase) return 0;
      var firstChar = textAfter && textAfter.charAt(0), lexical = state.lexical, top;
      if (!/^\s*else\b/.test(textAfter)) for (var i = state.cc.length - 1; i >= 0; --i) {
        var c = state.cc[i];
        if (c == poplex) lexical = lexical.prev;
        else if (c != maybeelse && c != popcontext) break;
      }
      while ((lexical.type == "stat" || lexical.type == "form") &&
             (firstChar == "}" || ((top = state.cc[state.cc.length - 1]) &&
                                   (top == maybeoperatorComma || top == maybeoperatorNoComma) &&
                                   !/^[,\.=+\-*:?[\(]/.test(textAfter))))
        lexical = lexical.prev;
      if (statementIndent && lexical.type == ")" && lexical.prev.type == "stat")
        lexical = lexical.prev;
      var type = lexical.type, closing = firstChar == type;
      if (type == "vardef") return lexical.indented + (state.lastType == "operator" || state.lastType == "," ? lexical.info.length + 1 : 0);
      else if (type == "form" && firstChar == "{") return lexical.indented;
      else if (type == "form") return lexical.indented + indentUnit;
      else if (type == "stat")
        return lexical.indented + (isContinuedStatement(state, textAfter) ? statementIndent || indentUnit : 0);
      else if (lexical.info == "switch" && !closing && parserConfig.doubleIndentSwitch != false)
        return lexical.indented + (/^(?:case|default)\b/.test(textAfter) ? indentUnit : 2 * indentUnit);
      else if (lexical.align) return lexical.column + (closing ? 0 : 1);
      else return lexical.indented + (closing ? 0 : indentUnit);
    },
    electricInput: /^\s*(?:case .*?:|default:|\{|\})$/,
    blockCommentStart: jsonMode ? null : "/*",
    blockCommentEnd: jsonMode ? null : "*/",
    blockCommentContinue: jsonMode ? null : " * ",
    lineComment: jsonMode ? null : "//",
    fold: "brace",
    closeBrackets: "()[]{}''\"\"``",
    helperType: jsonMode ? "json" : "javascript",
    jsonldMode: jsonldMode,
    jsonMode: jsonMode,
    expressionAllowed: expressionAllowed,
    skipExpression: function(state) {
      var top = state.cc[state.cc.length - 1];
      if (top == expression || top == expressionNoComma) state.cc.pop();
    }
  };
});
CodeMirror.registerHelper("wordChars", "javascript", /[\w$]/);
CodeMirror.defineMIME("text/javascript", "javascript");
CodeMirror.defineMIME("text/ecmascript", "javascript");
CodeMirror.defineMIME("application/javascript", "javascript");
CodeMirror.defineMIME("application/x-javascript", "javascript");
CodeMirror.defineMIME("application/ecmascript", "javascript");
CodeMirror.defineMIME("application/json", { name: "javascript", json: true });
CodeMirror.defineMIME("application/x-json", { name: "javascript", json: true });
CodeMirror.defineMIME("application/manifest+json", { name: "javascript", json: true });
CodeMirror.defineMIME("application/ld+json", { name: "javascript", jsonld: true });
CodeMirror.defineMIME("text/typescript", { name: "javascript", typescript: true });
CodeMirror.defineMIME("application/typescript", { name: "javascript", typescript: true });
});

// Copyright 2026 The Chromium Authors
var ExperimentName;
(function (ExperimentName) {
    ExperimentName["ALL"] = "*";
    ExperimentName["PROTOCOL_MONITOR"] = "protocol-monitor";
    ExperimentName["INSTRUMENTATION_BREAKPOINTS"] = "instrumentation-breakpoints";
    ExperimentName["DURABLE_MESSAGES"] = "durable-messages";
    ExperimentName["JPEG_XL"] = "jpeg-xl";
    ExperimentName["PLUS_BUTTON"] = "plus-button";
    ExperimentName["SOURCE_MAP_SCOPES_IN_SOURCES_PANEL"] = "source-map-scopes-in-sources-panel";
})(ExperimentName || (ExperimentName = {}));

// Copyright 2016 The Chromium Authors
class FormattedContentBuilder {
    indentString;
    #lastOriginalPosition = 0;
    #formattedContent = [];
    #formattedContentLength = 0;
    #lastFormattedPosition = 0;
    #nestingLevel = 0;
    #newLines = 0;
    #enforceSpaceBetweenWords = true;
    #softSpace = false;
    #hardSpaces = 0;
    #cachedIndents = new Map();
    #canBeIdentifierOrNumber = /[$\u200C\u200D\p{ID_Continue}]/u;
    mapping = { original: [0], formatted: [0] };
    constructor(indentString) {
        this.indentString = indentString;
    }
    setEnforceSpaceBetweenWords(value) {
        const oldValue = this.#enforceSpaceBetweenWords;
        this.#enforceSpaceBetweenWords = value;
        return oldValue;
    }
    addToken(token, offset) {
        if (this.#enforceSpaceBetweenWords && !this.#hardSpaces && !this.#softSpace) {
            const lastToken = this.#formattedContent.at(-1) ?? '';
            const lastCharOfLastToken = lastToken.at(-1) ?? '';
            if ((this.#canBeIdentifierOrNumber.test(lastCharOfLastToken) ||
                ['`', '}', ')', ']', '\'', '"', '/'].includes(lastCharOfLastToken)) &&
                this.#canBeIdentifierOrNumber.test(token)) {
                this.addSoftSpace();
            }
        }
        this.#appendFormatting();
        this.#addMappingIfNeeded(offset);
        this.#addText(token);
    }
    addSoftSpace() {
        if (!this.#hardSpaces) {
            this.#softSpace = true;
        }
    }
    addHardSpace() {
        this.#softSpace = false;
        ++this.#hardSpaces;
    }
    addNewLine(noSquash) {
        if (!this.#formattedContentLength) {
            return;
        }
        if (noSquash) {
            ++this.#newLines;
        }
        else {
            this.#newLines = this.#newLines || 1;
        }
    }
    increaseNestingLevel() {
        this.#nestingLevel += 1;
    }
    decreaseNestingLevel() {
        if (this.#nestingLevel > 0) {
            this.#nestingLevel -= 1;
        }
    }
    content() {
        return this.#formattedContent.join('') + (this.#newLines ? '\n' : '');
    }
    #appendFormatting() {
        if (this.#newLines) {
            for (let i = 0; i < this.#newLines; ++i) {
                this.#addText('\n');
            }
            this.#addText(this.#indent());
        }
        else if (this.#softSpace) {
            this.#addText(' ');
        }
        if (this.#hardSpaces) {
            for (let i = 0; i < this.#hardSpaces; ++i) {
                this.#addText(' ');
            }
        }
        this.#newLines = 0;
        this.#softSpace = false;
        this.#hardSpaces = 0;
    }
    #indent() {
        const cachedValue = this.#cachedIndents.get(this.#nestingLevel);
        if (cachedValue) {
            return cachedValue;
        }
        let fullIndent = '';
        for (let i = 0; i < this.#nestingLevel; ++i) {
            fullIndent += this.indentString;
        }
        if (this.#nestingLevel <= 20) {
            this.#cachedIndents.set(this.#nestingLevel, fullIndent);
        }
        return fullIndent;
    }
    #addText(text) {
        this.#formattedContent.push(text);
        this.#formattedContentLength += text.length;
    }
    #addMappingIfNeeded(originalPosition) {
        if (originalPosition - this.#lastOriginalPosition === this.#formattedContentLength - this.#lastFormattedPosition) {
            return;
        }
        this.mapping.original.push(originalPosition);
        this.#lastOriginalPosition = originalPosition;
        this.mapping.formatted.push(this.#formattedContentLength);
        this.#lastFormattedPosition = this.#formattedContentLength;
    }
}

var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 78, 5, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 199, 7, 137, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 55, 9, 266, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 233, 0, 3, 0, 8, 1, 6, 0, 475, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];
var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 7, 25, 39, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 5, 57, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 24, 43, 261, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 33, 24, 3, 24, 45, 74, 6, 0, 67, 12, 65, 1, 2, 0, 15, 4, 10, 7381, 42, 31, 98, 114, 8702, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 208, 30, 2, 2, 2, 1, 2, 6, 3, 4, 10, 1, 225, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4381, 3, 5773, 3, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 8489];
var nonASCIIidentifierChars = "\u200c\u200d\xb7\u0300-\u036f\u0387\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u07fd\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u0897-\u089f\u08ca-\u08e1\u08e3-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u09fe\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0afa-\u0aff\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b55-\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c00-\u0c04\u0c3c\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0cf3\u0d00-\u0d03\u0d3b\u0d3c\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d81-\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0de6-\u0def\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ece\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1369-\u1371\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u180f-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19d0-\u19da\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1ab0-\u1abd\u1abf-\u1add\u1ae0-\u1aeb\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf4\u1cf7-\u1cf9\u1dc0-\u1dff\u200c\u200d\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\u30fb\ua620-\ua629\ua66f\ua674-\ua67d\ua69e\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua82c\ua880\ua881\ua8b4-\ua8c5\ua8d0-\ua8d9\ua8e0-\ua8f1\ua8ff-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\ua9e5\ua9f0-\ua9f9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe2f\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f\uff65";
var nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u052f\u0531-\u0556\u0559\u0560-\u0588\u05d0-\u05ea\u05ef-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u0860-\u086a\u0870-\u0887\u0889-\u088f\u08a0-\u08c9\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u09fc\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0af9\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58-\u0c5a\u0c5c\u0c5d\u0c60\u0c61\u0c80\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cdc-\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d04-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d54-\u0d56\u0d5f-\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e86-\u0e8a\u0e8c-\u0ea3\u0ea5\u0ea7-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f5\u13f8-\u13fd\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f8\u1700-\u1711\u171f-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1878\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4c\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1c80-\u1c8a\u1c90-\u1cba\u1cbd-\u1cbf\u1ce9-\u1cec\u1cee-\u1cf3\u1cf5\u1cf6\u1cfa\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2118-\u211d\u2124\u2126\u2128\u212a-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309b-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312f\u3131-\u318e\u31a0-\u31bf\u31f0-\u31ff\u3400-\u4dbf\u4e00-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua69d\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua7dc\ua7f1-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua8fd\ua8fe\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab69\uab70-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";
var reservedWords = {
    3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
    5: "class enum extends super const export import",
    6: "enum",
    strict: "implements interface let package private protected public static yield",
    strictBind: "eval arguments"
};
var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";
var keywords$1 = {
    5: ecma5AndLessKeywords,
    "5module": ecma5AndLessKeywords + " export import",
    6: ecma5AndLessKeywords + " const class extends export import super"
};
var keywordRelationalOperator = /^in(stanceof)?$/;
var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
function isInAstralSet(code, set) {
    var pos = 0x10000;
    for (var i = 0; i < set.length; i += 2) {
        pos += set[i];
        if (pos > code) {
            return false;
        }
        pos += set[i + 1];
        if (pos >= code) {
            return true;
        }
    }
    return false;
}
function isIdentifierStart(code, astral) {
    if (code < 65) {
        return code === 36;
    }
    if (code < 91) {
        return true;
    }
    if (code < 97) {
        return code === 95;
    }
    if (code < 123) {
        return true;
    }
    if (code <= 0xffff) {
        return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code));
    }
    if (astral === false) {
        return false;
    }
    return isInAstralSet(code, astralIdentifierStartCodes);
}
function isIdentifierChar(code, astral) {
    if (code < 48) {
        return code === 36;
    }
    if (code < 58) {
        return true;
    }
    if (code < 65) {
        return false;
    }
    if (code < 91) {
        return true;
    }
    if (code < 97) {
        return code === 95;
    }
    if (code < 123) {
        return true;
    }
    if (code <= 0xffff) {
        return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code));
    }
    if (astral === false) {
        return false;
    }
    return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
}
var TokenType = function TokenType(label, conf) {
    if (conf === void 0)
        conf = {};
    this.label = label;
    this.keyword = conf.keyword;
    this.beforeExpr = !!conf.beforeExpr;
    this.startsExpr = !!conf.startsExpr;
    this.isLoop = !!conf.isLoop;
    this.isAssign = !!conf.isAssign;
    this.prefix = !!conf.prefix;
    this.postfix = !!conf.postfix;
    this.binop = conf.binop || null;
    this.updateContext = null;
};
function binop(name, prec) {
    return new TokenType(name, { beforeExpr: true, binop: prec });
}
var beforeExpr = { beforeExpr: true }, startsExpr = { startsExpr: true };
var keywords = {};
function kw(name, options) {
    if (options === void 0)
        options = {};
    options.keyword = name;
    return keywords[name] = new TokenType(name, options);
}
var types$1 = {
    num: new TokenType("num", startsExpr),
    regexp: new TokenType("regexp", startsExpr),
    string: new TokenType("string", startsExpr),
    name: new TokenType("name", startsExpr),
    privateId: new TokenType("privateId", startsExpr),
    eof: new TokenType("eof"),
    bracketL: new TokenType("[", { beforeExpr: true, startsExpr: true }),
    bracketR: new TokenType("]"),
    braceL: new TokenType("{", { beforeExpr: true, startsExpr: true }),
    braceR: new TokenType("}"),
    parenL: new TokenType("(", { beforeExpr: true, startsExpr: true }),
    parenR: new TokenType(")"),
    comma: new TokenType(",", beforeExpr),
    semi: new TokenType(";", beforeExpr),
    colon: new TokenType(":", beforeExpr),
    dot: new TokenType("."),
    question: new TokenType("?", beforeExpr),
    questionDot: new TokenType("?."),
    arrow: new TokenType("=>", beforeExpr),
    template: new TokenType("template"),
    invalidTemplate: new TokenType("invalidTemplate"),
    ellipsis: new TokenType("...", beforeExpr),
    backQuote: new TokenType("`", startsExpr),
    dollarBraceL: new TokenType("${", { beforeExpr: true, startsExpr: true }),
    eq: new TokenType("=", { beforeExpr: true, isAssign: true }),
    assign: new TokenType("_=", { beforeExpr: true, isAssign: true }),
    incDec: new TokenType("++/--", { prefix: true, postfix: true, startsExpr: true }),
    prefix: new TokenType("!/~", { beforeExpr: true, prefix: true, startsExpr: true }),
    logicalOR: binop("||", 1),
    logicalAND: binop("&&", 2),
    bitwiseOR: binop("|", 3),
    bitwiseXOR: binop("^", 4),
    bitwiseAND: binop("&", 5),
    equality: binop("==/!=/===/!==", 6),
    relational: binop("</>/<=/>=", 7),
    bitShift: binop("<</>>/>>>", 8),
    plusMin: new TokenType("+/-", { beforeExpr: true, binop: 9, prefix: true, startsExpr: true }),
    modulo: binop("%", 10),
    star: binop("*", 10),
    slash: binop("/", 10),
    starstar: new TokenType("**", { beforeExpr: true }),
    coalesce: binop("??", 1),
    _break: kw("break"),
    _case: kw("case", beforeExpr),
    _catch: kw("catch"),
    _continue: kw("continue"),
    _debugger: kw("debugger"),
    _default: kw("default", beforeExpr),
    _do: kw("do", { isLoop: true, beforeExpr: true }),
    _else: kw("else", beforeExpr),
    _finally: kw("finally"),
    _for: kw("for", { isLoop: true }),
    _function: kw("function", startsExpr),
    _if: kw("if"),
    _return: kw("return", beforeExpr),
    _switch: kw("switch"),
    _throw: kw("throw", beforeExpr),
    _try: kw("try"),
    _var: kw("var"),
    _const: kw("const"),
    _while: kw("while", { isLoop: true }),
    _with: kw("with"),
    _new: kw("new", { beforeExpr: true, startsExpr: true }),
    _this: kw("this", startsExpr),
    _super: kw("super", startsExpr),
    _class: kw("class", startsExpr),
    _extends: kw("extends", beforeExpr),
    _export: kw("export"),
    _import: kw("import", startsExpr),
    _null: kw("null", startsExpr),
    _true: kw("true", startsExpr),
    _false: kw("false", startsExpr),
    _in: kw("in", { beforeExpr: true, binop: 7 }),
    _instanceof: kw("instanceof", { beforeExpr: true, binop: 7 }),
    _typeof: kw("typeof", { beforeExpr: true, prefix: true, startsExpr: true }),
    _void: kw("void", { beforeExpr: true, prefix: true, startsExpr: true }),
    _delete: kw("delete", { beforeExpr: true, prefix: true, startsExpr: true })
};
var lineBreak = /\r\n?|\n|\u2028|\u2029/;
var lineBreakG = new RegExp(lineBreak.source, "g");
function isNewLine(code) {
    return code === 10 || code === 13 || code === 0x2028 || code === 0x2029;
}
function nextLineBreak(code, from, end) {
    if (end === void 0)
        end = code.length;
    for (var i = from; i < end; i++) {
        var next = code.charCodeAt(i);
        if (isNewLine(next)) {
            return i < end - 1 && next === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
        }
    }
    return -1;
}
var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
var ref = Object.prototype;
var hasOwnProperty = ref.hasOwnProperty;
var toString = ref.toString;
var hasOwn = Object.hasOwn || (function (obj, propName) {
    return (hasOwnProperty.call(obj, propName));
});
var isArray = Array.isArray || (function (obj) {
    return (toString.call(obj) === "[object Array]");
});
var regexpCache = Object.create(null);
function wordsRegexp(words) {
    return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"));
}
function codePointToString(code) {
    if (code <= 0xFFFF) {
        return String.fromCharCode(code);
    }
    code -= 0x10000;
    return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00);
}
var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
var Position = function Position(line, col) {
    this.line = line;
    this.column = col;
};
Position.prototype.offset = function offset(n) {
    return new Position(this.line, this.column + n);
};
var SourceLocation = function SourceLocation(p, start, end) {
    this.start = start;
    this.end = end;
    if (p.sourceFile !== null) {
        this.source = p.sourceFile;
    }
};
function getLineInfo(input, offset) {
    for (var line = 1, cur = 0;;) {
        var nextBreak = nextLineBreak(input, cur, offset);
        if (nextBreak < 0) {
            return new Position(line, offset - cur);
        }
        ++line;
        cur = nextBreak;
    }
}
var defaultOptions = {
    ecmaVersion: null,
    sourceType: "script",
    onInsertedSemicolon: null,
    onTrailingComma: null,
    allowReserved: null,
    allowReturnOutsideFunction: false,
    allowImportExportEverywhere: false,
    allowAwaitOutsideFunction: null,
    allowSuperOutsideMethod: null,
    allowHashBang: false,
    checkPrivateFields: true,
    locations: false,
    onToken: null,
    onComment: null,
    ranges: false,
    program: null,
    sourceFile: null,
    directSourceFile: null,
    preserveParens: false
};
var warnedAboutEcmaVersion = false;
function getOptions(opts) {
    var options = {};
    for (var opt in defaultOptions) {
        options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt];
    }
    if (options.ecmaVersion === "latest") {
        options.ecmaVersion = 1e8;
    }
    else if (options.ecmaVersion == null) {
        if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
            warnedAboutEcmaVersion = true;
            console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.");
        }
        options.ecmaVersion = 11;
    }
    else if (options.ecmaVersion >= 2015) {
        options.ecmaVersion -= 2009;
    }
    if (options.allowReserved == null) {
        options.allowReserved = options.ecmaVersion < 5;
    }
    if (!opts || opts.allowHashBang == null) {
        options.allowHashBang = options.ecmaVersion >= 14;
    }
    if (isArray(options.onToken)) {
        var tokens = options.onToken;
        options.onToken = function (token) { return tokens.push(token); };
    }
    if (isArray(options.onComment)) {
        options.onComment = pushComment(options, options.onComment);
    }
    if (options.sourceType === "commonjs" && options.allowAwaitOutsideFunction) {
        throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs");
    }
    return options;
}
function pushComment(options, array) {
    return function (block, text, start, end, startLoc, endLoc) {
        var comment = {
            type: block ? "Block" : "Line",
            value: text,
            start: start,
            end: end
        };
        if (options.locations) {
            comment.loc = new SourceLocation(this, startLoc, endLoc);
        }
        if (options.ranges) {
            comment.range = [start, end];
        }
        array.push(comment);
    };
}
var SCOPE_TOP = 1, SCOPE_FUNCTION = 2, SCOPE_ASYNC = 4, SCOPE_GENERATOR = 8, SCOPE_ARROW = 16, SCOPE_SIMPLE_CATCH = 32, SCOPE_SUPER = 64, SCOPE_DIRECT_SUPER = 128, SCOPE_CLASS_STATIC_BLOCK = 256, SCOPE_CLASS_FIELD_INIT = 512, SCOPE_SWITCH = 1024, SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;
function functionFlags(async, generator) {
    return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);
}
var BIND_NONE = 0,
BIND_VAR = 1,
BIND_LEXICAL = 2,
BIND_FUNCTION = 3,
BIND_SIMPLE_CATCH = 4,
BIND_OUTSIDE = 5;
var Parser$2 = function Parser(options, input, startPos) {
    this.options = options = getOptions(options);
    this.sourceFile = options.sourceFile;
    this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
    var reserved = "";
    if (options.allowReserved !== true) {
        reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
        if (options.sourceType === "module") {
            reserved += " await";
        }
    }
    this.reservedWords = wordsRegexp(reserved);
    var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
    this.reservedWordsStrict = wordsRegexp(reservedStrict);
    this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
    this.input = String(input);
    this.containsEsc = false;
    if (startPos) {
        this.pos = startPos;
        this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
        this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
    }
    else {
        this.pos = this.lineStart = 0;
        this.curLine = 1;
    }
    this.type = types$1.eof;
    this.value = null;
    this.start = this.end = this.pos;
    this.startLoc = this.endLoc = this.curPosition();
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;
    this.context = this.initialContext();
    this.exprAllowed = true;
    this.inModule = options.sourceType === "module";
    this.strict = this.inModule || this.strictDirective(this.pos);
    this.potentialArrowAt = -1;
    this.potentialArrowInForAwait = false;
    this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
    this.labels = [];
    this.undefinedExports = Object.create(null);
    if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!") {
        this.skipLineComment(2);
    }
    this.scopeStack = [];
    this.enterScope(this.options.sourceType === "commonjs"
        ? SCOPE_FUNCTION
        : SCOPE_TOP);
    this.regexpState = null;
    this.privateNameStack = [];
};
var prototypeAccessors = { inFunction: { configurable: true }, inGenerator: { configurable: true }, inAsync: { configurable: true }, canAwait: { configurable: true }, allowReturn: { configurable: true }, allowSuper: { configurable: true }, allowDirectSuper: { configurable: true }, treatFunctionsAsVar: { configurable: true }, allowNewDotTarget: { configurable: true }, allowUsing: { configurable: true }, inClassStaticBlock: { configurable: true } };
Parser$2.prototype.parse = function parse() {
    var node = this.options.program || this.startNode();
    this.nextToken();
    return this.parseTopLevel(node);
};
prototypeAccessors.inFunction.get = function () { return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0; };
prototypeAccessors.inGenerator.get = function () { return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0; };
prototypeAccessors.inAsync.get = function () { return (this.currentVarScope().flags & SCOPE_ASYNC) > 0; };
prototypeAccessors.canAwait.get = function () {
    for (var i = this.scopeStack.length - 1; i >= 0; i--) {
        var ref = this.scopeStack[i];
        var flags = ref.flags;
        if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
            return false;
        }
        if (flags & SCOPE_FUNCTION) {
            return (flags & SCOPE_ASYNC) > 0;
        }
    }
    return (this.inModule && this.options.ecmaVersion >= 13) || this.options.allowAwaitOutsideFunction;
};
prototypeAccessors.allowReturn.get = function () {
    if (this.inFunction) {
        return true;
    }
    if (this.options.allowReturnOutsideFunction && this.currentVarScope().flags & SCOPE_TOP) {
        return true;
    }
    return false;
};
prototypeAccessors.allowSuper.get = function () {
    var ref = this.currentThisScope();
    var flags = ref.flags;
    return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod;
};
prototypeAccessors.allowDirectSuper.get = function () { return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0; };
prototypeAccessors.treatFunctionsAsVar.get = function () { return this.treatFunctionsAsVarInScope(this.currentScope()); };
prototypeAccessors.allowNewDotTarget.get = function () {
    for (var i = this.scopeStack.length - 1; i >= 0; i--) {
        var ref = this.scopeStack[i];
        var flags = ref.flags;
        if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) ||
            ((flags & SCOPE_FUNCTION) && !(flags & SCOPE_ARROW))) {
            return true;
        }
    }
    return false;
};
prototypeAccessors.allowUsing.get = function () {
    var ref = this.currentScope();
    var flags = ref.flags;
    if (flags & SCOPE_SWITCH) {
        return false;
    }
    if (!this.inModule && flags & SCOPE_TOP) {
        return false;
    }
    return true;
};
prototypeAccessors.inClassStaticBlock.get = function () {
    return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0;
};
Parser$2.extend = function extend() {
    var plugins = [], len = arguments.length;
    while (len--)
        plugins[len] = arguments[len];
    var cls = this;
    for (var i = 0; i < plugins.length; i++) {
        cls = plugins[i](cls);
    }
    return cls;
};
Parser$2.parse = function parse(input, options) {
    return new this(options, input).parse();
};
Parser$2.parseExpressionAt = function parseExpressionAt(input, pos, options) {
    var parser = new this(options, input, pos);
    parser.nextToken();
    return parser.parseExpression();
};
Parser$2.tokenizer = function tokenizer(input, options) {
    return new this(options, input);
};
Object.defineProperties(Parser$2.prototype, prototypeAccessors);
var pp$9 = Parser$2.prototype;
var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
pp$9.strictDirective = function (start) {
    if (this.options.ecmaVersion < 5) {
        return false;
    }
    for (;;) {
        skipWhiteSpace.lastIndex = start;
        start += skipWhiteSpace.exec(this.input)[0].length;
        var match = literal.exec(this.input.slice(start));
        if (!match) {
            return false;
        }
        if ((match[1] || match[2]) === "use strict") {
            skipWhiteSpace.lastIndex = start + match[0].length;
            var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
            var next = this.input.charAt(end);
            return next === ";" || next === "}" ||
                (lineBreak.test(spaceAfter[0]) &&
                    !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "="));
        }
        start += match[0].length;
        skipWhiteSpace.lastIndex = start;
        start += skipWhiteSpace.exec(this.input)[0].length;
        if (this.input[start] === ";") {
            start++;
        }
    }
};
pp$9.eat = function (type) {
    if (this.type === type) {
        this.next();
        return true;
    }
    else {
        return false;
    }
};
pp$9.isContextual = function (name) {
    return this.type === types$1.name && this.value === name && !this.containsEsc;
};
pp$9.eatContextual = function (name) {
    if (!this.isContextual(name)) {
        return false;
    }
    this.next();
    return true;
};
pp$9.expectContextual = function (name) {
    if (!this.eatContextual(name)) {
        this.unexpected();
    }
};
pp$9.canInsertSemicolon = function () {
    return this.type === types$1.eof ||
        this.type === types$1.braceR ||
        lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$9.insertSemicolon = function () {
    if (this.canInsertSemicolon()) {
        if (this.options.onInsertedSemicolon) {
            this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc);
        }
        return true;
    }
};
pp$9.semicolon = function () {
    if (!this.eat(types$1.semi) && !this.insertSemicolon()) {
        this.unexpected();
    }
};
pp$9.afterTrailingComma = function (tokType, notNext) {
    if (this.type === tokType) {
        if (this.options.onTrailingComma) {
            this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc);
        }
        if (!notNext) {
            this.next();
        }
        return true;
    }
};
pp$9.expect = function (type) {
    this.eat(type) || this.unexpected();
};
pp$9.unexpected = function (pos) {
    this.raise(pos != null ? pos : this.start, "Unexpected token");
};
var DestructuringErrors = function DestructuringErrors() {
    this.shorthandAssign =
        this.trailingComma =
            this.parenthesizedAssign =
                this.parenthesizedBind =
                    this.doubleProto =
                        -1;
};
pp$9.checkPatternErrors = function (refDestructuringErrors, isAssign) {
    if (!refDestructuringErrors) {
        return;
    }
    if (refDestructuringErrors.trailingComma > -1) {
        this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element");
    }
    var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
    if (parens > -1) {
        this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern");
    }
};
pp$9.checkExpressionErrors = function (refDestructuringErrors, andThrow) {
    if (!refDestructuringErrors) {
        return false;
    }
    var shorthandAssign = refDestructuringErrors.shorthandAssign;
    var doubleProto = refDestructuringErrors.doubleProto;
    if (!andThrow) {
        return shorthandAssign >= 0 || doubleProto >= 0;
    }
    if (shorthandAssign >= 0) {
        this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns");
    }
    if (doubleProto >= 0) {
        this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property");
    }
};
pp$9.checkYieldAwaitInDefaultParams = function () {
    if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) {
        this.raise(this.yieldPos, "Yield expression cannot be a default value");
    }
    if (this.awaitPos) {
        this.raise(this.awaitPos, "Await expression cannot be a default value");
    }
};
pp$9.isSimpleAssignTarget = function (expr) {
    if (expr.type === "ParenthesizedExpression") {
        return this.isSimpleAssignTarget(expr.expression);
    }
    return expr.type === "Identifier" || expr.type === "MemberExpression";
};
var pp$8 = Parser$2.prototype;
pp$8.parseTopLevel = function (node) {
    var exports = Object.create(null);
    if (!node.body) {
        node.body = [];
    }
    while (this.type !== types$1.eof) {
        var stmt = this.parseStatement(null, true, exports);
        node.body.push(stmt);
    }
    if (this.inModule) {
        for (var i = 0, list = Object.keys(this.undefinedExports); i < list.length; i += 1) {
            var name = list[i];
            this.raiseRecoverable(this.undefinedExports[name].start, ("Export '" + name + "' is not defined"));
        }
    }
    this.adaptDirectivePrologue(node.body);
    this.next();
    node.sourceType = this.options.sourceType === "commonjs" ? "script" : this.options.sourceType;
    return this.finishNode(node, "Program");
};
var loopLabel = { kind: "loop" }, switchLabel = { kind: "switch" };
pp$8.isLet = function (context) {
    if (this.options.ecmaVersion < 6 || !this.isContextual("let")) {
        return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, nextCh = this.fullCharCodeAt(next);
    if (nextCh === 91 || nextCh === 92) {
        return true;
    }
    if (context) {
        return false;
    }
    if (nextCh === 123) {
        return true;
    }
    if (isIdentifierStart(nextCh)) {
        var start = next;
        do {
            next += nextCh <= 0xffff ? 1 : 2;
        } while (isIdentifierChar(nextCh = this.fullCharCodeAt(next)));
        if (nextCh === 92) {
            return true;
        }
        var ident = this.input.slice(start, next);
        if (!keywordRelationalOperator.test(ident)) {
            return true;
        }
    }
    return false;
};
pp$8.isAsyncFunction = function () {
    if (this.options.ecmaVersion < 8 || !this.isContextual("async")) {
        return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, after;
    return !lineBreak.test(this.input.slice(this.pos, next)) &&
        this.input.slice(next, next + 8) === "function" &&
        (next + 8 === this.input.length ||
            !(isIdentifierChar(after = this.fullCharCodeAt(next + 8)) || after === 92 ));
};
pp$8.isUsingKeyword = function (isAwaitUsing, isFor) {
    if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using")) {
        return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length;
    if (lineBreak.test(this.input.slice(this.pos, next))) {
        return false;
    }
    if (isAwaitUsing) {
        var usingEndPos = next + 5 , after;
        if (this.input.slice(next, usingEndPos) !== "using" ||
            usingEndPos === this.input.length ||
            isIdentifierChar(after = this.fullCharCodeAt(usingEndPos)) ||
            after === 92 ) {
            return false;
        }
        skipWhiteSpace.lastIndex = usingEndPos;
        var skipAfterUsing = skipWhiteSpace.exec(this.input);
        next = usingEndPos + skipAfterUsing[0].length;
        if (skipAfterUsing && lineBreak.test(this.input.slice(usingEndPos, next))) {
            return false;
        }
    }
    var ch = this.fullCharCodeAt(next);
    if (!isIdentifierStart(ch) && ch !== 92 ) {
        return false;
    }
    var idStart = next;
    do {
        next += ch <= 0xffff ? 1 : 2;
    } while (isIdentifierChar(ch = this.fullCharCodeAt(next)));
    if (ch === 92) {
        return true;
    }
    var id = this.input.slice(idStart, next);
    if (keywordRelationalOperator.test(id) || isFor && id === "of") {
        return false;
    }
    return true;
};
pp$8.isAwaitUsing = function (isFor) {
    return this.isUsingKeyword(true, isFor);
};
pp$8.isUsing = function (isFor) {
    return this.isUsingKeyword(false, isFor);
};
pp$8.parseStatement = function (context, topLevel, exports) {
    var starttype = this.type, node = this.startNode(), kind;
    if (this.isLet(context)) {
        starttype = types$1._var;
        kind = "let";
    }
    switch (starttype) {
        case types$1._break:
        case types$1._continue: return this.parseBreakContinueStatement(node, starttype.keyword);
        case types$1._debugger: return this.parseDebuggerStatement(node);
        case types$1._do: return this.parseDoStatement(node);
        case types$1._for: return this.parseForStatement(node);
        case types$1._function:
            if ((context && (this.strict || context !== "if" && context !== "label")) && this.options.ecmaVersion >= 6) {
                this.unexpected();
            }
            return this.parseFunctionStatement(node, false, !context);
        case types$1._class:
            if (context) {
                this.unexpected();
            }
            return this.parseClass(node, true);
        case types$1._if: return this.parseIfStatement(node);
        case types$1._return: return this.parseReturnStatement(node);
        case types$1._switch: return this.parseSwitchStatement(node);
        case types$1._throw: return this.parseThrowStatement(node);
        case types$1._try: return this.parseTryStatement(node);
        case types$1._const:
        case types$1._var:
            kind = kind || this.value;
            if (context && kind !== "var") {
                this.unexpected();
            }
            return this.parseVarStatement(node, kind);
        case types$1._while: return this.parseWhileStatement(node);
        case types$1._with: return this.parseWithStatement(node);
        case types$1.braceL: return this.parseBlock(true, node);
        case types$1.semi: return this.parseEmptyStatement(node);
        case types$1._export:
        case types$1._import:
            if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
                skipWhiteSpace.lastIndex = this.pos;
                var skip = skipWhiteSpace.exec(this.input);
                var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
                if (nextCh === 40 || nextCh === 46)
                 {
                    return this.parseExpressionStatement(node, this.parseExpression());
                }
            }
            if (!this.options.allowImportExportEverywhere) {
                if (!topLevel) {
                    this.raise(this.start, "'import' and 'export' may only appear at the top level");
                }
                if (!this.inModule) {
                    this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
                }
            }
            return starttype === types$1._import ? this.parseImport(node) : this.parseExport(node, exports);
        default:
            if (this.isAsyncFunction()) {
                if (context) {
                    this.unexpected();
                }
                this.next();
                return this.parseFunctionStatement(node, true, !context);
            }
            var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
            if (usingKind) {
                if (!this.allowUsing) {
                    this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script` or in the bare case statement");
                }
                if (usingKind === "await using") {
                    if (!this.canAwait) {
                        this.raise(this.start, "Await using cannot appear outside of async function");
                    }
                    this.next();
                }
                this.next();
                this.parseVar(node, false, usingKind);
                this.semicolon();
                return this.finishNode(node, "VariableDeclaration");
            }
            var maybeName = this.value, expr = this.parseExpression();
            if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon)) {
                return this.parseLabeledStatement(node, maybeName, expr, context);
            }
            else {
                return this.parseExpressionStatement(node, expr);
            }
    }
};
pp$8.parseBreakContinueStatement = function (node, keyword) {
    var isBreak = keyword === "break";
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) {
        node.label = null;
    }
    else if (this.type !== types$1.name) {
        this.unexpected();
    }
    else {
        node.label = this.parseIdent();
        this.semicolon();
    }
    var i = 0;
    for (; i < this.labels.length; ++i) {
        var lab = this.labels[i];
        if (node.label == null || lab.name === node.label.name) {
            if (lab.kind != null && (isBreak || lab.kind === "loop")) {
                break;
            }
            if (node.label && isBreak) {
                break;
            }
        }
    }
    if (i === this.labels.length) {
        this.raise(node.start, "Unsyntactic " + keyword);
    }
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
};
pp$8.parseDebuggerStatement = function (node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement");
};
pp$8.parseDoStatement = function (node) {
    this.next();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("do");
    this.labels.pop();
    this.expect(types$1._while);
    node.test = this.parseParenExpression();
    if (this.options.ecmaVersion >= 6) {
        this.eat(types$1.semi);
    }
    else {
        this.semicolon();
    }
    return this.finishNode(node, "DoWhileStatement");
};
pp$8.parseForStatement = function (node) {
    this.next();
    var awaitAt = (this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await")) ? this.lastTokStart : -1;
    this.labels.push(loopLabel);
    this.enterScope(0);
    this.expect(types$1.parenL);
    if (this.type === types$1.semi) {
        if (awaitAt > -1) {
            this.unexpected(awaitAt);
        }
        return this.parseFor(node, null);
    }
    var isLet = this.isLet();
    if (this.type === types$1._var || this.type === types$1._const || isLet) {
        var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
        this.next();
        this.parseVar(init$1, true, kind);
        this.finishNode(init$1, "VariableDeclaration");
        return this.parseForAfterInit(node, init$1, awaitAt);
    }
    var startsWithLet = this.isContextual("let"), isForOf = false;
    var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
    if (usingKind) {
        var init$2 = this.startNode();
        this.next();
        if (usingKind === "await using") {
            if (!this.canAwait) {
                this.raise(this.start, "Await using cannot appear outside of async function");
            }
            this.next();
        }
        this.parseVar(init$2, true, usingKind);
        this.finishNode(init$2, "VariableDeclaration");
        return this.parseForAfterInit(node, init$2, awaitAt);
    }
    var containsEsc = this.containsEsc;
    var refDestructuringErrors = new DestructuringErrors;
    var initPos = this.start;
    var init = awaitAt > -1
        ? this.parseExprSubscripts(refDestructuringErrors, "await")
        : this.parseExpression(true, refDestructuringErrors);
    if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
        if (awaitAt > -1) {
            if (this.type === types$1._in) {
                this.unexpected(awaitAt);
            }
            node.await = true;
        }
        else if (isForOf && this.options.ecmaVersion >= 8) {
            if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") {
                this.unexpected();
            }
            else if (this.options.ecmaVersion >= 9) {
                node.await = false;
            }
        }
        if (startsWithLet && isForOf) {
            this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'.");
        }
        this.toAssignable(init, false, refDestructuringErrors);
        this.checkLValPattern(init);
        return this.parseForIn(node, init);
    }
    else {
        this.checkExpressionErrors(refDestructuringErrors, true);
    }
    if (awaitAt > -1) {
        this.unexpected(awaitAt);
    }
    return this.parseFor(node, init);
};
pp$8.parseForAfterInit = function (node, init, awaitAt) {
    if ((this.type === types$1._in || (this.options.ecmaVersion >= 6 && this.isContextual("of"))) && init.declarations.length === 1) {
        if (this.options.ecmaVersion >= 9) {
            if (this.type === types$1._in) {
                if (awaitAt > -1) {
                    this.unexpected(awaitAt);
                }
            }
            else {
                node.await = awaitAt > -1;
            }
        }
        return this.parseForIn(node, init);
    }
    if (awaitAt > -1) {
        this.unexpected(awaitAt);
    }
    return this.parseFor(node, init);
};
pp$8.parseFunctionStatement = function (node, isAsync, declarationPosition) {
    this.next();
    return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync);
};
pp$8.parseIfStatement = function (node) {
    this.next();
    node.test = this.parseParenExpression();
    node.consequent = this.parseStatement("if");
    node.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
    return this.finishNode(node, "IfStatement");
};
pp$8.parseReturnStatement = function (node) {
    if (!this.allowReturn) {
        this.raise(this.start, "'return' outside of function");
    }
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) {
        node.argument = null;
    }
    else {
        node.argument = this.parseExpression();
        this.semicolon();
    }
    return this.finishNode(node, "ReturnStatement");
};
pp$8.parseSwitchStatement = function (node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    node.cases = [];
    this.expect(types$1.braceL);
    this.labels.push(switchLabel);
    this.enterScope(SCOPE_SWITCH);
    var cur;
    for (var sawDefault = false; this.type !== types$1.braceR;) {
        if (this.type === types$1._case || this.type === types$1._default) {
            var isCase = this.type === types$1._case;
            if (cur) {
                this.finishNode(cur, "SwitchCase");
            }
            node.cases.push(cur = this.startNode());
            cur.consequent = [];
            this.next();
            if (isCase) {
                cur.test = this.parseExpression();
            }
            else {
                if (sawDefault) {
                    this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
                }
                sawDefault = true;
                cur.test = null;
            }
            this.expect(types$1.colon);
        }
        else {
            if (!cur) {
                this.unexpected();
            }
            cur.consequent.push(this.parseStatement(null));
        }
    }
    this.exitScope();
    if (cur) {
        this.finishNode(cur, "SwitchCase");
    }
    this.next();
    this.labels.pop();
    return this.finishNode(node, "SwitchStatement");
};
pp$8.parseThrowStatement = function (node) {
    this.next();
    if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
        this.raise(this.lastTokEnd, "Illegal newline after throw");
    }
    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement");
};
var empty$1 = [];
pp$8.parseCatchClauseParam = function () {
    var param = this.parseBindingAtom();
    var simple = param.type === "Identifier";
    this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
    this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
    this.expect(types$1.parenR);
    return param;
};
pp$8.parseTryStatement = function (node) {
    this.next();
    node.block = this.parseBlock();
    node.handler = null;
    if (this.type === types$1._catch) {
        var clause = this.startNode();
        this.next();
        if (this.eat(types$1.parenL)) {
            clause.param = this.parseCatchClauseParam();
        }
        else {
            if (this.options.ecmaVersion < 10) {
                this.unexpected();
            }
            clause.param = null;
            this.enterScope(0);
        }
        clause.body = this.parseBlock(false);
        this.exitScope();
        node.handler = this.finishNode(clause, "CatchClause");
    }
    node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
    if (!node.handler && !node.finalizer) {
        this.raise(node.start, "Missing catch or finally clause");
    }
    return this.finishNode(node, "TryStatement");
};
pp$8.parseVarStatement = function (node, kind, allowMissingInitializer) {
    this.next();
    this.parseVar(node, false, kind, allowMissingInitializer);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration");
};
pp$8.parseWhileStatement = function (node) {
    this.next();
    node.test = this.parseParenExpression();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("while");
    this.labels.pop();
    return this.finishNode(node, "WhileStatement");
};
pp$8.parseWithStatement = function (node) {
    if (this.strict) {
        this.raise(this.start, "'with' in strict mode");
    }
    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement("with");
    return this.finishNode(node, "WithStatement");
};
pp$8.parseEmptyStatement = function (node) {
    this.next();
    return this.finishNode(node, "EmptyStatement");
};
pp$8.parseLabeledStatement = function (node, maybeName, expr, context) {
    for (var i$1 = 0, list = this.labels; i$1 < list.length; i$1 += 1) {
        var label = list[i$1];
        if (label.name === maybeName) {
            this.raise(expr.start, "Label '" + maybeName + "' is already declared");
        }
    }
    var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
    for (var i = this.labels.length - 1; i >= 0; i--) {
        var label$1 = this.labels[i];
        if (label$1.statementStart === node.start) {
            label$1.statementStart = this.start;
            label$1.kind = kind;
        }
        else {
            break;
        }
    }
    this.labels.push({ name: maybeName, kind: kind, statementStart: this.start });
    node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
    this.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement");
};
pp$8.parseExpressionStatement = function (node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement");
};
pp$8.parseBlock = function (createNewLexicalScope, node, exitStrict) {
    if (createNewLexicalScope === void 0)
        createNewLexicalScope = true;
    if (node === void 0)
        node = this.startNode();
    node.body = [];
    this.expect(types$1.braceL);
    if (createNewLexicalScope) {
        this.enterScope(0);
    }
    while (this.type !== types$1.braceR) {
        var stmt = this.parseStatement(null);
        node.body.push(stmt);
    }
    if (exitStrict) {
        this.strict = false;
    }
    this.next();
    if (createNewLexicalScope) {
        this.exitScope();
    }
    return this.finishNode(node, "BlockStatement");
};
pp$8.parseFor = function (node, init) {
    node.init = init;
    this.expect(types$1.semi);
    node.test = this.type === types$1.semi ? null : this.parseExpression();
    this.expect(types$1.semi);
    node.update = this.type === types$1.parenR ? null : this.parseExpression();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, "ForStatement");
};
pp$8.parseForIn = function (node, init) {
    var isForIn = this.type === types$1._in;
    this.next();
    if (init.type === "VariableDeclaration" &&
        init.declarations[0].init != null &&
        (!isForIn ||
            this.options.ecmaVersion < 8 ||
            this.strict ||
            init.kind !== "var" ||
            init.declarations[0].id.type !== "Identifier")) {
        this.raise(init.start, ((isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer"));
    }
    node.left = init;
    node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
};
pp$8.parseVar = function (node, isFor, kind, allowMissingInitializer) {
    node.declarations = [];
    node.kind = kind;
    for (;;) {
        var decl = this.startNode();
        this.parseVarId(decl, kind);
        if (this.eat(types$1.eq)) {
            decl.init = this.parseMaybeAssign(isFor);
        }
        else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || (this.options.ecmaVersion >= 6 && this.isContextual("of")))) {
            this.unexpected();
        }
        else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) {
            this.raise(this.lastTokEnd, ("Missing initializer in " + kind + " declaration"));
        }
        else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) {
            this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
        }
        else {
            decl.init = null;
        }
        node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
        if (!this.eat(types$1.comma)) {
            break;
        }
    }
    return node;
};
pp$8.parseVarId = function (decl, kind) {
    decl.id = kind === "using" || kind === "await using"
        ? this.parseIdent()
        : this.parseBindingAtom();
    this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
};
var FUNC_STATEMENT = 1, FUNC_HANGING_STATEMENT = 2, FUNC_NULLABLE_ID = 4;
pp$8.parseFunction = function (node, statement, allowExpressionBody, isAsync, forInit) {
    this.initFunction(node);
    if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
        if (this.type === types$1.star && (statement & FUNC_HANGING_STATEMENT)) {
            this.unexpected();
        }
        node.generator = this.eat(types$1.star);
    }
    if (this.options.ecmaVersion >= 8) {
        node.async = !!isAsync;
    }
    if (statement & FUNC_STATEMENT) {
        node.id = (statement & FUNC_NULLABLE_ID) && this.type !== types$1.name ? null : this.parseIdent();
        if (node.id && !(statement & FUNC_HANGING_STATEMENT))
        {
            this.checkLValSimple(node.id, (this.strict || node.generator || node.async) ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION);
        }
    }
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(node.async, node.generator));
    if (!(statement & FUNC_STATEMENT)) {
        node.id = this.type === types$1.name ? this.parseIdent() : null;
    }
    this.parseFunctionParams(node);
    this.parseFunctionBody(node, allowExpressionBody, false, forInit);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, (statement & FUNC_STATEMENT) ? "FunctionDeclaration" : "FunctionExpression");
};
pp$8.parseFunctionParams = function (node) {
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
};
pp$8.parseClass = function (node, isStatement) {
    this.next();
    var oldStrict = this.strict;
    this.strict = true;
    this.parseClassId(node, isStatement);
    this.parseClassSuper(node);
    var privateNameMap = this.enterClassBody();
    var classBody = this.startNode();
    var hadConstructor = false;
    classBody.body = [];
    this.expect(types$1.braceL);
    while (this.type !== types$1.braceR) {
        var element = this.parseClassElement(node.superClass !== null);
        if (element) {
            classBody.body.push(element);
            if (element.type === "MethodDefinition" && element.kind === "constructor") {
                if (hadConstructor) {
                    this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
                }
                hadConstructor = true;
            }
            else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted(privateNameMap, element)) {
                this.raiseRecoverable(element.key.start, ("Identifier '#" + (element.key.name) + "' has already been declared"));
            }
        }
    }
    this.strict = oldStrict;
    this.next();
    node.body = this.finishNode(classBody, "ClassBody");
    this.exitClassBody();
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
};
pp$8.parseClassElement = function (constructorAllowsSuper) {
    if (this.eat(types$1.semi)) {
        return null;
    }
    var ecmaVersion = this.options.ecmaVersion;
    var node = this.startNode();
    var keyName = "";
    var isGenerator = false;
    var isAsync = false;
    var kind = "method";
    var isStatic = false;
    if (this.eatContextual("static")) {
        if (ecmaVersion >= 13 && this.eat(types$1.braceL)) {
            this.parseClassStaticBlock(node);
            return node;
        }
        if (this.isClassElementNameStart() || this.type === types$1.star) {
            isStatic = true;
        }
        else {
            keyName = "static";
        }
    }
    node.static = isStatic;
    if (!keyName && ecmaVersion >= 8 && this.eatContextual("async")) {
        if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) {
            isAsync = true;
        }
        else {
            keyName = "async";
        }
    }
    if (!keyName && (ecmaVersion >= 9 || !isAsync) && this.eat(types$1.star)) {
        isGenerator = true;
    }
    if (!keyName && !isAsync && !isGenerator) {
        var lastValue = this.value;
        if (this.eatContextual("get") || this.eatContextual("set")) {
            if (this.isClassElementNameStart()) {
                kind = lastValue;
            }
            else {
                keyName = lastValue;
            }
        }
    }
    if (keyName) {
        node.computed = false;
        node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
        node.key.name = keyName;
        this.finishNode(node.key, "Identifier");
    }
    else {
        this.parseClassElementName(node);
    }
    if (ecmaVersion < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
        var isConstructor = !node.static && checkKeyName(node, "constructor");
        var allowsDirectSuper = isConstructor && constructorAllowsSuper;
        if (isConstructor && kind !== "method") {
            this.raise(node.key.start, "Constructor can't have get/set modifier");
        }
        node.kind = isConstructor ? "constructor" : kind;
        this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
    }
    else {
        this.parseClassField(node);
    }
    return node;
};
pp$8.isClassElementNameStart = function () {
    return (this.type === types$1.name ||
        this.type === types$1.privateId ||
        this.type === types$1.num ||
        this.type === types$1.string ||
        this.type === types$1.bracketL ||
        this.type.keyword);
};
pp$8.parseClassElementName = function (element) {
    if (this.type === types$1.privateId) {
        if (this.value === "constructor") {
            this.raise(this.start, "Classes can't have an element named '#constructor'");
        }
        element.computed = false;
        element.key = this.parsePrivateIdent();
    }
    else {
        this.parsePropertyName(element);
    }
};
pp$8.parseClassMethod = function (method, isGenerator, isAsync, allowsDirectSuper) {
    var key = method.key;
    if (method.kind === "constructor") {
        if (isGenerator) {
            this.raise(key.start, "Constructor can't be a generator");
        }
        if (isAsync) {
            this.raise(key.start, "Constructor can't be an async method");
        }
    }
    else if (method.static && checkKeyName(method, "prototype")) {
        this.raise(key.start, "Classes may not have a static property named prototype");
    }
    var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
    if (method.kind === "get" && value.params.length !== 0) {
        this.raiseRecoverable(value.start, "getter should have no params");
    }
    if (method.kind === "set" && value.params.length !== 1) {
        this.raiseRecoverable(value.start, "setter should have exactly one param");
    }
    if (method.kind === "set" && value.params[0].type === "RestElement") {
        this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params");
    }
    return this.finishNode(method, "MethodDefinition");
};
pp$8.parseClassField = function (field) {
    if (checkKeyName(field, "constructor")) {
        this.raise(field.key.start, "Classes can't have a field named 'constructor'");
    }
    else if (field.static && checkKeyName(field, "prototype")) {
        this.raise(field.key.start, "Classes can't have a static field named 'prototype'");
    }
    if (this.eat(types$1.eq)) {
        this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
        field.value = this.parseMaybeAssign();
        this.exitScope();
    }
    else {
        field.value = null;
    }
    this.semicolon();
    return this.finishNode(field, "PropertyDefinition");
};
pp$8.parseClassStaticBlock = function (node) {
    node.body = [];
    var oldLabels = this.labels;
    this.labels = [];
    this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
    while (this.type !== types$1.braceR) {
        var stmt = this.parseStatement(null);
        node.body.push(stmt);
    }
    this.next();
    this.exitScope();
    this.labels = oldLabels;
    return this.finishNode(node, "StaticBlock");
};
pp$8.parseClassId = function (node, isStatement) {
    if (this.type === types$1.name) {
        node.id = this.parseIdent();
        if (isStatement) {
            this.checkLValSimple(node.id, BIND_LEXICAL, false);
        }
    }
    else {
        if (isStatement === true) {
            this.unexpected();
        }
        node.id = null;
    }
};
pp$8.parseClassSuper = function (node) {
    node.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
};
pp$8.enterClassBody = function () {
    var element = { declared: Object.create(null), used: [] };
    this.privateNameStack.push(element);
    return element.declared;
};
pp$8.exitClassBody = function () {
    var ref = this.privateNameStack.pop();
    var declared = ref.declared;
    var used = ref.used;
    if (!this.options.checkPrivateFields) {
        return;
    }
    var len = this.privateNameStack.length;
    var parent = len === 0 ? null : this.privateNameStack[len - 1];
    for (var i = 0; i < used.length; ++i) {
        var id = used[i];
        if (!hasOwn(declared, id.name)) {
            if (parent) {
                parent.used.push(id);
            }
            else {
                this.raiseRecoverable(id.start, ("Private field '#" + (id.name) + "' must be declared in an enclosing class"));
            }
        }
    }
};
function isPrivateNameConflicted(privateNameMap, element) {
    var name = element.key.name;
    var curr = privateNameMap[name];
    var next = "true";
    if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) {
        next = (element.static ? "s" : "i") + element.kind;
    }
    if (curr === "iget" && next === "iset" ||
        curr === "iset" && next === "iget" ||
        curr === "sget" && next === "sset" ||
        curr === "sset" && next === "sget") {
        privateNameMap[name] = "true";
        return false;
    }
    else if (!curr) {
        privateNameMap[name] = next;
        return false;
    }
    else {
        return true;
    }
}
function checkKeyName(node, name) {
    var computed = node.computed;
    var key = node.key;
    return !computed && (key.type === "Identifier" && key.name === name ||
        key.type === "Literal" && key.value === name);
}
pp$8.parseExportAllDeclaration = function (node, exports) {
    if (this.options.ecmaVersion >= 11) {
        if (this.eatContextual("as")) {
            node.exported = this.parseModuleExportName();
            this.checkExport(exports, node.exported, this.lastTokStart);
        }
        else {
            node.exported = null;
        }
    }
    this.expectContextual("from");
    if (this.type !== types$1.string) {
        this.unexpected();
    }
    node.source = this.parseExprAtom();
    if (this.options.ecmaVersion >= 16) {
        node.attributes = this.parseWithClause();
    }
    this.semicolon();
    return this.finishNode(node, "ExportAllDeclaration");
};
pp$8.parseExport = function (node, exports) {
    this.next();
    if (this.eat(types$1.star)) {
        return this.parseExportAllDeclaration(node, exports);
    }
    if (this.eat(types$1._default)) {
        this.checkExport(exports, "default", this.lastTokStart);
        node.declaration = this.parseExportDefaultDeclaration();
        return this.finishNode(node, "ExportDefaultDeclaration");
    }
    if (this.shouldParseExportStatement()) {
        node.declaration = this.parseExportDeclaration(node);
        if (node.declaration.type === "VariableDeclaration") {
            this.checkVariableExport(exports, node.declaration.declarations);
        }
        else {
            this.checkExport(exports, node.declaration.id, node.declaration.id.start);
        }
        node.specifiers = [];
        node.source = null;
        if (this.options.ecmaVersion >= 16) {
            node.attributes = [];
        }
    }
    else {
        node.declaration = null;
        node.specifiers = this.parseExportSpecifiers(exports);
        if (this.eatContextual("from")) {
            if (this.type !== types$1.string) {
                this.unexpected();
            }
            node.source = this.parseExprAtom();
            if (this.options.ecmaVersion >= 16) {
                node.attributes = this.parseWithClause();
            }
        }
        else {
            for (var i = 0, list = node.specifiers; i < list.length; i += 1) {
                var spec = list[i];
                this.checkUnreserved(spec.local);
                this.checkLocalExport(spec.local);
                if (spec.local.type === "Literal") {
                    this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
                }
            }
            node.source = null;
            if (this.options.ecmaVersion >= 16) {
                node.attributes = [];
            }
        }
        this.semicolon();
    }
    return this.finishNode(node, "ExportNamedDeclaration");
};
pp$8.parseExportDeclaration = function (node) {
    return this.parseStatement(null);
};
pp$8.parseExportDefaultDeclaration = function () {
    var isAsync;
    if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
        var fNode = this.startNode();
        this.next();
        if (isAsync) {
            this.next();
        }
        return this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync);
    }
    else if (this.type === types$1._class) {
        var cNode = this.startNode();
        return this.parseClass(cNode, "nullableID");
    }
    else {
        var declaration = this.parseMaybeAssign();
        this.semicolon();
        return declaration;
    }
};
pp$8.checkExport = function (exports, name, pos) {
    if (!exports) {
        return;
    }
    if (typeof name !== "string") {
        name = name.type === "Identifier" ? name.name : name.value;
    }
    if (hasOwn(exports, name)) {
        this.raiseRecoverable(pos, "Duplicate export '" + name + "'");
    }
    exports[name] = true;
};
pp$8.checkPatternExport = function (exports, pat) {
    var type = pat.type;
    if (type === "Identifier") {
        this.checkExport(exports, pat, pat.start);
    }
    else if (type === "ObjectPattern") {
        for (var i = 0, list = pat.properties; i < list.length; i += 1) {
            var prop = list[i];
            this.checkPatternExport(exports, prop);
        }
    }
    else if (type === "ArrayPattern") {
        for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
            var elt = list$1[i$1];
            if (elt) {
                this.checkPatternExport(exports, elt);
            }
        }
    }
    else if (type === "Property") {
        this.checkPatternExport(exports, pat.value);
    }
    else if (type === "AssignmentPattern") {
        this.checkPatternExport(exports, pat.left);
    }
    else if (type === "RestElement") {
        this.checkPatternExport(exports, pat.argument);
    }
};
pp$8.checkVariableExport = function (exports, decls) {
    if (!exports) {
        return;
    }
    for (var i = 0, list = decls; i < list.length; i += 1) {
        var decl = list[i];
        this.checkPatternExport(exports, decl.id);
    }
};
pp$8.shouldParseExportStatement = function () {
    return this.type.keyword === "var" ||
        this.type.keyword === "const" ||
        this.type.keyword === "class" ||
        this.type.keyword === "function" ||
        this.isLet() ||
        this.isAsyncFunction();
};
pp$8.parseExportSpecifier = function (exports) {
    var node = this.startNode();
    node.local = this.parseModuleExportName();
    node.exported = this.eatContextual("as") ? this.parseModuleExportName() : node.local;
    this.checkExport(exports, node.exported, node.exported.start);
    return this.finishNode(node, "ExportSpecifier");
};
pp$8.parseExportSpecifiers = function (exports) {
    var nodes = [], first = true;
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
        if (!first) {
            this.expect(types$1.comma);
            if (this.afterTrailingComma(types$1.braceR)) {
                break;
            }
        }
        else {
            first = false;
        }
        nodes.push(this.parseExportSpecifier(exports));
    }
    return nodes;
};
pp$8.parseImport = function (node) {
    this.next();
    if (this.type === types$1.string) {
        node.specifiers = empty$1;
        node.source = this.parseExprAtom();
    }
    else {
        node.specifiers = this.parseImportSpecifiers();
        this.expectContextual("from");
        node.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
    }
    if (this.options.ecmaVersion >= 16) {
        node.attributes = this.parseWithClause();
    }
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
};
pp$8.parseImportSpecifier = function () {
    var node = this.startNode();
    node.imported = this.parseModuleExportName();
    if (this.eatContextual("as")) {
        node.local = this.parseIdent();
    }
    else {
        this.checkUnreserved(node.imported);
        node.local = node.imported;
    }
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportSpecifier");
};
pp$8.parseImportDefaultSpecifier = function () {
    var node = this.startNode();
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportDefaultSpecifier");
};
pp$8.parseImportNamespaceSpecifier = function () {
    var node = this.startNode();
    this.next();
    this.expectContextual("as");
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportNamespaceSpecifier");
};
pp$8.parseImportSpecifiers = function () {
    var nodes = [], first = true;
    if (this.type === types$1.name) {
        nodes.push(this.parseImportDefaultSpecifier());
        if (!this.eat(types$1.comma)) {
            return nodes;
        }
    }
    if (this.type === types$1.star) {
        nodes.push(this.parseImportNamespaceSpecifier());
        return nodes;
    }
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
        if (!first) {
            this.expect(types$1.comma);
            if (this.afterTrailingComma(types$1.braceR)) {
                break;
            }
        }
        else {
            first = false;
        }
        nodes.push(this.parseImportSpecifier());
    }
    return nodes;
};
pp$8.parseWithClause = function () {
    var nodes = [];
    if (!this.eat(types$1._with)) {
        return nodes;
    }
    this.expect(types$1.braceL);
    var attributeKeys = {};
    var first = true;
    while (!this.eat(types$1.braceR)) {
        if (!first) {
            this.expect(types$1.comma);
            if (this.afterTrailingComma(types$1.braceR)) {
                break;
            }
        }
        else {
            first = false;
        }
        var attr = this.parseImportAttribute();
        var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
        if (hasOwn(attributeKeys, keyName)) {
            this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'");
        }
        attributeKeys[keyName] = true;
        nodes.push(attr);
    }
    return nodes;
};
pp$8.parseImportAttribute = function () {
    var node = this.startNode();
    node.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
    this.expect(types$1.colon);
    if (this.type !== types$1.string) {
        this.unexpected();
    }
    node.value = this.parseExprAtom();
    return this.finishNode(node, "ImportAttribute");
};
pp$8.parseModuleExportName = function () {
    if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
        var stringLiteral = this.parseLiteral(this.value);
        if (loneSurrogate.test(stringLiteral.value)) {
            this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
        }
        return stringLiteral;
    }
    return this.parseIdent(true);
};
pp$8.adaptDirectivePrologue = function (statements) {
    for (var i = 0; i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) {
        statements[i].directive = statements[i].expression.raw.slice(1, -1);
    }
};
pp$8.isDirectiveCandidate = function (statement) {
    return (this.options.ecmaVersion >= 5 &&
        statement.type === "ExpressionStatement" &&
        statement.expression.type === "Literal" &&
        typeof statement.expression.value === "string" &&
        (this.input[statement.start] === "\"" || this.input[statement.start] === "'"));
};
var pp$7 = Parser$2.prototype;
pp$7.toAssignable = function (node, isBinding, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 6 && node) {
        switch (node.type) {
            case "Identifier":
                if (this.inAsync && node.name === "await") {
                    this.raise(node.start, "Cannot use 'await' as identifier inside an async function");
                }
                break;
            case "ObjectPattern":
            case "ArrayPattern":
            case "AssignmentPattern":
            case "RestElement":
                break;
            case "ObjectExpression":
                node.type = "ObjectPattern";
                if (refDestructuringErrors) {
                    this.checkPatternErrors(refDestructuringErrors, true);
                }
                for (var i = 0, list = node.properties; i < list.length; i += 1) {
                    var prop = list[i];
                    this.toAssignable(prop, isBinding);
                    if (prop.type === "RestElement" &&
                        (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")) {
                        this.raise(prop.argument.start, "Unexpected token");
                    }
                }
                break;
            case "Property":
                if (node.kind !== "init") {
                    this.raise(node.key.start, "Object pattern can't contain getter or setter");
                }
                this.toAssignable(node.value, isBinding);
                break;
            case "ArrayExpression":
                node.type = "ArrayPattern";
                if (refDestructuringErrors) {
                    this.checkPatternErrors(refDestructuringErrors, true);
                }
                this.toAssignableList(node.elements, isBinding);
                break;
            case "SpreadElement":
                node.type = "RestElement";
                this.toAssignable(node.argument, isBinding);
                if (node.argument.type === "AssignmentPattern") {
                    this.raise(node.argument.start, "Rest elements cannot have a default value");
                }
                break;
            case "AssignmentExpression":
                if (node.operator !== "=") {
                    this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
                }
                node.type = "AssignmentPattern";
                delete node.operator;
                this.toAssignable(node.left, isBinding);
                break;
            case "ParenthesizedExpression":
                this.toAssignable(node.expression, isBinding, refDestructuringErrors);
                break;
            case "ChainExpression":
                this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
                break;
            case "MemberExpression":
                if (!isBinding) {
                    break;
                }
            default:
                this.raise(node.start, "Assigning to rvalue");
        }
    }
    else if (refDestructuringErrors) {
        this.checkPatternErrors(refDestructuringErrors, true);
    }
    return node;
};
pp$7.toAssignableList = function (exprList, isBinding) {
    var end = exprList.length;
    for (var i = 0; i < end; i++) {
        var elt = exprList[i];
        if (elt) {
            this.toAssignable(elt, isBinding);
        }
    }
    if (end) {
        var last = exprList[end - 1];
        if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier") {
            this.unexpected(last.argument.start);
        }
    }
    return exprList;
};
pp$7.parseSpread = function (refDestructuringErrors) {
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    return this.finishNode(node, "SpreadElement");
};
pp$7.parseRestBinding = function () {
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion === 6 && this.type !== types$1.name) {
        this.unexpected();
    }
    node.argument = this.parseBindingAtom();
    return this.finishNode(node, "RestElement");
};
pp$7.parseBindingAtom = function () {
    if (this.options.ecmaVersion >= 6) {
        switch (this.type) {
            case types$1.bracketL:
                var node = this.startNode();
                this.next();
                node.elements = this.parseBindingList(types$1.bracketR, true, true);
                return this.finishNode(node, "ArrayPattern");
            case types$1.braceL:
                return this.parseObj(true);
        }
    }
    return this.parseIdent();
};
pp$7.parseBindingList = function (close, allowEmpty, allowTrailingComma, allowModifiers) {
    var elts = [], first = true;
    while (!this.eat(close)) {
        if (first) {
            first = false;
        }
        else {
            this.expect(types$1.comma);
        }
        if (allowEmpty && this.type === types$1.comma) {
            elts.push(null);
        }
        else if (allowTrailingComma && this.afterTrailingComma(close)) {
            break;
        }
        else if (this.type === types$1.ellipsis) {
            var rest = this.parseRestBinding();
            this.parseBindingListItem(rest);
            elts.push(rest);
            if (this.type === types$1.comma) {
                this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
            }
            this.expect(close);
            break;
        }
        else {
            elts.push(this.parseAssignableListItem(allowModifiers));
        }
    }
    return elts;
};
pp$7.parseAssignableListItem = function (allowModifiers) {
    var elem = this.parseMaybeDefault(this.start, this.startLoc);
    this.parseBindingListItem(elem);
    return elem;
};
pp$7.parseBindingListItem = function (param) {
    return param;
};
pp$7.parseMaybeDefault = function (startPos, startLoc, left) {
    left = left || this.parseBindingAtom();
    if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) {
        return left;
    }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern");
};
pp$7.checkLValSimple = function (expr, bindingType, checkClashes) {
    if (bindingType === void 0)
        bindingType = BIND_NONE;
    var isBind = bindingType !== BIND_NONE;
    switch (expr.type) {
        case "Identifier":
            if (this.strict && this.reservedWordsStrictBind.test(expr.name)) {
                this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
            }
            if (isBind) {
                if (bindingType === BIND_LEXICAL && expr.name === "let") {
                    this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name");
                }
                if (checkClashes) {
                    if (hasOwn(checkClashes, expr.name)) {
                        this.raiseRecoverable(expr.start, "Argument name clash");
                    }
                    checkClashes[expr.name] = true;
                }
                if (bindingType !== BIND_OUTSIDE) {
                    this.declareName(expr.name, bindingType, expr.start);
                }
            }
            break;
        case "ChainExpression":
            this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
            break;
        case "MemberExpression":
            if (isBind) {
                this.raiseRecoverable(expr.start, "Binding member expression");
            }
            break;
        case "ParenthesizedExpression":
            if (isBind) {
                this.raiseRecoverable(expr.start, "Binding parenthesized expression");
            }
            return this.checkLValSimple(expr.expression, bindingType, checkClashes);
        default:
            this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
    }
};
pp$7.checkLValPattern = function (expr, bindingType, checkClashes) {
    if (bindingType === void 0)
        bindingType = BIND_NONE;
    switch (expr.type) {
        case "ObjectPattern":
            for (var i = 0, list = expr.properties; i < list.length; i += 1) {
                var prop = list[i];
                this.checkLValInnerPattern(prop, bindingType, checkClashes);
            }
            break;
        case "ArrayPattern":
            for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
                var elem = list$1[i$1];
                if (elem) {
                    this.checkLValInnerPattern(elem, bindingType, checkClashes);
                }
            }
            break;
        default:
            this.checkLValSimple(expr, bindingType, checkClashes);
    }
};
pp$7.checkLValInnerPattern = function (expr, bindingType, checkClashes) {
    if (bindingType === void 0)
        bindingType = BIND_NONE;
    switch (expr.type) {
        case "Property":
            this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
            break;
        case "AssignmentPattern":
            this.checkLValPattern(expr.left, bindingType, checkClashes);
            break;
        case "RestElement":
            this.checkLValPattern(expr.argument, bindingType, checkClashes);
            break;
        default:
            this.checkLValPattern(expr, bindingType, checkClashes);
    }
};
var TokContext = function TokContext(token, isExpr, preserveSpace, override, generator) {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
    this.generator = !!generator;
};
var types = {
    b_stat: new TokContext("{", false),
    b_expr: new TokContext("{", true),
    b_tmpl: new TokContext("${", false),
    p_stat: new TokContext("(", false),
    p_expr: new TokContext("(", true),
    q_tmpl: new TokContext("`", true, true, function (p) { return p.tryReadTemplateToken(); }),
    f_stat: new TokContext("function", false),
    f_expr: new TokContext("function", true),
    f_expr_gen: new TokContext("function", true, false, null, true),
    f_gen: new TokContext("function", false, false, null, true)
};
var pp$6 = Parser$2.prototype;
pp$6.initialContext = function () {
    return [types.b_stat];
};
pp$6.curContext = function () {
    return this.context[this.context.length - 1];
};
pp$6.braceIsBlock = function (prevType) {
    var parent = this.curContext();
    if (parent === types.f_expr || parent === types.f_stat) {
        return true;
    }
    if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr)) {
        return !parent.isExpr;
    }
    if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed) {
        return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
    }
    if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow) {
        return true;
    }
    if (prevType === types$1.braceL) {
        return parent === types.b_stat;
    }
    if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name) {
        return false;
    }
    return !this.exprAllowed;
};
pp$6.inGeneratorContext = function () {
    for (var i = this.context.length - 1; i >= 1; i--) {
        var context = this.context[i];
        if (context.token === "function") {
            return context.generator;
        }
    }
    return false;
};
pp$6.updateContext = function (prevType) {
    var update, type = this.type;
    if (type.keyword && prevType === types$1.dot) {
        this.exprAllowed = false;
    }
    else if (update = type.updateContext) {
        update.call(this, prevType);
    }
    else {
        this.exprAllowed = type.beforeExpr;
    }
};
pp$6.overrideContext = function (tokenCtx) {
    if (this.curContext() !== tokenCtx) {
        this.context[this.context.length - 1] = tokenCtx;
    }
};
types$1.parenR.updateContext = types$1.braceR.updateContext = function () {
    if (this.context.length === 1) {
        this.exprAllowed = true;
        return;
    }
    var out = this.context.pop();
    if (out === types.b_stat && this.curContext().token === "function") {
        out = this.context.pop();
    }
    this.exprAllowed = !out.isExpr;
};
types$1.braceL.updateContext = function (prevType) {
    this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
    this.exprAllowed = true;
};
types$1.dollarBraceL.updateContext = function () {
    this.context.push(types.b_tmpl);
    this.exprAllowed = true;
};
types$1.parenL.updateContext = function (prevType) {
    var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
    this.context.push(statementParens ? types.p_stat : types.p_expr);
    this.exprAllowed = true;
};
types$1.incDec.updateContext = function () {
};
types$1._function.updateContext = types$1._class.updateContext = function (prevType) {
    if (prevType.beforeExpr && prevType !== types$1._else &&
        !(prevType === types$1.semi && this.curContext() !== types.p_stat) &&
        !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) &&
        !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat)) {
        this.context.push(types.f_expr);
    }
    else {
        this.context.push(types.f_stat);
    }
    this.exprAllowed = false;
};
types$1.colon.updateContext = function () {
    if (this.curContext().token === "function") {
        this.context.pop();
    }
    this.exprAllowed = true;
};
types$1.backQuote.updateContext = function () {
    if (this.curContext() === types.q_tmpl) {
        this.context.pop();
    }
    else {
        this.context.push(types.q_tmpl);
    }
    this.exprAllowed = false;
};
types$1.star.updateContext = function (prevType) {
    if (prevType === types$1._function) {
        var index = this.context.length - 1;
        if (this.context[index] === types.f_expr) {
            this.context[index] = types.f_expr_gen;
        }
        else {
            this.context[index] = types.f_gen;
        }
    }
    this.exprAllowed = true;
};
types$1.name.updateContext = function (prevType) {
    var allowed = false;
    if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
        if (this.value === "of" && !this.exprAllowed ||
            this.value === "yield" && this.inGeneratorContext()) {
            allowed = true;
        }
    }
    this.exprAllowed = allowed;
};
var pp$5 = Parser$2.prototype;
pp$5.checkPropClash = function (prop, propHash, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement") {
        return;
    }
    if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand)) {
        return;
    }
    var key = prop.key;
    var name;
    switch (key.type) {
        case "Identifier":
            name = key.name;
            break;
        case "Literal":
            name = String(key.value);
            break;
        default: return;
    }
    var kind = prop.kind;
    if (this.options.ecmaVersion >= 6) {
        if (name === "__proto__" && kind === "init") {
            if (propHash.proto) {
                if (refDestructuringErrors) {
                    if (refDestructuringErrors.doubleProto < 0) {
                        refDestructuringErrors.doubleProto = key.start;
                    }
                }
                else {
                    this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
                }
            }
            propHash.proto = true;
        }
        return;
    }
    name = "$" + name;
    var other = propHash[name];
    if (other) {
        var redefinition;
        if (kind === "init") {
            redefinition = this.strict && other.init || other.get || other.set;
        }
        else {
            redefinition = other.init || other[kind];
        }
        if (redefinition) {
            this.raiseRecoverable(key.start, "Redefinition of property");
        }
    }
    else {
        other = propHash[name] = {
            init: false,
            get: false,
            set: false
        };
    }
    other[kind] = true;
};
pp$5.parseExpression = function (forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeAssign(forInit, refDestructuringErrors);
    if (this.type === types$1.comma) {
        var node = this.startNodeAt(startPos, startLoc);
        node.expressions = [expr];
        while (this.eat(types$1.comma)) {
            node.expressions.push(this.parseMaybeAssign(forInit, refDestructuringErrors));
        }
        return this.finishNode(node, "SequenceExpression");
    }
    return expr;
};
pp$5.parseMaybeAssign = function (forInit, refDestructuringErrors, afterLeftParse) {
    if (this.isContextual("yield")) {
        if (this.inGenerator) {
            return this.parseYield(forInit);
        }
        else {
            this.exprAllowed = false;
        }
    }
    var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
    if (refDestructuringErrors) {
        oldParenAssign = refDestructuringErrors.parenthesizedAssign;
        oldTrailingComma = refDestructuringErrors.trailingComma;
        oldDoubleProto = refDestructuringErrors.doubleProto;
        refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
    }
    else {
        refDestructuringErrors = new DestructuringErrors;
        ownDestructuringErrors = true;
    }
    var startPos = this.start, startLoc = this.startLoc;
    if (this.type === types$1.parenL || this.type === types$1.name) {
        this.potentialArrowAt = this.start;
        this.potentialArrowInForAwait = forInit === "await";
    }
    var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
    if (afterLeftParse) {
        left = afterLeftParse.call(this, left, startPos, startLoc);
    }
    if (this.type.isAssign) {
        var node = this.startNodeAt(startPos, startLoc);
        node.operator = this.value;
        if (this.type === types$1.eq) {
            left = this.toAssignable(left, false, refDestructuringErrors);
        }
        if (!ownDestructuringErrors) {
            refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
        }
        if (refDestructuringErrors.shorthandAssign >= left.start) {
            refDestructuringErrors.shorthandAssign = -1;
        }
        if (this.type === types$1.eq) {
            this.checkLValPattern(left);
        }
        else {
            this.checkLValSimple(left);
        }
        node.left = left;
        this.next();
        node.right = this.parseMaybeAssign(forInit);
        if (oldDoubleProto > -1) {
            refDestructuringErrors.doubleProto = oldDoubleProto;
        }
        return this.finishNode(node, "AssignmentExpression");
    }
    else {
        if (ownDestructuringErrors) {
            this.checkExpressionErrors(refDestructuringErrors, true);
        }
    }
    if (oldParenAssign > -1) {
        refDestructuringErrors.parenthesizedAssign = oldParenAssign;
    }
    if (oldTrailingComma > -1) {
        refDestructuringErrors.trailingComma = oldTrailingComma;
    }
    return left;
};
pp$5.parseMaybeConditional = function (forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprOps(forInit, refDestructuringErrors);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
        return expr;
    }
    if (this.eat(types$1.question)) {
        var node = this.startNodeAt(startPos, startLoc);
        node.test = expr;
        node.consequent = this.parseMaybeAssign();
        this.expect(types$1.colon);
        node.alternate = this.parseMaybeAssign(forInit);
        return this.finishNode(node, "ConditionalExpression");
    }
    return expr;
};
pp$5.parseExprOps = function (forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
        return expr;
    }
    return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit);
};
pp$5.parseExprOp = function (left, leftStartPos, leftStartLoc, minPrec, forInit) {
    var prec = this.type.binop;
    if (prec != null && (!forInit || this.type !== types$1._in)) {
        if (prec > minPrec) {
            var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
            var coalesce = this.type === types$1.coalesce;
            if (coalesce) {
                prec = types$1.logicalAND.binop;
            }
            var op = this.value;
            this.next();
            var startPos = this.start, startLoc = this.startLoc;
            var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
            var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
            if ((logical && this.type === types$1.coalesce) || (coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND))) {
                this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
            }
            return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);
        }
    }
    return left;
};
pp$5.buildBinary = function (startPos, startLoc, left, right, op, logical) {
    if (right.type === "PrivateIdentifier") {
        this.raise(right.start, "Private identifier can only be left side of binary expression");
    }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.operator = op;
    node.right = right;
    return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression");
};
pp$5.parseMaybeUnary = function (refDestructuringErrors, sawUnary, incDec, forInit) {
    var startPos = this.start, startLoc = this.startLoc, expr;
    if (this.isContextual("await") && this.canAwait) {
        expr = this.parseAwait(forInit);
        sawUnary = true;
    }
    else if (this.type.prefix) {
        var node = this.startNode(), update = this.type === types$1.incDec;
        node.operator = this.value;
        node.prefix = true;
        this.next();
        node.argument = this.parseMaybeUnary(null, true, update, forInit);
        this.checkExpressionErrors(refDestructuringErrors, true);
        if (update) {
            this.checkLValSimple(node.argument);
        }
        else if (this.strict && node.operator === "delete" && isLocalVariableAccess(node.argument)) {
            this.raiseRecoverable(node.start, "Deleting local variable in strict mode");
        }
        else if (node.operator === "delete" && isPrivateFieldAccess(node.argument)) {
            this.raiseRecoverable(node.start, "Private fields can not be deleted");
        }
        else {
            sawUnary = true;
        }
        expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    }
    else if (!sawUnary && this.type === types$1.privateId) {
        if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) {
            this.unexpected();
        }
        expr = this.parsePrivateIdent();
        if (this.type !== types$1._in) {
            this.unexpected();
        }
    }
    else {
        expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
        if (this.checkExpressionErrors(refDestructuringErrors)) {
            return expr;
        }
        while (this.type.postfix && !this.canInsertSemicolon()) {
            var node$1 = this.startNodeAt(startPos, startLoc);
            node$1.operator = this.value;
            node$1.prefix = false;
            node$1.argument = expr;
            this.checkLValSimple(expr);
            this.next();
            expr = this.finishNode(node$1, "UpdateExpression");
        }
    }
    if (!incDec && this.eat(types$1.starstar)) {
        if (sawUnary) {
            this.unexpected(this.lastTokStart);
        }
        else {
            return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false);
        }
    }
    else {
        return expr;
    }
};
function isLocalVariableAccess(node) {
    return (node.type === "Identifier" ||
        node.type === "ParenthesizedExpression" && isLocalVariableAccess(node.expression));
}
function isPrivateFieldAccess(node) {
    return (node.type === "MemberExpression" && node.property.type === "PrivateIdentifier" ||
        node.type === "ChainExpression" && isPrivateFieldAccess(node.expression) ||
        node.type === "ParenthesizedExpression" && isPrivateFieldAccess(node.expression));
}
pp$5.parseExprSubscripts = function (refDestructuringErrors, forInit) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprAtom(refDestructuringErrors, forInit);
    if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")") {
        return expr;
    }
    var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
    if (refDestructuringErrors && result.type === "MemberExpression") {
        if (refDestructuringErrors.parenthesizedAssign >= result.start) {
            refDestructuringErrors.parenthesizedAssign = -1;
        }
        if (refDestructuringErrors.parenthesizedBind >= result.start) {
            refDestructuringErrors.parenthesizedBind = -1;
        }
        if (refDestructuringErrors.trailingComma >= result.start) {
            refDestructuringErrors.trailingComma = -1;
        }
    }
    return result;
};
pp$5.parseSubscripts = function (base, startPos, startLoc, noCalls, forInit) {
    var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" &&
        this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 &&
        this.potentialArrowAt === base.start;
    var optionalChained = false;
    while (true) {
        var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
        if (element.optional) {
            optionalChained = true;
        }
        if (element === base || element.type === "ArrowFunctionExpression") {
            if (optionalChained) {
                var chainNode = this.startNodeAt(startPos, startLoc);
                chainNode.expression = element;
                element = this.finishNode(chainNode, "ChainExpression");
            }
            return element;
        }
        base = element;
    }
};
pp$5.shouldParseAsyncArrow = function () {
    return !this.canInsertSemicolon() && this.eat(types$1.arrow);
};
pp$5.parseSubscriptAsyncArrow = function (startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit);
};
pp$5.parseSubscript = function (base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
    var optionalSupported = this.options.ecmaVersion >= 11;
    var optional = optionalSupported && this.eat(types$1.questionDot);
    if (noCalls && optional) {
        this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
    }
    var computed = this.eat(types$1.bracketL);
    if (computed || (optional && this.type !== types$1.parenL && this.type !== types$1.backQuote) || this.eat(types$1.dot)) {
        var node = this.startNodeAt(startPos, startLoc);
        node.object = base;
        if (computed) {
            node.property = this.parseExpression();
            this.expect(types$1.bracketR);
        }
        else if (this.type === types$1.privateId && base.type !== "Super") {
            node.property = this.parsePrivateIdent();
        }
        else {
            node.property = this.parseIdent(this.options.allowReserved !== "never");
        }
        node.computed = !!computed;
        if (optionalSupported) {
            node.optional = optional;
        }
        base = this.finishNode(node, "MemberExpression");
    }
    else if (!noCalls && this.eat(types$1.parenL)) {
        var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
        this.yieldPos = 0;
        this.awaitPos = 0;
        this.awaitIdentPos = 0;
        var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
        if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
            this.checkPatternErrors(refDestructuringErrors, false);
            this.checkYieldAwaitInDefaultParams();
            if (this.awaitIdentPos > 0) {
                this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
            }
            this.yieldPos = oldYieldPos;
            this.awaitPos = oldAwaitPos;
            this.awaitIdentPos = oldAwaitIdentPos;
            return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
        }
        this.checkExpressionErrors(refDestructuringErrors, true);
        this.yieldPos = oldYieldPos || this.yieldPos;
        this.awaitPos = oldAwaitPos || this.awaitPos;
        this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
        var node$1 = this.startNodeAt(startPos, startLoc);
        node$1.callee = base;
        node$1.arguments = exprList;
        if (optionalSupported) {
            node$1.optional = optional;
        }
        base = this.finishNode(node$1, "CallExpression");
    }
    else if (this.type === types$1.backQuote) {
        if (optional || optionalChained) {
            this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
        }
        var node$2 = this.startNodeAt(startPos, startLoc);
        node$2.tag = base;
        node$2.quasi = this.parseTemplate({ isTagged: true });
        base = this.finishNode(node$2, "TaggedTemplateExpression");
    }
    return base;
};
pp$5.parseExprAtom = function (refDestructuringErrors, forInit, forNew) {
    if (this.type === types$1.slash) {
        this.readRegexp();
    }
    var node, canBeArrow = this.potentialArrowAt === this.start;
    switch (this.type) {
        case types$1._super:
            if (!this.allowSuper) {
                this.raise(this.start, "'super' keyword outside a method");
            }
            node = this.startNode();
            this.next();
            if (this.type === types$1.parenL && !this.allowDirectSuper) {
                this.raise(node.start, "super() call outside constructor of a subclass");
            }
            if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL) {
                this.unexpected();
            }
            return this.finishNode(node, "Super");
        case types$1._this:
            node = this.startNode();
            this.next();
            return this.finishNode(node, "ThisExpression");
        case types$1.name:
            var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
            var id = this.parseIdent(false);
            if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
                this.overrideContext(types.f_expr);
                return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
            }
            if (canBeArrow && !this.canInsertSemicolon()) {
                if (this.eat(types$1.arrow)) {
                    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
                }
                if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc &&
                    (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
                    id = this.parseIdent(false);
                    if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) {
                        this.unexpected();
                    }
                    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
                }
            }
            return id;
        case types$1.regexp:
            var value = this.value;
            node = this.parseLiteral(value.value);
            node.regex = { pattern: value.pattern, flags: value.flags };
            return node;
        case types$1.num:
        case types$1.string:
            return this.parseLiteral(this.value);
        case types$1._null:
        case types$1._true:
        case types$1._false:
            node = this.startNode();
            node.value = this.type === types$1._null ? null : this.type === types$1._true;
            node.raw = this.type.keyword;
            this.next();
            return this.finishNode(node, "Literal");
        case types$1.parenL:
            var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
            if (refDestructuringErrors) {
                if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr)) {
                    refDestructuringErrors.parenthesizedAssign = start;
                }
                if (refDestructuringErrors.parenthesizedBind < 0) {
                    refDestructuringErrors.parenthesizedBind = start;
                }
            }
            return expr;
        case types$1.bracketL:
            node = this.startNode();
            this.next();
            node.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
            return this.finishNode(node, "ArrayExpression");
        case types$1.braceL:
            this.overrideContext(types.b_expr);
            return this.parseObj(false, refDestructuringErrors);
        case types$1._function:
            node = this.startNode();
            this.next();
            return this.parseFunction(node, 0);
        case types$1._class:
            return this.parseClass(this.startNode(), false);
        case types$1._new:
            return this.parseNew();
        case types$1.backQuote:
            return this.parseTemplate();
        case types$1._import:
            if (this.options.ecmaVersion >= 11) {
                return this.parseExprImport(forNew);
            }
            else {
                return this.unexpected();
            }
        default:
            return this.parseExprAtomDefault();
    }
};
pp$5.parseExprAtomDefault = function () {
    this.unexpected();
};
pp$5.parseExprImport = function (forNew) {
    var node = this.startNode();
    if (this.containsEsc) {
        this.raiseRecoverable(this.start, "Escape sequence in keyword import");
    }
    this.next();
    if (this.type === types$1.parenL && !forNew) {
        return this.parseDynamicImport(node);
    }
    else if (this.type === types$1.dot) {
        var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
        meta.name = "import";
        node.meta = this.finishNode(meta, "Identifier");
        return this.parseImportMeta(node);
    }
    else {
        this.unexpected();
    }
};
pp$5.parseDynamicImport = function (node) {
    this.next();
    node.source = this.parseMaybeAssign();
    if (this.options.ecmaVersion >= 16) {
        if (!this.eat(types$1.parenR)) {
            this.expect(types$1.comma);
            if (!this.afterTrailingComma(types$1.parenR)) {
                node.options = this.parseMaybeAssign();
                if (!this.eat(types$1.parenR)) {
                    this.expect(types$1.comma);
                    if (!this.afterTrailingComma(types$1.parenR)) {
                        this.unexpected();
                    }
                }
            }
            else {
                node.options = null;
            }
        }
        else {
            node.options = null;
        }
    }
    else {
        if (!this.eat(types$1.parenR)) {
            var errorPos = this.start;
            if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
                this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
            }
            else {
                this.unexpected(errorPos);
            }
        }
    }
    return this.finishNode(node, "ImportExpression");
};
pp$5.parseImportMeta = function (node) {
    this.next();
    var containsEsc = this.containsEsc;
    node.property = this.parseIdent(true);
    if (node.property.name !== "meta") {
        this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'");
    }
    if (containsEsc) {
        this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters");
    }
    if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere) {
        this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module");
    }
    return this.finishNode(node, "MetaProperty");
};
pp$5.parseLiteral = function (value) {
    var node = this.startNode();
    node.value = value;
    node.raw = this.input.slice(this.start, this.end);
    if (node.raw.charCodeAt(node.raw.length - 1) === 110) {
        node.bigint = node.value != null ? node.value.toString() : node.raw.slice(0, -1).replace(/_/g, "");
    }
    this.next();
    return this.finishNode(node, "Literal");
};
pp$5.parseParenExpression = function () {
    this.expect(types$1.parenL);
    var val = this.parseExpression();
    this.expect(types$1.parenR);
    return val;
};
pp$5.shouldParseArrow = function (exprList) {
    return !this.canInsertSemicolon();
};
pp$5.parseParenAndDistinguishExpression = function (canBeArrow, forInit) {
    var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
    if (this.options.ecmaVersion >= 6) {
        this.next();
        var innerStartPos = this.start, innerStartLoc = this.startLoc;
        var exprList = [], first = true, lastIsComma = false;
        var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
        this.yieldPos = 0;
        this.awaitPos = 0;
        while (this.type !== types$1.parenR) {
            first ? first = false : this.expect(types$1.comma);
            if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
                lastIsComma = true;
                break;
            }
            else if (this.type === types$1.ellipsis) {
                spreadStart = this.start;
                exprList.push(this.parseParenItem(this.parseRestBinding()));
                if (this.type === types$1.comma) {
                    this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
                }
                break;
            }
            else {
                exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
            }
        }
        var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
        this.expect(types$1.parenR);
        if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
            this.checkPatternErrors(refDestructuringErrors, false);
            this.checkYieldAwaitInDefaultParams();
            this.yieldPos = oldYieldPos;
            this.awaitPos = oldAwaitPos;
            return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
        }
        if (!exprList.length || lastIsComma) {
            this.unexpected(this.lastTokStart);
        }
        if (spreadStart) {
            this.unexpected(spreadStart);
        }
        this.checkExpressionErrors(refDestructuringErrors, true);
        this.yieldPos = oldYieldPos || this.yieldPos;
        this.awaitPos = oldAwaitPos || this.awaitPos;
        if (exprList.length > 1) {
            val = this.startNodeAt(innerStartPos, innerStartLoc);
            val.expressions = exprList;
            this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
        }
        else {
            val = exprList[0];
        }
    }
    else {
        val = this.parseParenExpression();
    }
    if (this.options.preserveParens) {
        var par = this.startNodeAt(startPos, startLoc);
        par.expression = val;
        return this.finishNode(par, "ParenthesizedExpression");
    }
    else {
        return val;
    }
};
pp$5.parseParenItem = function (item) {
    return item;
};
pp$5.parseParenArrowList = function (startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit);
};
var empty = [];
pp$5.parseNew = function () {
    if (this.containsEsc) {
        this.raiseRecoverable(this.start, "Escape sequence in keyword new");
    }
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
        var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
        meta.name = "new";
        node.meta = this.finishNode(meta, "Identifier");
        this.next();
        var containsEsc = this.containsEsc;
        node.property = this.parseIdent(true);
        if (node.property.name !== "target") {
            this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'");
        }
        if (containsEsc) {
            this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters");
        }
        if (!this.allowNewDotTarget) {
            this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block");
        }
        return this.finishNode(node, "MetaProperty");
    }
    var startPos = this.start, startLoc = this.startLoc;
    node.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
    if (this.eat(types$1.parenL)) {
        node.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false);
    }
    else {
        node.arguments = empty;
    }
    return this.finishNode(node, "NewExpression");
};
pp$5.parseTemplateElement = function (ref) {
    var isTagged = ref.isTagged;
    var elem = this.startNode();
    if (this.type === types$1.invalidTemplate) {
        if (!isTagged) {
            this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
        }
        elem.value = {
            raw: this.value.replace(/\r\n?/g, "\n"),
            cooked: null
        };
    }
    else {
        elem.value = {
            raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
            cooked: this.value
        };
    }
    this.next();
    elem.tail = this.type === types$1.backQuote;
    return this.finishNode(elem, "TemplateElement");
};
pp$5.parseTemplate = function (ref) {
    if (ref === void 0)
        ref = {};
    var isTagged = ref.isTagged;
    if (isTagged === void 0)
        isTagged = false;
    var node = this.startNode();
    this.next();
    node.expressions = [];
    var curElt = this.parseTemplateElement({ isTagged: isTagged });
    node.quasis = [curElt];
    while (!curElt.tail) {
        if (this.type === types$1.eof) {
            this.raise(this.pos, "Unterminated template literal");
        }
        this.expect(types$1.dollarBraceL);
        node.expressions.push(this.parseExpression());
        this.expect(types$1.braceR);
        node.quasis.push(curElt = this.parseTemplateElement({ isTagged: isTagged }));
    }
    this.next();
    return this.finishNode(node, "TemplateLiteral");
};
pp$5.isAsyncProp = function (prop) {
    return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" &&
        (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || (this.options.ecmaVersion >= 9 && this.type === types$1.star)) &&
        !lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$5.parseObj = function (isPattern, refDestructuringErrors) {
    var node = this.startNode(), first = true, propHash = {};
    node.properties = [];
    this.next();
    while (!this.eat(types$1.braceR)) {
        if (!first) {
            this.expect(types$1.comma);
            if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) {
                break;
            }
        }
        else {
            first = false;
        }
        var prop = this.parseProperty(isPattern, refDestructuringErrors);
        if (!isPattern) {
            this.checkPropClash(prop, propHash, refDestructuringErrors);
        }
        node.properties.push(prop);
    }
    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
};
pp$5.parseProperty = function (isPattern, refDestructuringErrors) {
    var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
    if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
        if (isPattern) {
            prop.argument = this.parseIdent(false);
            if (this.type === types$1.comma) {
                this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
            }
            return this.finishNode(prop, "RestElement");
        }
        prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
        if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
            refDestructuringErrors.trailingComma = this.start;
        }
        return this.finishNode(prop, "SpreadElement");
    }
    if (this.options.ecmaVersion >= 6) {
        prop.method = false;
        prop.shorthand = false;
        if (isPattern || refDestructuringErrors) {
            startPos = this.start;
            startLoc = this.startLoc;
        }
        if (!isPattern) {
            isGenerator = this.eat(types$1.star);
        }
    }
    var containsEsc = this.containsEsc;
    this.parsePropertyName(prop);
    if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
        isAsync = true;
        isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
        this.parsePropertyName(prop);
    }
    else {
        isAsync = false;
    }
    this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
    return this.finishNode(prop, "Property");
};
pp$5.parseGetterSetter = function (prop) {
    var kind = prop.key.name;
    this.parsePropertyName(prop);
    prop.value = this.parseMethod(false);
    prop.kind = kind;
    var paramCount = prop.kind === "get" ? 0 : 1;
    if (prop.value.params.length !== paramCount) {
        var start = prop.value.start;
        if (prop.kind === "get") {
            this.raiseRecoverable(start, "getter should have no params");
        }
        else {
            this.raiseRecoverable(start, "setter should have exactly one param");
        }
    }
    else {
        if (prop.kind === "set" && prop.value.params[0].type === "RestElement") {
            this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
        }
    }
};
pp$5.parsePropertyValue = function (prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
    if ((isGenerator || isAsync) && this.type === types$1.colon) {
        this.unexpected();
    }
    if (this.eat(types$1.colon)) {
        prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
        prop.kind = "init";
    }
    else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
        if (isPattern) {
            this.unexpected();
        }
        prop.method = true;
        prop.value = this.parseMethod(isGenerator, isAsync);
        prop.kind = "init";
    }
    else if (!isPattern && !containsEsc &&
        this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" &&
        (prop.key.name === "get" || prop.key.name === "set") &&
        (this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq)) {
        if (isGenerator || isAsync) {
            this.unexpected();
        }
        this.parseGetterSetter(prop);
    }
    else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
        if (isGenerator || isAsync) {
            this.unexpected();
        }
        this.checkUnreserved(prop.key);
        if (prop.key.name === "await" && !this.awaitIdentPos) {
            this.awaitIdentPos = startPos;
        }
        if (isPattern) {
            prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
        }
        else if (this.type === types$1.eq && refDestructuringErrors) {
            if (refDestructuringErrors.shorthandAssign < 0) {
                refDestructuringErrors.shorthandAssign = this.start;
            }
            prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
        }
        else {
            prop.value = this.copyNode(prop.key);
        }
        prop.kind = "init";
        prop.shorthand = true;
    }
    else {
        this.unexpected();
    }
};
pp$5.parsePropertyName = function (prop) {
    if (this.options.ecmaVersion >= 6) {
        if (this.eat(types$1.bracketL)) {
            prop.computed = true;
            prop.key = this.parseMaybeAssign();
            this.expect(types$1.bracketR);
            return prop.key;
        }
        else {
            prop.computed = false;
        }
    }
    return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
};
pp$5.initFunction = function (node) {
    node.id = null;
    if (this.options.ecmaVersion >= 6) {
        node.generator = node.expression = false;
    }
    if (this.options.ecmaVersion >= 8) {
        node.async = false;
    }
};
pp$5.parseMethod = function (isGenerator, isAsync, allowDirectSuper) {
    var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.initFunction(node);
    if (this.options.ecmaVersion >= 6) {
        node.generator = isGenerator;
    }
    if (this.options.ecmaVersion >= 8) {
        node.async = !!isAsync;
    }
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
    this.parseFunctionBody(node, false, true, false);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "FunctionExpression");
};
pp$5.parseArrowExpression = function (node, params, isAsync, forInit) {
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
    this.initFunction(node);
    if (this.options.ecmaVersion >= 8) {
        node.async = !!isAsync;
    }
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    node.params = this.toAssignableList(params, true);
    this.parseFunctionBody(node, true, false, forInit);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "ArrowFunctionExpression");
};
pp$5.parseFunctionBody = function (node, isArrowFunction, isMethod, forInit) {
    var isExpression = isArrowFunction && this.type !== types$1.braceL;
    var oldStrict = this.strict, useStrict = false;
    if (isExpression) {
        node.body = this.parseMaybeAssign(forInit);
        node.expression = true;
        this.checkParams(node, false);
    }
    else {
        var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
        if (!oldStrict || nonSimple) {
            useStrict = this.strictDirective(this.end);
            if (useStrict && nonSimple) {
                this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list");
            }
        }
        var oldLabels = this.labels;
        this.labels = [];
        if (useStrict) {
            this.strict = true;
        }
        this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
        if (this.strict && node.id) {
            this.checkLValSimple(node.id, BIND_OUTSIDE);
        }
        node.body = this.parseBlock(false, undefined, useStrict && !oldStrict);
        node.expression = false;
        this.adaptDirectivePrologue(node.body.body);
        this.labels = oldLabels;
    }
    this.exitScope();
};
pp$5.isSimpleParamList = function (params) {
    for (var i = 0, list = params; i < list.length; i += 1) {
        var param = list[i];
        if (param.type !== "Identifier") {
            return false;
        }
    }
    return true;
};
pp$5.checkParams = function (node, allowDuplicates) {
    var nameHash = Object.create(null);
    for (var i = 0, list = node.params; i < list.length; i += 1) {
        var param = list[i];
        this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
    }
};
pp$5.parseExprList = function (close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
    var elts = [], first = true;
    while (!this.eat(close)) {
        if (!first) {
            this.expect(types$1.comma);
            if (allowTrailingComma && this.afterTrailingComma(close)) {
                break;
            }
        }
        else {
            first = false;
        }
        var elt = (void 0);
        if (allowEmpty && this.type === types$1.comma) {
            elt = null;
        }
        else if (this.type === types$1.ellipsis) {
            elt = this.parseSpread(refDestructuringErrors);
            if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0) {
                refDestructuringErrors.trailingComma = this.start;
            }
        }
        else {
            elt = this.parseMaybeAssign(false, refDestructuringErrors);
        }
        elts.push(elt);
    }
    return elts;
};
pp$5.checkUnreserved = function (ref) {
    var start = ref.start;
    var end = ref.end;
    var name = ref.name;
    if (this.inGenerator && name === "yield") {
        this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator");
    }
    if (this.inAsync && name === "await") {
        this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function");
    }
    if (!(this.currentThisScope().flags & SCOPE_VAR) && name === "arguments") {
        this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer");
    }
    if (this.inClassStaticBlock && (name === "arguments" || name === "await")) {
        this.raise(start, ("Cannot use " + name + " in class static initialization block"));
    }
    if (this.keywords.test(name)) {
        this.raise(start, ("Unexpected keyword '" + name + "'"));
    }
    if (this.options.ecmaVersion < 6 &&
        this.input.slice(start, end).indexOf("\\") !== -1) {
        return;
    }
    var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
    if (re.test(name)) {
        if (!this.inAsync && name === "await") {
            this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function");
        }
        this.raiseRecoverable(start, ("The keyword '" + name + "' is reserved"));
    }
};
pp$5.parseIdent = function (liberal) {
    var node = this.parseIdentNode();
    this.next(!!liberal);
    this.finishNode(node, "Identifier");
    if (!liberal) {
        this.checkUnreserved(node);
        if (node.name === "await" && !this.awaitIdentPos) {
            this.awaitIdentPos = node.start;
        }
    }
    return node;
};
pp$5.parseIdentNode = function () {
    var node = this.startNode();
    if (this.type === types$1.name) {
        node.name = this.value;
    }
    else if (this.type.keyword) {
        node.name = this.type.keyword;
        if ((node.name === "class" || node.name === "function") &&
            (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
            this.context.pop();
        }
        this.type = types$1.name;
    }
    else {
        this.unexpected();
    }
    return node;
};
pp$5.parsePrivateIdent = function () {
    var node = this.startNode();
    if (this.type === types$1.privateId) {
        node.name = this.value;
    }
    else {
        this.unexpected();
    }
    this.next();
    this.finishNode(node, "PrivateIdentifier");
    if (this.options.checkPrivateFields) {
        if (this.privateNameStack.length === 0) {
            this.raise(node.start, ("Private field '#" + (node.name) + "' must be declared in an enclosing class"));
        }
        else {
            this.privateNameStack[this.privateNameStack.length - 1].used.push(node);
        }
    }
    return node;
};
pp$5.parseYield = function (forInit) {
    if (!this.yieldPos) {
        this.yieldPos = this.start;
    }
    var node = this.startNode();
    this.next();
    if (this.type === types$1.semi || this.canInsertSemicolon() || (this.type !== types$1.star && !this.type.startsExpr)) {
        node.delegate = false;
        node.argument = null;
    }
    else {
        node.delegate = this.eat(types$1.star);
        node.argument = this.parseMaybeAssign(forInit);
    }
    return this.finishNode(node, "YieldExpression");
};
pp$5.parseAwait = function (forInit) {
    if (!this.awaitPos) {
        this.awaitPos = this.start;
    }
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeUnary(null, true, false, forInit);
    return this.finishNode(node, "AwaitExpression");
};
var pp$4 = Parser$2.prototype;
pp$4.raise = function (pos, message) {
    var loc = getLineInfo(this.input, pos);
    message += " (" + loc.line + ":" + loc.column + ")";
    if (this.sourceFile) {
        message += " in " + this.sourceFile;
    }
    var err = new SyntaxError(message);
    err.pos = pos;
    err.loc = loc;
    err.raisedAt = this.pos;
    throw err;
};
pp$4.raiseRecoverable = pp$4.raise;
pp$4.curPosition = function () {
    if (this.options.locations) {
        return new Position(this.curLine, this.pos - this.lineStart);
    }
};
var pp$3 = Parser$2.prototype;
var Scope$1 = function Scope(flags) {
    this.flags = flags;
    this.var = [];
    this.lexical = [];
    this.functions = [];
};
pp$3.enterScope = function (flags) {
    this.scopeStack.push(new Scope$1(flags));
};
pp$3.exitScope = function () {
    this.scopeStack.pop();
};
pp$3.treatFunctionsAsVarInScope = function (scope) {
    return (scope.flags & SCOPE_FUNCTION) || !this.inModule && (scope.flags & SCOPE_TOP);
};
pp$3.declareName = function (name, bindingType, pos) {
    var redeclared = false;
    if (bindingType === BIND_LEXICAL) {
        var scope = this.currentScope();
        redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
        scope.lexical.push(name);
        if (this.inModule && (scope.flags & SCOPE_TOP)) {
            delete this.undefinedExports[name];
        }
    }
    else if (bindingType === BIND_SIMPLE_CATCH) {
        var scope$1 = this.currentScope();
        scope$1.lexical.push(name);
    }
    else if (bindingType === BIND_FUNCTION) {
        var scope$2 = this.currentScope();
        if (this.treatFunctionsAsVar) {
            redeclared = scope$2.lexical.indexOf(name) > -1;
        }
        else {
            redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1;
        }
        scope$2.functions.push(name);
    }
    else {
        for (var i = this.scopeStack.length - 1; i >= 0; --i) {
            var scope$3 = this.scopeStack[i];
            if (scope$3.lexical.indexOf(name) > -1 && !((scope$3.flags & SCOPE_SIMPLE_CATCH) && scope$3.lexical[0] === name) ||
                !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
                redeclared = true;
                break;
            }
            scope$3.var.push(name);
            if (this.inModule && (scope$3.flags & SCOPE_TOP)) {
                delete this.undefinedExports[name];
            }
            if (scope$3.flags & SCOPE_VAR) {
                break;
            }
        }
    }
    if (redeclared) {
        this.raiseRecoverable(pos, ("Identifier '" + name + "' has already been declared"));
    }
};
pp$3.checkLocalExport = function (id) {
    if (this.scopeStack[0].lexical.indexOf(id.name) === -1 &&
        this.scopeStack[0].var.indexOf(id.name) === -1) {
        this.undefinedExports[id.name] = id;
    }
};
pp$3.currentScope = function () {
    return this.scopeStack[this.scopeStack.length - 1];
};
pp$3.currentVarScope = function () {
    for (var i = this.scopeStack.length - 1;; i--) {
        var scope = this.scopeStack[i];
        if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) {
            return scope;
        }
    }
};
pp$3.currentThisScope = function () {
    for (var i = this.scopeStack.length - 1;; i--) {
        var scope = this.scopeStack[i];
        if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) &&
            !(scope.flags & SCOPE_ARROW)) {
            return scope;
        }
    }
};
var Node = function Node(parser, pos, loc) {
    this.type = "";
    this.start = pos;
    this.end = 0;
    if (parser.options.locations) {
        this.loc = new SourceLocation(parser, loc);
    }
    if (parser.options.directSourceFile) {
        this.sourceFile = parser.options.directSourceFile;
    }
    if (parser.options.ranges) {
        this.range = [pos, 0];
    }
};
var pp$2 = Parser$2.prototype;
pp$2.startNode = function () {
    return new Node(this, this.start, this.startLoc);
};
pp$2.startNodeAt = function (pos, loc) {
    return new Node(this, pos, loc);
};
function finishNodeAt(node, type, pos, loc) {
    node.type = type;
    node.end = pos;
    if (this.options.locations) {
        node.loc.end = loc;
    }
    if (this.options.ranges) {
        node.range[1] = pos;
    }
    return node;
}
pp$2.finishNode = function (node, type) {
    return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc);
};
pp$2.finishNodeAt = function (node, type, pos, loc) {
    return finishNodeAt.call(this, node, type, pos, loc);
};
pp$2.copyNode = function (node) {
    var newNode = new Node(this, node.start, this.startLoc);
    for (var prop in node) {
        newNode[prop] = node[prop];
    }
    return newNode;
};
var scriptValuesAddedInUnicode = "Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz";
var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
var ecma11BinaryProperties = ecma10BinaryProperties;
var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
var ecma13BinaryProperties = ecma12BinaryProperties;
var ecma14BinaryProperties = ecma13BinaryProperties;
var unicodeBinaryProperties = {
    9: ecma9BinaryProperties,
    10: ecma10BinaryProperties,
    11: ecma11BinaryProperties,
    12: ecma12BinaryProperties,
    13: ecma13BinaryProperties,
    14: ecma14BinaryProperties
};
var ecma14BinaryPropertiesOfStrings = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji";
var unicodeBinaryPropertiesOfStrings = {
    9: "",
    10: "",
    11: "",
    12: "",
    13: "",
    14: ecma14BinaryPropertiesOfStrings
};
var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";
var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
var ecma14ScriptValues = ecma13ScriptValues + " " + scriptValuesAddedInUnicode;
var unicodeScriptValues = {
    9: ecma9ScriptValues,
    10: ecma10ScriptValues,
    11: ecma11ScriptValues,
    12: ecma12ScriptValues,
    13: ecma13ScriptValues,
    14: ecma14ScriptValues
};
var data = {};
function buildUnicodeData(ecmaVersion) {
    var d = data[ecmaVersion] = {
        binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion] + " " + unicodeGeneralCategoryValues),
        binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion]),
        nonBinary: {
            General_Category: wordsRegexp(unicodeGeneralCategoryValues),
            Script: wordsRegexp(unicodeScriptValues[ecmaVersion])
        }
    };
    d.nonBinary.Script_Extensions = d.nonBinary.Script;
    d.nonBinary.gc = d.nonBinary.General_Category;
    d.nonBinary.sc = d.nonBinary.Script;
    d.nonBinary.scx = d.nonBinary.Script_Extensions;
}
for (var i = 0, list = [9, 10, 11, 12, 13, 14]; i < list.length; i += 1) {
    var ecmaVersion = list[i];
    buildUnicodeData(ecmaVersion);
}
var pp$1 = Parser$2.prototype;
var BranchID = function BranchID(parent, base) {
    this.parent = parent;
    this.base = base || this;
};
BranchID.prototype.separatedFrom = function separatedFrom(alt) {
    for (var self = this; self; self = self.parent) {
        for (var other = alt; other; other = other.parent) {
            if (self.base === other.base && self !== other) {
                return true;
            }
        }
    }
    return false;
};
BranchID.prototype.sibling = function sibling() {
    return new BranchID(this.parent, this.base);
};
var RegExpValidationState = function RegExpValidationState(parser) {
    this.parser = parser;
    this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
    this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
    this.source = "";
    this.flags = "";
    this.start = 0;
    this.switchU = false;
    this.switchV = false;
    this.switchN = false;
    this.pos = 0;
    this.lastIntValue = 0;
    this.lastStringValue = "";
    this.lastAssertionIsQuantifiable = false;
    this.numCapturingParens = 0;
    this.maxBackReference = 0;
    this.groupNames = Object.create(null);
    this.backReferenceNames = [];
    this.branchID = null;
};
RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
    var unicodeSets = flags.indexOf("v") !== -1;
    var unicode = flags.indexOf("u") !== -1;
    this.start = start | 0;
    this.source = pattern + "";
    this.flags = flags;
    if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
        this.switchU = true;
        this.switchV = true;
        this.switchN = true;
    }
    else {
        this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
        this.switchV = false;
        this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
    }
};
RegExpValidationState.prototype.raise = function raise(message) {
    this.parser.raiseRecoverable(this.start, ("Invalid regular expression: /" + (this.source) + "/: " + message));
};
RegExpValidationState.prototype.at = function at(i, forceU) {
    if (forceU === void 0)
        forceU = false;
    var s = this.source;
    var l = s.length;
    if (i >= l) {
        return -1;
    }
    var c = s.charCodeAt(i);
    if (!(forceU || this.switchU) || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l) {
        return c;
    }
    var next = s.charCodeAt(i + 1);
    return next >= 0xDC00 && next <= 0xDFFF ? (c << 10) + next - 0x35FDC00 : c;
};
RegExpValidationState.prototype.nextIndex = function nextIndex(i, forceU) {
    if (forceU === void 0)
        forceU = false;
    var s = this.source;
    var l = s.length;
    if (i >= l) {
        return l;
    }
    var c = s.charCodeAt(i), next;
    if (!(forceU || this.switchU) || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l ||
        (next = s.charCodeAt(i + 1)) < 0xDC00 || next > 0xDFFF) {
        return i + 1;
    }
    return i + 2;
};
RegExpValidationState.prototype.current = function current(forceU) {
    if (forceU === void 0)
        forceU = false;
    return this.at(this.pos, forceU);
};
RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
    if (forceU === void 0)
        forceU = false;
    return this.at(this.nextIndex(this.pos, forceU), forceU);
};
RegExpValidationState.prototype.advance = function advance(forceU) {
    if (forceU === void 0)
        forceU = false;
    this.pos = this.nextIndex(this.pos, forceU);
};
RegExpValidationState.prototype.eat = function eat(ch, forceU) {
    if (forceU === void 0)
        forceU = false;
    if (this.current(forceU) === ch) {
        this.advance(forceU);
        return true;
    }
    return false;
};
RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
    if (forceU === void 0)
        forceU = false;
    var pos = this.pos;
    for (var i = 0, list = chs; i < list.length; i += 1) {
        var ch = list[i];
        var current = this.at(pos, forceU);
        if (current === -1 || current !== ch) {
            return false;
        }
        pos = this.nextIndex(pos, forceU);
    }
    this.pos = pos;
    return true;
};
pp$1.validateRegExpFlags = function (state) {
    var validFlags = state.validFlags;
    var flags = state.flags;
    var u = false;
    var v = false;
    for (var i = 0; i < flags.length; i++) {
        var flag = flags.charAt(i);
        if (validFlags.indexOf(flag) === -1) {
            this.raise(state.start, "Invalid regular expression flag");
        }
        if (flags.indexOf(flag, i + 1) > -1) {
            this.raise(state.start, "Duplicate regular expression flag");
        }
        if (flag === "u") {
            u = true;
        }
        if (flag === "v") {
            v = true;
        }
    }
    if (this.options.ecmaVersion >= 15 && u && v) {
        this.raise(state.start, "Invalid regular expression flag");
    }
};
function hasProp(obj) {
    for (var _ in obj) {
        return true;
    }
    return false;
}
pp$1.validateRegExpPattern = function (state) {
    this.regexp_pattern(state);
    if (!state.switchN && this.options.ecmaVersion >= 9 && hasProp(state.groupNames)) {
        state.switchN = true;
        this.regexp_pattern(state);
    }
};
pp$1.regexp_pattern = function (state) {
    state.pos = 0;
    state.lastIntValue = 0;
    state.lastStringValue = "";
    state.lastAssertionIsQuantifiable = false;
    state.numCapturingParens = 0;
    state.maxBackReference = 0;
    state.groupNames = Object.create(null);
    state.backReferenceNames.length = 0;
    state.branchID = null;
    this.regexp_disjunction(state);
    if (state.pos !== state.source.length) {
        if (state.eat(0x29 )) {
            state.raise("Unmatched ')'");
        }
        if (state.eat(0x5D ) || state.eat(0x7D )) {
            state.raise("Lone quantifier brackets");
        }
    }
    if (state.maxBackReference > state.numCapturingParens) {
        state.raise("Invalid escape");
    }
    for (var i = 0, list = state.backReferenceNames; i < list.length; i += 1) {
        var name = list[i];
        if (!state.groupNames[name]) {
            state.raise("Invalid named capture referenced");
        }
    }
};
pp$1.regexp_disjunction = function (state) {
    var trackDisjunction = this.options.ecmaVersion >= 16;
    if (trackDisjunction) {
        state.branchID = new BranchID(state.branchID, null);
    }
    this.regexp_alternative(state);
    while (state.eat(0x7C )) {
        if (trackDisjunction) {
            state.branchID = state.branchID.sibling();
        }
        this.regexp_alternative(state);
    }
    if (trackDisjunction) {
        state.branchID = state.branchID.parent;
    }
    if (this.regexp_eatQuantifier(state, true)) {
        state.raise("Nothing to repeat");
    }
    if (state.eat(0x7B )) {
        state.raise("Lone quantifier brackets");
    }
};
pp$1.regexp_alternative = function (state) {
    while (state.pos < state.source.length && this.regexp_eatTerm(state)) { }
};
pp$1.regexp_eatTerm = function (state) {
    if (this.regexp_eatAssertion(state)) {
        if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
            if (state.switchU) {
                state.raise("Invalid quantifier");
            }
        }
        return true;
    }
    if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
        this.regexp_eatQuantifier(state);
        return true;
    }
    return false;
};
pp$1.regexp_eatAssertion = function (state) {
    var start = state.pos;
    state.lastAssertionIsQuantifiable = false;
    if (state.eat(0x5E ) || state.eat(0x24 )) {
        return true;
    }
    if (state.eat(0x5C )) {
        if (state.eat(0x42 ) || state.eat(0x62 )) {
            return true;
        }
        state.pos = start;
    }
    if (state.eat(0x28 ) && state.eat(0x3F )) {
        var lookbehind = false;
        if (this.options.ecmaVersion >= 9) {
            lookbehind = state.eat(0x3C );
        }
        if (state.eat(0x3D ) || state.eat(0x21 )) {
            this.regexp_disjunction(state);
            if (!state.eat(0x29 )) {
                state.raise("Unterminated group");
            }
            state.lastAssertionIsQuantifiable = !lookbehind;
            return true;
        }
    }
    state.pos = start;
    return false;
};
pp$1.regexp_eatQuantifier = function (state, noError) {
    if (noError === void 0)
        noError = false;
    if (this.regexp_eatQuantifierPrefix(state, noError)) {
        state.eat(0x3F );
        return true;
    }
    return false;
};
pp$1.regexp_eatQuantifierPrefix = function (state, noError) {
    return (state.eat(0x2A ) ||
        state.eat(0x2B ) ||
        state.eat(0x3F ) ||
        this.regexp_eatBracedQuantifier(state, noError));
};
pp$1.regexp_eatBracedQuantifier = function (state, noError) {
    var start = state.pos;
    if (state.eat(0x7B )) {
        var min = 0, max = -1;
        if (this.regexp_eatDecimalDigits(state)) {
            min = state.lastIntValue;
            if (state.eat(0x2C ) && this.regexp_eatDecimalDigits(state)) {
                max = state.lastIntValue;
            }
            if (state.eat(0x7D )) {
                if (max !== -1 && max < min && !noError) {
                    state.raise("numbers out of order in {} quantifier");
                }
                return true;
            }
        }
        if (state.switchU && !noError) {
            state.raise("Incomplete quantifier");
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatAtom = function (state) {
    return (this.regexp_eatPatternCharacters(state) ||
        state.eat(0x2E ) ||
        this.regexp_eatReverseSolidusAtomEscape(state) ||
        this.regexp_eatCharacterClass(state) ||
        this.regexp_eatUncapturingGroup(state) ||
        this.regexp_eatCapturingGroup(state));
};
pp$1.regexp_eatReverseSolidusAtomEscape = function (state) {
    var start = state.pos;
    if (state.eat(0x5C )) {
        if (this.regexp_eatAtomEscape(state)) {
            return true;
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatUncapturingGroup = function (state) {
    var start = state.pos;
    if (state.eat(0x28 )) {
        if (state.eat(0x3F )) {
            if (this.options.ecmaVersion >= 16) {
                var addModifiers = this.regexp_eatModifiers(state);
                var hasHyphen = state.eat(0x2D );
                if (addModifiers || hasHyphen) {
                    for (var i = 0; i < addModifiers.length; i++) {
                        var modifier = addModifiers.charAt(i);
                        if (addModifiers.indexOf(modifier, i + 1) > -1) {
                            state.raise("Duplicate regular expression modifiers");
                        }
                    }
                    if (hasHyphen) {
                        var removeModifiers = this.regexp_eatModifiers(state);
                        if (!addModifiers && !removeModifiers && state.current() === 0x3A ) {
                            state.raise("Invalid regular expression modifiers");
                        }
                        for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
                            var modifier$1 = removeModifiers.charAt(i$1);
                            if (removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 ||
                                addModifiers.indexOf(modifier$1) > -1) {
                                state.raise("Duplicate regular expression modifiers");
                            }
                        }
                    }
                }
            }
            if (state.eat(0x3A )) {
                this.regexp_disjunction(state);
                if (state.eat(0x29 )) {
                    return true;
                }
                state.raise("Unterminated group");
            }
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatCapturingGroup = function (state) {
    if (state.eat(0x28 )) {
        if (this.options.ecmaVersion >= 9) {
            this.regexp_groupSpecifier(state);
        }
        else if (state.current() === 0x3F ) {
            state.raise("Invalid group");
        }
        this.regexp_disjunction(state);
        if (state.eat(0x29 )) {
            state.numCapturingParens += 1;
            return true;
        }
        state.raise("Unterminated group");
    }
    return false;
};
pp$1.regexp_eatModifiers = function (state) {
    var modifiers = "";
    var ch = 0;
    while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
        modifiers += codePointToString(ch);
        state.advance();
    }
    return modifiers;
};
function isRegularExpressionModifier(ch) {
    return ch === 0x69  || ch === 0x6d  || ch === 0x73;
}
pp$1.regexp_eatExtendedAtom = function (state) {
    return (state.eat(0x2E ) ||
        this.regexp_eatReverseSolidusAtomEscape(state) ||
        this.regexp_eatCharacterClass(state) ||
        this.regexp_eatUncapturingGroup(state) ||
        this.regexp_eatCapturingGroup(state) ||
        this.regexp_eatInvalidBracedQuantifier(state) ||
        this.regexp_eatExtendedPatternCharacter(state));
};
pp$1.regexp_eatInvalidBracedQuantifier = function (state) {
    if (this.regexp_eatBracedQuantifier(state, true)) {
        state.raise("Nothing to repeat");
    }
    return false;
};
pp$1.regexp_eatSyntaxCharacter = function (state) {
    var ch = state.current();
    if (isSyntaxCharacter(ch)) {
        state.lastIntValue = ch;
        state.advance();
        return true;
    }
    return false;
};
function isSyntaxCharacter(ch) {
    return (ch === 0x24  ||
        ch >= 0x28  && ch <= 0x2B  ||
        ch === 0x2E  ||
        ch === 0x3F  ||
        ch >= 0x5B  && ch <= 0x5E  ||
        ch >= 0x7B  && ch <= 0x7D );
}
pp$1.regexp_eatPatternCharacters = function (state) {
    var start = state.pos;
    var ch = 0;
    while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
        state.advance();
    }
    return state.pos !== start;
};
pp$1.regexp_eatExtendedPatternCharacter = function (state) {
    var ch = state.current();
    if (ch !== -1 &&
        ch !== 0x24  &&
        !(ch >= 0x28  && ch <= 0x2B ) &&
        ch !== 0x2E  &&
        ch !== 0x3F  &&
        ch !== 0x5B  &&
        ch !== 0x5E  &&
        ch !== 0x7C ) {
        state.advance();
        return true;
    }
    return false;
};
pp$1.regexp_groupSpecifier = function (state) {
    if (state.eat(0x3F )) {
        if (!this.regexp_eatGroupName(state)) {
            state.raise("Invalid group");
        }
        var trackDisjunction = this.options.ecmaVersion >= 16;
        var known = state.groupNames[state.lastStringValue];
        if (known) {
            if (trackDisjunction) {
                for (var i = 0, list = known; i < list.length; i += 1) {
                    var altID = list[i];
                    if (!altID.separatedFrom(state.branchID)) {
                        state.raise("Duplicate capture group name");
                    }
                }
            }
            else {
                state.raise("Duplicate capture group name");
            }
        }
        if (trackDisjunction) {
            (known || (state.groupNames[state.lastStringValue] = [])).push(state.branchID);
        }
        else {
            state.groupNames[state.lastStringValue] = true;
        }
    }
};
pp$1.regexp_eatGroupName = function (state) {
    state.lastStringValue = "";
    if (state.eat(0x3C )) {
        if (this.regexp_eatRegExpIdentifierName(state) && state.eat(0x3E )) {
            return true;
        }
        state.raise("Invalid capture group name");
    }
    return false;
};
pp$1.regexp_eatRegExpIdentifierName = function (state) {
    state.lastStringValue = "";
    if (this.regexp_eatRegExpIdentifierStart(state)) {
        state.lastStringValue += codePointToString(state.lastIntValue);
        while (this.regexp_eatRegExpIdentifierPart(state)) {
            state.lastStringValue += codePointToString(state.lastIntValue);
        }
        return true;
    }
    return false;
};
pp$1.regexp_eatRegExpIdentifierStart = function (state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);
    if (ch === 0x5C  && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
        ch = state.lastIntValue;
    }
    if (isRegExpIdentifierStart(ch)) {
        state.lastIntValue = ch;
        return true;
    }
    state.pos = start;
    return false;
};
function isRegExpIdentifierStart(ch) {
    return isIdentifierStart(ch, true) || ch === 0x24  || ch === 0x5F;
}
pp$1.regexp_eatRegExpIdentifierPart = function (state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);
    if (ch === 0x5C  && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
        ch = state.lastIntValue;
    }
    if (isRegExpIdentifierPart(ch)) {
        state.lastIntValue = ch;
        return true;
    }
    state.pos = start;
    return false;
};
function isRegExpIdentifierPart(ch) {
    return isIdentifierChar(ch, true) || ch === 0x24  || ch === 0x5F  || ch === 0x200C  || ch === 0x200D;
}
pp$1.regexp_eatAtomEscape = function (state) {
    if (this.regexp_eatBackReference(state) ||
        this.regexp_eatCharacterClassEscape(state) ||
        this.regexp_eatCharacterEscape(state) ||
        (state.switchN && this.regexp_eatKGroupName(state))) {
        return true;
    }
    if (state.switchU) {
        if (state.current() === 0x63 ) {
            state.raise("Invalid unicode escape");
        }
        state.raise("Invalid escape");
    }
    return false;
};
pp$1.regexp_eatBackReference = function (state) {
    var start = state.pos;
    if (this.regexp_eatDecimalEscape(state)) {
        var n = state.lastIntValue;
        if (state.switchU) {
            if (n > state.maxBackReference) {
                state.maxBackReference = n;
            }
            return true;
        }
        if (n <= state.numCapturingParens) {
            return true;
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatKGroupName = function (state) {
    if (state.eat(0x6B )) {
        if (this.regexp_eatGroupName(state)) {
            state.backReferenceNames.push(state.lastStringValue);
            return true;
        }
        state.raise("Invalid named reference");
    }
    return false;
};
pp$1.regexp_eatCharacterEscape = function (state) {
    return (this.regexp_eatControlEscape(state) ||
        this.regexp_eatCControlLetter(state) ||
        this.regexp_eatZero(state) ||
        this.regexp_eatHexEscapeSequence(state) ||
        this.regexp_eatRegExpUnicodeEscapeSequence(state, false) ||
        (!state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state)) ||
        this.regexp_eatIdentityEscape(state));
};
pp$1.regexp_eatCControlLetter = function (state) {
    var start = state.pos;
    if (state.eat(0x63 )) {
        if (this.regexp_eatControlLetter(state)) {
            return true;
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatZero = function (state) {
    if (state.current() === 0x30  && !isDecimalDigit(state.lookahead())) {
        state.lastIntValue = 0;
        state.advance();
        return true;
    }
    return false;
};
pp$1.regexp_eatControlEscape = function (state) {
    var ch = state.current();
    if (ch === 0x74 ) {
        state.lastIntValue = 0x09;
        state.advance();
        return true;
    }
    if (ch === 0x6E ) {
        state.lastIntValue = 0x0A;
        state.advance();
        return true;
    }
    if (ch === 0x76 ) {
        state.lastIntValue = 0x0B;
        state.advance();
        return true;
    }
    if (ch === 0x66 ) {
        state.lastIntValue = 0x0C;
        state.advance();
        return true;
    }
    if (ch === 0x72 ) {
        state.lastIntValue = 0x0D;
        state.advance();
        return true;
    }
    return false;
};
pp$1.regexp_eatControlLetter = function (state) {
    var ch = state.current();
    if (isControlLetter(ch)) {
        state.lastIntValue = ch % 0x20;
        state.advance();
        return true;
    }
    return false;
};
function isControlLetter(ch) {
    return ((ch >= 0x41  && ch <= 0x5A ) ||
        (ch >= 0x61  && ch <= 0x7A ));
}
pp$1.regexp_eatRegExpUnicodeEscapeSequence = function (state, forceU) {
    if (forceU === void 0)
        forceU = false;
    var start = state.pos;
    var switchU = forceU || state.switchU;
    if (state.eat(0x75 )) {
        if (this.regexp_eatFixedHexDigits(state, 4)) {
            var lead = state.lastIntValue;
            if (switchU && lead >= 0xD800 && lead <= 0xDBFF) {
                var leadSurrogateEnd = state.pos;
                if (state.eat(0x5C ) && state.eat(0x75 ) && this.regexp_eatFixedHexDigits(state, 4)) {
                    var trail = state.lastIntValue;
                    if (trail >= 0xDC00 && trail <= 0xDFFF) {
                        state.lastIntValue = (lead - 0xD800) * 0x400 + (trail - 0xDC00) + 0x10000;
                        return true;
                    }
                }
                state.pos = leadSurrogateEnd;
                state.lastIntValue = lead;
            }
            return true;
        }
        if (switchU &&
            state.eat(0x7B ) &&
            this.regexp_eatHexDigits(state) &&
            state.eat(0x7D ) &&
            isValidUnicode(state.lastIntValue)) {
            return true;
        }
        if (switchU) {
            state.raise("Invalid unicode escape");
        }
        state.pos = start;
    }
    return false;
};
function isValidUnicode(ch) {
    return ch >= 0 && ch <= 0x10FFFF;
}
pp$1.regexp_eatIdentityEscape = function (state) {
    if (state.switchU) {
        if (this.regexp_eatSyntaxCharacter(state)) {
            return true;
        }
        if (state.eat(0x2F )) {
            state.lastIntValue = 0x2F;
            return true;
        }
        return false;
    }
    var ch = state.current();
    if (ch !== 0x63  && (!state.switchN || ch !== 0x6B )) {
        state.lastIntValue = ch;
        state.advance();
        return true;
    }
    return false;
};
pp$1.regexp_eatDecimalEscape = function (state) {
    state.lastIntValue = 0;
    var ch = state.current();
    if (ch >= 0x31  && ch <= 0x39 ) {
        do {
            state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 );
            state.advance();
        } while ((ch = state.current()) >= 0x30  && ch <= 0x39 );
        return true;
    }
    return false;
};
var CharSetNone = 0;
var CharSetOk = 1;
var CharSetString = 2;
pp$1.regexp_eatCharacterClassEscape = function (state) {
    var ch = state.current();
    if (isCharacterClassEscape(ch)) {
        state.lastIntValue = -1;
        state.advance();
        return CharSetOk;
    }
    var negate = false;
    if (state.switchU &&
        this.options.ecmaVersion >= 9 &&
        ((negate = ch === 0x50 ) || ch === 0x70 )) {
        state.lastIntValue = -1;
        state.advance();
        var result;
        if (state.eat(0x7B ) &&
            (result = this.regexp_eatUnicodePropertyValueExpression(state)) &&
            state.eat(0x7D )) {
            if (negate && result === CharSetString) {
                state.raise("Invalid property name");
            }
            return result;
        }
        state.raise("Invalid property name");
    }
    return CharSetNone;
};
function isCharacterClassEscape(ch) {
    return (ch === 0x64  ||
        ch === 0x44  ||
        ch === 0x73  ||
        ch === 0x53  ||
        ch === 0x77  ||
        ch === 0x57 );
}
pp$1.regexp_eatUnicodePropertyValueExpression = function (state) {
    var start = state.pos;
    if (this.regexp_eatUnicodePropertyName(state) && state.eat(0x3D )) {
        var name = state.lastStringValue;
        if (this.regexp_eatUnicodePropertyValue(state)) {
            var value = state.lastStringValue;
            this.regexp_validateUnicodePropertyNameAndValue(state, name, value);
            return CharSetOk;
        }
    }
    state.pos = start;
    if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
        var nameOrValue = state.lastStringValue;
        return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue);
    }
    return CharSetNone;
};
pp$1.regexp_validateUnicodePropertyNameAndValue = function (state, name, value) {
    if (!hasOwn(state.unicodeProperties.nonBinary, name)) {
        state.raise("Invalid property name");
    }
    if (!state.unicodeProperties.nonBinary[name].test(value)) {
        state.raise("Invalid property value");
    }
};
pp$1.regexp_validateUnicodePropertyNameOrValue = function (state, nameOrValue) {
    if (state.unicodeProperties.binary.test(nameOrValue)) {
        return CharSetOk;
    }
    if (state.switchV && state.unicodeProperties.binaryOfStrings.test(nameOrValue)) {
        return CharSetString;
    }
    state.raise("Invalid property name");
};
pp$1.regexp_eatUnicodePropertyName = function (state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyNameCharacter(ch = state.current())) {
        state.lastStringValue += codePointToString(ch);
        state.advance();
    }
    return state.lastStringValue !== "";
};
function isUnicodePropertyNameCharacter(ch) {
    return isControlLetter(ch) || ch === 0x5F;
}
pp$1.regexp_eatUnicodePropertyValue = function (state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyValueCharacter(ch = state.current())) {
        state.lastStringValue += codePointToString(ch);
        state.advance();
    }
    return state.lastStringValue !== "";
};
function isUnicodePropertyValueCharacter(ch) {
    return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch);
}
pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function (state) {
    return this.regexp_eatUnicodePropertyValue(state);
};
pp$1.regexp_eatCharacterClass = function (state) {
    if (state.eat(0x5B )) {
        var negate = state.eat(0x5E );
        var result = this.regexp_classContents(state);
        if (!state.eat(0x5D )) {
            state.raise("Unterminated character class");
        }
        if (negate && result === CharSetString) {
            state.raise("Negated character class may contain strings");
        }
        return true;
    }
    return false;
};
pp$1.regexp_classContents = function (state) {
    if (state.current() === 0x5D ) {
        return CharSetOk;
    }
    if (state.switchV) {
        return this.regexp_classSetExpression(state);
    }
    this.regexp_nonEmptyClassRanges(state);
    return CharSetOk;
};
pp$1.regexp_nonEmptyClassRanges = function (state) {
    while (this.regexp_eatClassAtom(state)) {
        var left = state.lastIntValue;
        if (state.eat(0x2D ) && this.regexp_eatClassAtom(state)) {
            var right = state.lastIntValue;
            if (state.switchU && (left === -1 || right === -1)) {
                state.raise("Invalid character class");
            }
            if (left !== -1 && right !== -1 && left > right) {
                state.raise("Range out of order in character class");
            }
        }
    }
};
pp$1.regexp_eatClassAtom = function (state) {
    var start = state.pos;
    if (state.eat(0x5C )) {
        if (this.regexp_eatClassEscape(state)) {
            return true;
        }
        if (state.switchU) {
            var ch$1 = state.current();
            if (ch$1 === 0x63  || isOctalDigit(ch$1)) {
                state.raise("Invalid class escape");
            }
            state.raise("Invalid escape");
        }
        state.pos = start;
    }
    var ch = state.current();
    if (ch !== 0x5D ) {
        state.lastIntValue = ch;
        state.advance();
        return true;
    }
    return false;
};
pp$1.regexp_eatClassEscape = function (state) {
    var start = state.pos;
    if (state.eat(0x62 )) {
        state.lastIntValue = 0x08;
        return true;
    }
    if (state.switchU && state.eat(0x2D )) {
        state.lastIntValue = 0x2D;
        return true;
    }
    if (!state.switchU && state.eat(0x63 )) {
        if (this.regexp_eatClassControlLetter(state)) {
            return true;
        }
        state.pos = start;
    }
    return (this.regexp_eatCharacterClassEscape(state) ||
        this.regexp_eatCharacterEscape(state));
};
pp$1.regexp_classSetExpression = function (state) {
    var result = CharSetOk, subResult;
    if (this.regexp_eatClassSetRange(state))
        ;
    else if (subResult = this.regexp_eatClassSetOperand(state)) {
        if (subResult === CharSetString) {
            result = CharSetString;
        }
        var start = state.pos;
        while (state.eatChars([0x26, 0x26] )) {
            if (state.current() !== 0x26  &&
                (subResult = this.regexp_eatClassSetOperand(state))) {
                if (subResult !== CharSetString) {
                    result = CharSetOk;
                }
                continue;
            }
            state.raise("Invalid character in character class");
        }
        if (start !== state.pos) {
            return result;
        }
        while (state.eatChars([0x2D, 0x2D] )) {
            if (this.regexp_eatClassSetOperand(state)) {
                continue;
            }
            state.raise("Invalid character in character class");
        }
        if (start !== state.pos) {
            return result;
        }
    }
    else {
        state.raise("Invalid character in character class");
    }
    for (;;) {
        if (this.regexp_eatClassSetRange(state)) {
            continue;
        }
        subResult = this.regexp_eatClassSetOperand(state);
        if (!subResult) {
            return result;
        }
        if (subResult === CharSetString) {
            result = CharSetString;
        }
    }
};
pp$1.regexp_eatClassSetRange = function (state) {
    var start = state.pos;
    if (this.regexp_eatClassSetCharacter(state)) {
        var left = state.lastIntValue;
        if (state.eat(0x2D ) && this.regexp_eatClassSetCharacter(state)) {
            var right = state.lastIntValue;
            if (left !== -1 && right !== -1 && left > right) {
                state.raise("Range out of order in character class");
            }
            return true;
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatClassSetOperand = function (state) {
    if (this.regexp_eatClassSetCharacter(state)) {
        return CharSetOk;
    }
    return this.regexp_eatClassStringDisjunction(state) || this.regexp_eatNestedClass(state);
};
pp$1.regexp_eatNestedClass = function (state) {
    var start = state.pos;
    if (state.eat(0x5B )) {
        var negate = state.eat(0x5E );
        var result = this.regexp_classContents(state);
        if (state.eat(0x5D )) {
            if (negate && result === CharSetString) {
                state.raise("Negated character class may contain strings");
            }
            return result;
        }
        state.pos = start;
    }
    if (state.eat(0x5C )) {
        var result$1 = this.regexp_eatCharacterClassEscape(state);
        if (result$1) {
            return result$1;
        }
        state.pos = start;
    }
    return null;
};
pp$1.regexp_eatClassStringDisjunction = function (state) {
    var start = state.pos;
    if (state.eatChars([0x5C, 0x71] )) {
        if (state.eat(0x7B )) {
            var result = this.regexp_classStringDisjunctionContents(state);
            if (state.eat(0x7D )) {
                return result;
            }
        }
        else {
            state.raise("Invalid escape");
        }
        state.pos = start;
    }
    return null;
};
pp$1.regexp_classStringDisjunctionContents = function (state) {
    var result = this.regexp_classString(state);
    while (state.eat(0x7C )) {
        if (this.regexp_classString(state) === CharSetString) {
            result = CharSetString;
        }
    }
    return result;
};
pp$1.regexp_classString = function (state) {
    var count = 0;
    while (this.regexp_eatClassSetCharacter(state)) {
        count++;
    }
    return count === 1 ? CharSetOk : CharSetString;
};
pp$1.regexp_eatClassSetCharacter = function (state) {
    var start = state.pos;
    if (state.eat(0x5C )) {
        if (this.regexp_eatCharacterEscape(state) ||
            this.regexp_eatClassSetReservedPunctuator(state)) {
            return true;
        }
        if (state.eat(0x62 )) {
            state.lastIntValue = 0x08;
            return true;
        }
        state.pos = start;
        return false;
    }
    var ch = state.current();
    if (ch < 0 || ch === state.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) {
        return false;
    }
    if (isClassSetSyntaxCharacter(ch)) {
        return false;
    }
    state.advance();
    state.lastIntValue = ch;
    return true;
};
function isClassSetReservedDoublePunctuatorCharacter(ch) {
    return (ch === 0x21  ||
        ch >= 0x23  && ch <= 0x26  ||
        ch >= 0x2A  && ch <= 0x2C  ||
        ch === 0x2E  ||
        ch >= 0x3A  && ch <= 0x40  ||
        ch === 0x5E  ||
        ch === 0x60  ||
        ch === 0x7E );
}
function isClassSetSyntaxCharacter(ch) {
    return (ch === 0x28  ||
        ch === 0x29  ||
        ch === 0x2D  ||
        ch === 0x2F  ||
        ch >= 0x5B  && ch <= 0x5D  ||
        ch >= 0x7B  && ch <= 0x7D );
}
pp$1.regexp_eatClassSetReservedPunctuator = function (state) {
    var ch = state.current();
    if (isClassSetReservedPunctuator(ch)) {
        state.lastIntValue = ch;
        state.advance();
        return true;
    }
    return false;
};
function isClassSetReservedPunctuator(ch) {
    return (ch === 0x21  ||
        ch === 0x23  ||
        ch === 0x25  ||
        ch === 0x26  ||
        ch === 0x2C  ||
        ch === 0x2D  ||
        ch >= 0x3A  && ch <= 0x3E  ||
        ch === 0x40  ||
        ch === 0x60  ||
        ch === 0x7E );
}
pp$1.regexp_eatClassControlLetter = function (state) {
    var ch = state.current();
    if (isDecimalDigit(ch) || ch === 0x5F ) {
        state.lastIntValue = ch % 0x20;
        state.advance();
        return true;
    }
    return false;
};
pp$1.regexp_eatHexEscapeSequence = function (state) {
    var start = state.pos;
    if (state.eat(0x78 )) {
        if (this.regexp_eatFixedHexDigits(state, 2)) {
            return true;
        }
        if (state.switchU) {
            state.raise("Invalid escape");
        }
        state.pos = start;
    }
    return false;
};
pp$1.regexp_eatDecimalDigits = function (state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isDecimalDigit(ch = state.current())) {
        state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 );
        state.advance();
    }
    return state.pos !== start;
};
function isDecimalDigit(ch) {
    return ch >= 0x30  && ch <= 0x39;
}
pp$1.regexp_eatHexDigits = function (state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isHexDigit(ch = state.current())) {
        state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
        state.advance();
    }
    return state.pos !== start;
};
function isHexDigit(ch) {
    return ((ch >= 0x30  && ch <= 0x39 ) ||
        (ch >= 0x41  && ch <= 0x46 ) ||
        (ch >= 0x61  && ch <= 0x66 ));
}
function hexToInt(ch) {
    if (ch >= 0x41  && ch <= 0x46 ) {
        return 10 + (ch - 0x41 );
    }
    if (ch >= 0x61  && ch <= 0x66 ) {
        return 10 + (ch - 0x61 );
    }
    return ch - 0x30;
}
pp$1.regexp_eatLegacyOctalEscapeSequence = function (state) {
    if (this.regexp_eatOctalDigit(state)) {
        var n1 = state.lastIntValue;
        if (this.regexp_eatOctalDigit(state)) {
            var n2 = state.lastIntValue;
            if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
                state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
            }
            else {
                state.lastIntValue = n1 * 8 + n2;
            }
        }
        else {
            state.lastIntValue = n1;
        }
        return true;
    }
    return false;
};
pp$1.regexp_eatOctalDigit = function (state) {
    var ch = state.current();
    if (isOctalDigit(ch)) {
        state.lastIntValue = ch - 0x30;
        state.advance();
        return true;
    }
    state.lastIntValue = 0;
    return false;
};
function isOctalDigit(ch) {
    return ch >= 0x30  && ch <= 0x37;
}
pp$1.regexp_eatFixedHexDigits = function (state, length) {
    var start = state.pos;
    state.lastIntValue = 0;
    for (var i = 0; i < length; ++i) {
        var ch = state.current();
        if (!isHexDigit(ch)) {
            state.pos = start;
            return false;
        }
        state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
        state.advance();
    }
    return true;
};
var Token$1 = function Token(p) {
    this.type = p.type;
    this.value = p.value;
    this.start = p.start;
    this.end = p.end;
    if (p.options.locations) {
        this.loc = new SourceLocation(p, p.startLoc, p.endLoc);
    }
    if (p.options.ranges) {
        this.range = [p.start, p.end];
    }
};
var pp = Parser$2.prototype;
pp.next = function (ignoreEscapeSequenceInKeyword) {
    if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) {
        this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword);
    }
    if (this.options.onToken) {
        this.options.onToken(new Token$1(this));
    }
    this.lastTokEnd = this.end;
    this.lastTokStart = this.start;
    this.lastTokEndLoc = this.endLoc;
    this.lastTokStartLoc = this.startLoc;
    this.nextToken();
};
pp.getToken = function () {
    this.next();
    return new Token$1(this);
};
if (typeof Symbol !== "undefined") {
    pp[Symbol.iterator] = function () {
        var this$1$1 = this;
        return {
            next: function () {
                var token = this$1$1.getToken();
                return {
                    done: token.type === types$1.eof,
                    value: token
                };
            }
        };
    };
}
pp.nextToken = function () {
    var curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) {
        this.skipSpace();
    }
    this.start = this.pos;
    if (this.options.locations) {
        this.startLoc = this.curPosition();
    }
    if (this.pos >= this.input.length) {
        return this.finishToken(types$1.eof);
    }
    if (curContext.override) {
        return curContext.override(this);
    }
    else {
        this.readToken(this.fullCharCodeAtPos());
    }
};
pp.readToken = function (code) {
    if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92 ) {
        return this.readWord();
    }
    return this.getTokenFromCode(code);
};
pp.fullCharCodeAt = function (pos) {
    var code = this.input.charCodeAt(pos);
    if (code <= 0xd7ff || code >= 0xdc00) {
        return code;
    }
    var next = this.input.charCodeAt(pos + 1);
    return next <= 0xdbff || next >= 0xe000 ? code : (code << 10) + next - 0x35fdc00;
};
pp.fullCharCodeAtPos = function () {
    return this.fullCharCodeAt(this.pos);
};
pp.skipBlockComment = function () {
    var startLoc = this.options.onComment && this.curPosition();
    var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
    if (end === -1) {
        this.raise(this.pos - 2, "Unterminated comment");
    }
    this.pos = end + 2;
    if (this.options.locations) {
        for (var nextBreak = (void 0), pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1;) {
            ++this.curLine;
            pos = this.lineStart = nextBreak;
        }
    }
    if (this.options.onComment) {
        this.options.onComment(true, this.input.slice(start + 2, end), start, this.pos, startLoc, this.curPosition());
    }
};
pp.skipLineComment = function (startSkip) {
    var start = this.pos;
    var startLoc = this.options.onComment && this.curPosition();
    var ch = this.input.charCodeAt(this.pos += startSkip);
    while (this.pos < this.input.length && !isNewLine(ch)) {
        ch = this.input.charCodeAt(++this.pos);
    }
    if (this.options.onComment) {
        this.options.onComment(false, this.input.slice(start + startSkip, this.pos), start, this.pos, startLoc, this.curPosition());
    }
};
pp.skipSpace = function () {
    loop: while (this.pos < this.input.length) {
        var ch = this.input.charCodeAt(this.pos);
        switch (ch) {
            case 32:
            case 160:
                ++this.pos;
                break;
            case 13:
                if (this.input.charCodeAt(this.pos + 1) === 10) {
                    ++this.pos;
                }
            case 10:
            case 8232:
            case 8233:
                ++this.pos;
                if (this.options.locations) {
                    ++this.curLine;
                    this.lineStart = this.pos;
                }
                break;
            case 47:
                switch (this.input.charCodeAt(this.pos + 1)) {
                    case 42:
                        this.skipBlockComment();
                        break;
                    case 47:
                        this.skipLineComment(2);
                        break;
                    default:
                        break loop;
                }
                break;
            default:
                if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
                    ++this.pos;
                }
                else {
                    break loop;
                }
        }
    }
};
pp.finishToken = function (type, val) {
    this.end = this.pos;
    if (this.options.locations) {
        this.endLoc = this.curPosition();
    }
    var prevType = this.type;
    this.type = type;
    this.value = val;
    this.updateContext(prevType);
};
pp.readToken_dot = function () {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next >= 48 && next <= 57) {
        return this.readNumber(true);
    }
    var next2 = this.input.charCodeAt(this.pos + 2);
    if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) {
        this.pos += 3;
        return this.finishToken(types$1.ellipsis);
    }
    else {
        ++this.pos;
        return this.finishToken(types$1.dot);
    }
};
pp.readToken_slash = function () {
    var next = this.input.charCodeAt(this.pos + 1);
    if (this.exprAllowed) {
        ++this.pos;
        return this.readRegexp();
    }
    if (next === 61) {
        return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.slash, 1);
};
pp.readToken_mult_modulo_exp = function (code) {
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    var tokentype = code === 42 ? types$1.star : types$1.modulo;
    if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
        ++size;
        tokentype = types$1.starstar;
        next = this.input.charCodeAt(this.pos + 2);
    }
    if (next === 61) {
        return this.finishOp(types$1.assign, size + 1);
    }
    return this.finishOp(tokentype, size);
};
pp.readToken_pipe_amp = function (code) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
        if (this.options.ecmaVersion >= 12) {
            var next2 = this.input.charCodeAt(this.pos + 2);
            if (next2 === 61) {
                return this.finishOp(types$1.assign, 3);
            }
        }
        return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2);
    }
    if (next === 61) {
        return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1);
};
pp.readToken_caret = function () {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) {
        return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.bitwiseXOR, 1);
};
pp.readToken_plus_min = function (code) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
        if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 &&
            (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
            this.skipLineComment(3);
            this.skipSpace();
            return this.nextToken();
        }
        return this.finishOp(types$1.incDec, 2);
    }
    if (next === 61) {
        return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.plusMin, 1);
};
pp.readToken_lt_gt = function (code) {
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    if (next === code) {
        size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
        if (this.input.charCodeAt(this.pos + size) === 61) {
            return this.finishOp(types$1.assign, size + 1);
        }
        return this.finishOp(types$1.bitShift, size);
    }
    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 &&
        this.input.charCodeAt(this.pos + 3) === 45) {
        this.skipLineComment(4);
        this.skipSpace();
        return this.nextToken();
    }
    if (next === 61) {
        size = 2;
    }
    return this.finishOp(types$1.relational, size);
};
pp.readToken_eq_excl = function (code) {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) {
        return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2);
    }
    if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) {
        this.pos += 2;
        return this.finishToken(types$1.arrow);
    }
    return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1);
};
pp.readToken_question = function () {
    var ecmaVersion = this.options.ecmaVersion;
    if (ecmaVersion >= 11) {
        var next = this.input.charCodeAt(this.pos + 1);
        if (next === 46) {
            var next2 = this.input.charCodeAt(this.pos + 2);
            if (next2 < 48 || next2 > 57) {
                return this.finishOp(types$1.questionDot, 2);
            }
        }
        if (next === 63) {
            if (ecmaVersion >= 12) {
                var next2$1 = this.input.charCodeAt(this.pos + 2);
                if (next2$1 === 61) {
                    return this.finishOp(types$1.assign, 3);
                }
            }
            return this.finishOp(types$1.coalesce, 2);
        }
    }
    return this.finishOp(types$1.question, 1);
};
pp.readToken_numberSign = function () {
    var ecmaVersion = this.options.ecmaVersion;
    var code = 35;
    if (ecmaVersion >= 13) {
        ++this.pos;
        code = this.fullCharCodeAtPos();
        if (isIdentifierStart(code, true) || code === 92 ) {
            return this.finishToken(types$1.privateId, this.readWord1());
        }
    }
    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.getTokenFromCode = function (code) {
    switch (code) {
        case 46:
            return this.readToken_dot();
        case 40:
            ++this.pos;
            return this.finishToken(types$1.parenL);
        case 41:
            ++this.pos;
            return this.finishToken(types$1.parenR);
        case 59:
            ++this.pos;
            return this.finishToken(types$1.semi);
        case 44:
            ++this.pos;
            return this.finishToken(types$1.comma);
        case 91:
            ++this.pos;
            return this.finishToken(types$1.bracketL);
        case 93:
            ++this.pos;
            return this.finishToken(types$1.bracketR);
        case 123:
            ++this.pos;
            return this.finishToken(types$1.braceL);
        case 125:
            ++this.pos;
            return this.finishToken(types$1.braceR);
        case 58:
            ++this.pos;
            return this.finishToken(types$1.colon);
        case 96:
            if (this.options.ecmaVersion < 6) {
                break;
            }
            ++this.pos;
            return this.finishToken(types$1.backQuote);
        case 48:
            var next = this.input.charCodeAt(this.pos + 1);
            if (next === 120 || next === 88) {
                return this.readRadixNumber(16);
            }
            if (this.options.ecmaVersion >= 6) {
                if (next === 111 || next === 79) {
                    return this.readRadixNumber(8);
                }
                if (next === 98 || next === 66) {
                    return this.readRadixNumber(2);
                }
            }
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
            return this.readNumber(false);
        case 34:
        case 39:
            return this.readString(code);
        case 47:
            return this.readToken_slash();
        case 37:
        case 42:
            return this.readToken_mult_modulo_exp(code);
        case 124:
        case 38:
            return this.readToken_pipe_amp(code);
        case 94:
            return this.readToken_caret();
        case 43:
        case 45:
            return this.readToken_plus_min(code);
        case 60:
        case 62:
            return this.readToken_lt_gt(code);
        case 61:
        case 33:
            return this.readToken_eq_excl(code);
        case 63:
            return this.readToken_question();
        case 126:
            return this.finishOp(types$1.prefix, 1);
        case 35:
            return this.readToken_numberSign();
    }
    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.finishOp = function (type, size) {
    var str = this.input.slice(this.pos, this.pos + size);
    this.pos += size;
    return this.finishToken(type, str);
};
pp.readRegexp = function () {
    var escaped, inClass, start = this.pos;
    for (;;) {
        if (this.pos >= this.input.length) {
            this.raise(start, "Unterminated regular expression");
        }
        var ch = this.input.charAt(this.pos);
        if (lineBreak.test(ch)) {
            this.raise(start, "Unterminated regular expression");
        }
        if (!escaped) {
            if (ch === "[") {
                inClass = true;
            }
            else if (ch === "]" && inClass) {
                inClass = false;
            }
            else if (ch === "/" && !inClass) {
                break;
            }
            escaped = ch === "\\";
        }
        else {
            escaped = false;
        }
        ++this.pos;
    }
    var pattern = this.input.slice(start, this.pos);
    ++this.pos;
    var flagsStart = this.pos;
    var flags = this.readWord1();
    if (this.containsEsc) {
        this.unexpected(flagsStart);
    }
    var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
    state.reset(start, pattern, flags);
    this.validateRegExpFlags(state);
    this.validateRegExpPattern(state);
    var value = null;
    try {
        value = new RegExp(pattern, flags);
    }
    catch (e) {
    }
    return this.finishToken(types$1.regexp, { pattern: pattern, flags: flags, value: value });
};
pp.readInt = function (radix, len, maybeLegacyOctalNumericLiteral) {
    var allowSeparators = this.options.ecmaVersion >= 12 && len === undefined;
    var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;
    var start = this.pos, total = 0, lastCode = 0;
    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i, ++this.pos) {
        var code = this.input.charCodeAt(this.pos), val = (void 0);
        if (allowSeparators && code === 95) {
            if (isLegacyOctalNumericLiteral) {
                this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals");
            }
            if (lastCode === 95) {
                this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore");
            }
            if (i === 0) {
                this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits");
            }
            lastCode = code;
            continue;
        }
        if (code >= 97) {
            val = code - 97 + 10;
        }
        else if (code >= 65) {
            val = code - 65 + 10;
        }
        else if (code >= 48 && code <= 57) {
            val = code - 48;
        }
        else {
            val = Infinity;
        }
        if (val >= radix) {
            break;
        }
        lastCode = code;
        total = total * radix + val;
    }
    if (allowSeparators && lastCode === 95) {
        this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits");
    }
    if (this.pos === start || len != null && this.pos - start !== len) {
        return null;
    }
    return total;
};
function stringToNumber(str, isLegacyOctalNumericLiteral) {
    if (isLegacyOctalNumericLiteral) {
        return parseInt(str, 8);
    }
    return parseFloat(str.replace(/_/g, ""));
}
function stringToBigInt(str) {
    if (typeof BigInt !== "function") {
        return null;
    }
    return BigInt(str.replace(/_/g, ""));
}
pp.readRadixNumber = function (radix) {
    var start = this.pos;
    this.pos += 2;
    var val = this.readInt(radix);
    if (val == null) {
        this.raise(this.start + 2, "Expected number in radix " + radix);
    }
    if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
        val = stringToBigInt(this.input.slice(start, this.pos));
        ++this.pos;
    }
    else if (isIdentifierStart(this.fullCharCodeAtPos())) {
        this.raise(this.pos, "Identifier directly after number");
    }
    return this.finishToken(types$1.num, val);
};
pp.readNumber = function (startsWithDot) {
    var start = this.pos;
    if (!startsWithDot && this.readInt(10, undefined, true) === null) {
        this.raise(start, "Invalid number");
    }
    var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
    if (octal && this.strict) {
        this.raise(start, "Invalid number");
    }
    var next = this.input.charCodeAt(this.pos);
    if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
        var val$1 = stringToBigInt(this.input.slice(start, this.pos));
        ++this.pos;
        if (isIdentifierStart(this.fullCharCodeAtPos())) {
            this.raise(this.pos, "Identifier directly after number");
        }
        return this.finishToken(types$1.num, val$1);
    }
    if (octal && /[89]/.test(this.input.slice(start, this.pos))) {
        octal = false;
    }
    if (next === 46 && !octal) {
        ++this.pos;
        this.readInt(10);
        next = this.input.charCodeAt(this.pos);
    }
    if ((next === 69 || next === 101) && !octal) {
        next = this.input.charCodeAt(++this.pos);
        if (next === 43 || next === 45) {
            ++this.pos;
        }
        if (this.readInt(10) === null) {
            this.raise(start, "Invalid number");
        }
    }
    if (isIdentifierStart(this.fullCharCodeAtPos())) {
        this.raise(this.pos, "Identifier directly after number");
    }
    var val = stringToNumber(this.input.slice(start, this.pos), octal);
    return this.finishToken(types$1.num, val);
};
pp.readCodePoint = function () {
    var ch = this.input.charCodeAt(this.pos), code;
    if (ch === 123) {
        if (this.options.ecmaVersion < 6) {
            this.unexpected();
        }
        var codePos = ++this.pos;
        code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
        ++this.pos;
        if (code > 0x10FFFF) {
            this.invalidStringToken(codePos, "Code point out of bounds");
        }
    }
    else {
        code = this.readHexChar(4);
    }
    return code;
};
pp.readString = function (quote) {
    var out = "", chunkStart = ++this.pos;
    for (;;) {
        if (this.pos >= this.input.length) {
            this.raise(this.start, "Unterminated string constant");
        }
        var ch = this.input.charCodeAt(this.pos);
        if (ch === quote) {
            break;
        }
        if (ch === 92) {
            out += this.input.slice(chunkStart, this.pos);
            out += this.readEscapedChar(false);
            chunkStart = this.pos;
        }
        else if (ch === 0x2028 || ch === 0x2029) {
            if (this.options.ecmaVersion < 10) {
                this.raise(this.start, "Unterminated string constant");
            }
            ++this.pos;
            if (this.options.locations) {
                this.curLine++;
                this.lineStart = this.pos;
            }
        }
        else {
            if (isNewLine(ch)) {
                this.raise(this.start, "Unterminated string constant");
            }
            ++this.pos;
        }
    }
    out += this.input.slice(chunkStart, this.pos++);
    return this.finishToken(types$1.string, out);
};
var INVALID_TEMPLATE_ESCAPE_ERROR = {};
pp.tryReadTemplateToken = function () {
    this.inTemplateElement = true;
    try {
        this.readTmplToken();
    }
    catch (err) {
        if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
            this.readInvalidTemplateToken();
        }
        else {
            throw err;
        }
    }
    this.inTemplateElement = false;
};
pp.invalidStringToken = function (position, message) {
    if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
        throw INVALID_TEMPLATE_ESCAPE_ERROR;
    }
    else {
        this.raise(position, message);
    }
};
pp.readTmplToken = function () {
    var out = "", chunkStart = this.pos;
    for (;;) {
        if (this.pos >= this.input.length) {
            this.raise(this.start, "Unterminated template");
        }
        var ch = this.input.charCodeAt(this.pos);
        if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) {
            if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) {
                if (ch === 36) {
                    this.pos += 2;
                    return this.finishToken(types$1.dollarBraceL);
                }
                else {
                    ++this.pos;
                    return this.finishToken(types$1.backQuote);
                }
            }
            out += this.input.slice(chunkStart, this.pos);
            return this.finishToken(types$1.template, out);
        }
        if (ch === 92) {
            out += this.input.slice(chunkStart, this.pos);
            out += this.readEscapedChar(true);
            chunkStart = this.pos;
        }
        else if (isNewLine(ch)) {
            out += this.input.slice(chunkStart, this.pos);
            ++this.pos;
            switch (ch) {
                case 13:
                    if (this.input.charCodeAt(this.pos) === 10) {
                        ++this.pos;
                    }
                case 10:
                    out += "\n";
                    break;
                default:
                    out += String.fromCharCode(ch);
                    break;
            }
            if (this.options.locations) {
                ++this.curLine;
                this.lineStart = this.pos;
            }
            chunkStart = this.pos;
        }
        else {
            ++this.pos;
        }
    }
};
pp.readInvalidTemplateToken = function () {
    for (; this.pos < this.input.length; this.pos++) {
        switch (this.input[this.pos]) {
            case "\\":
                ++this.pos;
                break;
            case "$":
                if (this.input[this.pos + 1] !== "{") {
                    break;
                }
            case "`":
                return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos));
            case "\r":
                if (this.input[this.pos + 1] === "\n") {
                    ++this.pos;
                }
            case "\n":
            case "\u2028":
            case "\u2029":
                ++this.curLine;
                this.lineStart = this.pos + 1;
                break;
        }
    }
    this.raise(this.start, "Unterminated template");
};
pp.readEscapedChar = function (inTemplate) {
    var ch = this.input.charCodeAt(++this.pos);
    ++this.pos;
    switch (ch) {
        case 110: return "\n";
        case 114: return "\r";
        case 120: return String.fromCharCode(this.readHexChar(2));
        case 117: return codePointToString(this.readCodePoint());
        case 116: return "\t";
        case 98: return "\b";
        case 118: return "\u000b";
        case 102: return "\f";
        case 13: if (this.input.charCodeAt(this.pos) === 10) {
            ++this.pos;
        }
        case 10:
            if (this.options.locations) {
                this.lineStart = this.pos;
                ++this.curLine;
            }
            return "";
        case 56:
        case 57:
            if (this.strict) {
                this.invalidStringToken(this.pos - 1, "Invalid escape sequence");
            }
            if (inTemplate) {
                var codePos = this.pos - 1;
                this.invalidStringToken(codePos, "Invalid escape sequence in template string");
            }
        default:
            if (ch >= 48 && ch <= 55) {
                var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
                var octal = parseInt(octalStr, 8);
                if (octal > 255) {
                    octalStr = octalStr.slice(0, -1);
                    octal = parseInt(octalStr, 8);
                }
                this.pos += octalStr.length - 1;
                ch = this.input.charCodeAt(this.pos);
                if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
                    this.invalidStringToken(this.pos - 1 - octalStr.length, inTemplate
                        ? "Octal literal in template string"
                        : "Octal literal in strict mode");
                }
                return String.fromCharCode(octal);
            }
            if (isNewLine(ch)) {
                if (this.options.locations) {
                    this.lineStart = this.pos;
                    ++this.curLine;
                }
                return "";
            }
            return String.fromCharCode(ch);
    }
};
pp.readHexChar = function (len) {
    var codePos = this.pos;
    var n = this.readInt(16, len);
    if (n === null) {
        this.invalidStringToken(codePos, "Bad character escape sequence");
    }
    return n;
};
pp.readWord1 = function () {
    this.containsEsc = false;
    var word = "", first = true, chunkStart = this.pos;
    var astral = this.options.ecmaVersion >= 6;
    while (this.pos < this.input.length) {
        var ch = this.fullCharCodeAtPos();
        if (isIdentifierChar(ch, astral)) {
            this.pos += ch <= 0xffff ? 1 : 2;
        }
        else if (ch === 92) {
            this.containsEsc = true;
            word += this.input.slice(chunkStart, this.pos);
            var escStart = this.pos;
            if (this.input.charCodeAt(++this.pos) !== 117)
             {
                this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX");
            }
            ++this.pos;
            var esc = this.readCodePoint();
            if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) {
                this.invalidStringToken(escStart, "Invalid Unicode escape");
            }
            word += codePointToString(esc);
            chunkStart = this.pos;
        }
        else {
            break;
        }
        first = false;
    }
    return word + this.input.slice(chunkStart, this.pos);
};
pp.readWord = function () {
    var word = this.readWord1();
    var type = types$1.name;
    if (this.keywords.test(word)) {
        type = keywords[word];
    }
    return this.finishToken(type, word);
};
var version = "8.16.0";
Parser$2.acorn = {
    Parser: Parser$2,
    version: version,
    defaultOptions: defaultOptions,
    Position: Position,
    SourceLocation: SourceLocation,
    getLineInfo: getLineInfo,
    Node: Node,
    TokenType: TokenType,
    tokTypes: types$1,
    keywordTypes: keywords,
    TokContext: TokContext,
    tokContexts: types,
    isIdentifierChar: isIdentifierChar,
    isIdentifierStart: isIdentifierStart,
    Token: Token$1,
    isNewLine: isNewLine,
    lineBreak: lineBreak,
    lineBreakG: lineBreakG,
    nonASCIIwhitespace: nonASCIIwhitespace
};

// Copyright (c) 2020 The Chromium Authors. All rights reserved.
const Parser$1 = Parser$2;
Parser$2.tokenizer.bind(Parser$2);
const parse$1 = Parser$2.parse.bind(Parser$2);

// Copyright 2020 The Chromium Authors
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_CODES = new Uint8Array(123);
for (let index = 0; index < BASE64_CHARS.length; ++index) {
    BASE64_CODES[BASE64_CHARS.charCodeAt(index)] = index;
}

// Copyright 2022 The Chromium Authors
const D50_X = 0.9642;
const D50_Y = 1.0;
const D50_Z = 0.8251;
class Vector3 {
    values = [0, 0, 0];
    constructor(values) {
        if (values) {
            this.values = values;
        }
    }
}
class Matrix3x3 {
    values = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    constructor(values) {
        if (values) {
            this.values = values;
        }
    }
    multiply(other) {
        const dst = new Vector3();
        for (let row = 0; row < 3; ++row) {
            dst.values[row] = this.values[row][0] * other.values[0] + this.values[row][1] * other.values[1] +
                this.values[row][2] * other.values[2];
        }
        return dst;
    }
}
class TransferFunction {
    g;
    a;
    b;
    c;
    d;
    e;
    f;
    constructor(g, a, b = 0, c = 0, d = 0, e = 0, f = 0) {
        this.g = g;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
    }
    eval(val) {
        const sign = val < 0 ? -1 : 1.0;
        const abs = val * sign;
        if (abs < this.d) {
            return sign * (this.c * abs + this.f);
        }
        return sign * (Math.pow(this.a * abs + this.b, this.g) + this.e);
    }
}
const NAMED_TRANSFER_FN = {
    sRGB: new TransferFunction(2.4, (1 / 1.055), (0.055 / 1.055), (1 / 12.92), 0.04045, 0.0, 0.0),
    sRGB_INVERSE: new TransferFunction(0.416667, 1.13728, -0, 12.92, 0.0031308, -0.0549698, -0),
    proPhotoRGB: new TransferFunction(1.8, 1),
    proPhotoRGB_INVERSE: new TransferFunction(0.555556, 1, -0, 0, 0, 0, 0),
    k2Dot2: new TransferFunction(2.2, 1.0),
    k2Dot2_INVERSE: new TransferFunction(0.454545, 1),
    rec2020: new TransferFunction(2.22222, 0.909672, 0.0903276, 0.222222, 0.0812429, 0, 0),
    rec2020_INVERSE: new TransferFunction(0.45, 1.23439, -0, 4.5, 0.018054, -0.0993195, -0),
};
const NAMED_GAMUTS = {
    sRGB: new Matrix3x3([
        [0.436065674, 0.385147095, 0.143066406],
        [0.222488403, 0.716873169, 0.060607910],
        [0.013916016, 0.097076416, 0.714096069],
    ]),
    sRGB_INVERSE: new Matrix3x3([
        [3.134112151374599, -1.6173924597114966, -0.4906334036481285],
        [-0.9787872938826594, 1.9162795854799963, 0.0334547139520088],
        [0.07198304248352326, -0.2289858493321844, 1.4053851325241447],
    ]),
    displayP3: new Matrix3x3([
        [0.515102, 0.291965, 0.157153],
        [0.241182, 0.692236, 0.0665819],
        [-104941e-8, 0.0418818, 0.784378],
    ]),
    displayP3_INVERSE: new Matrix3x3([
        [2.404045155982687, -0.9898986932663839, -0.3976317191366333],
        [-0.8422283799266768, 1.7988505115115485, 0.016048170293157416],
        [0.04818705979712955, -0.09737385156228891, 1.2735066448052303],
    ]),
    adobeRGB: new Matrix3x3([
        [0.60974, 0.20528, 0.14919],
        [0.31111, 0.62567, 0.06322],
        [0.01947, 0.06087, 0.74457],
    ]),
    adobeRGB_INVERSE: new Matrix3x3([
        [1.9625385510109137, -0.6106892546501431, -0.3413827467482388],
        [-0.9787580455521, 1.9161624707082339, 0.03341676594241408],
        [0.028696263137883395, -0.1406807819331586, 1.349252109991369],
    ]),
    rec2020: new Matrix3x3([
        [0.673459, 0.165661, 0.125100],
        [0.279033, 0.675338, 0.0456288],
        [-193139e-8, 0.0299794, 0.797162],
    ]),
    rec2020_INVERSE: new Matrix3x3([
        [1.647275201661012, -0.3936024771460771, -0.23598028884792507],
        [-0.6826176165196962, 1.647617775014935, 0.01281626807852422],
        [0.029662725298529837, -0.06291668721366285, 1.2533964313435522],
    ])};
function degToRad(deg) {
    return deg * (Math.PI / 180);
}
function radToDeg(rad) {
    return rad * (180 / Math.PI);
}
function applyTransferFns(fn, r, g, b) {
    return [fn.eval(r), fn.eval(g), fn.eval(b)];
}
const OKLAB_TO_LMS_MATRIX = new Matrix3x3([
    [0.99999999845051981432, 0.39633779217376785678, 0.21580375806075880339],
    [1.0000000088817607767, -0.10556134232365635, -0.06385417477170591],
    [1.0000000546724109177, -0.08948418209496575, -1.2914855378640917],
]);
const LMS_TO_OKLAB_MATRIX = new Matrix3x3([
    [0.2104542553, 0.7936177849999999, -0.0040720468],
    [1.9779984951000003, -2.4285922049999997, 0.4505937099000001],
    [0.025904037099999982, 0.7827717662, -0.8086757660000001],
]);
const XYZ_TO_LMS_MATRIX = new Matrix3x3([
    [0.8190224432164319, 0.3619062562801221, -0.12887378261216414],
    [0.0329836671980271, 0.9292868468965546, 0.03614466816999844],
    [0.048177199566046255, 0.26423952494422764, 0.6335478258136937],
]);
const LMS_TO_XYZ_MATRIX = new Matrix3x3([
    [1.226879873374156, -0.5578149965554814, 0.2813910501772159],
    [-0.040575762624313734, 1.1122868293970596, -0.07171106666151703],
    [-0.07637294974672144, -0.4214933239627915, 1.586924024427242],
]);
const PRO_PHOTO_TO_XYZD50_MATRIX = new Matrix3x3([
    [0.7976700747153241, 0.13519395152800417, 0.03135596341127167],
    [0.28803902352472205, 0.7118744007923554, 0.00008661179538844252],
    [2.739876695467402e-7, -14405226518969991e-22, 0.825211112593861],
]);
const XYZD50_TO_PRO_PHOTO_MATRIX = new Matrix3x3([
    [1.3459533710138858, -0.25561367037652133, -0.051116041522131374],
    [-0.544600415668951, 1.5081687311475767, 0.020535163968720935],
    [-13975622054109725e-22, 0.000002717590904589903, 1.2118111696814942],
]);
const XYZD65_TO_XYZD50_MATRIX = new Matrix3x3([
    [1.0478573189120088, 0.022907374491829943, -0.050162247377152525],
    [0.029570500050499514, 0.9904755577034089, -0.017061518194840468],
    [-0.00924047197558879, 0.015052921526981566, 0.7519708530777581],
]);
const XYZD50_TO_XYZD65_MATRIX = new Matrix3x3([
    [0.9555366447632887, -0.02306009252137888, 0.06321844147263304],
    [-0.028315378228764922, 1.009951351591575, 0.021026001591792402],
    [0.012308773293784308, -0.02050053471777469, 1.3301947294775631],
]);
class ColorConverter {
    static labToXyzd50(l, a, b) {
        let y = (l + 16.0) / 116.0;
        let x = y + a / 500.0;
        let z = y - b / 200.0;
        function labInverseTransferFunction(t) {
            const delta = (24.0 / 116.0);
            if (t <= delta) {
                return (108.0 / 841.0) * (t - (16.0 / 116.0));
            }
            return t * t * t;
        }
        x = labInverseTransferFunction(x) * D50_X;
        y = labInverseTransferFunction(y) * D50_Y;
        z = labInverseTransferFunction(z) * D50_Z;
        return [x, y, z];
    }
    static xyzd50ToLab(x, y, z) {
        function labTransferFunction(t) {
            const deltaLimit = (24.0 / 116.0) * (24.0 / 116.0) * (24.0 / 116.0);
            if (t <= deltaLimit) {
                return (841.0 / 108.0) * t + (16.0 / 116.0);
            }
            return Math.pow(t, 1.0 / 3.0);
        }
        x = labTransferFunction(x / D50_X);
        y = labTransferFunction(y / D50_Y);
        z = labTransferFunction(z / D50_Z);
        const l = 116.0 * y - 16.0;
        const a = 500.0 * (x - y);
        const b = 200.0 * (y - z);
        return [l, a, b];
    }
    static oklabToXyzd65(l, a, b) {
        const labInput = new Vector3([l, a, b]);
        const lmsIntermediate = OKLAB_TO_LMS_MATRIX.multiply(labInput);
        lmsIntermediate.values[0] = lmsIntermediate.values[0] * lmsIntermediate.values[0] * lmsIntermediate.values[0];
        lmsIntermediate.values[1] = lmsIntermediate.values[1] * lmsIntermediate.values[1] * lmsIntermediate.values[1];
        lmsIntermediate.values[2] = lmsIntermediate.values[2] * lmsIntermediate.values[2] * lmsIntermediate.values[2];
        const xyzOutput = LMS_TO_XYZ_MATRIX.multiply(lmsIntermediate);
        return xyzOutput.values;
    }
    static xyzd65ToOklab(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const lmsIntermediate = XYZ_TO_LMS_MATRIX.multiply(xyzInput);
        lmsIntermediate.values[0] = Math.cbrt(lmsIntermediate.values[0]);
        lmsIntermediate.values[1] = Math.cbrt(lmsIntermediate.values[1]);
        lmsIntermediate.values[2] = Math.cbrt(lmsIntermediate.values[2]);
        const labOutput = LMS_TO_OKLAB_MATRIX.multiply(lmsIntermediate);
        return [labOutput.values[0], labOutput.values[1], labOutput.values[2]];
    }
    static lchToLab(l, c, h) {
        if (h === undefined) {
            return [l, 0, 0];
        }
        return [l, c * Math.cos(degToRad(h)), c * Math.sin(degToRad(h))];
    }
    static labToLch(l, a, b) {
        return [l, Math.sqrt(a * a + b * b), radToDeg(Math.atan2(b, a))];
    }
    static displayP3ToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.sRGB, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.displayP3.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToDisplayP3(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.displayP3_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.sRGB_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static displayP3LinearToXyzd50(r, g, b) {
        const rgbInput = new Vector3([r, g, b]);
        const xyzOutput = NAMED_GAMUTS.displayP3.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToDisplayP3Linear(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbResult = NAMED_GAMUTS.displayP3_INVERSE.multiply(xyzInput);
        return rgbResult.values;
    }
    static proPhotoToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.proPhotoRGB, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = PRO_PHOTO_TO_XYZD50_MATRIX.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToProPhoto(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = XYZD50_TO_PRO_PHOTO_MATRIX.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.proPhotoRGB_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static adobeRGBToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.k2Dot2, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.adobeRGB.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToAdobeRGB(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.adobeRGB_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.k2Dot2_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static rec2020ToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.rec2020, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.rec2020.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToRec2020(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.rec2020_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.rec2020_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static xyzd50ToD65(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const xyzOutput = XYZD50_TO_XYZD65_MATRIX.multiply(xyzInput);
        return xyzOutput.values;
    }
    static xyzd65ToD50(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const xyzOutput = XYZD65_TO_XYZD50_MATRIX.multiply(xyzInput);
        return xyzOutput.values;
    }
    static xyzd50TosRGBLinear(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbResult = NAMED_GAMUTS.sRGB_INVERSE.multiply(xyzInput);
        return rgbResult.values;
    }
    static srgbLinearToXyzd50(r, g, b) {
        const rgbInput = new Vector3([r, g, b]);
        const xyzOutput = NAMED_GAMUTS.sRGB.multiply(rgbInput);
        return xyzOutput.values;
    }
    static srgbToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.sRGB, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.sRGB.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToSrgb(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.sRGB_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.sRGB_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static oklchToXyzd50(lInput, c, h) {
        const [l, a, b] = ColorConverter.lchToLab(lInput, c, h);
        const [x65, y65, z65] = ColorConverter.oklabToXyzd65(l, a, b);
        return ColorConverter.xyzd65ToD50(x65, y65, z65);
    }
    static xyzd50ToOklch(x, y, z) {
        const [x65, y65, z65] = ColorConverter.xyzd50ToD65(x, y, z);
        const [l, a, b] = ColorConverter.xyzd65ToOklab(x65, y65, z65);
        return ColorConverter.labToLch(l, a, b);
    }
}

// Copyright 2020 The Chromium Authors
function blendColors(fgRGBA, bgRGBA) {
    const alpha = fgRGBA[3];
    return [
        ((1 - alpha) * bgRGBA[0]) + (alpha * fgRGBA[0]),
        ((1 - alpha) * bgRGBA[1]) + (alpha * fgRGBA[1]),
        ((1 - alpha) * bgRGBA[2]) + (alpha * fgRGBA[2]),
        alpha + (bgRGBA[3] * (1 - alpha)),
    ];
}
function rgbToHue([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    let h;
    if (min === max) {
        h = 0;
    }
    else if (r === max) {
        h = ((1 / 6 * (g - b) / diff) + 1) % 1;
    }
    else if (g === max) {
        h = (1 / 6 * (b - r) / diff) + 1 / 3;
    }
    else {
        h = (1 / 6 * (r - g) / diff) + 2 / 3;
    }
    return h;
}
function rgbToHsl(rgb) {
    const [h, s, l] = rgbaToHsla([...rgb, undefined]);
    return [h, s, l];
}
function rgbaToHsla([r, g, b, a]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const sum = max + min;
    const h = rgbToHue([r, g, b]);
    const l = 0.5 * sum;
    let s;
    if (l === 0) {
        s = 0;
    }
    else if (l === 1) {
        s = 0;
    }
    else if (l <= 0.5) {
        s = diff / sum;
    }
    else {
        s = diff / (2 - sum);
    }
    return [h, s, l, a];
}
function rgbToHwb(rgb) {
    const [h, w, b] = rgbaToHwba([...rgb, undefined]);
    return [h, w, b];
}
function rgbaToHwba([r, g, b, a]) {
    const h = rgbToHue([r, g, b]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return [h, min, 1 - max, a];
}

// Copyright 2021 The Chromium Authors
/*
 * Copyright (C) 2009 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function normalizeHue(hue) {
    return ((hue % 360) + 360) % 360;
}
function parseAngle(angleText) {
    const angle = angleText.replace(/(deg|g?rad|turn)$/, '');
    if (isNaN(angle) || angleText.match(/\s+(deg|g?rad|turn)/)) {
        return null;
    }
    const number = parseFloat(angle);
    if (angleText.includes('turn')) {
        return number * 360;
    }
    if (angleText.includes('grad')) {
        return number * 9 / 10;
    }
    if (angleText.includes('rad')) {
        return number * 180 / Math.PI;
    }
    return number;
}
function getColorSpace(colorSpaceText) {
    switch (colorSpaceText) {
        case "srgb" :
            return "srgb" ;
        case "srgb-linear" :
            return "srgb-linear" ;
        case "display-p3" :
            return "display-p3" ;
        case "display-p3-linear" :
            return "display-p3-linear" ;
        case "a98-rgb" :
            return "a98-rgb" ;
        case "prophoto-rgb" :
            return "prophoto-rgb" ;
        case "rec2020" :
            return "rec2020" ;
        case "xyz" :
            return "xyz" ;
        case "xyz-d50" :
            return "xyz-d50" ;
        case "xyz-d65" :
            return "xyz-d65" ;
    }
    return null;
}
function mapPercentToRange(percent, range) {
    const sign = Math.sign(percent);
    const absPercent = Math.abs(percent);
    const [outMin, outMax] = range;
    return sign * (absPercent * (outMax - outMin) / 100 + outMin);
}
function clamp(value, { min, max }) {
    if (value === null) {
        return value;
    }
    {
        value = Math.max(value, min);
    }
    if (max !== undefined) {
        value = Math.min(value, max);
    }
    return value;
}
function parsePercentage(value, range) {
    if (!value.endsWith('%')) {
        return null;
    }
    const percentage = parseFloat(value.substr(0, value.length - 1));
    return isNaN(percentage) ? null : mapPercentToRange(percentage, range);
}
function parseNumber(value) {
    const number = parseFloat(value);
    return isNaN(number) ? null : number;
}
function parseAlpha(value) {
    if (value === undefined) {
        return null;
    }
    return clamp(parsePercentage(value, [0, 1]) ?? parseNumber(value), { min: 0, max: 1 });
}
function parsePercentOrNumber(value, range = [0, 1]) {
    if (isNaN(value.replace('%', ''))) {
        return null;
    }
    const parsed = parseFloat(value);
    if (value.indexOf('%') !== -1) {
        if (value.indexOf('%') !== value.length - 1) {
            return null;
        }
        return mapPercentToRange(parsed, range);
    }
    return parsed;
}
function parseRgbNumeric(value) {
    const parsed = parsePercentOrNumber(value);
    if (parsed === null) {
        return null;
    }
    if (value.indexOf('%') !== -1) {
        return parsed;
    }
    return parsed / 255;
}
function parseHueNumeric(value) {
    const angle = value.replace(/(deg|g?rad|turn)$/, '');
    if (isNaN(angle) || value.match(/\s+(deg|g?rad|turn)/)) {
        return null;
    }
    const number = parseFloat(angle);
    if (value.indexOf('turn') !== -1) {
        return number % 1;
    }
    if (value.indexOf('grad') !== -1) {
        return (number / 400) % 1;
    }
    if (value.indexOf('rad') !== -1) {
        return (number / (2 * Math.PI)) % 1;
    }
    return (number / 360) % 1;
}
function parseSatLightNumeric(value) {
    if (value.indexOf('%') !== value.length - 1 || isNaN(value.replace('%', ''))) {
        return null;
    }
    const parsed = parseFloat(value);
    return parsed / 100;
}
function parseAlphaNumeric(value) {
    return parsePercentOrNumber(value);
}
function hsva2hsla(hsva) {
    const h = hsva[0];
    let s = hsva[1];
    const v = hsva[2];
    const t = (2 - s) * v;
    if (v === 0 || s === 0) {
        s = 0;
    }
    else {
        s *= v / (t < 1 ? t : 2 - t);
    }
    return [h, s, t / 2, hsva[3]];
}
function hsl2rgb(hsl) {
    const h = hsl[0];
    let s = hsl[1];
    const l = hsl[2];
    function hue2rgb(p, q, h) {
        if (h < 0) {
            h += 1;
        }
        else if (h > 1) {
            h -= 1;
        }
        if ((h * 6) < 1) {
            return p + (q - p) * h * 6;
        }
        if ((h * 2) < 1) {
            return q;
        }
        if ((h * 3) < 2) {
            return p + (q - p) * ((2 / 3) - h) * 6;
        }
        return p;
    }
    if (s < 0) {
        s = 0;
    }
    let q;
    if (l <= 0.5) {
        q = l * (1 + s);
    }
    else {
        q = l + s - (l * s);
    }
    const p = 2 * l - q;
    const tr = h + (1 / 3);
    const tg = h;
    const tb = h - (1 / 3);
    return [hue2rgb(p, q, tr), hue2rgb(p, q, tg), hue2rgb(p, q, tb), hsl[3]];
}
function hwb2rgb(hwb) {
    const h = hwb[0];
    const w = hwb[1];
    const b = hwb[2];
    const whiteRatio = w / (w + b);
    let result = [whiteRatio, whiteRatio, whiteRatio, hwb[3]];
    if (w + b < 1) {
        result = hsl2rgb([h, 1, 0.5, hwb[3]]);
        for (let i = 0; i < 3; ++i) {
            result[i] += w - (w + b) * result[i];
        }
    }
    return result;
}
function hsva2rgba(hsva) {
    return hsl2rgb(hsva2hsla(hsva));
}
const EPSILON = 0.01;
const WIDE_RANGE_EPSILON = 1;
const STRICT_EPSILON = 1e-4;
function equals(a, b, accuracy = EPSILON) {
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (const i in a) {
            if (!equals(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return false;
    }
    if (a === null || b === null) {
        return a === b;
    }
    return Math.abs(a - b) < accuracy;
}
function lessOrEquals(a, b, accuracy = EPSILON) {
    return a - b <= accuracy;
}
class Lab {
    l;
    a;
    b;
    alpha;
    #authoredText;
    #rawParams;
    channels = ["l" , "a" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(self.l, self.a, self.b), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => self,
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.labToXyzd50(this.l, this.a, this.b);
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, a, b, alpha, authoredText) {
        this.#rawParams = [l, a, b];
        this.l = clamp(l, { min: 0, max: 100 });
        if (equals(this.l, 0, WIDE_RANGE_EPSILON) || equals(this.l, 100, WIDE_RANGE_EPSILON)) {
            a = b = 0;
        }
        this.a = a;
        this.b = b;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return Lab.#conversions[format](this);
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    equal(color) {
        const lab = color.as("lab" );
        return equals(lab.l, this.l, WIDE_RANGE_EPSILON) && equals(lab.a, this.a) && equals(lab.b, this.b) &&
            equals(lab.alpha, this.alpha);
    }
    format() {
        return "lab" ;
    }
    setAlpha(alpha) {
        return new Lab(this.l, this.a, this.b, alpha, undefined);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.a, this.b);
    }
    #stringify(l, a, b) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `lab(${stringifyWithPrecision(l, 0)} ${stringifyWithPrecision(a)} ${stringifyWithPrecision(b)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 100]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const a = parsePercentage(spec[1], [0, 125]) ?? parseNumber(spec[1]);
        if (a === null) {
            return null;
        }
        const b = parsePercentage(spec[2], [0, 125]) ?? parseNumber(spec[2]);
        if (b === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new Lab(L, a, b, alpha, text);
    }
}
class LCH {
    #rawParams;
    l;
    c;
    h;
    alpha;
    #authoredText;
    channels = ["l" , "c" , "h" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => self,
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.lchToLab(self.l, self.c, self.h), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.labToXyzd50(...ColorConverter.lchToLab(this.l, this.c, this.h));
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, c, h, alpha, authoredText) {
        this.#rawParams = [l, c, h];
        this.l = clamp(l, { min: 0, max: 100 });
        c = equals(this.l, 0, WIDE_RANGE_EPSILON) || equals(this.l, 100, WIDE_RANGE_EPSILON) ? 0 : c;
        this.c = clamp(c, { min: 0 });
        h = equals(c, 0) ? 0 : h;
        this.h = normalizeHue(h);
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return LCH.#conversions[format](this);
    }
    equal(color) {
        const lch = color.as("lch" );
        return equals(lch.l, this.l, WIDE_RANGE_EPSILON) && equals(lch.c, this.c) && equals(lch.h, this.h) &&
            equals(lch.alpha, this.alpha);
    }
    format() {
        return "lch" ;
    }
    setAlpha(alpha) {
        return new LCH(this.l, this.c, this.h, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.c, this.h);
    }
    #stringify(l, c, h) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `lch(${stringifyWithPrecision(l, 0)} ${stringifyWithPrecision(c)} ${stringifyWithPrecision(h)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    isHuePowerless() {
        return equals(this.c, 0, STRICT_EPSILON);
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 100]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const c = parsePercentage(spec[1], [0, 150]) ?? parseNumber(spec[1]);
        if (c === null) {
            return null;
        }
        const h = parseAngle(spec[2]);
        if (h === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new LCH(L, c, h, alpha, text);
    }
}
class Oklab {
    #rawParams;
    l;
    a;
    b;
    alpha;
    #authoredText;
    channels = ["l" , "a" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => self,
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.xyzd65ToD50(...ColorConverter.oklabToXyzd65(this.l, this.a, this.b));
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, a, b, alpha, authoredText) {
        this.#rawParams = [l, a, b];
        this.l = clamp(l, { min: 0, max: 1 });
        if (equals(this.l, 0) || equals(this.l, 1)) {
            a = b = 0;
        }
        this.a = a;
        this.b = b;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return Oklab.#conversions[format](this);
    }
    equal(color) {
        const oklab = color.as("oklab" );
        return equals(oklab.l, this.l) && equals(oklab.a, this.a) && equals(oklab.b, this.b) &&
            equals(oklab.alpha, this.alpha);
    }
    format() {
        return "oklab" ;
    }
    setAlpha(alpha) {
        return new Oklab(this.l, this.a, this.b, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.a, this.b);
    }
    #stringify(l, a, b) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `oklab(${stringifyWithPrecision(l)} ${stringifyWithPrecision(a)} ${stringifyWithPrecision(b)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 1]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const a = parsePercentage(spec[1], [0, 0.4]) ?? parseNumber(spec[1]);
        if (a === null) {
            return null;
        }
        const b = parsePercentage(spec[2], [0, 0.4]) ?? parseNumber(spec[2]);
        if (b === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new Oklab(L, a, b, alpha, text);
    }
}
class Oklch {
    #rawParams;
    l;
    c;
    h;
    alpha;
    #authoredText;
    channels = ["l" , "c" , "h" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => self,
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.oklchToXyzd50(this.l, this.c, this.h);
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, c, h, alpha, authoredText) {
        this.#rawParams = [l, c, h];
        this.l = clamp(l, { min: 0, max: 1 });
        c = equals(this.l, 0) || equals(this.l, 1) ? 0 : c;
        this.c = clamp(c, { min: 0 });
        h = equals(c, 0) ? 0 : h;
        this.h = normalizeHue(h);
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return Oklch.#conversions[format](this);
    }
    equal(color) {
        const oklch = color.as("oklch" );
        return equals(oklch.l, this.l) && equals(oklch.c, this.c) && equals(oklch.h, this.h) &&
            equals(oklch.alpha, this.alpha);
    }
    format() {
        return "oklch" ;
    }
    setAlpha(alpha) {
        return new Oklch(this.l, this.c, this.h, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.c, this.h);
    }
    #stringify(l, c, h) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `oklch(${stringifyWithPrecision(l)} ${stringifyWithPrecision(c)} ${stringifyWithPrecision(h)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 1]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const c = parsePercentage(spec[1], [0, 0.4]) ?? parseNumber(spec[1]);
        if (c === null) {
            return null;
        }
        const h = parseAngle(spec[2]);
        if (h === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new Oklch(L, c, h, alpha, text);
    }
}
class ColorFunction {
    #rawParams;
    p0;
    p1;
    p2;
    alpha;
    colorSpace;
    #authoredText;
    get channels() {
        return this.isXYZ() ? ["x" , "y" , "z" , "alpha" ] :
            ["r" , "g" , "b" , "alpha" ];
    }
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        const [p0, p1, p2] = this.#rawParams;
        switch (this.colorSpace) {
            case "srgb" :
                return ColorConverter.srgbToXyzd50(p0, p1, p2);
            case "srgb-linear" :
                return ColorConverter.srgbLinearToXyzd50(p0, p1, p2);
            case "display-p3" :
                return ColorConverter.displayP3ToXyzd50(p0, p1, p2);
            case "display-p3-linear" :
                return ColorConverter.displayP3LinearToXyzd50(p0, p1, p2);
            case "a98-rgb" :
                return ColorConverter.adobeRGBToXyzd50(p0, p1, p2);
            case "prophoto-rgb" :
                return ColorConverter.proPhotoToXyzd50(p0, p1, p2);
            case "rec2020" :
                return ColorConverter.rec2020ToXyzd50(p0, p1, p2);
            case "xyz-d50" :
                return [p0, p1, p2];
            case "xyz" :
            case "xyz-d65" :
                return ColorConverter.xyzd65ToD50(p0, p1, p2);
        }
        throw new Error('Invalid color space');
    }
    #getRGBArray(withAlpha = true) {
        const [p0, p1, p2] = this.#rawParams;
        const params = this.colorSpace === "srgb"  ? [p0, p1, p2] : [...ColorConverter.xyzd50ToSrgb(...this.#toXyzd50())];
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(colorSpace, p0, p1, p2, alpha, authoredText) {
        this.#rawParams = [p0, p1, p2];
        this.colorSpace = colorSpace;
        this.#authoredText = authoredText;
        if (this.colorSpace !== "xyz-d50"  && this.colorSpace !== "xyz-d65"  && this.colorSpace !== "xyz" ) {
            p0 = clamp(p0, { min: 0, max: 1 });
            p1 = clamp(p1, { min: 0, max: 1 });
            p2 = clamp(p2, { min: 0, max: 1 });
        }
        this.p0 = p0;
        this.p1 = p1;
        this.p2 = p2;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (this.colorSpace === format) {
            return this;
        }
        return ColorFunction.#conversions[format](this);
    }
    equal(color) {
        const space = color.as(this.colorSpace);
        return equals(this.p0, space.p0) && equals(this.p1, space.p1) && equals(this.p2, space.p2) &&
            equals(this.alpha, space.alpha);
    }
    format() {
        return this.colorSpace;
    }
    setAlpha(alpha) {
        return new ColorFunction(this.colorSpace, this.p0, this.p1, this.p2, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.p0, this.p1, this.p2);
    }
    #stringify(p0, p1, p2) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `color(${this.colorSpace} ${stringifyWithPrecision(p0)} ${stringifyWithPrecision(p1)} ${stringifyWithPrecision(p2)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        if (this.colorSpace !== "xyz-d50"  && this.colorSpace !== "xyz-d65"  && this.colorSpace !== "xyz" ) {
            return !equals(this.#rawParams, [this.p0, this.p1, this.p2]);
        }
        return false;
    }
    isXYZ() {
        switch (this.colorSpace) {
            case "xyz" :
            case "xyz-d50" :
            case "xyz-d65" :
                return true;
        }
        return false;
    }
    static fromSpec(authoredText, parametersWithAlphaText) {
        const [parametersText, alphaText] = parametersWithAlphaText.split('/', 2);
        const parameters = parametersText.trim().split(/\s+/);
        const [colorSpaceText, ...remainingParams] = parameters;
        const colorSpace = getColorSpace(colorSpaceText);
        if (!colorSpace) {
            return null;
        }
        if (remainingParams.length === 0 && alphaText === undefined) {
            return new ColorFunction(colorSpace, 0, 0, 0, null, authoredText);
        }
        if (remainingParams.length === 0 && alphaText !== undefined && alphaText.trim().split(/\s+/).length > 1) {
            return null;
        }
        if (remainingParams.length > 3) {
            return null;
        }
        const nonesReplacedParams = remainingParams.map(param => param === 'none' ? '0' : param);
        const values = nonesReplacedParams.map(param => parsePercentOrNumber(param, [0, 1]));
        const containsNull = values.includes(null);
        if (containsNull) {
            return null;
        }
        const alphaValue = alphaText ? parsePercentOrNumber(alphaText, [0, 1]) ?? 1 : 1;
        const rgbOrXyza = [
            values[0] ?? 0,
            values[1] ?? 0,
            values[2] ?? 0,
            alphaValue,
        ];
        return new ColorFunction(colorSpace, ...rgbOrXyza, authoredText);
    }
}
class HSL {
    h;
    s;
    l;
    alpha;
    #rawParams;
    #authoredText;
    channels = ["h" , "s" , "l" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => self,
        ["hsla" ]: (self) => self,
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #getRGBArray(withAlpha = true) {
        const rgb = hsl2rgb([this.h, this.s, this.l, 0]);
        if (withAlpha) {
            return [rgb[0], rgb[1], rgb[2], this.alpha ?? undefined];
        }
        return [rgb[0], rgb[1], rgb[2]];
    }
    #toXyzd50() {
        const rgb = this.#getRGBArray(false);
        return ColorConverter.srgbToXyzd50(rgb[0], rgb[1], rgb[2]);
    }
    constructor(h, s, l, alpha, authoredText) {
        this.#rawParams = [h, s, l];
        this.l = clamp(l, { min: 0, max: 1 });
        s = equals(this.l, 0) || equals(this.l, 1) ? 0 : s;
        this.s = clamp(s, { min: 0, max: 1 });
        h = equals(this.s, 0, STRICT_EPSILON) ? 0 : h;
        this.h = normalizeHue(h * 360) / 360;
        this.alpha = clamp(alpha ?? null, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    equal(color) {
        const hsl = color.as("hsl" );
        return equals(this.h, hsl.h) && equals(this.s, hsl.s) && equals(this.l, hsl.l) && equals(this.alpha, hsl.alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.h, this.s, this.l);
    }
    #stringify(h, s, l) {
        const start = sprintf('hsl(%sdeg %s% %s%', stringifyWithPrecision(h * 360), stringifyWithPrecision(s * 100), stringifyWithPrecision(l * 100));
        if (this.alpha !== null && this.alpha !== 1) {
            return start +
                sprintf(' / %s%)', stringifyWithPrecision(this.alpha * 100));
        }
        return start + ')';
    }
    setAlpha(alpha) {
        return new HSL(this.h, this.s, this.l, alpha);
    }
    format() {
        return this.alpha === null || this.alpha === 1 ? "hsl"  : "hsla" ;
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (format === this.format()) {
            return this;
        }
        return HSL.#conversions[format](this);
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return !lessOrEquals(this.#rawParams[1], 1) || !lessOrEquals(0, this.#rawParams[1]);
    }
    static fromSpec(spec, text) {
        const h = parseHueNumeric(spec[0]);
        if (h === null) {
            return null;
        }
        const s = parseSatLightNumeric(spec[1]);
        if (s === null) {
            return null;
        }
        const l = parseSatLightNumeric(spec[2]);
        if (l === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new HSL(h, s, l, alpha, text);
    }
    hsva() {
        const s = this.s * (this.l < 0.5 ? this.l : 1 - this.l);
        return [this.h, s !== 0 ? 2 * s / (this.l + s) : 0, (this.l + s), this.alpha ?? 1];
    }
    canonicalHSLA() {
        return [Math.round(this.h * 360), Math.round(this.s * 100), Math.round(this.l * 100), this.alpha ?? 1];
    }
}
class HWB {
    h;
    w;
    b;
    alpha;
    #rawParams;
    #authoredText;
    channels = ["h" , "w" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => self,
        ["hwba" ]: (self) => self,
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #getRGBArray(withAlpha = true) {
        const rgb = hwb2rgb([this.h, this.w, this.b, 0]);
        if (withAlpha) {
            return [rgb[0], rgb[1], rgb[2], this.alpha ?? undefined];
        }
        return [rgb[0], rgb[1], rgb[2]];
    }
    #toXyzd50() {
        const rgb = this.#getRGBArray(false);
        return ColorConverter.srgbToXyzd50(rgb[0], rgb[1], rgb[2]);
    }
    constructor(h, w, b, alpha, authoredText) {
        this.#rawParams = [h, w, b];
        this.w = clamp(w, { min: 0, max: 1 });
        this.b = clamp(b, { min: 0, max: 1 });
        h = lessOrEquals(1, this.w + this.b) ? 0 : h;
        this.h = normalizeHue(h * 360) / 360;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        if (lessOrEquals(1, this.w + this.b)) {
            const ratio = this.w / this.b;
            this.b = 1 / (1 + ratio);
            this.w = 1 - this.b;
        }
        this.#authoredText = authoredText;
    }
    equal(color) {
        const hwb = color.as("hwb" );
        return equals(this.h, hwb.h) && equals(this.w, hwb.w) && equals(this.b, hwb.b) && equals(this.alpha, hwb.alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.h, this.w, this.b);
    }
    #stringify(h, w, b) {
        const start = sprintf('hwb(%sdeg %s% %s%', stringifyWithPrecision(h * 360), stringifyWithPrecision(w * 100), stringifyWithPrecision(b * 100));
        if (this.alpha !== null && this.alpha !== 1) {
            return start +
                sprintf(' / %s%)', stringifyWithPrecision(this.alpha * 100));
        }
        return start + ')';
    }
    setAlpha(alpha) {
        return new HWB(this.h, this.w, this.b, alpha, this.#authoredText);
    }
    format() {
        return this.alpha !== null && !equals(this.alpha, 1) ? "hwba"  : "hwb" ;
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (format === this.format()) {
            return this;
        }
        return HWB.#conversions[format](this);
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    canonicalHWBA() {
        return [
            Math.round(this.h * 360),
            Math.round(this.w * 100),
            Math.round(this.b * 100),
            this.alpha ?? 1,
        ];
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return !lessOrEquals(this.#rawParams[1], 1) || !lessOrEquals(0, this.#rawParams[1]) ||
            !lessOrEquals(this.#rawParams[2], 1) || !lessOrEquals(0, this.#rawParams[2]);
    }
    static fromSpec(spec, text) {
        const h = parseHueNumeric(spec[0]);
        if (h === null) {
            return null;
        }
        const w = parseSatLightNumeric(spec[1]);
        if (w === null) {
            return null;
        }
        const b = parseSatLightNumeric(spec[2]);
        if (b === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new HWB(h, w, b, alpha, text);
    }
}
function toRgbValue(value) {
    return Math.round(value * 255);
}
class ShortFormatColorBase {
    color;
    channels = ["r" , "g" , "b" , "alpha" ];
    constructor(color) {
        this.color = color;
    }
    get alpha() {
        return this.color.alpha;
    }
    rgba() {
        return this.color.rgba();
    }
    equal(color) {
        return this.color.equal(color);
    }
    setAlpha(alpha) {
        return this.color.setAlpha(alpha);
    }
    format() {
        return (this.alpha ?? 1) !== 1 ? "hexa"  : "hex" ;
    }
    as(format) {
        return this.color.as(format);
    }
    is(format) {
        return this.color.is(format);
    }
    asLegacyColor() {
        return this.color.asLegacyColor();
    }
    getAuthoredText() {
        return this.color.getAuthoredText();
    }
    getRawParameters() {
        return this.color.getRawParameters();
    }
    isGamutClipped() {
        return this.color.isGamutClipped();
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        const [r, g, b] = this.color.rgba();
        return this.stringify(r, g, b);
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        const [r, g, b] = this.getRawParameters();
        return this.stringify(r, g, b);
    }
}
class ShortHex extends ShortFormatColorBase {
    setAlpha(alpha) {
        return new ShortHex(this.color.setAlpha(alpha));
    }
    asString(format) {
        return format && format !== this.format() ? super.as(format).asString() : super.asString();
    }
    stringify(r, g, b) {
        function toShortHexValue(value) {
            return (Math.round(value * 255) / 17).toString(16);
        }
        if (this.color.hasAlpha()) {
            return sprintf('#%s%s%s%s', toShortHexValue(r), toShortHexValue(g), toShortHexValue(b), toShortHexValue(this.alpha ?? 1))
                .toLowerCase();
        }
        return sprintf('#%s%s%s', toShortHexValue(r), toShortHexValue(g), toShortHexValue(b))
            .toLowerCase();
    }
}
class Nickname extends ShortFormatColorBase {
    nickname;
    constructor(nickname, color) {
        super(color);
        this.nickname = nickname;
    }
    static fromName(name, text) {
        const nickname = name.toLowerCase();
        const rgba = Nicknames.get(nickname);
        if (rgba !== undefined) {
            return new Nickname(nickname, Legacy.fromRGBA(rgba, text));
        }
        return null;
    }
    stringify() {
        return this.nickname;
    }
    getAsRawString(format) {
        return this.color.getAsRawString(format);
    }
}
class Legacy {
    #rawParams;
    #rgba;
    #authoredText;
    #format;
    channels = ["r" , "g" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#rgba, "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#rgba, "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#rgba, "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#rgba, "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        const [r, g, b] = this.#rgba;
        return ColorConverter.srgbToXyzd50(r, g, b);
    }
    get alpha() {
        switch (this.format()) {
            case "hexa" :
            case "rgba" :
                return this.#rgba[3];
            default:
                return null;
        }
    }
    asLegacyColor() {
        return this;
    }
    nickname() {
        const nickname = RGBAToNickname.get(String(this.canonicalRGBA()));
        return nickname ? new Nickname(nickname, this) : null;
    }
    shortHex() {
        for (let i = 0; i < 4; ++i) {
            const c = Math.round(this.#rgba[i] * 255);
            if (c % 0x11) {
                return null;
            }
        }
        return new ShortHex(this);
    }
    constructor(rgba, format, authoredText) {
        this.#authoredText = authoredText || null;
        this.#format = format;
        this.#rawParams = [rgba[0], rgba[1], rgba[2]];
        this.#rgba = [
            clamp(rgba[0], { min: 0, max: 1 }),
            clamp(rgba[1], { min: 0, max: 1 }),
            clamp(rgba[2], { min: 0, max: 1 }),
            clamp(rgba[3] ?? 1, { min: 0, max: 1 }),
        ];
    }
    static fromHex(hex, text) {
        hex = hex.toLowerCase();
        const hasAlpha = hex.length === 4 || hex.length === 8;
        const format = hasAlpha ? "hexa"  : "hex" ;
        const isShort = hex.length <= 4;
        if (isShort) {
            hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) +
                hex.charAt(3) + hex.charAt(3);
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        let a = 1;
        if (hex.length === 8) {
            a = parseInt(hex.substring(6, 8), 16) / 255;
        }
        const color = new Legacy([r / 255, g / 255, b / 255, a], format, text);
        return isShort ? new ShortHex(color) : color;
    }
    static fromRGBAFunction(r, g, b, alpha, text) {
        const rgba = [
            parseRgbNumeric(r),
            parseRgbNumeric(g),
            parseRgbNumeric(b),
            alpha ? parseAlphaNumeric(alpha) : 1,
        ];
        if (!arrayDoesNotContainNullOrUndefined(rgba)) {
            return null;
        }
        return new Legacy(rgba, alpha ? "rgba"  : "rgb" , text);
    }
    static fromRGBA(rgba, authoredText) {
        return new Legacy([rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3]], "rgba" , authoredText);
    }
    static fromHSVA(hsva) {
        const rgba = hsva2rgba(hsva);
        return new Legacy(rgba, "rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (format === this.format()) {
            return this;
        }
        return Legacy.#conversions[format](this);
    }
    format() {
        return this.#format;
    }
    hasAlpha() {
        return this.#rgba[3] !== 1;
    }
    detectHEXFormat() {
        const hasAlpha = this.hasAlpha();
        return hasAlpha ? "hexa"  : "hex" ;
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(format, this.#rgba[0], this.#rgba[1], this.#rgba[2]);
    }
    #stringify(format, r, g, b) {
        if (!format) {
            format = this.#format;
        }
        function toHexValue(value) {
            const hex = Math.round(value * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }
        switch (format) {
            case "rgb" :
            case "rgba" : {
                const start = sprintf('rgb(%d %d %d', toRgbValue(r), toRgbValue(g), toRgbValue(b));
                if (this.hasAlpha()) {
                    return start + sprintf(' / %d%)', Math.round(this.#rgba[3] * 100));
                }
                return start + ')';
            }
            case "hex" :
            case "hexa" : {
                if (this.hasAlpha()) {
                    return sprintf('#%s%s%s%s', toHexValue(r), toHexValue(g), toHexValue(b), toHexValue(this.#rgba[3]))
                        .toLowerCase();
                }
                return sprintf('#%s%s%s', toHexValue(r), toHexValue(g), toHexValue(b)).toLowerCase();
            }
        }
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(format, ...this.#rawParams);
    }
    isGamutClipped() {
        return !equals(this.#rawParams.map(toRgbValue), [this.#rgba[0], this.#rgba[1], this.#rgba[2]].map(toRgbValue), WIDE_RANGE_EPSILON);
    }
    rgba() {
        return [...this.#rgba];
    }
    canonicalRGBA() {
        const rgba = new Array(4);
        for (let i = 0; i < 3; ++i) {
            rgba[i] = Math.round(this.#rgba[i] * 255);
        }
        rgba[3] = this.#rgba[3];
        return rgba;
    }
    toProtocolRGBA() {
        const rgba = this.canonicalRGBA();
        const result = { r: rgba[0], g: rgba[1], b: rgba[2] };
        if (rgba[3] !== 1) {
            result.a = rgba[3];
        }
        return result;
    }
    invert() {
        const rgba = [0, 0, 0, 0];
        rgba[0] = 1 - this.#rgba[0];
        rgba[1] = 1 - this.#rgba[1];
        rgba[2] = 1 - this.#rgba[2];
        rgba[3] = this.#rgba[3];
        return new Legacy(rgba, "rgba" );
    }
    grayscale() {
        const [r, g, b] = this.#rgba;
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        return new Legacy([gray, gray, gray, 0.5], "rgba" );
    }
    setAlpha(alpha) {
        const rgba = [...this.#rgba];
        rgba[3] = alpha;
        return new Legacy(rgba, "rgba" );
    }
    blendWith(fgColor) {
        const rgba = blendColors(fgColor.#rgba, this.#rgba);
        return new Legacy(rgba, "rgba" );
    }
    blendWithAlpha(alpha) {
        const rgba = [...this.#rgba];
        rgba[3] *= alpha;
        return new Legacy(rgba, "rgba" );
    }
    setFormat(format) {
        this.#format = format;
    }
    equal(other) {
        const legacy = other.as(this.#format);
        return equals(toRgbValue(this.#rgba[0]), toRgbValue(legacy.#rgba[0]), WIDE_RANGE_EPSILON) &&
            equals(toRgbValue(this.#rgba[1]), toRgbValue(legacy.#rgba[1]), WIDE_RANGE_EPSILON) &&
            equals(toRgbValue(this.#rgba[2]), toRgbValue(legacy.#rgba[2]), WIDE_RANGE_EPSILON) &&
            equals(this.#rgba[3], legacy.#rgba[3]);
    }
}
const COLOR_TO_RGBA_ENTRIES = [
    ['aliceblue', [240, 248, 255]],
    ['antiquewhite', [250, 235, 215]],
    ['aqua', [0, 255, 255]],
    ['aquamarine', [127, 255, 212]],
    ['azure', [240, 255, 255]],
    ['beige', [245, 245, 220]],
    ['bisque', [255, 228, 196]],
    ['black', [0, 0, 0]],
    ['blanchedalmond', [255, 235, 205]],
    ['blue', [0, 0, 255]],
    ['blueviolet', [138, 43, 226]],
    ['brown', [165, 42, 42]],
    ['burlywood', [222, 184, 135]],
    ['cadetblue', [95, 158, 160]],
    ['chartreuse', [127, 255, 0]],
    ['chocolate', [210, 105, 30]],
    ['coral', [255, 127, 80]],
    ['cornflowerblue', [100, 149, 237]],
    ['cornsilk', [255, 248, 220]],
    ['crimson', [237, 20, 61]],
    ['cyan', [0, 255, 255]],
    ['darkblue', [0, 0, 139]],
    ['darkcyan', [0, 139, 139]],
    ['darkgoldenrod', [184, 134, 11]],
    ['darkgray', [169, 169, 169]],
    ['darkgrey', [169, 169, 169]],
    ['darkgreen', [0, 100, 0]],
    ['darkkhaki', [189, 183, 107]],
    ['darkmagenta', [139, 0, 139]],
    ['darkolivegreen', [85, 107, 47]],
    ['darkorange', [255, 140, 0]],
    ['darkorchid', [153, 50, 204]],
    ['darkred', [139, 0, 0]],
    ['darksalmon', [233, 150, 122]],
    ['darkseagreen', [143, 188, 143]],
    ['darkslateblue', [72, 61, 139]],
    ['darkslategray', [47, 79, 79]],
    ['darkslategrey', [47, 79, 79]],
    ['darkturquoise', [0, 206, 209]],
    ['darkviolet', [148, 0, 211]],
    ['deeppink', [255, 20, 147]],
    ['deepskyblue', [0, 191, 255]],
    ['dimgray', [105, 105, 105]],
    ['dimgrey', [105, 105, 105]],
    ['dodgerblue', [30, 144, 255]],
    ['firebrick', [178, 34, 34]],
    ['floralwhite', [255, 250, 240]],
    ['forestgreen', [34, 139, 34]],
    ['fuchsia', [255, 0, 255]],
    ['gainsboro', [220, 220, 220]],
    ['ghostwhite', [248, 248, 255]],
    ['gold', [255, 215, 0]],
    ['goldenrod', [218, 165, 32]],
    ['gray', [128, 128, 128]],
    ['grey', [128, 128, 128]],
    ['green', [0, 128, 0]],
    ['greenyellow', [173, 255, 47]],
    ['honeydew', [240, 255, 240]],
    ['hotpink', [255, 105, 180]],
    ['indianred', [205, 92, 92]],
    ['indigo', [75, 0, 130]],
    ['ivory', [255, 255, 240]],
    ['khaki', [240, 230, 140]],
    ['lavender', [230, 230, 250]],
    ['lavenderblush', [255, 240, 245]],
    ['lawngreen', [124, 252, 0]],
    ['lemonchiffon', [255, 250, 205]],
    ['lightblue', [173, 216, 230]],
    ['lightcoral', [240, 128, 128]],
    ['lightcyan', [224, 255, 255]],
    ['lightgoldenrodyellow', [250, 250, 210]],
    ['lightgreen', [144, 238, 144]],
    ['lightgray', [211, 211, 211]],
    ['lightgrey', [211, 211, 211]],
    ['lightpink', [255, 182, 193]],
    ['lightsalmon', [255, 160, 122]],
    ['lightseagreen', [32, 178, 170]],
    ['lightskyblue', [135, 206, 250]],
    ['lightslategray', [119, 136, 153]],
    ['lightslategrey', [119, 136, 153]],
    ['lightsteelblue', [176, 196, 222]],
    ['lightyellow', [255, 255, 224]],
    ['lime', [0, 255, 0]],
    ['limegreen', [50, 205, 50]],
    ['linen', [250, 240, 230]],
    ['magenta', [255, 0, 255]],
    ['maroon', [128, 0, 0]],
    ['mediumaquamarine', [102, 205, 170]],
    ['mediumblue', [0, 0, 205]],
    ['mediumorchid', [186, 85, 211]],
    ['mediumpurple', [147, 112, 219]],
    ['mediumseagreen', [60, 179, 113]],
    ['mediumslateblue', [123, 104, 238]],
    ['mediumspringgreen', [0, 250, 154]],
    ['mediumturquoise', [72, 209, 204]],
    ['mediumvioletred', [199, 21, 133]],
    ['midnightblue', [25, 25, 112]],
    ['mintcream', [245, 255, 250]],
    ['mistyrose', [255, 228, 225]],
    ['moccasin', [255, 228, 181]],
    ['navajowhite', [255, 222, 173]],
    ['navy', [0, 0, 128]],
    ['oldlace', [253, 245, 230]],
    ['olive', [128, 128, 0]],
    ['olivedrab', [107, 142, 35]],
    ['orange', [255, 165, 0]],
    ['orangered', [255, 69, 0]],
    ['orchid', [218, 112, 214]],
    ['palegoldenrod', [238, 232, 170]],
    ['palegreen', [152, 251, 152]],
    ['paleturquoise', [175, 238, 238]],
    ['palevioletred', [219, 112, 147]],
    ['papayawhip', [255, 239, 213]],
    ['peachpuff', [255, 218, 185]],
    ['peru', [205, 133, 63]],
    ['pink', [255, 192, 203]],
    ['plum', [221, 160, 221]],
    ['powderblue', [176, 224, 230]],
    ['purple', [128, 0, 128]],
    ['rebeccapurple', [102, 51, 153]],
    ['red', [255, 0, 0]],
    ['rosybrown', [188, 143, 143]],
    ['royalblue', [65, 105, 225]],
    ['saddlebrown', [139, 69, 19]],
    ['salmon', [250, 128, 114]],
    ['sandybrown', [244, 164, 96]],
    ['seagreen', [46, 139, 87]],
    ['seashell', [255, 245, 238]],
    ['sienna', [160, 82, 45]],
    ['silver', [192, 192, 192]],
    ['skyblue', [135, 206, 235]],
    ['slateblue', [106, 90, 205]],
    ['slategray', [112, 128, 144]],
    ['slategrey', [112, 128, 144]],
    ['snow', [255, 250, 250]],
    ['springgreen', [0, 255, 127]],
    ['steelblue', [70, 130, 180]],
    ['tan', [210, 180, 140]],
    ['teal', [0, 128, 128]],
    ['thistle', [216, 191, 216]],
    ['tomato', [255, 99, 71]],
    ['turquoise', [64, 224, 208]],
    ['violet', [238, 130, 238]],
    ['wheat', [245, 222, 179]],
    ['white', [255, 255, 255]],
    ['whitesmoke', [245, 245, 245]],
    ['yellow', [255, 255, 0]],
    ['yellowgreen', [154, 205, 50]],
    ['transparent', [0, 0, 0, 0]],
];
console.assert(COLOR_TO_RGBA_ENTRIES.every(([nickname]) => nickname.toLowerCase() === nickname), 'All color nicknames must be lowercase.');
const Nicknames = new Map(COLOR_TO_RGBA_ENTRIES);
const RGBAToNickname = new Map(
COLOR_TO_RGBA_ENTRIES.map(([nickname, [r, g, b, a = 1]]) => {
    return [String([r, g, b, a]), nickname];
}));
const LAYOUT_LINES_HIGHLIGHT_COLOR = [127, 32, 210];
({
    Content: Legacy.fromRGBA([111, 168, 220, .66]),
    ContentLight: Legacy.fromRGBA([111, 168, 220, .5]),
    ContentOutline: Legacy.fromRGBA([9, 83, 148]),
    Padding: Legacy.fromRGBA([147, 196, 125, .55]),
    PaddingLight: Legacy.fromRGBA([147, 196, 125, .4]),
    Border: Legacy.fromRGBA([255, 229, 153, .66]),
    BorderLight: Legacy.fromRGBA([255, 229, 153, .5]),
    Margin: Legacy.fromRGBA([246, 178, 107, .66]),
    MarginLight: Legacy.fromRGBA([246, 178, 107, .5]),
    EventTarget: Legacy.fromRGBA([255, 196, 196, .66]),
    Shape: Legacy.fromRGBA([96, 82, 177, 0.8]),
    ShapeMargin: Legacy.fromRGBA([96, 82, 127, .6]),
    CssGrid: Legacy.fromRGBA([0x4b, 0, 0x82, 1]),
    LayoutLine: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, 1]),
    GridBorder: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, 1]),
    GapBackground: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, .3]),
    GapHatch: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, .8]),
    GridAreaBorder: Legacy.fromRGBA([26, 115, 232, 1]),
    AnchorIMCB: Legacy.fromRGBA([127, 32, 210, 1]),
    AnchorIMCBBackground: Legacy.fromRGBA([127, 32, 210, 0.15]),
    AnchorInsetsBackground: Legacy.fromRGBA([246, 178, 107, 0.25]),
    AnchorInsetsHatch: Legacy.fromRGBA([246, 178, 107, 0.8]),
    AnchorTarget: Legacy.fromRGBA([26, 115, 232, 1]),
    AnchorTargetBackground: Legacy.fromRGBA([26, 115, 232, 0.15]),
});
({
    ParentOutline: Legacy.fromRGBA([224, 90, 183, 1]),
    ChildOutline: Legacy.fromRGBA([0, 120, 212, 1]),
});
({
    Resizer: Legacy.fromRGBA([222, 225, 230, 1]),
    ResizerHandle: Legacy.fromRGBA([166, 166, 166, 1]),
    Mask: Legacy.fromRGBA([248, 249, 249, 1]),
});

// Copyright 2021 The Chromium Authors
let devToolsLocaleInstance = null;
class DevToolsLocale {
    locale;
    lookupClosestDevToolsLocale;
    constructor(data) {
        this.lookupClosestDevToolsLocale = data.lookupClosestDevToolsLocale;
        if (data.settingLanguage === 'browserLanguage') {
            this.locale = data.navigatorLanguage || 'en-US';
        }
        else {
            this.locale = data.settingLanguage;
        }
        this.locale = this.lookupClosestDevToolsLocale(this.locale);
    }
    static instance(opts = { create: false }) {
        if (!devToolsLocaleInstance && !opts.create) {
            throw new Error('No LanguageSelector instance exists yet.');
        }
        if (opts.create) {
            devToolsLocaleInstance = new DevToolsLocale(opts.data);
        }
        return devToolsLocaleInstance;
    }
    static removeInstance() {
        devToolsLocaleInstance = null;
    }
    forceFallbackLocale() {
        this.locale = 'en-US';
    }
    languageIsSupportedByDevTools(localeString) {
        return localeLanguagesMatch(localeString, this.lookupClosestDevToolsLocale(localeString));
    }
}
function localeLanguagesMatch(localeString1, localeString2) {
    const locale1 = new Intl.Locale(localeString1);
    const locale2 = new Intl.Locale(localeString2);
    return locale1.language === locale2.language;
}

var __assign = function () {
    __assign = Object.assign || function __assign2(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var ErrorKind;
(function (ErrorKind2) {
    ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_CLOSING_BRACE"] = 1] = "EXPECT_ARGUMENT_CLOSING_BRACE";
    ErrorKind2[ErrorKind2["EMPTY_ARGUMENT"] = 2] = "EMPTY_ARGUMENT";
    ErrorKind2[ErrorKind2["MALFORMED_ARGUMENT"] = 3] = "MALFORMED_ARGUMENT";
    ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_TYPE"] = 4] = "EXPECT_ARGUMENT_TYPE";
    ErrorKind2[ErrorKind2["INVALID_ARGUMENT_TYPE"] = 5] = "INVALID_ARGUMENT_TYPE";
    ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_STYLE"] = 6] = "EXPECT_ARGUMENT_STYLE";
    ErrorKind2[ErrorKind2["INVALID_NUMBER_SKELETON"] = 7] = "INVALID_NUMBER_SKELETON";
    ErrorKind2[ErrorKind2["INVALID_DATE_TIME_SKELETON"] = 8] = "INVALID_DATE_TIME_SKELETON";
    ErrorKind2[ErrorKind2["EXPECT_NUMBER_SKELETON"] = 9] = "EXPECT_NUMBER_SKELETON";
    ErrorKind2[ErrorKind2["EXPECT_DATE_TIME_SKELETON"] = 10] = "EXPECT_DATE_TIME_SKELETON";
    ErrorKind2[ErrorKind2["UNCLOSED_QUOTE_IN_ARGUMENT_STYLE"] = 11] = "UNCLOSED_QUOTE_IN_ARGUMENT_STYLE";
    ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_OPTIONS"] = 12] = "EXPECT_SELECT_ARGUMENT_OPTIONS";
    ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE"] = 13] = "EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE";
    ErrorKind2[ErrorKind2["INVALID_PLURAL_ARGUMENT_OFFSET_VALUE"] = 14] = "INVALID_PLURAL_ARGUMENT_OFFSET_VALUE";
    ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_SELECTOR"] = 15] = "EXPECT_SELECT_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_SELECTOR"] = 16] = "EXPECT_PLURAL_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT"] = 17] = "EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT";
    ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT"] = 18] = "EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT";
    ErrorKind2[ErrorKind2["INVALID_PLURAL_ARGUMENT_SELECTOR"] = 19] = "INVALID_PLURAL_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["DUPLICATE_PLURAL_ARGUMENT_SELECTOR"] = 20] = "DUPLICATE_PLURAL_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["DUPLICATE_SELECT_ARGUMENT_SELECTOR"] = 21] = "DUPLICATE_SELECT_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["MISSING_OTHER_CLAUSE"] = 22] = "MISSING_OTHER_CLAUSE";
    ErrorKind2[ErrorKind2["INVALID_TAG"] = 23] = "INVALID_TAG";
    ErrorKind2[ErrorKind2["INVALID_TAG_NAME"] = 25] = "INVALID_TAG_NAME";
    ErrorKind2[ErrorKind2["UNMATCHED_CLOSING_TAG"] = 26] = "UNMATCHED_CLOSING_TAG";
    ErrorKind2[ErrorKind2["UNCLOSED_TAG"] = 27] = "UNCLOSED_TAG";
})(ErrorKind || (ErrorKind = {}));
var TYPE;
(function (TYPE2) {
    TYPE2[TYPE2["literal"] = 0] = "literal";
    TYPE2[TYPE2["argument"] = 1] = "argument";
    TYPE2[TYPE2["number"] = 2] = "number";
    TYPE2[TYPE2["date"] = 3] = "date";
    TYPE2[TYPE2["time"] = 4] = "time";
    TYPE2[TYPE2["select"] = 5] = "select";
    TYPE2[TYPE2["plural"] = 6] = "plural";
    TYPE2[TYPE2["pound"] = 7] = "pound";
    TYPE2[TYPE2["tag"] = 8] = "tag";
})(TYPE || (TYPE = {}));
var SKELETON_TYPE;
(function (SKELETON_TYPE2) {
    SKELETON_TYPE2[SKELETON_TYPE2["number"] = 0] = "number";
    SKELETON_TYPE2[SKELETON_TYPE2["dateTime"] = 1] = "dateTime";
})(SKELETON_TYPE || (SKELETON_TYPE = {}));
function isLiteralElement(el) {
    return el.type === TYPE.literal;
}
function isArgumentElement(el) {
    return el.type === TYPE.argument;
}
function isNumberElement(el) {
    return el.type === TYPE.number;
}
function isDateElement(el) {
    return el.type === TYPE.date;
}
function isTimeElement(el) {
    return el.type === TYPE.time;
}
function isSelectElement(el) {
    return el.type === TYPE.select;
}
function isPluralElement(el) {
    return el.type === TYPE.plural;
}
function isPoundElement(el) {
    return el.type === TYPE.pound;
}
function isTagElement(el) {
    return el.type === TYPE.tag;
}
function isNumberSkeleton(el) {
    return !!(el && typeof el === "object" && el.type === SKELETON_TYPE.number);
}
function isDateTimeSkeleton(el) {
    return !!(el && typeof el === "object" && el.type === SKELETON_TYPE.dateTime);
}
var SPACE_SEPARATOR_REGEX = /[ \xA0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
var DATE_TIME_REGEX = /(?:[Eec]{1,6}|G{1,5}|[Qq]{1,5}|(?:[yYur]+|U{1,5})|[ML]{1,5}|d{1,2}|D{1,3}|F{1}|[abB]{1,5}|[hkHK]{1,2}|w{1,2}|W{1}|m{1,2}|s{1,2}|[zZOvVxX]{1,4})(?=([^']*'[^']*')*[^']*$)/g;
function parseDateTimeSkeleton(skeleton) {
    var result = {};
    skeleton.replace(DATE_TIME_REGEX, function (match) {
        var len = match.length;
        switch (match[0]) {
            case "G":
                result.era = len === 4 ? "long" : len === 5 ? "narrow" : "short";
                break;
            case "y":
                result.year = len === 2 ? "2-digit" : "numeric";
                break;
            case "Y":
            case "u":
            case "U":
            case "r":
                throw new RangeError("`Y/u/U/r` (year) patterns are not supported, use `y` instead");
            case "q":
            case "Q":
                throw new RangeError("`q/Q` (quarter) patterns are not supported");
            case "M":
            case "L":
                result.month = ["numeric", "2-digit", "short", "long", "narrow"][len - 1];
                break;
            case "w":
            case "W":
                throw new RangeError("`w/W` (week) patterns are not supported");
            case "d":
                result.day = ["numeric", "2-digit"][len - 1];
                break;
            case "D":
            case "F":
            case "g":
                throw new RangeError("`D/F/g` (day) patterns are not supported, use `d` instead");
            case "E":
                result.weekday = len === 4 ? "short" : len === 5 ? "narrow" : "short";
                break;
            case "e":
                if (len < 4) {
                    throw new RangeError("`e..eee` (weekday) patterns are not supported");
                }
                result.weekday = ["short", "long", "narrow", "short"][len - 4];
                break;
            case "c":
                if (len < 4) {
                    throw new RangeError("`c..ccc` (weekday) patterns are not supported");
                }
                result.weekday = ["short", "long", "narrow", "short"][len - 4];
                break;
            case "a":
                result.hour12 = true;
                break;
            case "b":
            case "B":
                throw new RangeError("`b/B` (period) patterns are not supported, use `a` instead");
            case "h":
                result.hourCycle = "h12";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "H":
                result.hourCycle = "h23";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "K":
                result.hourCycle = "h11";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "k":
                result.hourCycle = "h24";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "j":
            case "J":
            case "C":
                throw new RangeError("`j/J/C` (hour) patterns are not supported, use `h/H/K/k` instead");
            case "m":
                result.minute = ["numeric", "2-digit"][len - 1];
                break;
            case "s":
                result.second = ["numeric", "2-digit"][len - 1];
                break;
            case "S":
            case "A":
                throw new RangeError("`S/A` (second) patterns are not supported, use `s` instead");
            case "z":
                result.timeZoneName = len < 4 ? "short" : "long";
                break;
            case "Z":
            case "O":
            case "v":
            case "V":
            case "X":
            case "x":
                throw new RangeError("`Z/O/v/V/X/x` (timeZone) patterns are not supported, use `z` instead");
        }
        return "";
    });
    return result;
}
var WHITE_SPACE_REGEX = /[\t-\r \x85\u200E\u200F\u2028\u2029]/i;
function parseNumberSkeletonFromString(skeleton) {
    if (skeleton.length === 0) {
        throw new Error("Number skeleton cannot be empty");
    }
    var stringTokens = skeleton.split(WHITE_SPACE_REGEX).filter(function (x) {
        return x.length > 0;
    });
    var tokens = [];
    for (var _i = 0, stringTokens_1 = stringTokens; _i < stringTokens_1.length; _i++) {
        var stringToken = stringTokens_1[_i];
        var stemAndOptions = stringToken.split("/");
        if (stemAndOptions.length === 0) {
            throw new Error("Invalid number skeleton");
        }
        var stem = stemAndOptions[0], options = stemAndOptions.slice(1);
        for (var _a2 = 0, options_1 = options; _a2 < options_1.length; _a2++) {
            var option = options_1[_a2];
            if (option.length === 0) {
                throw new Error("Invalid number skeleton");
            }
        }
        tokens.push({ stem, options });
    }
    return tokens;
}
function icuUnitToEcma(unit) {
    return unit.replace(/^(.*?)-/, "");
}
var FRACTION_PRECISION_REGEX = /^\.(?:(0+)(\*)?|(#+)|(0+)(#+))$/g;
var SIGNIFICANT_PRECISION_REGEX = /^(@+)?(\+|#+)?$/g;
var INTEGER_WIDTH_REGEX = /(\*)(0+)|(#+)(0+)|(0+)/g;
var CONCISE_INTEGER_WIDTH_REGEX = /^(0+)$/;
function parseSignificantPrecision(str) {
    var result = {};
    str.replace(SIGNIFICANT_PRECISION_REGEX, function (_, g1, g2) {
        if (typeof g2 !== "string") {
            result.minimumSignificantDigits = g1.length;
            result.maximumSignificantDigits = g1.length;
        }
        else if (g2 === "+") {
            result.minimumSignificantDigits = g1.length;
        }
        else if (g1[0] === "#") {
            result.maximumSignificantDigits = g1.length;
        }
        else {
            result.minimumSignificantDigits = g1.length;
            result.maximumSignificantDigits = g1.length + (typeof g2 === "string" ? g2.length : 0);
        }
        return "";
    });
    return result;
}
function parseSign(str) {
    switch (str) {
        case "sign-auto":
            return {
                signDisplay: "auto"
            };
        case "sign-accounting":
        case "()":
            return {
                currencySign: "accounting"
            };
        case "sign-always":
        case "+!":
            return {
                signDisplay: "always"
            };
        case "sign-accounting-always":
        case "()!":
            return {
                signDisplay: "always",
                currencySign: "accounting"
            };
        case "sign-except-zero":
        case "+?":
            return {
                signDisplay: "exceptZero"
            };
        case "sign-accounting-except-zero":
        case "()?":
            return {
                signDisplay: "exceptZero",
                currencySign: "accounting"
            };
        case "sign-never":
        case "+_":
            return {
                signDisplay: "never"
            };
    }
}
function parseConciseScientificAndEngineeringStem(stem) {
    var result;
    if (stem[0] === "E" && stem[1] === "E") {
        result = {
            notation: "engineering"
        };
        stem = stem.slice(2);
    }
    else if (stem[0] === "E") {
        result = {
            notation: "scientific"
        };
        stem = stem.slice(1);
    }
    if (result) {
        var signDisplay = stem.slice(0, 2);
        if (signDisplay === "+!") {
            result.signDisplay = "always";
            stem = stem.slice(2);
        }
        else if (signDisplay === "+?") {
            result.signDisplay = "exceptZero";
            stem = stem.slice(2);
        }
        if (!CONCISE_INTEGER_WIDTH_REGEX.test(stem)) {
            throw new Error("Malformed concise eng/scientific notation");
        }
        result.minimumIntegerDigits = stem.length;
    }
    return result;
}
function parseNotationOptions(opt) {
    var result = {};
    var signOpts = parseSign(opt);
    if (signOpts) {
        return signOpts;
    }
    return result;
}
function parseNumberSkeleton(tokens) {
    var result = {};
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        switch (token.stem) {
            case "percent":
            case "%":
                result.style = "percent";
                continue;
            case "%x100":
                result.style = "percent";
                result.scale = 100;
                continue;
            case "currency":
                result.style = "currency";
                result.currency = token.options[0];
                continue;
            case "group-off":
            case ",_":
                result.useGrouping = false;
                continue;
            case "precision-integer":
            case ".":
                result.maximumFractionDigits = 0;
                continue;
            case "measure-unit":
            case "unit":
                result.style = "unit";
                result.unit = icuUnitToEcma(token.options[0]);
                continue;
            case "compact-short":
            case "K":
                result.notation = "compact";
                result.compactDisplay = "short";
                continue;
            case "compact-long":
            case "KK":
                result.notation = "compact";
                result.compactDisplay = "long";
                continue;
            case "scientific":
                result = __assign(__assign(__assign({}, result), { notation: "scientific" }), token.options.reduce(function (all, opt) {
                    return __assign(__assign({}, all), parseNotationOptions(opt));
                }, {}));
                continue;
            case "engineering":
                result = __assign(__assign(__assign({}, result), { notation: "engineering" }), token.options.reduce(function (all, opt) {
                    return __assign(__assign({}, all), parseNotationOptions(opt));
                }, {}));
                continue;
            case "notation-simple":
                result.notation = "standard";
                continue;
            case "unit-width-narrow":
                result.currencyDisplay = "narrowSymbol";
                result.unitDisplay = "narrow";
                continue;
            case "unit-width-short":
                result.currencyDisplay = "code";
                result.unitDisplay = "short";
                continue;
            case "unit-width-full-name":
                result.currencyDisplay = "name";
                result.unitDisplay = "long";
                continue;
            case "unit-width-iso-code":
                result.currencyDisplay = "symbol";
                continue;
            case "scale":
                result.scale = parseFloat(token.options[0]);
                continue;
            case "integer-width":
                if (token.options.length > 1) {
                    throw new RangeError("integer-width stems only accept a single optional option");
                }
                token.options[0].replace(INTEGER_WIDTH_REGEX, function (_, g1, g2, g3, g4, g5) {
                    if (g1) {
                        result.minimumIntegerDigits = g2.length;
                    }
                    else if (g3 && g4) {
                        throw new Error("We currently do not support maximum integer digits");
                    }
                    else if (g5) {
                        throw new Error("We currently do not support exact integer digits");
                    }
                    return "";
                });
                continue;
        }
        if (CONCISE_INTEGER_WIDTH_REGEX.test(token.stem)) {
            result.minimumIntegerDigits = token.stem.length;
            continue;
        }
        if (FRACTION_PRECISION_REGEX.test(token.stem)) {
            if (token.options.length > 1) {
                throw new RangeError("Fraction-precision stems only accept a single optional option");
            }
            token.stem.replace(FRACTION_PRECISION_REGEX, function (_, g1, g2, g3, g4, g5) {
                if (g2 === "*") {
                    result.minimumFractionDigits = g1.length;
                }
                else if (g3 && g3[0] === "#") {
                    result.maximumFractionDigits = g3.length;
                }
                else if (g4 && g5) {
                    result.minimumFractionDigits = g4.length;
                    result.maximumFractionDigits = g4.length + g5.length;
                }
                else {
                    result.minimumFractionDigits = g1.length;
                    result.maximumFractionDigits = g1.length;
                }
                return "";
            });
            if (token.options.length) {
                result = __assign(__assign({}, result), parseSignificantPrecision(token.options[0]));
            }
            continue;
        }
        if (SIGNIFICANT_PRECISION_REGEX.test(token.stem)) {
            result = __assign(__assign({}, result), parseSignificantPrecision(token.stem));
            continue;
        }
        var signOpts = parseSign(token.stem);
        if (signOpts) {
            result = __assign(__assign({}, result), signOpts);
        }
        var conciseScientificAndEngineeringOpts = parseConciseScientificAndEngineeringStem(token.stem);
        if (conciseScientificAndEngineeringOpts) {
            result = __assign(__assign({}, result), conciseScientificAndEngineeringOpts);
        }
    }
    return result;
}
var _a;
var SPACE_SEPARATOR_START_REGEX = new RegExp("^" + SPACE_SEPARATOR_REGEX.source + "*");
var SPACE_SEPARATOR_END_REGEX = new RegExp(SPACE_SEPARATOR_REGEX.source + "*$");
function createLocation(start, end) {
    return { start, end };
}
var hasNativeStartsWith = !!String.prototype.startsWith;
var hasNativeFromCodePoint = !!String.fromCodePoint;
var hasNativeFromEntries = !!Object.fromEntries;
var hasNativeCodePointAt = !!String.prototype.codePointAt;
var hasTrimStart = !!String.prototype.trimStart;
var hasTrimEnd = !!String.prototype.trimEnd;
var hasNativeIsSafeInteger = !!Number.isSafeInteger;
var isSafeInteger = hasNativeIsSafeInteger ? Number.isSafeInteger : function (n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n && Math.abs(n) <= 9007199254740991;
};
var REGEX_SUPPORTS_U_AND_Y = true;
try {
    re = RE("([^\\p{White_Space}\\p{Pattern_Syntax}]*)", "yu");
    REGEX_SUPPORTS_U_AND_Y = ((_a = re.exec("a")) === null || _a === void 0 ? void 0 : _a[0]) === "a";
}
catch (_) {
    REGEX_SUPPORTS_U_AND_Y = false;
}
var re;
var startsWith = hasNativeStartsWith ? function startsWith2(s, search, position) {
    return s.startsWith(search, position);
} : function startsWith3(s, search, position) {
    return s.slice(position, position + search.length) === search;
};
var fromCodePoint = hasNativeFromCodePoint ? String.fromCodePoint : function fromCodePoint2() {
    var codePoints = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        codePoints[_i] = arguments[_i];
    }
    var elements = "";
    var length = codePoints.length;
    var i = 0;
    var code;
    while (length > i) {
        code = codePoints[i++];
        if (code > 1114111)
            throw RangeError(code + " is not a valid code point");
        elements += code < 65536 ? String.fromCharCode(code) : String.fromCharCode(((code -= 65536) >> 10) + 55296, code % 1024 + 56320);
    }
    return elements;
};
var fromEntries = hasNativeFromEntries ? Object.fromEntries : function fromEntries2(entries) {
    var obj = {};
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var _a2 = entries_1[_i], k = _a2[0], v = _a2[1];
        obj[k] = v;
    }
    return obj;
};
var codePointAt = hasNativeCodePointAt ? function codePointAt2(s, index) {
    return s.codePointAt(index);
} : function codePointAt3(s, index) {
    var size = s.length;
    if (index < 0 || index >= size) {
        return void 0;
    }
    var first = s.charCodeAt(index);
    var second;
    return first < 55296 || first > 56319 || index + 1 === size || (second = s.charCodeAt(index + 1)) < 56320 || second > 57343 ? first : (first - 55296 << 10) + (second - 56320) + 65536;
};
var trimStart = hasTrimStart ? function trimStart2(s) {
    return s.trimStart();
} : function trimStart3(s) {
    return s.replace(SPACE_SEPARATOR_START_REGEX, "");
};
var trimEnd = hasTrimEnd ? function trimEnd2(s) {
    return s.trimEnd();
} : function trimEnd3(s) {
    return s.replace(SPACE_SEPARATOR_END_REGEX, "");
};
function RE(s, flag) {
    return new RegExp(s, flag);
}
var matchIdentifierAtIndex;
if (REGEX_SUPPORTS_U_AND_Y) {
    IDENTIFIER_PREFIX_RE_1 = RE("([^\\p{White_Space}\\p{Pattern_Syntax}]*)", "yu");
    matchIdentifierAtIndex = function matchIdentifierAtIndex2(s, index) {
        var _a2;
        IDENTIFIER_PREFIX_RE_1.lastIndex = index;
        var match = IDENTIFIER_PREFIX_RE_1.exec(s);
        return (_a2 = match[1]) !== null && _a2 !== void 0 ? _a2 : "";
    };
}
else {
    matchIdentifierAtIndex = function matchIdentifierAtIndex2(s, index) {
        var match = [];
        while (true) {
            var c = codePointAt(s, index);
            if (c === void 0 || _isWhiteSpace(c) || _isPatternSyntax(c)) {
                break;
            }
            match.push(c);
            index += c >= 65536 ? 2 : 1;
        }
        return fromCodePoint.apply(void 0, match);
    };
}
var IDENTIFIER_PREFIX_RE_1;
var Parser = function () {
    function Parser2(message, options) {
        if (options === void 0) {
            options = {};
        }
        this.message = message;
        this.position = { offset: 0, line: 1, column: 1 };
        this.ignoreTag = !!options.ignoreTag;
        this.requiresOtherClause = !!options.requiresOtherClause;
        this.shouldParseSkeletons = !!options.shouldParseSkeletons;
    }
    Parser2.prototype.parse = function () {
        if (this.offset() !== 0) {
            throw Error("parser can only be used once");
        }
        return this.parseMessage(0, "", false);
    };
    Parser2.prototype.parseMessage = function (nestingLevel, parentArgType, expectingCloseTag) {
        var elements = [];
        while (!this.isEOF()) {
            var char = this.char();
            if (char === 123) {
                var result = this.parseArgument(nestingLevel, expectingCloseTag);
                if (result.err) {
                    return result;
                }
                elements.push(result.val);
            }
            else if (char === 125 && nestingLevel > 0) {
                break;
            }
            else if (char === 35 && (parentArgType === "plural" || parentArgType === "selectordinal")) {
                var position = this.clonePosition();
                this.bump();
                elements.push({
                    type: TYPE.pound,
                    location: createLocation(position, this.clonePosition())
                });
            }
            else if (char === 60 && !this.ignoreTag && this.peek() === 47) {
                if (expectingCloseTag) {
                    break;
                }
                else {
                    return this.error(ErrorKind.UNMATCHED_CLOSING_TAG, createLocation(this.clonePosition(), this.clonePosition()));
                }
            }
            else if (char === 60 && !this.ignoreTag && _isAlpha(this.peek() || 0)) {
                var result = this.parseTag(nestingLevel, parentArgType);
                if (result.err) {
                    return result;
                }
                elements.push(result.val);
            }
            else {
                var result = this.parseLiteral(nestingLevel, parentArgType);
                if (result.err) {
                    return result;
                }
                elements.push(result.val);
            }
        }
        return { val: elements, err: null };
    };
    Parser2.prototype.parseTag = function (nestingLevel, parentArgType) {
        var startPosition = this.clonePosition();
        this.bump();
        var tagName = this.parseTagName();
        this.bumpSpace();
        if (this.bumpIf("/>")) {
            return {
                val: {
                    type: TYPE.literal,
                    value: "<" + tagName + "/>",
                    location: createLocation(startPosition, this.clonePosition())
                },
                err: null
            };
        }
        else if (this.bumpIf(">")) {
            var childrenResult = this.parseMessage(nestingLevel + 1, parentArgType, true);
            if (childrenResult.err) {
                return childrenResult;
            }
            var children = childrenResult.val;
            var endTagStartPosition = this.clonePosition();
            if (this.bumpIf("</")) {
                if (this.isEOF() || !_isAlpha(this.char())) {
                    return this.error(ErrorKind.INVALID_TAG, createLocation(endTagStartPosition, this.clonePosition()));
                }
                var closingTagNameStartPosition = this.clonePosition();
                var closingTagName = this.parseTagName();
                if (tagName !== closingTagName) {
                    return this.error(ErrorKind.UNMATCHED_CLOSING_TAG, createLocation(closingTagNameStartPosition, this.clonePosition()));
                }
                this.bumpSpace();
                if (!this.bumpIf(">")) {
                    return this.error(ErrorKind.INVALID_TAG, createLocation(endTagStartPosition, this.clonePosition()));
                }
                return {
                    val: {
                        type: TYPE.tag,
                        value: tagName,
                        children,
                        location: createLocation(startPosition, this.clonePosition())
                    },
                    err: null
                };
            }
            else {
                return this.error(ErrorKind.UNCLOSED_TAG, createLocation(startPosition, this.clonePosition()));
            }
        }
        else {
            return this.error(ErrorKind.INVALID_TAG, createLocation(startPosition, this.clonePosition()));
        }
    };
    Parser2.prototype.parseTagName = function () {
        var startOffset = this.offset();
        this.bump();
        while (!this.isEOF() && _isPotentialElementNameChar(this.char())) {
            this.bump();
        }
        return this.message.slice(startOffset, this.offset());
    };
    Parser2.prototype.parseLiteral = function (nestingLevel, parentArgType) {
        var start = this.clonePosition();
        var value = "";
        while (true) {
            var parseQuoteResult = this.tryParseQuote(parentArgType);
            if (parseQuoteResult) {
                value += parseQuoteResult;
                continue;
            }
            var parseUnquotedResult = this.tryParseUnquoted(nestingLevel, parentArgType);
            if (parseUnquotedResult) {
                value += parseUnquotedResult;
                continue;
            }
            var parseLeftAngleResult = this.tryParseLeftAngleBracket();
            if (parseLeftAngleResult) {
                value += parseLeftAngleResult;
                continue;
            }
            break;
        }
        var location = createLocation(start, this.clonePosition());
        return {
            val: { type: TYPE.literal, value, location },
            err: null
        };
    };
    Parser2.prototype.tryParseLeftAngleBracket = function () {
        if (!this.isEOF() && this.char() === 60 && (this.ignoreTag || !_isAlphaOrSlash(this.peek() || 0))) {
            this.bump();
            return "<";
        }
        return null;
    };
    Parser2.prototype.tryParseQuote = function (parentArgType) {
        if (this.isEOF() || this.char() !== 39) {
            return null;
        }
        switch (this.peek()) {
            case 39:
                this.bump();
                this.bump();
                return "'";
            case 123:
            case 60:
            case 62:
            case 125:
                break;
            case 35:
                if (parentArgType === "plural" || parentArgType === "selectordinal") {
                    break;
                }
                return null;
            default:
                return null;
        }
        this.bump();
        var codePoints = [this.char()];
        this.bump();
        while (!this.isEOF()) {
            var ch = this.char();
            if (ch === 39) {
                if (this.peek() === 39) {
                    codePoints.push(39);
                    this.bump();
                }
                else {
                    this.bump();
                    break;
                }
            }
            else {
                codePoints.push(ch);
            }
            this.bump();
        }
        return fromCodePoint.apply(void 0, codePoints);
    };
    Parser2.prototype.tryParseUnquoted = function (nestingLevel, parentArgType) {
        if (this.isEOF()) {
            return null;
        }
        var ch = this.char();
        if (ch === 60 || ch === 123 || ch === 35 && (parentArgType === "plural" || parentArgType === "selectordinal") || ch === 125 && nestingLevel > 0) {
            return null;
        }
        else {
            this.bump();
            return fromCodePoint(ch);
        }
    };
    Parser2.prototype.parseArgument = function (nestingLevel, expectingCloseTag) {
        var openingBracePosition = this.clonePosition();
        this.bump();
        this.bumpSpace();
        if (this.isEOF()) {
            return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
        }
        if (this.char() === 125) {
            this.bump();
            return this.error(ErrorKind.EMPTY_ARGUMENT, createLocation(openingBracePosition, this.clonePosition()));
        }
        var value = this.parseIdentifierIfPossible().value;
        if (!value) {
            return this.error(ErrorKind.MALFORMED_ARGUMENT, createLocation(openingBracePosition, this.clonePosition()));
        }
        this.bumpSpace();
        if (this.isEOF()) {
            return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
        }
        switch (this.char()) {
            case 125: {
                this.bump();
                return {
                    val: {
                        type: TYPE.argument,
                        value,
                        location: createLocation(openingBracePosition, this.clonePosition())
                    },
                    err: null
                };
            }
            case 44: {
                this.bump();
                this.bumpSpace();
                if (this.isEOF()) {
                    return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
                }
                return this.parseArgumentOptions(nestingLevel, expectingCloseTag, value, openingBracePosition);
            }
            default:
                return this.error(ErrorKind.MALFORMED_ARGUMENT, createLocation(openingBracePosition, this.clonePosition()));
        }
    };
    Parser2.prototype.parseIdentifierIfPossible = function () {
        var startingPosition = this.clonePosition();
        var startOffset = this.offset();
        var value = matchIdentifierAtIndex(this.message, startOffset);
        var endOffset = startOffset + value.length;
        this.bumpTo(endOffset);
        var endPosition = this.clonePosition();
        var location = createLocation(startingPosition, endPosition);
        return { value, location };
    };
    Parser2.prototype.parseArgumentOptions = function (nestingLevel, expectingCloseTag, value, openingBracePosition) {
        var _a2;
        var typeStartPosition = this.clonePosition();
        var argType = this.parseIdentifierIfPossible().value;
        var typeEndPosition = this.clonePosition();
        switch (argType) {
            case "":
                return this.error(ErrorKind.EXPECT_ARGUMENT_TYPE, createLocation(typeStartPosition, typeEndPosition));
            case "number":
            case "date":
            case "time": {
                this.bumpSpace();
                var styleAndLocation = null;
                if (this.bumpIf(",")) {
                    this.bumpSpace();
                    var styleStartPosition = this.clonePosition();
                    var result = this.parseSimpleArgStyleIfPossible();
                    if (result.err) {
                        return result;
                    }
                    var style = trimEnd(result.val);
                    if (style.length === 0) {
                        return this.error(ErrorKind.EXPECT_ARGUMENT_STYLE, createLocation(this.clonePosition(), this.clonePosition()));
                    }
                    var styleLocation = createLocation(styleStartPosition, this.clonePosition());
                    styleAndLocation = { style, styleLocation };
                }
                var argCloseResult = this.tryParseArgumentClose(openingBracePosition);
                if (argCloseResult.err) {
                    return argCloseResult;
                }
                var location_1 = createLocation(openingBracePosition, this.clonePosition());
                if (styleAndLocation && startsWith(styleAndLocation === null || styleAndLocation === void 0 ? void 0 : styleAndLocation.style, "::", 0)) {
                    var skeleton = trimStart(styleAndLocation.style.slice(2));
                    if (argType === "number") {
                        var result = this.parseNumberSkeletonFromString(skeleton, styleAndLocation.styleLocation);
                        if (result.err) {
                            return result;
                        }
                        return {
                            val: { type: TYPE.number, value, location: location_1, style: result.val },
                            err: null
                        };
                    }
                    else {
                        if (skeleton.length === 0) {
                            return this.error(ErrorKind.EXPECT_DATE_TIME_SKELETON, location_1);
                        }
                        var style = {
                            type: SKELETON_TYPE.dateTime,
                            pattern: skeleton,
                            location: styleAndLocation.styleLocation,
                            parsedOptions: this.shouldParseSkeletons ? parseDateTimeSkeleton(skeleton) : {}
                        };
                        var type = argType === "date" ? TYPE.date : TYPE.time;
                        return {
                            val: { type, value, location: location_1, style },
                            err: null
                        };
                    }
                }
                return {
                    val: {
                        type: argType === "number" ? TYPE.number : argType === "date" ? TYPE.date : TYPE.time,
                        value,
                        location: location_1,
                        style: (_a2 = styleAndLocation === null || styleAndLocation === void 0 ? void 0 : styleAndLocation.style) !== null && _a2 !== void 0 ? _a2 : null
                    },
                    err: null
                };
            }
            case "plural":
            case "selectordinal":
            case "select": {
                var typeEndPosition_1 = this.clonePosition();
                this.bumpSpace();
                if (!this.bumpIf(",")) {
                    return this.error(ErrorKind.EXPECT_SELECT_ARGUMENT_OPTIONS, createLocation(typeEndPosition_1, __assign({}, typeEndPosition_1)));
                }
                this.bumpSpace();
                var identifierAndLocation = this.parseIdentifierIfPossible();
                var pluralOffset = 0;
                if (argType !== "select" && identifierAndLocation.value === "offset") {
                    if (!this.bumpIf(":")) {
                        return this.error(ErrorKind.EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE, createLocation(this.clonePosition(), this.clonePosition()));
                    }
                    this.bumpSpace();
                    var result = this.tryParseDecimalInteger(ErrorKind.EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE, ErrorKind.INVALID_PLURAL_ARGUMENT_OFFSET_VALUE);
                    if (result.err) {
                        return result;
                    }
                    this.bumpSpace();
                    identifierAndLocation = this.parseIdentifierIfPossible();
                    pluralOffset = result.val;
                }
                var optionsResult = this.tryParsePluralOrSelectOptions(nestingLevel, argType, expectingCloseTag, identifierAndLocation);
                if (optionsResult.err) {
                    return optionsResult;
                }
                var argCloseResult = this.tryParseArgumentClose(openingBracePosition);
                if (argCloseResult.err) {
                    return argCloseResult;
                }
                var location_2 = createLocation(openingBracePosition, this.clonePosition());
                if (argType === "select") {
                    return {
                        val: {
                            type: TYPE.select,
                            value,
                            options: fromEntries(optionsResult.val),
                            location: location_2
                        },
                        err: null
                    };
                }
                else {
                    return {
                        val: {
                            type: TYPE.plural,
                            value,
                            options: fromEntries(optionsResult.val),
                            offset: pluralOffset,
                            pluralType: argType === "plural" ? "cardinal" : "ordinal",
                            location: location_2
                        },
                        err: null
                    };
                }
            }
            default:
                return this.error(ErrorKind.INVALID_ARGUMENT_TYPE, createLocation(typeStartPosition, typeEndPosition));
        }
    };
    Parser2.prototype.tryParseArgumentClose = function (openingBracePosition) {
        if (this.isEOF() || this.char() !== 125) {
            return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
        }
        this.bump();
        return { val: true, err: null };
    };
    Parser2.prototype.parseSimpleArgStyleIfPossible = function () {
        var nestedBraces = 0;
        var startPosition = this.clonePosition();
        while (!this.isEOF()) {
            var ch = this.char();
            switch (ch) {
                case 39: {
                    this.bump();
                    var apostrophePosition = this.clonePosition();
                    if (!this.bumpUntil("'")) {
                        return this.error(ErrorKind.UNCLOSED_QUOTE_IN_ARGUMENT_STYLE, createLocation(apostrophePosition, this.clonePosition()));
                    }
                    this.bump();
                    break;
                }
                case 123: {
                    nestedBraces += 1;
                    this.bump();
                    break;
                }
                case 125: {
                    if (nestedBraces > 0) {
                        nestedBraces -= 1;
                    }
                    else {
                        return {
                            val: this.message.slice(startPosition.offset, this.offset()),
                            err: null
                        };
                    }
                    break;
                }
                default:
                    this.bump();
                    break;
            }
        }
        return {
            val: this.message.slice(startPosition.offset, this.offset()),
            err: null
        };
    };
    Parser2.prototype.parseNumberSkeletonFromString = function (skeleton, location) {
        var tokens = [];
        try {
            tokens = parseNumberSkeletonFromString(skeleton);
        }
        catch (e) {
            return this.error(ErrorKind.INVALID_NUMBER_SKELETON, location);
        }
        return {
            val: {
                type: SKELETON_TYPE.number,
                tokens,
                location,
                parsedOptions: this.shouldParseSkeletons ? parseNumberSkeleton(tokens) : {}
            },
            err: null
        };
    };
    Parser2.prototype.tryParsePluralOrSelectOptions = function (nestingLevel, parentArgType, expectCloseTag, parsedFirstIdentifier) {
        var _a2;
        var hasOtherClause = false;
        var options = [];
        var parsedSelectors = new Set();
        var selector = parsedFirstIdentifier.value, selectorLocation = parsedFirstIdentifier.location;
        while (true) {
            if (selector.length === 0) {
                var startPosition = this.clonePosition();
                if (parentArgType !== "select" && this.bumpIf("=")) {
                    var result = this.tryParseDecimalInteger(ErrorKind.EXPECT_PLURAL_ARGUMENT_SELECTOR, ErrorKind.INVALID_PLURAL_ARGUMENT_SELECTOR);
                    if (result.err) {
                        return result;
                    }
                    selectorLocation = createLocation(startPosition, this.clonePosition());
                    selector = this.message.slice(startPosition.offset, this.offset());
                }
                else {
                    break;
                }
            }
            if (parsedSelectors.has(selector)) {
                return this.error(parentArgType === "select" ? ErrorKind.DUPLICATE_SELECT_ARGUMENT_SELECTOR : ErrorKind.DUPLICATE_PLURAL_ARGUMENT_SELECTOR, selectorLocation);
            }
            if (selector === "other") {
                hasOtherClause = true;
            }
            this.bumpSpace();
            var openingBracePosition = this.clonePosition();
            if (!this.bumpIf("{")) {
                return this.error(parentArgType === "select" ? ErrorKind.EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT : ErrorKind.EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT, createLocation(this.clonePosition(), this.clonePosition()));
            }
            var fragmentResult = this.parseMessage(nestingLevel + 1, parentArgType, expectCloseTag);
            if (fragmentResult.err) {
                return fragmentResult;
            }
            var argCloseResult = this.tryParseArgumentClose(openingBracePosition);
            if (argCloseResult.err) {
                return argCloseResult;
            }
            options.push([
                selector,
                {
                    value: fragmentResult.val,
                    location: createLocation(openingBracePosition, this.clonePosition())
                }
            ]);
            parsedSelectors.add(selector);
            this.bumpSpace();
            _a2 = this.parseIdentifierIfPossible(), selector = _a2.value, selectorLocation = _a2.location;
        }
        if (options.length === 0) {
            return this.error(parentArgType === "select" ? ErrorKind.EXPECT_SELECT_ARGUMENT_SELECTOR : ErrorKind.EXPECT_PLURAL_ARGUMENT_SELECTOR, createLocation(this.clonePosition(), this.clonePosition()));
        }
        if (this.requiresOtherClause && !hasOtherClause) {
            return this.error(ErrorKind.MISSING_OTHER_CLAUSE, createLocation(this.clonePosition(), this.clonePosition()));
        }
        return { val: options, err: null };
    };
    Parser2.prototype.tryParseDecimalInteger = function (expectNumberError, invalidNumberError) {
        var sign = 1;
        var startingPosition = this.clonePosition();
        if (this.bumpIf("+")) ;
        else if (this.bumpIf("-")) {
            sign = -1;
        }
        var hasDigits = false;
        var decimal = 0;
        while (!this.isEOF()) {
            var ch = this.char();
            if (ch >= 48 && ch <= 57) {
                hasDigits = true;
                decimal = decimal * 10 + (ch - 48);
                this.bump();
            }
            else {
                break;
            }
        }
        var location = createLocation(startingPosition, this.clonePosition());
        if (!hasDigits) {
            return this.error(expectNumberError, location);
        }
        decimal *= sign;
        if (!isSafeInteger(decimal)) {
            return this.error(invalidNumberError, location);
        }
        return { val: decimal, err: null };
    };
    Parser2.prototype.offset = function () {
        return this.position.offset;
    };
    Parser2.prototype.isEOF = function () {
        return this.offset() === this.message.length;
    };
    Parser2.prototype.clonePosition = function () {
        return {
            offset: this.position.offset,
            line: this.position.line,
            column: this.position.column
        };
    };
    Parser2.prototype.char = function () {
        var offset = this.position.offset;
        if (offset >= this.message.length) {
            throw Error("out of bound");
        }
        var code = codePointAt(this.message, offset);
        if (code === void 0) {
            throw Error("Offset " + offset + " is at invalid UTF-16 code unit boundary");
        }
        return code;
    };
    Parser2.prototype.error = function (kind, location) {
        return {
            val: null,
            err: {
                kind,
                message: this.message,
                location
            }
        };
    };
    Parser2.prototype.bump = function () {
        if (this.isEOF()) {
            return;
        }
        var code = this.char();
        if (code === 10) {
            this.position.line += 1;
            this.position.column = 1;
            this.position.offset += 1;
        }
        else {
            this.position.column += 1;
            this.position.offset += code < 65536 ? 1 : 2;
        }
    };
    Parser2.prototype.bumpIf = function (prefix) {
        if (startsWith(this.message, prefix, this.offset())) {
            for (var i = 0; i < prefix.length; i++) {
                this.bump();
            }
            return true;
        }
        return false;
    };
    Parser2.prototype.bumpUntil = function (pattern) {
        var currentOffset = this.offset();
        var index = this.message.indexOf(pattern, currentOffset);
        if (index >= 0) {
            this.bumpTo(index);
            return true;
        }
        else {
            this.bumpTo(this.message.length);
            return false;
        }
    };
    Parser2.prototype.bumpTo = function (targetOffset) {
        if (this.offset() > targetOffset) {
            throw Error("targetOffset " + targetOffset + " must be greater than or equal to the current offset " + this.offset());
        }
        targetOffset = Math.min(targetOffset, this.message.length);
        while (true) {
            var offset = this.offset();
            if (offset === targetOffset) {
                break;
            }
            if (offset > targetOffset) {
                throw Error("targetOffset " + targetOffset + " is at invalid UTF-16 code unit boundary");
            }
            this.bump();
            if (this.isEOF()) {
                break;
            }
        }
    };
    Parser2.prototype.bumpSpace = function () {
        while (!this.isEOF() && _isWhiteSpace(this.char())) {
            this.bump();
        }
    };
    Parser2.prototype.peek = function () {
        if (this.isEOF()) {
            return null;
        }
        var code = this.char();
        var offset = this.offset();
        var nextCode = this.message.charCodeAt(offset + (code >= 65536 ? 2 : 1));
        return nextCode !== null && nextCode !== void 0 ? nextCode : null;
    };
    return Parser2;
}();
function _isAlpha(codepoint) {
    return codepoint >= 97 && codepoint <= 122 || codepoint >= 65 && codepoint <= 90;
}
function _isAlphaOrSlash(codepoint) {
    return _isAlpha(codepoint) || codepoint === 47;
}
function _isPotentialElementNameChar(c) {
    return c === 45 || c === 46 || c >= 48 && c <= 57 || c === 95 || c >= 97 && c <= 122 || c >= 65 && c <= 90 || c == 183 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 893 || c >= 895 && c <= 8191 || c >= 8204 && c <= 8205 || c >= 8255 && c <= 8256 || c >= 8304 && c <= 8591 || c >= 11264 && c <= 12271 || c >= 12289 && c <= 55295 || c >= 63744 && c <= 64975 || c >= 65008 && c <= 65533 || c >= 65536 && c <= 983039;
}
function _isWhiteSpace(c) {
    return c >= 9 && c <= 13 || c === 32 || c === 133 || c >= 8206 && c <= 8207 || c === 8232 || c === 8233;
}
function _isPatternSyntax(c) {
    return c >= 33 && c <= 35 || c === 36 || c >= 37 && c <= 39 || c === 40 || c === 41 || c === 42 || c === 43 || c === 44 || c === 45 || c >= 46 && c <= 47 || c >= 58 && c <= 59 || c >= 60 && c <= 62 || c >= 63 && c <= 64 || c === 91 || c === 92 || c === 93 || c === 94 || c === 96 || c === 123 || c === 124 || c === 125 || c === 126 || c === 161 || c >= 162 && c <= 165 || c === 166 || c === 167 || c === 169 || c === 171 || c === 172 || c === 174 || c === 176 || c === 177 || c === 182 || c === 187 || c === 191 || c === 215 || c === 247 || c >= 8208 && c <= 8213 || c >= 8214 && c <= 8215 || c === 8216 || c === 8217 || c === 8218 || c >= 8219 && c <= 8220 || c === 8221 || c === 8222 || c === 8223 || c >= 8224 && c <= 8231 || c >= 8240 && c <= 8248 || c === 8249 || c === 8250 || c >= 8251 && c <= 8254 || c >= 8257 && c <= 8259 || c === 8260 || c === 8261 || c === 8262 || c >= 8263 && c <= 8273 || c === 8274 || c === 8275 || c >= 8277 && c <= 8286 || c >= 8592 && c <= 8596 || c >= 8597 && c <= 8601 || c >= 8602 && c <= 8603 || c >= 8604 && c <= 8607 || c === 8608 || c >= 8609 && c <= 8610 || c === 8611 || c >= 8612 && c <= 8613 || c === 8614 || c >= 8615 && c <= 8621 || c === 8622 || c >= 8623 && c <= 8653 || c >= 8654 && c <= 8655 || c >= 8656 && c <= 8657 || c === 8658 || c === 8659 || c === 8660 || c >= 8661 && c <= 8691 || c >= 8692 && c <= 8959 || c >= 8960 && c <= 8967 || c === 8968 || c === 8969 || c === 8970 || c === 8971 || c >= 8972 && c <= 8991 || c >= 8992 && c <= 8993 || c >= 8994 && c <= 9e3 || c === 9001 || c === 9002 || c >= 9003 && c <= 9083 || c === 9084 || c >= 9085 && c <= 9114 || c >= 9115 && c <= 9139 || c >= 9140 && c <= 9179 || c >= 9180 && c <= 9185 || c >= 9186 && c <= 9254 || c >= 9255 && c <= 9279 || c >= 9280 && c <= 9290 || c >= 9291 && c <= 9311 || c >= 9472 && c <= 9654 || c === 9655 || c >= 9656 && c <= 9664 || c === 9665 || c >= 9666 && c <= 9719 || c >= 9720 && c <= 9727 || c >= 9728 && c <= 9838 || c === 9839 || c >= 9840 && c <= 10087 || c === 10088 || c === 10089 || c === 10090 || c === 10091 || c === 10092 || c === 10093 || c === 10094 || c === 10095 || c === 10096 || c === 10097 || c === 10098 || c === 10099 || c === 10100 || c === 10101 || c >= 10132 && c <= 10175 || c >= 10176 && c <= 10180 || c === 10181 || c === 10182 || c >= 10183 && c <= 10213 || c === 10214 || c === 10215 || c === 10216 || c === 10217 || c === 10218 || c === 10219 || c === 10220 || c === 10221 || c === 10222 || c === 10223 || c >= 10224 && c <= 10239 || c >= 10240 && c <= 10495 || c >= 10496 && c <= 10626 || c === 10627 || c === 10628 || c === 10629 || c === 10630 || c === 10631 || c === 10632 || c === 10633 || c === 10634 || c === 10635 || c === 10636 || c === 10637 || c === 10638 || c === 10639 || c === 10640 || c === 10641 || c === 10642 || c === 10643 || c === 10644 || c === 10645 || c === 10646 || c === 10647 || c === 10648 || c >= 10649 && c <= 10711 || c === 10712 || c === 10713 || c === 10714 || c === 10715 || c >= 10716 && c <= 10747 || c === 10748 || c === 10749 || c >= 10750 && c <= 11007 || c >= 11008 && c <= 11055 || c >= 11056 && c <= 11076 || c >= 11077 && c <= 11078 || c >= 11079 && c <= 11084 || c >= 11085 && c <= 11123 || c >= 11124 && c <= 11125 || c >= 11126 && c <= 11157 || c === 11158 || c >= 11159 && c <= 11263 || c >= 11776 && c <= 11777 || c === 11778 || c === 11779 || c === 11780 || c === 11781 || c >= 11782 && c <= 11784 || c === 11785 || c === 11786 || c === 11787 || c === 11788 || c === 11789 || c >= 11790 && c <= 11798 || c === 11799 || c >= 11800 && c <= 11801 || c === 11802 || c === 11803 || c === 11804 || c === 11805 || c >= 11806 && c <= 11807 || c === 11808 || c === 11809 || c === 11810 || c === 11811 || c === 11812 || c === 11813 || c === 11814 || c === 11815 || c === 11816 || c === 11817 || c >= 11818 && c <= 11822 || c === 11823 || c >= 11824 && c <= 11833 || c >= 11834 && c <= 11835 || c >= 11836 && c <= 11839 || c === 11840 || c === 11841 || c === 11842 || c >= 11843 && c <= 11855 || c >= 11856 && c <= 11857 || c === 11858 || c >= 11859 && c <= 11903 || c >= 12289 && c <= 12291 || c === 12296 || c === 12297 || c === 12298 || c === 12299 || c === 12300 || c === 12301 || c === 12302 || c === 12303 || c === 12304 || c === 12305 || c >= 12306 && c <= 12307 || c === 12308 || c === 12309 || c === 12310 || c === 12311 || c === 12312 || c === 12313 || c === 12314 || c === 12315 || c === 12316 || c === 12317 || c >= 12318 && c <= 12319 || c === 12320 || c === 12336 || c === 64830 || c === 64831 || c >= 65093 && c <= 65094;
}
function pruneLocation(els) {
    els.forEach(function (el) {
        delete el.location;
        if (isSelectElement(el) || isPluralElement(el)) {
            for (var k in el.options) {
                delete el.options[k].location;
                pruneLocation(el.options[k].value);
            }
        }
        else if (isNumberElement(el) && isNumberSkeleton(el.style)) {
            delete el.style.location;
        }
        else if ((isDateElement(el) || isTimeElement(el)) && isDateTimeSkeleton(el.style)) {
            delete el.style.location;
        }
        else if (isTagElement(el)) {
            pruneLocation(el.children);
        }
    });
}
function parse(message, opts) {
    if (opts === void 0) {
        opts = {};
    }
    opts = __assign({ shouldParseSkeletons: true, requiresOtherClause: true }, opts);
    var result = new Parser(message, opts).parse();
    if (result.err) {
        var error = SyntaxError(ErrorKind[result.err.kind]);
        error.location = result.err.location;
        error.originalMessage = result.err.message;
        throw error;
    }
    if (!(opts === null || opts === void 0 ? void 0 : opts.captureLocation)) {
        pruneLocation(result.val);
    }
    return result.val;
}
function memoize(fn, options) {
    var cache = options && options.cache ? options.cache : cacheDefault;
    var serializer = options && options.serializer ? options.serializer : serializerDefault;
    var strategy = options && options.strategy ? options.strategy : strategyDefault;
    return strategy(fn, {
        cache,
        serializer
    });
}
function isPrimitive(value) {
    return value == null || typeof value === "number" || typeof value === "boolean";
}
function monadic(fn, cache, serializer, arg) {
    var cacheKey = isPrimitive(arg) ? arg : serializer(arg);
    var computedValue = cache.get(cacheKey);
    if (typeof computedValue === "undefined") {
        computedValue = fn.call(this, arg);
        cache.set(cacheKey, computedValue);
    }
    return computedValue;
}
function variadic(fn, cache, serializer) {
    var args = Array.prototype.slice.call(arguments, 3);
    var cacheKey = serializer(args);
    var computedValue = cache.get(cacheKey);
    if (typeof computedValue === "undefined") {
        computedValue = fn.apply(this, args);
        cache.set(cacheKey, computedValue);
    }
    return computedValue;
}
function assemble(fn, context, strategy, cache, serialize) {
    return strategy.bind(context, fn, cache, serialize);
}
function strategyDefault(fn, options) {
    var strategy = fn.length === 1 ? monadic : variadic;
    return assemble(fn, this, strategy, options.cache.create(), options.serializer);
}
function strategyVariadic(fn, options) {
    return assemble(fn, this, variadic, options.cache.create(), options.serializer);
}
var serializerDefault = function () {
    return JSON.stringify(arguments);
};
function ObjectWithoutPrototypeCache() {
    this.cache = Object.create(null);
}
ObjectWithoutPrototypeCache.prototype.has = function (key) {
    return key in this.cache;
};
ObjectWithoutPrototypeCache.prototype.get = function (key) {
    return this.cache[key];
};
ObjectWithoutPrototypeCache.prototype.set = function (key, value) {
    this.cache[key] = value;
};
var cacheDefault = {
    create: function create() {
        return new ObjectWithoutPrototypeCache();
    }
};
var strategies = {
    variadic: strategyVariadic};
var ErrorCode;
(function (ErrorCode2) {
    ErrorCode2["MISSING_VALUE"] = "MISSING_VALUE";
    ErrorCode2["INVALID_VALUE"] = "INVALID_VALUE";
    ErrorCode2["MISSING_INTL_API"] = "MISSING_INTL_API";
})(ErrorCode || (ErrorCode = {}));
var FormatError = class extends Error {
    constructor(msg, code, originalMessage) {
        super(msg);
        this.code = code;
        this.originalMessage = originalMessage;
    }
    toString() {
        return `[formatjs Error: ${this.code}] ${this.message}`;
    }
};
var InvalidValueError = class extends FormatError {
    constructor(variableId, value, options, originalMessage) {
        super(`Invalid values for "${variableId}": "${value}". Options are "${Object.keys(options).join('", "')}"`, ErrorCode.INVALID_VALUE, originalMessage);
    }
};
var InvalidValueTypeError = class extends FormatError {
    constructor(value, type, originalMessage) {
        super(`Value for "${value}" must be of type ${type}`, ErrorCode.INVALID_VALUE, originalMessage);
    }
};
var MissingValueError = class extends FormatError {
    constructor(variableId, originalMessage) {
        super(`The intl string context variable "${variableId}" was not provided to the string "${originalMessage}"`, ErrorCode.MISSING_VALUE, originalMessage);
    }
};
var PART_TYPE;
(function (PART_TYPE2) {
    PART_TYPE2[PART_TYPE2["literal"] = 0] = "literal";
    PART_TYPE2[PART_TYPE2["object"] = 1] = "object";
})(PART_TYPE || (PART_TYPE = {}));
function mergeLiteral(parts) {
    if (parts.length < 2) {
        return parts;
    }
    return parts.reduce((all, part) => {
        const lastPart = all[all.length - 1];
        if (!lastPart || lastPart.type !== PART_TYPE.literal || part.type !== PART_TYPE.literal) {
            all.push(part);
        }
        else {
            lastPart.value += part.value;
        }
        return all;
    }, []);
}
function isFormatXMLElementFn(el) {
    return typeof el === "function";
}
function formatToParts(els, locales, formatters, formats, values, currentPluralValue, originalMessage) {
    if (els.length === 1 && isLiteralElement(els[0])) {
        return [
            {
                type: PART_TYPE.literal,
                value: els[0].value
            }
        ];
    }
    const result = [];
    for (const el of els) {
        if (isLiteralElement(el)) {
            result.push({
                type: PART_TYPE.literal,
                value: el.value
            });
            continue;
        }
        if (isPoundElement(el)) {
            if (typeof currentPluralValue === "number") {
                result.push({
                    type: PART_TYPE.literal,
                    value: formatters.getNumberFormat(locales).format(currentPluralValue)
                });
            }
            continue;
        }
        const { value: varName } = el;
        if (!(values && varName in values)) {
            throw new MissingValueError(varName, originalMessage);
        }
        let value = values[varName];
        if (isArgumentElement(el)) {
            if (!value || typeof value === "string" || typeof value === "number") {
                value = typeof value === "string" || typeof value === "number" ? String(value) : "";
            }
            result.push({
                type: typeof value === "string" ? PART_TYPE.literal : PART_TYPE.object,
                value
            });
            continue;
        }
        if (isDateElement(el)) {
            const style = typeof el.style === "string" ? formats.date[el.style] : isDateTimeSkeleton(el.style) ? el.style.parsedOptions : void 0;
            result.push({
                type: PART_TYPE.literal,
                value: formatters.getDateTimeFormat(locales, style).format(value)
            });
            continue;
        }
        if (isTimeElement(el)) {
            const style = typeof el.style === "string" ? formats.time[el.style] : isDateTimeSkeleton(el.style) ? el.style.parsedOptions : void 0;
            result.push({
                type: PART_TYPE.literal,
                value: formatters.getDateTimeFormat(locales, style).format(value)
            });
            continue;
        }
        if (isNumberElement(el)) {
            const style = typeof el.style === "string" ? formats.number[el.style] : isNumberSkeleton(el.style) ? el.style.parsedOptions : void 0;
            if (style && style.scale) {
                value = value * (style.scale || 1);
            }
            result.push({
                type: PART_TYPE.literal,
                value: formatters.getNumberFormat(locales, style).format(value)
            });
            continue;
        }
        if (isTagElement(el)) {
            const { children, value: value2 } = el;
            const formatFn = values[value2];
            if (!isFormatXMLElementFn(formatFn)) {
                throw new InvalidValueTypeError(value2, "function", originalMessage);
            }
            const parts = formatToParts(children, locales, formatters, formats, values, currentPluralValue);
            let chunks = formatFn(parts.map((p) => p.value));
            if (!Array.isArray(chunks)) {
                chunks = [chunks];
            }
            result.push(...chunks.map((c) => {
                return {
                    type: typeof c === "string" ? PART_TYPE.literal : PART_TYPE.object,
                    value: c
                };
            }));
        }
        if (isSelectElement(el)) {
            const opt = el.options[value] || el.options.other;
            if (!opt) {
                throw new InvalidValueError(el.value, value, Object.keys(el.options), originalMessage);
            }
            result.push(...formatToParts(opt.value, locales, formatters, formats, values));
            continue;
        }
        if (isPluralElement(el)) {
            let opt = el.options[`=${value}`];
            if (!opt) {
                if (!Intl.PluralRules) {
                    throw new FormatError(`Intl.PluralRules is not available in this environment.
Try polyfilling it using "@formatjs/intl-pluralrules"
`, ErrorCode.MISSING_INTL_API, originalMessage);
                }
                const rule = formatters.getPluralRules(locales, { type: el.pluralType }).select(value - (el.offset || 0));
                opt = el.options[rule] || el.options.other;
            }
            if (!opt) {
                throw new InvalidValueError(el.value, value, Object.keys(el.options), originalMessage);
            }
            result.push(...formatToParts(opt.value, locales, formatters, formats, values, value - (el.offset || 0)));
            continue;
        }
    }
    return mergeLiteral(result);
}
function mergeConfig(c1, c2) {
    if (!c2) {
        return c1;
    }
    return {
        ...c1 || {},
        ...c2 || {},
        ...Object.keys(c1).reduce((all, k) => {
            all[k] = {
                ...c1[k],
                ...c2[k] || {}
            };
            return all;
        }, {})
    };
}
function mergeConfigs(defaultConfig, configs) {
    if (!configs) {
        return defaultConfig;
    }
    return Object.keys(defaultConfig).reduce((all, k) => {
        all[k] = mergeConfig(defaultConfig[k], configs[k]);
        return all;
    }, { ...defaultConfig });
}
function createFastMemoizeCache(store) {
    return {
        create() {
            return {
                has(key) {
                    return key in store;
                },
                get(key) {
                    return store[key];
                },
                set(key, value) {
                    store[key] = value;
                }
            };
        }
    };
}
function createDefaultFormatters(cache = {
    number: {},
    dateTime: {},
    pluralRules: {}
}) {
    return {
        getNumberFormat: memoize((...args) => new Intl.NumberFormat(...args), {
            cache: createFastMemoizeCache(cache.number),
            strategy: strategies.variadic
        }),
        getDateTimeFormat: memoize((...args) => new Intl.DateTimeFormat(...args), {
            cache: createFastMemoizeCache(cache.dateTime),
            strategy: strategies.variadic
        }),
        getPluralRules: memoize((...args) => new Intl.PluralRules(...args), {
            cache: createFastMemoizeCache(cache.pluralRules),
            strategy: strategies.variadic
        })
    };
}
var IntlMessageFormat = class {
    constructor(message, locales = IntlMessageFormat.defaultLocale, overrideFormats, opts) {
        this.formatterCache = {
            number: {},
            dateTime: {},
            pluralRules: {}
        };
        this.format = (values) => {
            const parts = this.formatToParts(values);
            if (parts.length === 1) {
                return parts[0].value;
            }
            const result = parts.reduce((all, part) => {
                if (!all.length || part.type !== PART_TYPE.literal || typeof all[all.length - 1] !== "string") {
                    all.push(part.value);
                }
                else {
                    all[all.length - 1] += part.value;
                }
                return all;
            }, []);
            if (result.length <= 1) {
                return result[0] || "";
            }
            return result;
        };
        this.formatToParts = (values) => formatToParts(this.ast, this.locales, this.formatters, this.formats, values, void 0, this.message);
        this.resolvedOptions = () => ({
            locale: Intl.NumberFormat.supportedLocalesOf(this.locales)[0]
        });
        this.getAst = () => this.ast;
        if (typeof message === "string") {
            this.message = message;
            if (!IntlMessageFormat.__parse) {
                throw new TypeError("IntlMessageFormat.__parse must be set to process `message` of type `string`");
            }
            this.ast = IntlMessageFormat.__parse(message, {
                ignoreTag: opts?.ignoreTag
            });
        }
        else {
            this.ast = message;
        }
        if (!Array.isArray(this.ast)) {
            throw new TypeError("A message must be provided as a String or AST.");
        }
        this.formats = mergeConfigs(IntlMessageFormat.formats, overrideFormats);
        this.locales = locales;
        this.formatters = opts && opts.formatters || createDefaultFormatters(this.formatterCache);
    }
    static get defaultLocale() {
        if (!IntlMessageFormat.memoizedDefaultLocale) {
            IntlMessageFormat.memoizedDefaultLocale = new Intl.NumberFormat().resolvedOptions().locale;
        }
        return IntlMessageFormat.memoizedDefaultLocale;
    }
};
IntlMessageFormat.memoizedDefaultLocale = null;
IntlMessageFormat.__parse = parse;
IntlMessageFormat.formats = {
    number: {
        integer: {
            maximumFractionDigits: 0
        },
        currency: {
            style: "currency"
        },
        percent: {
            style: "percent"
        }
    },
    date: {
        short: {
            month: "numeric",
            day: "numeric",
            year: "2-digit"
        },
        medium: {
            month: "short",
            day: "numeric",
            year: "numeric"
        },
        long: {
            month: "long",
            day: "numeric",
            year: "numeric"
        },
        full: {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    },
    time: {
        short: {
            hour: "numeric",
            minute: "numeric"
        },
        medium: {
            hour: "numeric",
            minute: "numeric",
            second: "numeric"
        },
        long: {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            timeZoneName: "short"
        },
        full: {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            timeZoneName: "short"
        }
    }
};
var lib_esnext_default = IntlMessageFormat;
/*! *****************************************************************************
Copyright (c) Microsoft Corporation.
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

// Copyright 2018 The Lighthouse Authors. All Rights Reserved.
const EMPTY_VALUES_OBJECT = {};
class RegisteredFileStrings {
    filename;
    stringStructure;
    localizedMessages;
    localizedStringSet;
    constructor(filename, stringStructure, localizedMessages) {
        this.filename = filename;
        this.stringStructure = stringStructure;
        this.localizedMessages = localizedMessages;
    }
    getLocalizedStringSetFor(locale) {
        if (this.localizedStringSet) {
            return this.localizedStringSet;
        }
        const localeData = this.localizedMessages.get(locale);
        if (!localeData) {
            throw new Error(`No locale data registered for '${locale}'`);
        }
        this.localizedStringSet = new LocalizedStringSet(this.filename, this.stringStructure, locale, localeData);
        return this.localizedStringSet;
    }
}
class LocalizedStringSet {
    filename;
    stringStructure;
    localizedMessages;
    cachedSimpleStrings = new Map();
    cachedMessageFormatters = new Map();
    localeForFormatter;
    constructor(filename, stringStructure, locale, localizedMessages) {
        this.filename = filename;
        this.stringStructure = stringStructure;
        this.localizedMessages = localizedMessages;
        this.localeForFormatter = (locale === 'en-XA' || locale === 'en-XL') ? 'de-DE' : locale;
    }
    getLocalizedString(message, values = EMPTY_VALUES_OBJECT) {
        if (values === EMPTY_VALUES_OBJECT || Object.keys(values).length === 0) {
            return this.getSimpleLocalizedString(message);
        }
        return this.getFormattedLocalizedString(message, values);
    }
    getMessageFormatterFor(message) {
        const keyname = Object.keys(this.stringStructure).find(key => this.stringStructure[key] === message);
        if (!keyname) {
            throw new Error(`Unable to locate '${message}' in UIStrings object`);
        }
        const i18nId = `${this.filename} | ${keyname}`;
        const localeMessage = this.localizedMessages[i18nId];
        const messageToTranslate = localeMessage ? localeMessage.message : message;
        return new lib_esnext_default(messageToTranslate, this.localeForFormatter, undefined, { ignoreTag: true });
    }
    getSimpleLocalizedString(message) {
        const cachedSimpleString = this.cachedSimpleStrings.get(message);
        if (cachedSimpleString) {
            return cachedSimpleString;
        }
        const formatter = this.getMessageFormatterFor(message);
        try {
            const translatedString = formatter.format();
            this.cachedSimpleStrings.set(message, translatedString);
            return translatedString;
        }
        catch {
            const formatter = new lib_esnext_default(message, this.localeForFormatter, undefined, { ignoreTag: true });
            const translatedString = formatter.format();
            this.cachedSimpleStrings.set(message, translatedString);
            return translatedString;
        }
    }
    getFormattedLocalizedString(message, values) {
        let formatter = this.cachedMessageFormatters.get(message);
        if (!formatter) {
            formatter = this.getMessageFormatterFor(message);
            this.cachedMessageFormatters.set(message, formatter);
        }
        try {
            return formatter.format(values);
        }
        catch {
            const formatter = new lib_esnext_default(message, this.localeForFormatter, undefined, { ignoreTag: true });
            return formatter.format(values);
        }
    }
}

// Copyright 2018 The Lighthouse Authors. All Rights Reserved.
class I18n {
    supportedLocales;
    localeData = new Map();
    defaultLocale;
    constructor(supportedLocales, defaultLocale) {
        this.defaultLocale = defaultLocale;
        this.supportedLocales = new Set(supportedLocales);
    }
    registerLocaleData(locale, messages) {
        this.localeData.set(locale, messages);
    }
    hasLocaleDataForTest(locale) {
        return this.localeData.has(locale);
    }
    resetLocaleDataForTest() {
        this.localeData.clear();
    }
    registerFileStrings(filename, stringStructure) {
        return new RegisteredFileStrings(filename, stringStructure, this.localeData);
    }
    lookupClosestSupportedLocale(locale) {
        const canonicalLocale = Intl.getCanonicalLocales(locale)[0];
        const localeParts = canonicalLocale.split('-');
        while (localeParts.length) {
            const candidate = localeParts.join('-');
            if (this.supportedLocales.has(candidate)) {
                return candidate;
            }
            localeParts.pop();
        }
        return this.defaultLocale;
    }
}

const LOCALES = [
  'en-US',
];
const DEFAULT_LOCALE = 'en-US';

// Copyright 2020 The Chromium Authors
const i18nInstance = new I18n(LOCALES, DEFAULT_LOCALE);
function getLazilyComputedLocalizedString(registeredStrings, id, values = {}) {
    return () => getLocalizedString(registeredStrings, id, values);
}
function getLocalizedString(registeredStrings, id, values = {}) {
    return registeredStrings.getLocalizedStringSetFor(DevToolsLocale.instance().locale).getLocalizedString(id, values);
}
function registerUIStrings(path, stringStructure) {
    return i18nInstance.registerFileStrings(path, stringStructure);
}
function lockedLazyString(str) {
    return () => str;
}

// Copyright 2014 The Chromium Authors
const UIStrings$2 = {
    elementsPanel: 'Elements panel',
    stylesSidebar: 'Styles sidebar',
    changesDrawer: 'Changes drawer',
    issuesView: 'Issues view',
    networkPanel: 'Network panel',
    requestConditionsDrawer: 'Request conditions drawer',
    applicationPanel: 'Application panel',
    sourcesPanel: 'Sources panel',
    timelinePanel: 'Performance panel',
    memoryInspectorPanel: 'Memory inspector panel',
    developerResourcesPanel: 'Developer resources panel',
    animationsPanel: 'Animations panel',
    lighthousePanel: 'Lighthouse panel',
};
const str_$2 = registerUIStrings('core/common/Revealer.ts', UIStrings$2);
const i18nLazyString$1 = getLazilyComputedLocalizedString.bind(undefined, str_$2);
({
    DEVELOPER_RESOURCES_PANEL: i18nLazyString$1(UIStrings$2.developerResourcesPanel),
    ELEMENTS_PANEL: i18nLazyString$1(UIStrings$2.elementsPanel),
    STYLES_SIDEBAR: i18nLazyString$1(UIStrings$2.stylesSidebar),
    CHANGES_DRAWER: i18nLazyString$1(UIStrings$2.changesDrawer),
    ISSUES_VIEW: i18nLazyString$1(UIStrings$2.issuesView),
    NETWORK_PANEL: i18nLazyString$1(UIStrings$2.networkPanel),
    REQUEST_CONDITIONS_DRAWER: i18nLazyString$1(UIStrings$2.requestConditionsDrawer),
    TIMELINE_PANEL: i18nLazyString$1(UIStrings$2.timelinePanel),
    APPLICATION_PANEL: i18nLazyString$1(UIStrings$2.applicationPanel),
    SOURCES_PANEL: i18nLazyString$1(UIStrings$2.sourcesPanel),
    MEMORY_INSPECTOR_PANEL: i18nLazyString$1(UIStrings$2.memoryInspectorPanel),
    ANIMATIONS_PANEL: i18nLazyString$1(UIStrings$2.animationsPanel),
    LIGHTHOUSE_PANEL: i18nLazyString$1(UIStrings$2.lighthousePanel),
});

// Copyright 2014 The Chromium Authors
var FrontendMessageSource;
(function (FrontendMessageSource) {
    FrontendMessageSource["CSS"] = "css";
    FrontendMessageSource["ConsoleAPI"] = "console-api";
    FrontendMessageSource["ISSUE_PANEL"] = "issue-panel";
    FrontendMessageSource["SELF_XSS"] = "self-xss";
})(FrontendMessageSource || (FrontendMessageSource = {}));

// Copyright 2012 The Chromium Authors
function normalizePath(path) {
    if (path.indexOf('..') === -1 && path.indexOf('.') === -1) {
        return path;
    }
    const segments = (path[0] === '/' ? path.substring(1) : path).split('/');
    const normalizedSegments = [];
    for (const segment of segments) {
        if (segment === '.') {
            continue;
        }
        else if (segment === '..') {
            normalizedSegments.pop();
        }
        else {
            normalizedSegments.push(segment);
        }
    }
    let normalizedPath = normalizedSegments.join('/');
    if (path[0] === '/' && normalizedPath) {
        normalizedPath = '/' + normalizedPath;
    }
    if (normalizedPath[normalizedPath.length - 1] !== '/' &&
        ((path[path.length - 1] === '/') || (segments[segments.length - 1] === '.') ||
            (segments[segments.length - 1] === '..'))) {
        normalizedPath = normalizedPath + '/';
    }
    return normalizedPath;
}
class ParsedURL {
    isValid = false;
    url;
    scheme = '';
    user = '';
    host = '';
    port = '';
    path = '';
    queryParams = '';
    fragment = '';
    folderPathComponents = '';
    lastPathComponent = '';
    blobInnerScheme;
    #displayName;
    #dataURLDisplayName;
    constructor(url) {
        this.url = url;
        const isBlobUrl = this.url.startsWith('blob:');
        const urlToMatch = isBlobUrl ? url.substring(5) : url;
        const match = urlToMatch.match(ParsedURL.urlRegex());
        if (match) {
            this.isValid = true;
            if (isBlobUrl) {
                this.blobInnerScheme = match[2].toLowerCase();
                this.scheme = 'blob';
            }
            else {
                this.scheme = match[2].toLowerCase();
            }
            this.user = match[3] ?? '';
            this.host = match[4] ?? '';
            this.port = match[5] ?? '';
            this.path = match[6] ?? '/';
            this.queryParams = match[7] ?? '';
            this.fragment = match[8] ?? '';
        }
        else {
            if (this.url.startsWith('data:')) {
                this.scheme = 'data';
                return;
            }
            if (this.url.startsWith('blob:')) {
                this.scheme = 'blob';
                return;
            }
            if (this.url === 'about:blank') {
                this.scheme = 'about';
                return;
            }
            this.path = this.url;
        }
        const lastSlashExceptTrailingIndex = this.path.lastIndexOf('/', this.path.length - 2);
        if (lastSlashExceptTrailingIndex !== -1) {
            this.lastPathComponent = this.path.substring(lastSlashExceptTrailingIndex + 1);
        }
        else {
            this.lastPathComponent = this.path;
        }
        const lastSlashIndex = this.path.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
            this.folderPathComponents = this.path.substring(0, lastSlashIndex);
        }
    }
    static fromString(string) {
        const parsedURL = new ParsedURL(string.toString());
        if (parsedURL.isValid) {
            return parsedURL;
        }
        return null;
    }
    static preEncodeSpecialCharactersInPath(path) {
        for (const specialChar of ['%', ';', '#', '?', ' ']) {
            (path) = path.replaceAll(specialChar, encodeURIComponent(specialChar));
        }
        return path;
    }
    static rawPathToEncodedPathString(path) {
        const partiallyEncoded = ParsedURL.preEncodeSpecialCharactersInPath(path);
        if (path.startsWith('/')) {
            return new URL(partiallyEncoded, 'file:///').pathname;
        }
        return new URL('/' + partiallyEncoded, 'file:///').pathname.substr(1);
    }
    static encodedFromParentPathAndName(parentPath, name) {
        return ParsedURL.concatenate(parentPath, '/', ParsedURL.preEncodeSpecialCharactersInPath(name));
    }
    static urlFromParentUrlAndName(parentUrl, name) {
        return ParsedURL.concatenate(parentUrl, '/', ParsedURL.preEncodeSpecialCharactersInPath(name));
    }
    static encodedPathToRawPathString(encPath) {
        return decodeURIComponent(encPath);
    }
    static rawPathToUrlString(fileSystemPath) {
        let preEncodedPath = ParsedURL.preEncodeSpecialCharactersInPath(fileSystemPath.replace(/\\/g, '/'));
        preEncodedPath = preEncodedPath.replace(/\\/g, '/');
        if (!preEncodedPath.startsWith('file://')) {
            if (preEncodedPath.startsWith('/')) {
                preEncodedPath = 'file://' + preEncodedPath;
            }
            else {
                preEncodedPath = 'file:///' + preEncodedPath;
            }
        }
        let url = new URL(preEncodedPath).toString();
        while (url.endsWith('/') && url.length > 'file:///'.length) {
            url = url.substring(0, url.length - 1);
        }
        return url;
    }
    static relativePathToUrlString(relativePath, baseURL) {
        const preEncodedPath = ParsedURL.preEncodeSpecialCharactersInPath(relativePath.replace(/\\/g, '/'));
        return new URL(preEncodedPath, baseURL).toString();
    }
    static urlToRawPathString(fileURL, isWindows) {
        console.assert(fileURL.startsWith('file://'), 'This must be a file URL.');
        const decodedFileURL = decodeURIComponent(fileURL);
        if (isWindows) {
            return decodedFileURL.substr('file:///'.length).replace(/\//g, '\\');
        }
        return decodedFileURL.substr('file://'.length);
    }
    static sliceUrlToEncodedPathString(url, start) {
        return url.substring(start);
    }
    static substr(devToolsPath, from, length) {
        return devToolsPath.substr(from, length);
    }
    static substring(devToolsPath, start, end) {
        return devToolsPath.substring(start, end);
    }
    static prepend(prefix, devToolsPath) {
        return prefix + devToolsPath;
    }
    static concatenate(devToolsPath, ...appendage) {
        return devToolsPath.concat(...appendage);
    }
    static trim(devToolsPath) {
        return devToolsPath.trim();
    }
    static slice(devToolsPath, start, end) {
        return devToolsPath.slice(start, end);
    }
    static join(devToolsPaths, separator) {
        return devToolsPaths.join(separator);
    }
    static split(devToolsPath, separator, limit) {
        return devToolsPath.split(separator, limit);
    }
    static toLowerCase(devToolsPath) {
        return devToolsPath.toLowerCase();
    }
    static isValidUrlString(str) {
        return new ParsedURL(str).isValid;
    }
    static urlWithoutHash(url) {
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
            return url.substr(0, hashIndex);
        }
        return url;
    }
    static urlRegex() {
        if (ParsedURL.urlRegexInstance) {
            return ParsedURL.urlRegexInstance;
        }
        const schemeRegex = /([A-Za-z][A-Za-z0-9+.-]*):\/\//;
        const userRegex = /(?:([A-Za-z0-9\-._~%!$&'()*+,;=:]*)@)?/;
        const hostRegex = /((?:\[[0-9a-fA-F:.]*:[0-9a-fA-F:.]*\])|(?:[^\s\/:]*))/;
        const portRegex = /(?::([\d]+))?/;
        const pathRegex = /(\/[^#?]*)?/;
        const queryRegex = /(?:\?([^#]*))?/;
        const fragmentRegex = /(?:#(.*))?/;
        ParsedURL.urlRegexInstance = new RegExp('^(' + schemeRegex.source + userRegex.source + hostRegex.source + portRegex.source + ')' + pathRegex.source +
            queryRegex.source + fragmentRegex.source + '$');
        return ParsedURL.urlRegexInstance;
    }
    static extractPath(url) {
        const parsedURL = this.fromString(url);
        return (parsedURL ? parsedURL.path : '');
    }
    static extractOrigin(url) {
        const parsedURL = this.fromString(url);
        return parsedURL ? parsedURL.securityOrigin() : EmptyUrlString;
    }
    static extractExtension(url) {
        url = ParsedURL.urlWithoutHash(url);
        const indexOfQuestionMark = url.indexOf('?');
        if (indexOfQuestionMark !== -1) {
            url = url.substr(0, indexOfQuestionMark);
        }
        const lastIndexOfSlash = url.lastIndexOf('/');
        if (lastIndexOfSlash !== -1) {
            url = url.substr(lastIndexOfSlash + 1);
        }
        const lastIndexOfDot = url.lastIndexOf('.');
        if (lastIndexOfDot !== -1) {
            url = url.substr(lastIndexOfDot + 1);
            const lastIndexOfPercent = url.indexOf('%');
            if (lastIndexOfPercent !== -1) {
                return url.substr(0, lastIndexOfPercent);
            }
            return url;
        }
        return '';
    }
    static extractName(url) {
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        let index = url.lastIndexOf('/');
        const pathAndQuery = index !== -1 ? url.substr(index + 1) : url;
        index = pathAndQuery.indexOf('?');
        return index < 0 ? pathAndQuery : pathAndQuery.substr(0, index);
    }
    static completeURL(baseURL, href) {
        if (href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('javascript:') ||
            href.startsWith('mailto:')) {
            return href;
        }
        const trimmedHref = href.trim();
        const parsedHref = this.fromString(trimmedHref);
        if (parsedHref?.scheme) {
            const securityOrigin = parsedHref.securityOrigin();
            const pathText = normalizePath(parsedHref.path);
            const queryText = parsedHref.queryParams && `?${parsedHref.queryParams}`;
            const fragmentText = parsedHref.fragment && `#${parsedHref.fragment}`;
            return securityOrigin + pathText + queryText + fragmentText;
        }
        const parsedURL = this.fromString(baseURL);
        if (!parsedURL) {
            return null;
        }
        if (parsedURL.isDataURL()) {
            return href;
        }
        if (href.length > 1 && href.charAt(0) === '/' && href.charAt(1) === '/') {
            return parsedURL.scheme + ':' + href;
        }
        const securityOrigin = parsedURL.securityOrigin();
        const pathText = parsedURL.path;
        const queryText = parsedURL.queryParams ? '?' + parsedURL.queryParams : '';
        if (!href.length) {
            return securityOrigin + pathText + queryText;
        }
        if (href.charAt(0) === '#') {
            return securityOrigin + pathText + queryText + href;
        }
        if (href.charAt(0) === '?') {
            return securityOrigin + pathText + href;
        }
        const hrefMatches = href.match(/^[^#?]*/);
        if (!hrefMatches || !href.length) {
            throw new Error('Invalid href');
        }
        let hrefPath = hrefMatches[0];
        const hrefSuffix = href.substring(hrefPath.length);
        if (hrefPath.charAt(0) !== '/') {
            hrefPath = parsedURL.folderPathComponents + '/' + hrefPath;
        }
        return securityOrigin + normalizePath(hrefPath) + hrefSuffix;
    }
    static splitLineAndColumn(string) {
        const beforePathMatch = string.match(ParsedURL.urlRegex());
        let beforePath = '';
        let pathAndAfter = string;
        if (beforePathMatch) {
            beforePath = beforePathMatch[1];
            pathAndAfter = string.substring(beforePathMatch[1].length);
        }
        const lineColumnRegEx = /(?::(\d+))?(?::(\d+))?$/;
        const lineColumnMatch = lineColumnRegEx.exec(pathAndAfter);
        let lineNumber;
        let columnNumber;
        console.assert(Boolean(lineColumnMatch));
        if (!lineColumnMatch) {
            return { url: string, lineNumber: 0, columnNumber: 0 };
        }
        if (typeof (lineColumnMatch[1]) === 'string') {
            lineNumber = parseInt(lineColumnMatch[1], 10);
            lineNumber = isNaN(lineNumber) ? undefined : lineNumber - 1;
        }
        if (typeof (lineColumnMatch[2]) === 'string') {
            columnNumber = parseInt(lineColumnMatch[2], 10);
            columnNumber = isNaN(columnNumber) ? undefined : columnNumber - 1;
        }
        let url = beforePath + pathAndAfter.substring(0, pathAndAfter.length - lineColumnMatch[0].length);
        if (lineColumnMatch[1] === undefined && lineColumnMatch[2] === undefined) {
            const wasmCodeOffsetRegex = /wasm-function\[\d+\]:0x([a-z0-9]+)$/g;
            const wasmCodeOffsetMatch = wasmCodeOffsetRegex.exec(pathAndAfter);
            if (wasmCodeOffsetMatch && typeof (wasmCodeOffsetMatch[1]) === 'string') {
                url = ParsedURL.removeWasmFunctionInfoFromURL(url);
                columnNumber = parseInt(wasmCodeOffsetMatch[1], 16);
                columnNumber = isNaN(columnNumber) ? undefined : columnNumber;
            }
        }
        return { url, lineNumber, columnNumber };
    }
    static removeWasmFunctionInfoFromURL(url) {
        const wasmFunctionRegEx = /:wasm-function\[\d+\]/;
        const wasmFunctionIndex = url.search(wasmFunctionRegEx);
        if (wasmFunctionIndex === -1) {
            return url;
        }
        return ParsedURL.substring(url, 0, wasmFunctionIndex);
    }
    static beginsWithWindowsDriveLetter(url) {
        return /^[A-Za-z]:/.test(url);
    }
    static beginsWithScheme(url) {
        return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url);
    }
    static isRelativeURL(url) {
        return !this.beginsWithScheme(url) || this.beginsWithWindowsDriveLetter(url);
    }
    get displayName() {
        if (this.#displayName) {
            return this.#displayName;
        }
        if (this.isDataURL()) {
            return this.dataURLDisplayName();
        }
        if (this.isBlobURL()) {
            return this.url;
        }
        if (this.isAboutBlank()) {
            return this.url;
        }
        this.#displayName = this.lastPathComponent;
        if (!this.#displayName) {
            this.#displayName = (this.host || '') + '/';
        }
        if (this.#displayName === '/') {
            this.#displayName = this.url;
        }
        return this.#displayName;
    }
    dataURLDisplayName() {
        if (this.#dataURLDisplayName) {
            return this.#dataURLDisplayName;
        }
        if (!this.isDataURL()) {
            return '';
        }
        this.#dataURLDisplayName = trimEndWithMaxLength(this.url, 20);
        return this.#dataURLDisplayName;
    }
    isAboutBlank() {
        return this.url === 'about:blank';
    }
    isDataURL() {
        return this.scheme === 'data';
    }
    extractDataUrlMimeType() {
        const regexp = /^data:((?<type>\w+)\/(?<subtype>\w+))?(;base64)?,/;
        const match = this.url.match(regexp);
        return {
            type: match?.groups?.type,
            subtype: match?.groups?.subtype,
        };
    }
    isBlobURL() {
        return this.url.startsWith('blob:');
    }
    lastPathComponentWithFragment() {
        return this.lastPathComponent + (this.fragment ? '#' + this.fragment : '');
    }
    domain() {
        if (this.isDataURL()) {
            return 'data:';
        }
        return this.host + (this.port ? ':' + this.port : '');
    }
    securityOrigin() {
        if (this.isDataURL()) {
            return 'data:';
        }
        const scheme = this.isBlobURL() ? this.blobInnerScheme : this.scheme;
        const domain = this.domain();
        if (!scheme && !domain) {
            return '';
        }
        return scheme + '://' + domain;
    }
    urlWithoutScheme() {
        if (this.scheme && this.url.startsWith(this.scheme + '://')) {
            return this.url.substring(this.scheme.length + 3);
        }
        return this.url;
    }
    static urlRegexInstance = null;
}

// Copyright 2021 The Chromium Authors
/*
 * Copyright (C) 2012 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
const UIStrings$1 = {
    fetchAndXHR: '`Fetch` and `XHR`',
    javascript: 'JavaScript',
    js: 'JS',
    css: 'CSS',
    img: 'Img',
    media: 'Media',
    font: 'Font',
    doc: 'Doc',
    socketShort: 'Socket',
    webassembly: 'WebAssembly',
    wasm: 'Wasm',
    manifest: 'Manifest',
    other: 'Other',
    document: 'Document',
    stylesheet: 'Stylesheet',
    image: 'Image',
    script: 'Script',
    texttrack: 'TextTrack',
    fetch: 'Fetch',
    eventsource: 'EventSource',
    websocket: 'WebSocket',
    webtransport: 'WebTransport',
    directsocket: 'DirectSocket',
    signedexchange: 'SignedExchange',
    ping: 'Ping',
    cspviolationreport: 'CSPViolationReport',
    preflight: 'Preflight',
    fedcm: 'FedCM',
};
const str_$1 = registerUIStrings('core/common/ResourceType.ts', UIStrings$1);
const i18nLazyString = getLazilyComputedLocalizedString.bind(undefined, str_$1);
class ResourceType {
    #name;
    #title;
    #category;
    #isTextType;
    constructor(name, title, category, isTextType) {
        this.#name = name;
        this.#title = title;
        this.#category = category;
        this.#isTextType = isTextType;
    }
    static fromMimeType(mimeType) {
        if (!mimeType) {
            return resourceTypes.Other;
        }
        if (mimeType.startsWith('text/html')) {
            return resourceTypes.Document;
        }
        if (mimeType.startsWith('text/css')) {
            return resourceTypes.Stylesheet;
        }
        if (mimeType.startsWith('image/')) {
            return resourceTypes.Image;
        }
        if (mimeType.startsWith('text/')) {
            return resourceTypes.Script;
        }
        if (mimeType.includes('font')) {
            return resourceTypes.Font;
        }
        if (mimeType.includes('script')) {
            return resourceTypes.Script;
        }
        if (mimeType.includes('octet')) {
            return resourceTypes.Other;
        }
        if (mimeType.includes('application')) {
            return resourceTypes.Script;
        }
        return resourceTypes.Other;
    }
    static fromMimeTypeOverride(mimeType) {
        if (mimeType === 'application/manifest+json') {
            return resourceTypes.Manifest;
        }
        if (mimeType === 'application/wasm') {
            return resourceTypes.Wasm;
        }
        return null;
    }
    static fromURL(url) {
        return resourceTypeByExtension.get(ParsedURL.extractExtension(url)) || null;
    }
    static fromName(name) {
        for (const resourceType of Object.values(resourceTypes)) {
            if (resourceType.name() === name) {
                return resourceType;
            }
        }
        return null;
    }
    static mimeFromURL(url) {
        if (url.startsWith('snippet://') || url.startsWith('debugger://')) {
            return 'text/javascript';
        }
        const name = ParsedURL.extractName(url);
        if (mimeTypeByName.has(name)) {
            return mimeTypeByName.get(name);
        }
        let ext = ParsedURL.extractExtension(url).toLowerCase();
        if (ext === 'html' && name.endsWith('.component.html')) {
            ext = 'component.html';
        }
        return mimeTypeByExtension.get(ext);
    }
    static mimeFromExtension(ext) {
        return mimeTypeByExtension.get(ext);
    }
    static simplifyContentType(contentType) {
        const regex = new RegExp('^application(.*json$|\/json\+.*)');
        return regex.test(contentType) ? 'application/json' : contentType;
    }
    static isJavaScriptMimeType(mimeType) {
        return mimeType === 'application/javascript' || mimeType === 'text/javascript';
    }
    static mediaTypeForMetrics(mimeType, isFromSourceMap, isMinified, isSnippet, isDebugger) {
        if (mimeType !== 'text/javascript') {
            return mimeType;
        }
        if (isFromSourceMap) {
            return 'text/javascript+sourcemapped';
        }
        if (isMinified) {
            return 'text/javascript+minified';
        }
        if (isSnippet) {
            return 'text/javascript+snippet';
        }
        if (isDebugger) {
            return 'text/javascript+eval';
        }
        return 'text/javascript+plain';
    }
    name() {
        return this.#name;
    }
    title() {
        return this.#title();
    }
    category() {
        return this.#category;
    }
    isTextType() {
        return this.#isTextType;
    }
    isScript() {
        return this.#name === 'script' || this.#name === 'sm-script';
    }
    hasScripts() {
        return this.isScript() || this.isDocument();
    }
    isStyleSheet() {
        return this.#name === 'stylesheet' || this.#name === 'sm-stylesheet';
    }
    hasStyleSheets() {
        return this.isStyleSheet() || this.isDocument();
    }
    isDocument() {
        return this.#name === 'document';
    }
    isDocumentOrScriptOrStyleSheet() {
        return this.isDocument() || this.isScript() || this.isStyleSheet();
    }
    isFont() {
        return this.#name === 'font';
    }
    isImage() {
        return this.#name === 'image';
    }
    isFromSourceMap() {
        return this.#name.startsWith('sm-');
    }
    toString() {
        return this.#name;
    }
    canonicalMimeType() {
        if (this.isDocument()) {
            return 'text/html';
        }
        if (this.isScript()) {
            return 'text/javascript';
        }
        if (this.isStyleSheet()) {
            return 'text/css';
        }
        return '';
    }
}
class ResourceCategory {
    name;
    title;
    shortTitle;
    constructor(name, title, shortTitle) {
        this.name = name;
        this.title = title;
        this.shortTitle = shortTitle;
    }
}
const resourceCategories = {
    XHR: new ResourceCategory('Fetch and XHR', i18nLazyString(UIStrings$1.fetchAndXHR), lockedLazyString('Fetch/XHR')),
    Document: new ResourceCategory(UIStrings$1.document, i18nLazyString(UIStrings$1.document), i18nLazyString(UIStrings$1.doc)),
    Stylesheet: new ResourceCategory(UIStrings$1.css, i18nLazyString(UIStrings$1.css), i18nLazyString(UIStrings$1.css)),
    Script: new ResourceCategory(UIStrings$1.javascript, i18nLazyString(UIStrings$1.javascript), i18nLazyString(UIStrings$1.js)),
    Font: new ResourceCategory(UIStrings$1.font, i18nLazyString(UIStrings$1.font), i18nLazyString(UIStrings$1.font)),
    Image: new ResourceCategory(UIStrings$1.image, i18nLazyString(UIStrings$1.image), i18nLazyString(UIStrings$1.img)),
    Media: new ResourceCategory(UIStrings$1.media, i18nLazyString(UIStrings$1.media), i18nLazyString(UIStrings$1.media)),
    Manifest: new ResourceCategory(UIStrings$1.manifest, i18nLazyString(UIStrings$1.manifest), i18nLazyString(UIStrings$1.manifest)),
    Socket: new ResourceCategory('Socket', lockedLazyString('WebSocket | WebTransport | DirectSocket'), i18nLazyString(UIStrings$1.socketShort)),
    Wasm: new ResourceCategory(UIStrings$1.webassembly, i18nLazyString(UIStrings$1.webassembly), i18nLazyString(UIStrings$1.wasm)),
    Other: new ResourceCategory(UIStrings$1.other, i18nLazyString(UIStrings$1.other), i18nLazyString(UIStrings$1.other)),
};
const resourceTypes = {
    Document: new ResourceType('document', i18nLazyString(UIStrings$1.document), resourceCategories.Document, true),
    Stylesheet: new ResourceType('stylesheet', i18nLazyString(UIStrings$1.stylesheet), resourceCategories.Stylesheet, true),
    Image: new ResourceType('image', i18nLazyString(UIStrings$1.image), resourceCategories.Image, false),
    Media: new ResourceType('media', i18nLazyString(UIStrings$1.media), resourceCategories.Media, false),
    Font: new ResourceType('font', i18nLazyString(UIStrings$1.font), resourceCategories.Font, false),
    Script: new ResourceType('script', i18nLazyString(UIStrings$1.script), resourceCategories.Script, true),
    TextTrack: new ResourceType('texttrack', i18nLazyString(UIStrings$1.texttrack), resourceCategories.Other, true),
    XHR: new ResourceType('xhr', lockedLazyString('XHR'), resourceCategories.XHR, true),
    Fetch: new ResourceType('fetch', i18nLazyString(UIStrings$1.fetch), resourceCategories.XHR, true),
    Prefetch: new ResourceType('prefetch', lockedLazyString('Prefetch'), resourceCategories.Document, true),
    EventSource: new ResourceType('eventsource', i18nLazyString(UIStrings$1.eventsource), resourceCategories.XHR, true),
    WebSocket: new ResourceType('websocket', i18nLazyString(UIStrings$1.websocket), resourceCategories.Socket, false),
    WebTransport: new ResourceType('webtransport', i18nLazyString(UIStrings$1.webtransport), resourceCategories.Socket, false),
    DirectSocket: new ResourceType('directsocket', i18nLazyString(UIStrings$1.directsocket), resourceCategories.Socket, false),
    Wasm: new ResourceType('wasm', i18nLazyString(UIStrings$1.wasm), resourceCategories.Wasm, false),
    Manifest: new ResourceType('manifest', i18nLazyString(UIStrings$1.manifest), resourceCategories.Manifest, true),
    SignedExchange: new ResourceType('signed-exchange', i18nLazyString(UIStrings$1.signedexchange), resourceCategories.Other, false),
    Ping: new ResourceType('ping', i18nLazyString(UIStrings$1.ping), resourceCategories.Other, false),
    CSPViolationReport: new ResourceType('csp-violation-report', i18nLazyString(UIStrings$1.cspviolationreport), resourceCategories.Other, false),
    Other: new ResourceType('other', i18nLazyString(UIStrings$1.other), resourceCategories.Other, false),
    Preflight: new ResourceType('preflight', i18nLazyString(UIStrings$1.preflight), resourceCategories.Other, true),
    SourceMapScript: new ResourceType('sm-script', i18nLazyString(UIStrings$1.script), resourceCategories.Script, true),
    SourceMapStyleSheet: new ResourceType('sm-stylesheet', i18nLazyString(UIStrings$1.stylesheet), resourceCategories.Stylesheet, true),
    FedCM: new ResourceType('fedcm', i18nLazyString(UIStrings$1.fedcm), resourceCategories.Other, false),
};
const mimeTypeByName = new Map([
    ['Cakefile', 'text/x-coffeescript'],
]);
const resourceTypeByExtension = new Map([
    ['js', resourceTypes.Script],
    ['mjs', resourceTypes.Script],
    ['css', resourceTypes.Stylesheet],
    ['xsl', resourceTypes.Stylesheet],
    ['avif', resourceTypes.Image],
    ['bmp', resourceTypes.Image],
    ['gif', resourceTypes.Image],
    ['ico', resourceTypes.Image],
    ['jpeg', resourceTypes.Image],
    ['jpg', resourceTypes.Image],
    ['jxl', resourceTypes.Image],
    ['png', resourceTypes.Image],
    ['svg', resourceTypes.Image],
    ['tif', resourceTypes.Image],
    ['tiff', resourceTypes.Image],
    ['vue', resourceTypes.Document],
    ['webmanifest', resourceTypes.Manifest],
    ['webp', resourceTypes.Media],
    ['otf', resourceTypes.Font],
    ['ttc', resourceTypes.Font],
    ['ttf', resourceTypes.Font],
    ['woff', resourceTypes.Font],
    ['woff2', resourceTypes.Font],
    ['wasm', resourceTypes.Wasm],
]);
const mimeTypeByExtension = new Map([
    ['js', 'text/javascript'],
    ['mjs', 'text/javascript'],
    ['css', 'text/css'],
    ['html', 'text/html'],
    ['htm', 'text/html'],
    ['xml', 'application/xml'],
    ['xsl', 'application/xml'],
    ['wasm', 'application/wasm'],
    ['webmanifest', 'application/manifest+json'],
    ['asp', 'application/x-aspx'],
    ['aspx', 'application/x-aspx'],
    ['jsp', 'application/x-jsp'],
    ['c', 'text/x-c++src'],
    ['cc', 'text/x-c++src'],
    ['cpp', 'text/x-c++src'],
    ['h', 'text/x-c++src'],
    ['m', 'text/x-c++src'],
    ['mm', 'text/x-c++src'],
    ['coffee', 'text/x-coffeescript'],
    ['dart', 'application/vnd.dart'],
    ['ts', 'text/typescript'],
    ['tsx', 'text/typescript-jsx'],
    ['json', 'application/json'],
    ['gyp', 'application/json'],
    ['gypi', 'application/json'],
    ['map', 'application/json'],
    ['cs', 'text/x-csharp'],
    ['go', 'text/x-go'],
    ['java', 'text/x-java'],
    ['kt', 'text/x-kotlin'],
    ['scala', 'text/x-scala'],
    ['less', 'text/x-less'],
    ['php', 'application/x-httpd-php'],
    ['phtml', 'application/x-httpd-php'],
    ['py', 'text/x-python'],
    ['sh', 'text/x-sh'],
    ['gss', 'text/x-gss'],
    ['sass', 'text/x-sass'],
    ['scss', 'text/x-scss'],
    ['vtt', 'text/vtt'],
    ['ls', 'text/x-livescript'],
    ['md', 'text/markdown'],
    ['cljs', 'text/x-clojure'],
    ['cljc', 'text/x-clojure'],
    ['cljx', 'text/x-clojure'],
    ['styl', 'text/x-styl'],
    ['jsx', 'text/jsx'],
    ['avif', 'image/avif'],
    ['bmp', 'image/bmp'],
    ['gif', 'image/gif'],
    ['ico', 'image/ico'],
    ['jpeg', 'image/jpeg'],
    ['jpg', 'image/jpeg'],
    ['jxl', 'image/jxl'],
    ['png', 'image/png'],
    ['svg', 'image/svg+xml'],
    ['tif', 'image/tif'],
    ['tiff', 'image/tiff'],
    ['webp', 'image/webp'],
    ['otf', 'font/otf'],
    ['ttc', 'font/collection'],
    ['ttf', 'font/ttf'],
    ['woff', 'font/woff'],
    ['woff2', 'font/woff2'],
    ['component.html', 'text/x.angular'],
    ['svelte', 'text/x.svelte'],
    ['vue', 'text/x.vue'],
]);

// Copyright 2020 The Chromium Authors
const UIStrings = {
    elements: 'Elements',
    ai: 'AI',
    appearance: 'Appearance',
    sources: 'Sources',
    network: 'Network',
    performance: 'Performance',
    console: 'Console',
    persistence: 'Persistence',
    debugger: 'Debugger',
    global: 'Global',
    rendering: 'Rendering',
    grid: 'Grid',
    mobile: 'Mobile',
    memory: 'Memory',
    extension: 'Extension',
    adorner: 'Adorner',
    account: 'Account',
};
const str_ = registerUIStrings('core/common/SettingRegistration.ts', UIStrings);
getLocalizedString.bind(undefined, str_);

// Copyright 2020 The Chromium Authors
class TextCursor {
    #lineEndings;
    #offset = 0;
    #lineNumber = 0;
    #columnNumber = 0;
    constructor(lineEndings) {
        this.#lineEndings = lineEndings;
    }
    advance(offset) {
        this.#offset = offset;
        while (this.#lineNumber < this.#lineEndings.length && this.#lineEndings[this.#lineNumber] < this.#offset) {
            ++this.#lineNumber;
        }
        this.#columnNumber = this.#lineNumber ? this.#offset - this.#lineEndings[this.#lineNumber - 1] - 1 : this.#offset;
    }
    offset() {
        return this.#offset;
    }
    resetTo(offset) {
        this.#offset = offset;
        this.#lineNumber =
            lowerBound(this.#lineEndings, offset, DEFAULT_COMPARATOR);
        this.#columnNumber = this.#lineNumber ? this.#offset - this.#lineEndings[this.#lineNumber - 1] - 1 : this.#offset;
    }
    lineNumber() {
        return this.#lineNumber;
    }
    columnNumber() {
        return this.#columnNumber;
    }
}

// Copyright 2023 The Chromium Authors
new FinalizationRegistry(url => {
    URL.revokeObjectURL(url);
});

/**
 * marked v18.0.4 - a markdown parser
 * Copyright (c) 2018-2026, MarkedJS. (MIT License)
 * Copyright (c) 2011-2018, Christopher Jeffrey. (MIT License)
 * https://github.com/markedjs/marked
 */
function M() { return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null }; }
var T = M();
function N(l) { T = l; }
var _ = { exec: () => null };
function E(l) { let e = []; return t => { let n = Math.max(0, Math.min(3, t - 1)), s = e[n]; return s || (s = l(n), e[n] = s), s; }; }
function d(l, e = "") { let t = typeof l == "string" ? l : l.source, n = { replace: (s, r) => { let i = typeof r == "string" ? r : r.source; return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n; }, getRegex: () => new RegExp(t, e) }; return n; }
var Te = ((l = "") => { try {
    return !!new RegExp("(?<=1)(?<!1)" + l);
}
catch {
    return false;
} })(), m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: l => new RegExp(`^( {0,3}${l})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: E(l => new RegExp(`^ {0,${l}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: E(l => new RegExp(`^ {0,${l}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: E(l => new RegExp(`^ {0,${l}}(?:\`\`\`|~~~)`)), headingBeginRegex: E(l => new RegExp(`^ {0,${l}}#`)), htmlBeginRegex: E(l => new RegExp(`^ {0,${l}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: E(l => new RegExp(`^ {0,${l}}>`)) }, Oe = /^(?:[ \t]*(?:\n|$))+/, we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, B = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, j = / {0,3}(?:[*+-]|\d{1,9}[.)])/, oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, ae = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), Se = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), F = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/, $e = /^[^\n]+/, U = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, Le = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", U).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), _e = d(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, j).getRegex(), H = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", K = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, ze = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", K).replace("tag", H).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), le = d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex(), Me = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", le).getRegex(), W = { blockquote: Me, code: we, def: Le, fences: ye, heading: Pe, hr: B, html: ze, lheading: ae, list: _e, newline: Oe, paragraph: le, table: _, text: $e }, se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex(), Ee = { ...W, lheading: Se, table: se, paragraph: d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex() }, Ie = { ...W, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", K).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(F).replace("hr", B).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() }, Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, ue = /^( {2,}|\\)\n(?!\s*$)/, Be = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, I = /[\p{P}\p{S}]/u, Z = /[\s\p{P}\p{S}]/u, X = /[^\s\p{P}\p{S}]/u, De = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, Z).getRegex(), pe = /(?!~)[\p{P}\p{S}]/u, qe = /(?!~)[\s\p{P}\p{S}]/u, ve = /(?:[^\s\p{P}\p{S}]|~)/u, He = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, Ze = d(ce, "u").replace(/punct/g, I).getRegex(), Ge = d(ce, "u").replace(/punct/g, pe).getRegex(), he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", Ne = d(he, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Qe = d(he, "gu").replace(/notPunctSpace/g, ve).replace(/punctSpace/g, qe).replace(/punct/g, pe).getRegex(), je = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Fe = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, I).getRegex(), Ue = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", Ke = d(Ue, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), We = d(/\\(punct)/, "gu").replace(/punct/g, I).getRegex(), Xe = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), Je = d(K).replace("(?:-->|$)", "-->").getRegex(), Ve = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Je).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), v = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/, Ye = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", v).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), ke = d(/^!?\[(label)\]\[(ref)\]/).replace("label", v).replace("ref", U).getRegex(), de = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", U).getRegex(), et = d("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex(), ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, J = { _backpedal: _, anyPunctuation: We, autolink: Xe, blockSkip: He, br: ue, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Ne, emStrongRDelimUnd: je, escape: Ae, link: Ye, nolink: de, punctuation: De, reflink: ke, reflinkSearch: et, tag: Ve, text: Be, url: _ }, tt = { ...J, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", v).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", v).getRegex() }, Q = { ...J, emStrongRDelimAst: Qe, emStrongLDelim: Ge, delLDelim: Fe, delRDelim: Ke, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() }, nt = { ...Q, br: d(ue).replace("{2,}", "*").getRegex(), text: d(Q.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() }, D = { normal: W, gfm: Ee, pedantic: Ie }, A = { normal: J, gfm: Q, breaks: nt, pedantic: tt };
var rt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }, ge = l => rt[l];
function O(l, e) { if (e) {
    if (m.escapeTest.test(l))
        return l.replace(m.escapeReplace, ge);
}
else if (m.escapeTestNoEncode.test(l))
    return l.replace(m.escapeReplaceNoEncode, ge); return l; }
function V(l) { try {
    l = encodeURI(l).replace(m.percentDecode, "%");
}
catch {
    return null;
} return l; }
function Y(l, e) { let t = l.replace(m.findPipe, (r, i, o) => { let u = false, a = i; for (; --a >= 0 && o[a] === "\\";)
    u = !u; return u ? "|" : " |"; }), n = t.split(m.splitPipe), s = 0; if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e)
    if (n.length > e)
        n.splice(e);
    else
        for (; n.length < e;)
            n.push(""); for (; s < n.length; s++)
    n[s] = n[s].trim().replace(m.slashPipe, "|"); return n; }
function $(l, e, t) { let n = l.length; if (n === 0)
    return ""; let s = 0; for (; s < n;) {
    let r = l.charAt(n - s - 1);
    if (r === e && true)
        s++;
    else break;
} return l.slice(0, n - s); }
function ee(l) {
    let e = l.split(`
`), t = e.length - 1;
    for (; t >= 0 && m.blankLine.test(e[t]);)
        t--;
    return e.length - t <= 2 ? l : e.slice(0, t + 1).join(`
`);
}
function fe(l, e) { if (l.indexOf(e[1]) === -1)
    return -1; let t = 0; for (let n = 0; n < l.length; n++)
    if (l[n] === "\\")
        n++;
    else if (l[n] === e[0])
        t++;
    else if (l[n] === e[1] && (t--, t < 0))
        return n; return t > 0 ? -2 : -1; }
function me(l, e = 0) { let t = e, n = ""; for (let s of l)
    if (s === "	") {
        let r = 4 - t % 4;
        n += " ".repeat(r), t += r;
    }
    else
        n += s, t++; return n; }
function xe(l, e, t, n, s) { let r = e.href, i = e.title || null, o = l[1].replace(s.other.outputLinkReplace, "$1"); n.state.inLink = true; let u = { type: l[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) }; return n.state.inLink = false, u; }
function st(l, e, t) {
    let n = l.match(t.other.indentCodeCompensation);
    if (n === null)
        return e;
    let s = n[1];
    return e.split(`
`).map(r => { let i = r.match(t.other.beginningSpace); if (i === null)
        return r; let [o] = i; return o.length >= s.length ? r.slice(s.length) : r; }).join(`
`);
}
var w = class {
    options;
    rules;
    lexer;
    constructor(e) { this.options = e || T; }
    space(e) { let t = this.rules.block.newline.exec(e); if (t && t[0].length > 0)
        return { type: "space", raw: t[0] }; }
    code(e) { let t = this.rules.block.code.exec(e); if (t) {
        let n = this.options.pedantic ? t[0] : ee(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
        return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    } }
    fences(e) { let t = this.rules.block.fences.exec(e); if (t) {
        let n = t[0], s = st(n, t[3] || "", this.rules);
        return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    } }
    heading(e) {
        let t = this.rules.block.heading.exec(e);
        if (t) {
            let n = t[2].trim();
            if (this.rules.other.endingHash.test(n)) {
                let s = $(n, "#");
                (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
            }
            return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
        }
    }
    hr(e) {
        let t = this.rules.block.hr.exec(e);
        if (t)
            return { type: "hr", raw: $(t[0], `
`) };
    }
    blockquote(e) {
        let t = this.rules.block.blockquote.exec(e);
        if (t) {
            let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
            for (; n.length > 0;) {
                let o = false, u = [], a;
                for (a = 0; a < n.length; a++)
                    if (this.rules.other.blockquoteStart.test(n[a]))
                        u.push(n[a]), o = true;
                    else if (!o)
                        u.push(n[a]);
                    else
                        break;
                n = n.slice(a);
                let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
                s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
                let k = this.lexer.state.top;
                if (this.lexer.state.top = true, this.lexer.blockTokens(p, i, true), this.lexer.state.top = k, n.length === 0)
                    break;
                let h = i.at(-1);
                if (h?.type === "code")
                    break;
                if (h?.type === "blockquote") {
                    let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
                    i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
                    break;
                }
                else if (h?.type === "list") {
                    let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
                    i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
                    continue;
                }
            }
            return { type: "blockquote", raw: s, tokens: i, text: r };
        }
    }
    list(e) {
        let t = this.rules.block.list.exec(e);
        if (t) {
            let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
            n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
            let i = this.rules.other.listItemRegex(n), o = false;
            for (; e;) {
                let a = false, c = "", p = "";
                if (!(t = i.exec(e)) || this.rules.block.hr.test(e))
                    break;
                c = t[0], e = e.substring(c.length);
                let k = me(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
                if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
                    let S = this.rules.other.nextBulletRegex(f), te = this.rules.other.hrRegex(f), ne = this.rules.other.fencesBeginRegex(f), re = this.rules.other.headingBeginRegex(f), be = this.rules.other.htmlBeginRegex(f), Re = this.rules.other.blockquoteBeginRegex(f);
                    for (; e;) {
                        let G = e.split(`
`, 1)[0], C;
                        if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), ne.test(h) || re.test(h) || be.test(h) || Re.test(h) || S.test(h) || te.test(h))
                            break;
                        if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim())
                            p += `
` + C.slice(f);
                        else {
                            if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(k) || re.test(k) || te.test(k))
                                break;
                            p += `
` + h;
                        }
                        R = !h.trim(), c += G + `
`, e = e.substring(G.length + 1), k = C.slice(f);
                    }
                }
                r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
            }
            let u = r.items.at(-1);
            if (u)
                u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
            else
                return;
            r.raw = r.raw.trimEnd();
            for (let a of r.items) {
                this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []);
                let c = a.tokens[0];
                if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
                    a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
                    for (let k = this.lexer.inlineQueue.length - 1; k >= 0; k--)
                        if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
                            this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
                            break;
                        }
                    let p = this.rules.other.listTaskCheckbox.exec(a.raw);
                    if (p) {
                        let k = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
                        a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({ type: "paragraph", raw: k.raw, text: k.raw, tokens: [k] }) : a.tokens.unshift(k);
                    }
                }
                else
                    a.task && (a.task = false);
                if (!r.loose) {
                    let p = a.tokens.filter(h => h.type === "space"), k = p.length > 0 && p.some(h => this.rules.other.anyLine.test(h.raw));
                    r.loose = k;
                }
            }
            if (r.loose)
                for (let a of r.items) {
                    a.loose = true;
                    for (let c of a.tokens)
                        c.type === "text" && (c.type = "paragraph");
                }
            return r;
        }
    }
    html(e) { let t = this.rules.block.html.exec(e); if (t) {
        let n = ee(t[0]);
        return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    } }
    def(e) {
        let t = this.rules.block.def.exec(e);
        if (t) {
            let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
            return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
        }
    }
    table(e) {
        let t = this.rules.block.table.exec(e);
        if (!t || !this.rules.other.tableDelimiter.test(t[2]))
            return;
        let n = Y(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
        if (n.length === s.length) {
            for (let o of s)
                this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
            for (let o = 0; o < n.length; o++)
                i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
            for (let o of r)
                i.rows.push(Y(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
            return i;
        }
    }
    lheading(e) {
        let t = this.rules.block.lheading.exec(e);
        if (t) {
            let n = t[1].trim();
            return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
        }
    }
    paragraph(e) {
        let t = this.rules.block.paragraph.exec(e);
        if (t) {
            let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
            return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
        }
    }
    text(e) { let t = this.rules.block.text.exec(e); if (t)
        return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) }; }
    escape(e) { let t = this.rules.inline.escape.exec(e); if (t)
        return { type: "escape", raw: t[0], text: t[1] }; }
    tag(e) { let t = this.rules.inline.tag.exec(e); if (t)
        return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] }; }
    link(e) { let t = this.rules.inline.link.exec(e); if (t) {
        let n = t[2].trim();
        if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
            if (!this.rules.other.endAngleBracket.test(n))
                return;
            let i = $(n.slice(0, -1), "\\");
            if ((n.length - i.length) % 2 === 0)
                return;
        }
        else {
            let i = fe(t[2], "()");
            if (i === -2)
                return;
            if (i > -1) {
                let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
                t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
            }
        }
        let s = t[2], r = "";
        if (this.options.pedantic) {
            let i = this.rules.other.pedanticHrefTitle.exec(s);
            i && (s = i[1], r = i[3]);
        }
        else
            r = t[3] ? t[3].slice(1, -1) : "";
        return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    } }
    reflink(e, t) { let n; if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
        let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
        if (!r) {
            let i = n[0].charAt(0);
            return { type: "text", raw: i, text: i };
        }
        return xe(n, r, n[0], this.lexer, this.rules);
    } }
    emStrong(e, t, n = "") { let s = this.rules.inline.emStrongLDelim.exec(e); if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric))
        return; if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
        for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null;) {
            if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o)
                continue;
            if (u = [...o].length, s[3] || s[4]) {
                a += u;
                continue;
            }
            else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
                c += u;
                continue;
            }
            if (a -= u, a > 0)
                continue;
            u = Math.min(u, u + a + c);
            let k = [...s[0]][0].length, h = e.slice(0, i + s.index + k + u);
            if (Math.min(i, u) % 2) {
                let f = h.slice(1, -1);
                return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
            }
            let R = h.slice(2, -2);
            return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
        }
    } }
    codespan(e) { let t = this.rules.inline.code.exec(e); if (t) {
        let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
        return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    } }
    br(e) { let t = this.rules.inline.br.exec(e); if (t)
        return { type: "br", raw: t[0] }; }
    del(e, t, n = "") { let s = this.rules.inline.delLDelim.exec(e); if (!s)
        return; if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
        for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null;) {
            if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i))
                continue;
            if (s[3] || s[4]) {
                a += u;
                continue;
            }
            if (a -= u, a > 0)
                continue;
            u = Math.min(u, u + a);
            let p = [...s[0]][0].length, k = e.slice(0, i + s.index + p + u), h = k.slice(i, -i);
            return { type: "del", raw: k, text: h, tokens: this.lexer.inlineTokens(h) };
        }
    } }
    autolink(e) { let t = this.rules.inline.autolink.exec(e); if (t) {
        let n, s;
        return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    } }
    url(e) { let t; if (t = this.rules.inline.url.exec(e)) {
        let n, s;
        if (t[2] === "@")
            n = t[0], s = "mailto:" + n;
        else {
            let r;
            do
                r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
            while (r !== t[0]);
            n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
        }
        return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    } }
    inlineText(e) { let t = this.rules.inline.text.exec(e); if (t) {
        let n = this.lexer.state.inRawBlock;
        return { type: "text", raw: t[0], text: t[0], escaped: n };
    } }
};
var x = class l {
    tokens;
    options;
    state;
    inlineQueue;
    tokenizer;
    constructor(e) { this.tokens = [], this.tokens.links = Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w, this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true }; let t = { other: m, block: D.normal, inline: A.normal }; this.options.pedantic ? (t.block = D.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = D.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t; }
    static get rules() { return { block: D, inline: A }; }
    static lex(e, t) { return new l(t).lex(e); }
    static lexInline(e, t) { return new l(t).inlineTokens(e); }
    lex(e) {
        e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
        for (let t = 0; t < this.inlineQueue.length; t++) {
            let n = this.inlineQueue[t];
            this.inlineTokens(n.src, n.tokens);
        }
        return this.inlineQueue = [], this.tokens;
    }
    blockTokens(e, t = [], n = false) {
        this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
        let s = 1 / 0;
        for (; e;) {
            if (e.length < s)
                s = e.length;
            else {
                this.infiniteLoopError(e.charCodeAt(0));
                break;
            }
            let r;
            if (this.options.extensions?.block?.some(o => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false))
                continue;
            if (r = this.tokenizer.space(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
                continue;
            }
            if (r = this.tokenizer.code(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
                continue;
            }
            if (r = this.tokenizer.fences(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.heading(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.hr(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.blockquote(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.list(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.html(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.def(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
                continue;
            }
            if (r = this.tokenizer.table(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.lheading(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            let i = e;
            if (this.options.extensions?.startBlock) {
                let o = 1 / 0, u = e.slice(1), a;
                this.options.extensions.startBlock.forEach(c => { a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a)); }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
            }
            if (this.state.top && (r = this.tokenizer.paragraph(i))) {
                let o = t.at(-1);
                n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
                continue;
            }
            if (r = this.tokenizer.text(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
                continue;
            }
            if (e) {
                this.infiniteLoopError(e.charCodeAt(0));
                break;
            }
        }
        return this.state.top = true, t;
    }
    inline(e, t = []) { return this.inlineQueue.push({ src: e, tokens: t }), t; }
    inlineTokens(e, t = []) { this.tokenizer.lexer = this; let n = e, s = null; if (this.tokens.links) {
        let a = Object.keys(this.tokens.links);
        if (a.length > 0)
            for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null;)
                a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    } for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null;)
        n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex); let r; for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null;)
        r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex); n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n; let i = false, o = "", u = 1 / 0; for (; e;) {
        if (e.length < u)
            u = e.length;
        else {
            this.infiniteLoopError(e.charCodeAt(0));
            break;
        }
        i || (o = ""), i = false;
        let a;
        if (this.options.extensions?.inline?.some(p => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false))
            continue;
        if (a = this.tokenizer.escape(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.tag(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.link(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.reflink(e, this.tokens.links)) {
            e = e.substring(a.raw.length);
            let p = t.at(-1);
            a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
            continue;
        }
        if (a = this.tokenizer.emStrong(e, n, o)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.codespan(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.br(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.del(e, n, o)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.autolink(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (!this.state.inLink && (a = this.tokenizer.url(e))) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        let c = e;
        if (this.options.extensions?.startInline) {
            let p = 1 / 0, k = e.slice(1), h;
            this.options.extensions.startInline.forEach(R => { h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h)); }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
        }
        if (a = this.tokenizer.inlineText(c)) {
            e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = true;
            let p = t.at(-1);
            p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
            continue;
        }
        if (e) {
            this.infiniteLoopError(e.charCodeAt(0));
            break;
        }
    } return t; }
    infiniteLoopError(e) { let t = "Infinite loop on byte: " + e; if (this.options.silent)
        console.error(t);
    else
        throw new Error(t); }
};
var y = class {
    options;
    parser;
    constructor(e) { this.options = e || T; }
    space(e) { return ""; }
    code({ text: e, lang: t, escaped: n }) {
        let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
        return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
    }
    blockquote({ tokens: e }) {
        return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
    }
    html({ text: e }) { return e; }
    def(e) { return ""; }
    heading({ tokens: e, depth: t }) {
        return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
    }
    hr(e) {
        return `<hr>
`;
    }
    list(e) {
        let t = e.ordered, n = e.start, s = "";
        for (let o = 0; o < e.items.length; o++) {
            let u = e.items[o];
            s += this.listitem(u);
        }
        let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
        return "<" + r + i + `>
` + s + "</" + r + `>
`;
    }
    listitem(e) {
        return `<li>${this.parser.parse(e.tokens)}</li>
`;
    }
    checkbox({ checked: e }) { return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> '; }
    paragraph({ tokens: e }) {
        return `<p>${this.parser.parseInline(e)}</p>
`;
    }
    table(e) {
        let t = "", n = "";
        for (let r = 0; r < e.header.length; r++)
            n += this.tablecell(e.header[r]);
        t += this.tablerow({ text: n });
        let s = "";
        for (let r = 0; r < e.rows.length; r++) {
            let i = e.rows[r];
            n = "";
            for (let o = 0; o < i.length; o++)
                n += this.tablecell(i[o]);
            s += this.tablerow({ text: n });
        }
        return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
    }
    tablerow({ text: e }) {
        return `<tr>
${e}</tr>
`;
    }
    tablecell(e) {
        let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
        return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
    }
    strong({ tokens: e }) { return `<strong>${this.parser.parseInline(e)}</strong>`; }
    em({ tokens: e }) { return `<em>${this.parser.parseInline(e)}</em>`; }
    codespan({ text: e }) { return `<code>${O(e, true)}</code>`; }
    br(e) { return "<br>"; }
    del({ tokens: e }) { return `<del>${this.parser.parseInline(e)}</del>`; }
    link({ href: e, title: t, tokens: n }) { let s = this.parser.parseInline(n), r = V(e); if (r === null)
        return s; e = r; let i = '<a href="' + e + '"'; return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i; }
    image({ href: e, title: t, text: n, tokens: s }) { s && (n = this.parser.parseInline(s, this.parser.textRenderer)); let r = V(e); if (r === null)
        return O(n); e = r; let i = `<img src="${e}" alt="${O(n)}"`; return t && (i += ` title="${O(t)}"`), i += ">", i; }
    text(e) { return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text); }
};
var L = class {
    strong({ text: e }) { return e; }
    em({ text: e }) { return e; }
    codespan({ text: e }) { return e; }
    del({ text: e }) { return e; }
    html({ text: e }) { return e; }
    text({ text: e }) { return e; }
    link({ text: e }) { return "" + e; }
    image({ text: e }) { return "" + e; }
    br() { return ""; }
    checkbox({ raw: e }) { return e; }
};
var b = class l {
    options;
    renderer;
    textRenderer;
    constructor(e) { this.options = e || T, this.options.renderer = this.options.renderer || new y, this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L; }
    static parse(e, t) { return new l(t).parse(e); }
    static parseInline(e, t) { return new l(t).parseInline(e); }
    parse(e) { this.renderer.parser = this; let t = ""; for (let n = 0; n < e.length; n++) {
        let s = e[n];
        if (this.options.extensions?.renderers?.[s.type]) {
            let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
            if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i.type)) {
                t += o || "";
                continue;
            }
        }
        let r = s;
        switch (r.type) {
            case "space": {
                t += this.renderer.space(r);
                break;
            }
            case "hr": {
                t += this.renderer.hr(r);
                break;
            }
            case "heading": {
                t += this.renderer.heading(r);
                break;
            }
            case "code": {
                t += this.renderer.code(r);
                break;
            }
            case "table": {
                t += this.renderer.table(r);
                break;
            }
            case "blockquote": {
                t += this.renderer.blockquote(r);
                break;
            }
            case "list": {
                t += this.renderer.list(r);
                break;
            }
            case "checkbox": {
                t += this.renderer.checkbox(r);
                break;
            }
            case "html": {
                t += this.renderer.html(r);
                break;
            }
            case "def": {
                t += this.renderer.def(r);
                break;
            }
            case "paragraph": {
                t += this.renderer.paragraph(r);
                break;
            }
            case "text": {
                t += this.renderer.text(r);
                break;
            }
            default: {
                let i = 'Token with "' + r.type + '" type was not found.';
                if (this.options.silent)
                    return console.error(i), "";
                throw new Error(i);
            }
        }
    } return t; }
    parseInline(e, t = this.renderer) { this.renderer.parser = this; let n = ""; for (let s = 0; s < e.length; s++) {
        let r = e[s];
        if (this.options.extensions?.renderers?.[r.type]) {
            let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
            if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
                n += o || "";
                continue;
            }
        }
        let i = r;
        switch (i.type) {
            case "escape": {
                n += t.text(i);
                break;
            }
            case "html": {
                n += t.html(i);
                break;
            }
            case "link": {
                n += t.link(i);
                break;
            }
            case "image": {
                n += t.image(i);
                break;
            }
            case "checkbox": {
                n += t.checkbox(i);
                break;
            }
            case "strong": {
                n += t.strong(i);
                break;
            }
            case "em": {
                n += t.em(i);
                break;
            }
            case "codespan": {
                n += t.codespan(i);
                break;
            }
            case "br": {
                n += t.br(i);
                break;
            }
            case "del": {
                n += t.del(i);
                break;
            }
            case "text": {
                n += t.text(i);
                break;
            }
            default: {
                let o = 'Token with "' + i.type + '" type was not found.';
                if (this.options.silent)
                    return console.error(o), "";
                throw new Error(o);
            }
        }
    } return n; }
};
var P = class {
    options;
    block;
    constructor(e) { this.options = e || T; }
    static passThroughHooks = new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
    static passThroughHooksRespectAsync = new Set(["preprocess", "postprocess", "processAllTokens"]);
    preprocess(e) { return e; }
    postprocess(e) { return e; }
    processAllTokens(e) { return e; }
    emStrongMask(e) { return e; }
    provideLexer(e = this.block) { return e ? x.lex : x.lexInline; }
    provideParser(e = this.block) { return e ? b.parse : b.parseInline; }
};
var q = class {
    defaults = M();
    options = this.setOptions;
    parse = this.parseMarkdown(true);
    parseInline = this.parseMarkdown(false);
    Parser = b;
    Renderer = y;
    TextRenderer = L;
    Lexer = x;
    Tokenizer = w;
    Hooks = P;
    constructor(...e) { this.use(...e); }
    walkTokens(e, t) { let n = []; for (let s of e)
        switch (n = n.concat(t.call(this, s)), s.type) {
            case "table": {
                let r = s;
                for (let i of r.header)
                    n = n.concat(this.walkTokens(i.tokens, t));
                for (let i of r.rows)
                    for (let o of i)
                        n = n.concat(this.walkTokens(o.tokens, t));
                break;
            }
            case "list": {
                let r = s;
                n = n.concat(this.walkTokens(r.items, t));
                break;
            }
            default: {
                let r = s;
                this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach(i => { let o = r[i].flat(1 / 0); n = n.concat(this.walkTokens(o, t)); }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
            }
        } return n; }
    use(...e) { let t = this.defaults.extensions || { renderers: {}, childTokens: {} }; return e.forEach(n => { let s = { ...n }; if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach(r => { if (!r.name)
        throw new Error("extension name required"); if ("renderer" in r) {
        let i = t.renderers[r.name];
        i ? t.renderers[r.name] = function (...o) { let u = r.renderer.apply(this, o); return u === false && (u = i.apply(this, o)), u; } : t.renderers[r.name] = r.renderer;
    } if ("tokenizer" in r) {
        if (!r.level || r.level !== "block" && r.level !== "inline")
            throw new Error("extension level must be 'block' or 'inline'");
        let i = t[r.level];
        i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
    } "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens); }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new y(this.defaults);
        for (let i in n.renderer) {
            if (!(i in r))
                throw new Error(`renderer '${i}' does not exist`);
            if (["options", "parser"].includes(i))
                continue;
            let o = i, u = n.renderer[o], a = r[o];
            r[o] = (...c) => { let p = u.apply(r, c); return p === false && (p = a.apply(r, c)), p || ""; };
        }
        s.renderer = r;
    } if (n.tokenizer) {
        let r = this.defaults.tokenizer || new w(this.defaults);
        for (let i in n.tokenizer) {
            if (!(i in r))
                throw new Error(`tokenizer '${i}' does not exist`);
            if (["options", "rules", "lexer"].includes(i))
                continue;
            let o = i, u = n.tokenizer[o], a = r[o];
            r[o] = (...c) => { let p = u.apply(r, c); return p === false && (p = a.apply(r, c)), p; };
        }
        s.tokenizer = r;
    } if (n.hooks) {
        let r = this.defaults.hooks || new P;
        for (let i in n.hooks) {
            if (!(i in r))
                throw new Error(`hook '${i}' does not exist`);
            if (["options", "block"].includes(i))
                continue;
            let o = i, u = n.hooks[o], a = r[o];
            P.passThroughHooks.has(i) ? r[o] = c => { if (this.defaults.async && P.passThroughHooksRespectAsync.has(i))
                return (async () => { let k = await u.call(r, c); return a.call(r, k); })(); let p = u.call(r, c); return a.call(r, p); } : r[o] = (...c) => { if (this.defaults.async)
                return (async () => { let k = await u.apply(r, c); return k === false && (k = await a.apply(r, c)), k; })(); let p = u.apply(r, c); return p === false && (p = a.apply(r, c)), p; };
        }
        s.hooks = r;
    } if (n.walkTokens) {
        let r = this.defaults.walkTokens, i = n.walkTokens;
        s.walkTokens = function (o) { let u = []; return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u; };
    } this.defaults = { ...this.defaults, ...s }; }), this; }
    setOptions(e) { return this.defaults = { ...this.defaults, ...e }, this; }
    lexer(e, t) { return x.lex(e, t ?? this.defaults); }
    parser(e, t) { return b.parse(e, t ?? this.defaults); }
    parseMarkdown(e) { return (n, s) => { let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async); if (this.defaults.async === true && r.async === false)
        return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise.")); if (typeof n > "u" || n === null)
        return o(new Error("marked(): input parameter is undefined or null")); if (typeof n != "string")
        return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected")); if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async)
        return (async () => { let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c; i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens)); let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i); return i.hooks ? await i.hooks.postprocess(h) : h; })().catch(o); try {
        i.hooks && (n = i.hooks.preprocess(n));
        let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
        i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
        let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
        return i.hooks && (p = i.hooks.postprocess(p)), p;
    }
    catch (u) {
        return o(u);
    } }; }
    onError(e, t) {
        return n => {
            if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
                let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
                return t ? Promise.resolve(s) : s;
            }
            if (t)
                return Promise.reject(n);
            throw n;
        };
    }
};
var z = new q;
function g(l, e) { return z.parse(l, e); }
g.options = g.setOptions = function (l) { return z.setOptions(l), g.defaults = z.defaults, N(g.defaults), g; };
g.getDefaults = M;
g.defaults = T;
g.use = function (...l) { return z.use(...l), g.defaults = z.defaults, N(g.defaults), g; };
g.walkTokens = function (l, e) { return z.walkTokens(l, e); };
g.parseInline = z.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = L;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
g.options; g.setOptions; g.use; g.walkTokens; g.parseInline; b.parse; x.lex;

// Copyright 2014 The Chromium Authors
class AcornTokenizer {
    #textCursor;
    #tokenLineStart;
    #tokenLineEnd;
    #tokens;
    #idx = 0;
    constructor(content, tokens) {
        this.#tokens = tokens;
        const contentLineEndings = findLineEndingIndexes(content);
        this.#textCursor = new TextCursor(contentLineEndings);
        this.#tokenLineStart = 0;
        this.#tokenLineEnd = 0;
    }
    static punctuator(token, values) {
        return token.type !== types$1.num && token.type !== types$1.regexp &&
            token.type !== types$1.string && token.type !== types$1.name && !token.type.keyword &&
            (!values || (token.type.label.length === 1 && values.indexOf(token.type.label) !== -1));
    }
    static keyword(token, keyword) {
        return Boolean(token.type.keyword) && token.type !== types$1['_true'] &&
            token.type !== types$1['_false'] && token.type !== types$1['_null'] &&
            (!keyword || token.type.keyword === keyword);
    }
    static identifier(token, identifier) {
        return token.type === types$1.name && (!identifier || token.value === identifier);
    }
    static arrowIdentifier(token, identifier) {
        return token.type === types$1.arrow && (!identifier || token.type.label === identifier);
    }
    static lineComment(token) {
        return token.type === 'Line';
    }
    static blockComment(token) {
        return token.type === 'Block';
    }
    nextToken() {
        const token = this.#tokens[this.#idx++];
        if (!token || token.type === types$1.eof) {
            return null;
        }
        this.#textCursor.advance(token.start);
        this.#tokenLineStart = this.#textCursor.lineNumber();
        this.#textCursor.advance(token.end);
        this.#tokenLineEnd = this.#textCursor.lineNumber();
        return token;
    }
    peekToken() {
        const token = this.#tokens[this.#idx];
        if (!token || token.type === types$1.eof) {
            return null;
        }
        return token;
    }
    tokenLineStart() {
        return this.#tokenLineStart;
    }
    tokenLineEnd() {
        return this.#tokenLineEnd;
    }
}
const ECMA_VERSION = 'latest';

// Copyright 2014 The Chromium Authors
class ESTreeWalker {
    #beforeVisit;
    #afterVisit;
    constructor(beforeVisit, afterVisit) {
        this.#beforeVisit = beforeVisit;
        this.#afterVisit = afterVisit;
    }
    walk(ast) {
        this.#innerWalk(ast, null);
    }
    #innerWalk(node, parent) {
        if (!node) {
            return;
        }
        node.parent = parent;
        this.#beforeVisit.call(null, node);
        const walkOrder = WALK_ORDER[node.type];
        if (!walkOrder) {
            console.error('Walk order not defined for ' + node.type);
            return;
        }
        if (node.type === 'TemplateLiteral') {
            const templateLiteral = (node);
            const expressionsLength = templateLiteral.expressions.length;
            for (let i = 0; i < expressionsLength; ++i) {
                this.#innerWalk(templateLiteral.quasis[i], templateLiteral);
                this.#innerWalk(templateLiteral.expressions[i], templateLiteral);
            }
            this.#innerWalk(templateLiteral.quasis[expressionsLength], templateLiteral);
        }
        else {
            for (let i = 0; i < walkOrder.length; ++i) {
                const entity = node[walkOrder[i]];
                if (Array.isArray(entity)) {
                    this.#walkArray(entity, node);
                }
                else {
                    this.#innerWalk(entity, node);
                }
            }
        }
        this.#afterVisit.call(null, node);
    }
    #walkArray(nodeArray, parentNode) {
        for (let i = 0; i < nodeArray.length; ++i) {
            this.#innerWalk(nodeArray[i], parentNode);
        }
    }
}
const WALK_ORDER = {
    AwaitExpression: ['argument'],
    ArrayExpression: ['elements'],
    ArrayPattern: ['elements'],
    ArrowFunctionExpression: ['params', 'body'],
    AssignmentExpression: ['left', 'right'],
    AssignmentPattern: ['left', 'right'],
    BinaryExpression: ['left', 'right'],
    BlockStatement: ['body'],
    BreakStatement: ['label'],
    CallExpression: ['callee', 'arguments'],
    CatchClause: ['param', 'body'],
    ClassBody: ['body'],
    ClassDeclaration: ['id', 'superClass', 'body'],
    ClassExpression: ['id', 'superClass', 'body'],
    ChainExpression: ['expression'],
    ConditionalExpression: ['test', 'consequent', 'alternate'],
    ContinueStatement: ['label'],
    DebuggerStatement: [],
    DoWhileStatement: ['body', 'test'],
    EmptyStatement: [],
    ExpressionStatement: ['expression'],
    ForInStatement: ['left', 'right', 'body'],
    ForOfStatement: ['left', 'right', 'body'],
    ForStatement: ['init', 'test', 'update', 'body'],
    FunctionDeclaration: ['id', 'params', 'body'],
    FunctionExpression: ['id', 'params', 'body'],
    Identifier: [],
    ImportDeclaration: ['specifiers', 'source', 'attributes'],
    ImportAttribute: ['key', 'value'],
    ImportDefaultSpecifier: ['local'],
    ImportNamespaceSpecifier: ['local'],
    ImportSpecifier: ['imported', 'local'],
    ImportExpression: ['source'],
    ExportAllDeclaration: ['source'],
    ExportDefaultDeclaration: ['declaration'],
    ExportNamedDeclaration: ['specifiers', 'source', 'declaration'],
    ExportSpecifier: ['exported', 'local'],
    IfStatement: ['test', 'consequent', 'alternate'],
    LabeledStatement: ['label', 'body'],
    Literal: [],
    LogicalExpression: ['left', 'right'],
    MemberExpression: ['object', 'property'],
    MetaProperty: ['meta', 'property'],
    MethodDefinition: ['key', 'value'],
    NewExpression: ['callee', 'arguments'],
    ObjectExpression: ['properties'],
    ObjectPattern: ['properties'],
    ParenthesizedExpression: ['expression'],
    PrivateIdentifier: [],
    PropertyDefinition: ['key', 'value'],
    Program: ['body'],
    Property: ['key', 'value'],
    RestElement: ['argument'],
    ReturnStatement: ['argument'],
    SequenceExpression: ['expressions'],
    SpreadElement: ['argument'],
    StaticBlock: ['body'],
    Super: [],
    SwitchCase: ['test', 'consequent'],
    SwitchStatement: ['discriminant', 'cases'],
    TaggedTemplateExpression: ['tag', 'quasi'],
    TemplateElement: [],
    TemplateLiteral: ['quasis', 'expressions'],
    ThisExpression: [],
    ThrowStatement: ['argument'],
    TryStatement: ['block', 'handler', 'finalizer'],
    UnaryExpression: ['argument'],
    UpdateExpression: ['argument'],
    VariableDeclaration: ['declarations'],
    VariableDeclarator: ['id', 'init'],
    WhileStatement: ['test', 'body'],
    WithStatement: ['object', 'body'],
    YieldExpression: ['argument'],
};

// Copyright 2011 The Chromium Authors
class JavaScriptFormatter {
    #builder;
    #tokenizer;
    #content;
    #fromOffset;
    #lastLineNumber;
    #toOffset;
    constructor(builder) {
        this.#builder = builder;
    }
    format(text, _lineEndings, fromOffset, toOffset) {
        this.#fromOffset = fromOffset;
        this.#toOffset = toOffset;
        this.#content = text.substring(this.#fromOffset, this.#toOffset);
        this.#lastLineNumber = 0;
        const tokens = [];
        const ast = parse$1(this.#content, {
            ranges: false,
            preserveParens: true,
            allowAwaitOutsideFunction: true,
            allowImportExportEverywhere: true,
            ecmaVersion: ECMA_VERSION,
            allowHashBang: true,
            onToken: tokens,
            onComment: tokens,
        });
        this.#tokenizer = new AcornTokenizer(this.#content, tokens);
        const walker = new ESTreeWalker(this.#beforeVisit.bind(this), this.#afterVisit.bind(this));
        walker.walk(ast);
    }
    #push(token, format) {
        for (let i = 0; i < format.length; ++i) {
            if (format[i] === 's') {
                this.#builder.addSoftSpace();
            }
            else if (format[i] === 'S') {
                this.#builder.addHardSpace();
            }
            else if (format[i] === 'n') {
                this.#builder.addNewLine();
            }
            else if (format[i] === '>') {
                this.#builder.increaseNestingLevel();
            }
            else if (format[i] === '<') {
                this.#builder.decreaseNestingLevel();
            }
            else if (format[i] === 't') {
                if (this.#tokenizer.tokenLineStart() - this.#lastLineNumber > 1) {
                    this.#builder.addNewLine(true);
                }
                this.#lastLineNumber = this.#tokenizer.tokenLineEnd();
                if (token) {
                    this.#builder.addToken(this.#content.substring(token.start, token.end), this.#fromOffset + token.start);
                }
            }
        }
    }
    #beforeVisit(node) {
        if (!node.parent) {
            return;
        }
        if (node.type === 'TemplateLiteral') {
            this.#builder.setEnforceSpaceBetweenWords(false);
        }
        let token;
        while ((token = this.#tokenizer.peekToken()) && token.start < node.start) {
            const token = this.#tokenizer.nextToken();
            const format = this.#formatToken(node.parent, token);
            this.#push(token, format);
        }
        if (node.parent?.type === 'TemplateLiteral' && node.type !== 'TemplateElement' && node.type !== 'TemplateLiteral') {
            this.#builder.setEnforceSpaceBetweenWords(true);
        }
    }
    #afterVisit(node) {
        let token;
        while ((token = this.#tokenizer.peekToken()) && token.start < node.end) {
            const token = this.#tokenizer.nextToken();
            const format = this.#formatToken(node, token);
            this.#push(token, format);
        }
        this.#push(null, this.#finishNode(node));
        if (node.parent?.type === 'TemplateLiteral' && node.type !== 'TemplateElement' && node.type !== 'TemplateLiteral') {
            this.#builder.setEnforceSpaceBetweenWords(false);
        }
        else if (node.type === 'TemplateLiteral' && node.parent?.type !== 'TemplateLiteral') {
            this.#builder.setEnforceSpaceBetweenWords(true);
        }
    }
    #inForLoopHeader(node) {
        const parent = node.parent;
        if (!parent) {
            return false;
        }
        if (parent.type === 'ForStatement') {
            const parentNode = parent;
            return node === parentNode.init || node === parentNode.test || node === parentNode.update;
        }
        if (parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') {
            const parentNode = parent;
            return node === parentNode.left || node === parentNode.right;
        }
        return false;
    }
    #formatToken(node, tokenOrComment) {
        const AT = AcornTokenizer;
        if (AT.lineComment(tokenOrComment)) {
            return 'tn';
        }
        if (AT.blockComment(tokenOrComment)) {
            return 'tn';
        }
        const token = tokenOrComment;
        const nodeType = node.type;
        if (nodeType === 'ContinueStatement' || nodeType === 'BreakStatement') {
            return node.label && AT.keyword(token) ? 'ts' : 't';
        }
        if (nodeType === 'Identifier') {
            return 't';
        }
        if (nodeType === 'PrivateIdentifier') {
            return 't';
        }
        if (nodeType === 'ReturnStatement') {
            if (AT.punctuator(token, ';')) {
                return 't';
            }
            return node.argument ? 'ts' : 't';
        }
        if (nodeType === 'AwaitExpression') {
            if (AT.punctuator(token, ';')) {
                return 't';
            }
            return node.argument ? 'ts' : 't';
        }
        if (nodeType === 'Property') {
            if (AT.punctuator(token, ':')) {
                return 'ts';
            }
            return 't';
        }
        if (nodeType === 'ImportAttribute') {
            if (AT.punctuator(token, ':')) {
                return 'ts';
            }
            return 't';
        }
        if (nodeType === 'ArrayExpression') {
            if (AT.punctuator(token, ',')) {
                return 'ts';
            }
            return 't';
        }
        if (nodeType === 'LabeledStatement') {
            if (AT.punctuator(token, ':')) {
                return 'ts';
            }
        }
        else if (nodeType === 'LogicalExpression' || nodeType === 'AssignmentExpression' || nodeType === 'BinaryExpression') {
            if (AT.punctuator(token) && !AT.punctuator(token, '()')) {
                return 'sts';
            }
        }
        else if (nodeType === 'ConditionalExpression') {
            if (AT.punctuator(token, '?:')) {
                return 'sts';
            }
        }
        else if (nodeType === 'VariableDeclarator') {
            if (AT.punctuator(token, '=')) {
                return 'sts';
            }
        }
        else if (nodeType === 'ObjectPattern') {
            if (node.parent?.type === 'VariableDeclarator' && AT.punctuator(token, '{')) {
                return 'st';
            }
            if (AT.punctuator(token, ',')) {
                return 'ts';
            }
        }
        else if (nodeType === 'FunctionDeclaration') {
            if (AT.punctuator(token, ',)')) {
                return 'ts';
            }
        }
        else if (nodeType === 'FunctionExpression') {
            if (AT.punctuator(token, ',)')) {
                return 'ts';
            }
            if (AT.keyword(token, 'function')) {
                return node.id ? 'ts' : 't';
            }
        }
        else if (nodeType === 'ArrowFunctionExpression') {
            if (AT.punctuator(token, ',)')) {
                return 'ts';
            }
            if (AT.punctuator(token, '(')) {
                return 'st';
            }
            if (AT.arrowIdentifier(token, '=>')) {
                return 'sts';
            }
        }
        else if (nodeType === 'WithStatement') {
            if (AT.punctuator(token, ')')) {
                return node.body?.type === 'BlockStatement' ? 'ts' : 'tn>';
            }
        }
        else if (nodeType === 'SwitchStatement') {
            if (AT.punctuator(token, '{')) {
                return 'tn>';
            }
            if (AT.punctuator(token, '}')) {
                return 'n<tn';
            }
            if (AT.punctuator(token, ')')) {
                return 'ts';
            }
        }
        else if (nodeType === 'SwitchCase') {
            if (AT.keyword(token, 'case')) {
                return 'n<ts';
            }
            if (AT.keyword(token, 'default')) {
                return 'n<t';
            }
            if (AT.punctuator(token, ':')) {
                return 'tn>';
            }
        }
        else if (nodeType === 'VariableDeclaration') {
            if (AT.punctuator(token, ',')) {
                let allVariablesInitialized = true;
                const declarations = node.declarations;
                for (let i = 0; i < declarations.length; ++i) {
                    allVariablesInitialized = allVariablesInitialized && Boolean(declarations[i].init);
                }
                return !this.#inForLoopHeader(node) && allVariablesInitialized ? 'nSSts' : 'ts';
            }
        }
        else if (nodeType === 'PropertyDefinition') {
            if (AT.punctuator(token, '=')) {
                return 'sts';
            }
            if (AT.punctuator(token, ';')) {
                return 'tn';
            }
        }
        else if (nodeType === 'BlockStatement') {
            if (AT.punctuator(token, '{')) {
                return node.body.length ? 'tn>' : 't';
            }
            if (AT.punctuator(token, '}')) {
                return node.body.length ? 'n<t' : 't';
            }
        }
        else if (nodeType === 'CatchClause') {
            if (AT.punctuator(token, ')')) {
                return 'ts';
            }
        }
        else if (nodeType === 'ObjectExpression') {
            if (!node.properties.length) {
                return 't';
            }
            if (AT.punctuator(token, '{')) {
                return 'tn>';
            }
            if (AT.punctuator(token, '}')) {
                return 'n<t';
            }
            if (AT.punctuator(token, ',')) {
                return 'tn';
            }
        }
        else if (nodeType === 'IfStatement') {
            if (AT.punctuator(token, ')')) {
                return node.consequent?.type === 'BlockStatement' ? 'ts' : 'tn>';
            }
            if (AT.keyword(token, 'else')) {
                const preFormat = node.consequent?.type === 'BlockStatement' ? 'st' : 'n<t';
                let postFormat = 'n>';
                if (node.alternate && (node.alternate.type === 'BlockStatement' || node.alternate.type === 'IfStatement')) {
                    postFormat = 's';
                }
                return preFormat + postFormat;
            }
        }
        else if (nodeType === 'CallExpression') {
            if (AT.punctuator(token, ',')) {
                return 'ts';
            }
        }
        else if (nodeType === 'SequenceExpression' && AT.punctuator(token, ',')) {
            return node.parent?.type === 'SwitchCase' ? 'ts' : 'tn';
        }
        else if (nodeType === 'ForStatement' || nodeType === 'ForOfStatement' || nodeType === 'ForInStatement') {
            if (AT.punctuator(token, ';')) {
                return 'ts';
            }
            if (AT.keyword(token, 'in') || AT.identifier(token, 'of')) {
                return 'sts';
            }
            if (AT.punctuator(token, ')')) {
                return node.body?.type === 'BlockStatement' ? 'ts' : 'tn>';
            }
        }
        else if (nodeType === 'WhileStatement') {
            if (AT.punctuator(token, ')')) {
                return node.body?.type === 'BlockStatement' ? 'ts' : 'tn>';
            }
        }
        else if (nodeType === 'DoWhileStatement') {
            const blockBody = node.body?.type === 'BlockStatement';
            if (AT.keyword(token, 'do')) {
                return blockBody ? 'ts' : 'tn>';
            }
            if (AT.keyword(token, 'while')) {
                return blockBody ? 'sts' : 'n<ts';
            }
            if (AT.punctuator(token, ';')) {
                return 'tn';
            }
        }
        else if (nodeType === 'ClassBody') {
            if (AT.punctuator(token, '{')) {
                return 'stn>';
            }
            if (AT.punctuator(token, '}')) {
                return '<ntn';
            }
            return 't';
        }
        else if (nodeType === 'YieldExpression') {
            return 't';
        }
        else if (nodeType === 'Super') {
            return 't';
        }
        else if (nodeType === 'ImportExpression') {
            return 't';
        }
        else if (nodeType === 'ExportAllDeclaration') {
            if (AT.punctuator(token, '*')) {
                return 'sts';
            }
            return 't';
        }
        else if (nodeType === 'ExportNamedDeclaration' || nodeType === 'ImportDeclaration') {
            if (AT.punctuator(token, '{')) {
                return 'st';
            }
            if (AT.punctuator(token, ',')) {
                return 'ts';
            }
            if (AT.punctuator(token, '}')) {
                if (node.attributes.length > 0) {
                    return 't';
                }
                return node.source ? 'ts' : 't';
            }
            if (AT.punctuator(token, '*')) {
                return 'sts';
            }
            if (AT.keyword(token, 'with')) {
                return 'sts';
            }
            return 't';
        }
        else if (nodeType === 'MemberExpression') {
            if (node.object.type === 'Literal' && typeof (node.object.value) === 'number') {
                return 'st';
            }
            return 't';
        }
        return AT.keyword(token) && !AT.keyword(token, 'this') ? 'ts' : 't';
    }
    #finishNode(node) {
        const nodeType = node.type;
        if (nodeType === 'WithStatement') {
            if (node.body && node.body.type !== 'BlockStatement') {
                return 'n<';
            }
        }
        else if (nodeType === 'VariableDeclaration') {
            if (!this.#inForLoopHeader(node)) {
                return 'n';
            }
        }
        else if (nodeType === 'ForStatement' || nodeType === 'ForOfStatement' || nodeType === 'ForInStatement') {
            if (node.body && node.body.type !== 'BlockStatement') {
                return 'n<';
            }
        }
        else if (nodeType === 'BlockStatement') {
            if (node.parent?.type === 'IfStatement') {
                const parentNode = node.parent;
                if (parentNode.alternate && parentNode.consequent === node) {
                    return '';
                }
            }
            if (node.parent?.type === 'FunctionExpression' && node.parent.parent?.type === 'Property') {
                return '';
            }
            if (node.parent?.type === 'FunctionExpression' && node.parent.parent?.type === 'VariableDeclarator') {
                return '';
            }
            if (node.parent?.type === 'FunctionExpression' && node.parent.parent?.type === 'CallExpression') {
                return '';
            }
            if (node.parent?.type === 'DoWhileStatement') {
                return '';
            }
            if (node.parent?.type === 'TryStatement') {
                const parentNode = node.parent;
                if (parentNode.block === node) {
                    return 's';
                }
            }
            if (node.parent?.type === 'CatchClause') {
                const parentNode = node.parent;
                if (parentNode.parent?.finalizer) {
                    return 's';
                }
            }
            return 'n';
        }
        else if (nodeType === 'WhileStatement') {
            if (node.body && node.body.type !== 'BlockStatement') {
                return 'n<';
            }
        }
        else if (nodeType === 'IfStatement') {
            if (node.alternate) {
                if (node.alternate.type !== 'BlockStatement' && node.alternate.type !== 'IfStatement') {
                    return '<';
                }
            }
            else if (node.consequent) {
                if (node.consequent.type !== 'BlockStatement') {
                    return '<';
                }
            }
        }
        else if (nodeType === 'BreakStatement' || nodeType === 'ContinueStatement' || nodeType === 'ThrowStatement' ||
            nodeType === 'ReturnStatement' || nodeType === 'ExpressionStatement') {
            return 'n';
        }
        else if (nodeType === 'ImportDeclaration' || nodeType === 'ExportAllDeclaration' ||
            nodeType === 'ExportDefaultDeclaration' || nodeType === 'ExportNamedDeclaration') {
            return 'n';
        }
        return '';
    }
}

// Copyright 2021 The Chromium Authors
class JSONFormatter {
    builder;
    toOffset;
    fromOffset;
    lineEndings;
    lastLine;
    text;
    constructor(builder) {
        this.builder = builder;
        this.lastLine = -1;
    }
    format(text, lineEndings, fromOffset, toOffset) {
        this.lineEndings = lineEndings;
        this.fromOffset = fromOffset;
        this.toOffset = toOffset;
        this.lastLine = -1;
        this.text = text;
        const tokenize = createTokenizer('application/json');
        tokenize(text.substring(this.fromOffset, this.toOffset), this.tokenCallback.bind(this));
    }
    tokenCallback(token, _type, startPosition) {
        switch (token.charAt(0)) {
            case '{':
            case '[':
                if (this.text[startPosition + 1] === '}' || this.text[startPosition + 1] === ']') {
                    this.builder.addToken(token, startPosition);
                }
                else {
                    this.builder.addToken(token, startPosition);
                    this.builder.addNewLine();
                    this.builder.increaseNestingLevel();
                }
                break;
            case '}':
            case ']':
                if (this.text[startPosition - 1] === '{' || this.text[startPosition - 1] === '[') {
                    this.builder.addToken(token, startPosition);
                }
                else {
                    this.builder.decreaseNestingLevel();
                    this.builder.addNewLine();
                    this.builder.addToken(token, startPosition);
                }
                break;
            case ':':
                this.builder.addToken(token, startPosition);
                this.builder.addSoftSpace();
                break;
            case ',':
                this.builder.addToken(token, startPosition);
                this.builder.addNewLine();
                break;
            case '':
            case ' ':
            case '\n':
                break;
            default:
                this.builder.addToken(token, startPosition);
                break;
        }
    }
}

// Copyright 2016 The Chromium Authors
class HTMLFormatter {
    #builder;
    #jsFormatter;
    #jsonFormatter;
    #cssFormatter;
    #text;
    #lineEndings;
    #model;
    constructor(builder) {
        this.#builder = builder;
        this.#jsFormatter = new JavaScriptFormatter(builder);
        this.#jsonFormatter = new JSONFormatter(builder);
        this.#cssFormatter = new CSSFormatter(builder);
    }
    format(text, lineEndings) {
        this.#text = text;
        this.#lineEndings = lineEndings;
        this.#model = new HTMLModel(text);
        this.#walk(this.#model.document());
    }
    #formatTokensTill(element, offset) {
        if (!this.#model) {
            return;
        }
        let nextToken = this.#model.peekToken();
        while (nextToken && nextToken.startOffset < offset) {
            const token = this.#model.nextToken();
            this.#formatToken(element, token);
            nextToken = this.#model.peekToken();
        }
    }
    #walk(element) {
        if (!element.openTag || !element.closeTag) {
            throw new Error('Element is missing open or close tag');
        }
        if (element.parent) {
            this.#formatTokensTill(element.parent, element.openTag.startOffset);
        }
        this.#beforeOpenTag(element);
        this.#formatTokensTill(element, element.openTag.endOffset);
        this.#afterOpenTag(element);
        for (let i = 0; i < element.children.length; ++i) {
            this.#walk(element.children[i]);
        }
        this.#formatTokensTill(element, element.closeTag.startOffset);
        this.#beforeCloseTag(element);
        this.#formatTokensTill(element, element.closeTag.endOffset);
        this.#afterCloseTag(element);
    }
    #beforeOpenTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length || element === this.#model.document()) {
            return;
        }
        this.#builder.addNewLine();
    }
    #afterOpenTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length || element === this.#model.document()) {
            return;
        }
        this.#builder.increaseNestingLevel();
        this.#builder.addNewLine();
    }
    #beforeCloseTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length || element === this.#model.document()) {
            return;
        }
        this.#builder.decreaseNestingLevel();
        this.#builder.addNewLine();
    }
    #afterCloseTag(element) {
        if (!this.#model) {
            return;
        }
        if (!element.children.length && element !== this.#model.document()) {
            const nextToken = this.#model.peekToken();
            if (nextToken) {
                if (isTextToken(nextToken)) {
                    return;
                }
                const followingToken = this.#model.peekToken(1);
                if (isWhitespace(nextToken.value) && !/[\r\n]/.test(nextToken.value) &&
                    followingToken && isTextToken(followingToken)) {
                    this.#model.nextToken();
                    this.#builder.addToken(nextToken.value, nextToken.startOffset);
                    return;
                }
            }
        }
        this.#builder.addNewLine();
    }
    #formatToken(element, token) {
        const isBodyToken = Boolean(element.openTag && !element.openTag.selfClosingTag && element.closeTag &&
            element.openTag.endOffset <= token.startOffset && token.startOffset < element.closeTag.startOffset);
        if (isWhitespace(token.value) &&
            (!isBodyToken || element.children.length > 0 ||
                (!element.hasContent && !element.hasComments && /[\r\n]/.test(token.value)))) {
            return;
        }
        if ((hasTokenInSet(token.type, 'comment') || hasTokenInSet(token.type, 'meta')) &&
            (!isBodyToken || element.children.length > 0)) {
            this.#builder.addNewLine();
            this.#builder.addToken(token.value.trim(), token.startOffset);
            this.#builder.addNewLine();
            return;
        }
        if (!element.openTag || !element.closeTag) {
            return;
        }
        if (isBodyToken && element.name === 'style') {
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            this.#cssFormatter.format(this.#text || '', this.#lineEndings || [], token.startOffset, token.endOffset);
            this.#builder.decreaseNestingLevel();
            return;
        }
        if (isBodyToken && element.name === 'script') {
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            if (scriptTagIsJavaScript(element)) {
                this.#jsFormatter.format(this.#text || '', this.#lineEndings || [], token.startOffset, token.endOffset);
            }
            else if (scriptTagIsJSON(element)) {
                this.#jsonFormatter.format(this.#text || '', this.#lineEndings || [], token.startOffset, token.endOffset);
            }
            else {
                this.#builder.addToken(token.value, token.startOffset);
                this.#builder.addNewLine();
            }
            this.#builder.decreaseNestingLevel();
            return;
        }
        if (!isBodyToken && hasTokenInSet(token.type, 'attribute')) {
            this.#builder.addSoftSpace();
        }
        const restore = !isBodyToken && !hasTokenInSet(token.type, 'attribute') ?
            this.#builder.setEnforceSpaceBetweenWords(false) :
            false;
        this.#builder.addToken(token.value, token.startOffset);
        if (!isBodyToken && !hasTokenInSet(token.type, 'attribute')) {
            this.#builder.setEnforceSpaceBetweenWords(restore);
        }
    }
}
function scriptTagIsJavaScript(element) {
    if (!element.openTag) {
        return true;
    }
    if (!element.openTag.attributes.has('type')) {
        return true;
    }
    let type = element.openTag.attributes.get('type');
    if (!type) {
        return true;
    }
    type = type.toLowerCase();
    const isWrappedInQuotes = /^(["\'])(.*)\1$/.exec(type.trim());
    if (isWrappedInQuotes) {
        type = isWrappedInQuotes[2];
    }
    return [
        'application/ecmascript',
        'application/javascript',
        'application/x-ecmascript',
        'application/x-javascript',
        'module',
        'text/ecmascript',
        'text/javascript',
        'text/javascript1.0',
        'text/javascript1.1',
        'text/javascript1.2',
        'text/javascript1.3',
        'text/javascript1.4',
        'text/javascript1.5',
        'text/jscript',
        'text/livescript',
        'text/x-ecmascript',
        'text/x-javascript',
    ].includes(type.trim());
}
function scriptTagIsJSON(element) {
    if (!element.openTag) {
        return false;
    }
    let type = element.openTag.attributes.get('type');
    if (!type) {
        return false;
    }
    type = type.toLowerCase();
    const isWrappedInQuotes = /^(["\'])(.*)\1$/.exec(type.trim());
    if (isWrappedInQuotes) {
        type = isWrappedInQuotes[2];
    }
    const isSubtype = /^application\/\w+\+json$/.exec(type.trim());
    if (isSubtype) {
        type = 'application/json';
    }
    return [
        'application/json',
        'importmap',
        'speculationrules',
    ].includes(type.trim());
}
function hasTokenInSet(tokenTypes, type) {
    return tokenTypes.has(type) || tokenTypes.has(`xml-${type}`);
}
function isTextToken(token) {
    return !isWhitespace(token.value) && !hasTokenInSet(token.type, 'tag') &&
        !hasTokenInSet(token.type, 'attribute') && !hasTokenInSet(token.type, 'bracket') &&
        !hasTokenInSet(token.type, 'comment') && !hasTokenInSet(token.type, 'meta');
}
class HTMLModel {
    #state = "Initial" ;
    #document;
    #stack;
    #tokens = [];
    #tokenIndex = 0;
    #attributes = new Map();
    #attributeName = '';
    #tagName = '';
    #isOpenTag = false;
    #tagStartOffset;
    #tagEndOffset;
    constructor(text) {
        this.#document = new FormatterElement('document');
        this.#document.openTag = new Tag('document', 0, 0, new Map(), true, false);
        this.#document.closeTag = new Tag('document', text.length, text.length, new Map(), false, false);
        this.#stack = [this.#document];
        this.#build(text);
    }
    #build(text) {
        const tokenizer = createTokenizer('text/html');
        let lastOffset = 0;
        let pendingToken = null;
        const pushToken = (token) => {
            this.#tokens.push(token);
            this.#updateDOM(token);
            const element = this.#stack[this.#stack.length - 1];
            if (element && (hasTokenInSet(token.type, 'comment') || hasTokenInSet(token.type, 'meta'))) {
                element.hasComments = true;
            }
            if (element && isTextToken(token)) {
                element.hasContent = true;
            }
            if (element && (element.name === 'script' || element.name === 'style') &&
                element.openTag?.endOffset === lastOffset) {
                return AbortTokenization;
            }
            return;
        };
        const processToken = (tokenValue, type, tokenStart, tokenEnd) => {
            lastOffset = tokenEnd;
            const tokenType = type ? new Set(type.split(' ')) : new Set();
            const token = new Token(tokenValue, tokenType, tokenStart, tokenEnd);
            if (pendingToken) {
                if (tokenValue === '/' && type === 'attribute' && pendingToken.type.has('string')) {
                    token.startOffset = pendingToken.startOffset;
                    token.value = `${pendingToken.value}${tokenValue}`;
                    token.type = pendingToken.type;
                }
                else if ((tokenValue.startsWith('&') && type === 'error' && pendingToken.type.size === 0) ||
                    (type === null && pendingToken.type.has('error'))) {
                    pendingToken.endOffset = token.endOffset;
                    pendingToken.value += tokenValue;
                    pendingToken.type = token.type;
                    return;
                }
                else if (pushToken(pendingToken) === AbortTokenization) {
                    return AbortTokenization;
                }
                pendingToken = null;
            }
            if (type === 'string' || type === null) {
                pendingToken = token;
                return;
            }
            return pushToken(token);
        };
        while (true) {
            tokenizer(text, processToken, lastOffset);
            if (pendingToken) {
                pushToken(pendingToken);
                pendingToken = null;
            }
            if (lastOffset >= text.length) {
                break;
            }
            const element = this.#stack[this.#stack.length - 1];
            if (!element) {
                break;
            }
            while (true) {
                lastOffset = text.indexOf('</', lastOffset);
                if (lastOffset === -1) {
                    lastOffset = text.length;
                    break;
                }
                const sliced = text.slice(lastOffset + 2, lastOffset + 2 + element.name.length);
                if (sliced.toLowerCase() === element.name) {
                    break;
                }
                lastOffset += 2;
            }
            if (!element.openTag) {
                break;
            }
            const tokenStart = element.openTag.endOffset;
            const tokenEnd = lastOffset;
            const tokenValue = text.substring(tokenStart, tokenEnd);
            this.#tokens.push(new Token(tokenValue, new Set(), tokenStart, tokenEnd));
        }
        while (this.#stack.length > 1) {
            const element = this.#stack[this.#stack.length - 1];
            if (!element) {
                break;
            }
            this.#popElement(new Tag(element.name, text.length, text.length, new Map(), false, false));
        }
    }
    #updateDOM(token) {
        const value = token.value;
        const type = token.type;
        switch (this.#state) {
            case "Initial" :
                if (hasTokenInSet(type, 'bracket') && (value === '<' || value === '</')) {
                    this.#onStartTag(token);
                    this.#state = "Tag" ;
                }
                return;
            case "Tag" :
                if (hasTokenInSet(type, 'tag') && !hasTokenInSet(type, 'bracket')) {
                    this.#tagName = value.trim().toLowerCase();
                }
                else if (hasTokenInSet(type, 'attribute')) {
                    this.#attributeName = value.trim().toLowerCase();
                    this.#attributes.set(this.#attributeName, '');
                    this.#state = "AttributeName" ;
                }
                else if (hasTokenInSet(type, 'bracket') && (value === '>' || value === '/>')) {
                    this.#onEndTag(token);
                    this.#state = "Initial" ;
                }
                return;
            case "AttributeName" :
                if (!type.size && value === '=') {
                    this.#state = "AttributeValue" ;
                }
                else if (hasTokenInSet(type, 'bracket') && (value === '>' || value === '/>')) {
                    this.#onEndTag(token);
                    this.#state = "Initial" ;
                }
                return;
            case "AttributeValue" :
                if (hasTokenInSet(type, 'string')) {
                    this.#attributes.set(this.#attributeName, value);
                    this.#state = "Tag" ;
                }
                else if (hasTokenInSet(type, 'bracket') && (value === '>' || value === '/>')) {
                    this.#onEndTag(token);
                    this.#state = "Initial" ;
                }
                return;
        }
    }
    #onStartTag(token) {
        this.#tagName = '';
        this.#tagStartOffset = token.startOffset;
        this.#tagEndOffset = null;
        this.#attributes = new Map();
        this.#attributeName = '';
        this.#isOpenTag = token.value === '<';
    }
    #onEndTag(token) {
        this.#tagEndOffset = token.endOffset;
        const selfClosingTag = token.value === '/>' || SelfClosingTags.has(this.#tagName);
        const tag = new Tag(this.#tagName, this.#tagStartOffset || 0, this.#tagEndOffset, this.#attributes, this.#isOpenTag, selfClosingTag);
        this.#onTagComplete(tag);
    }
    #onTagComplete(tag) {
        if (tag.isOpenTag) {
            const topElement = this.#stack[this.#stack.length - 1];
            if (topElement) {
                const tagSet = AutoClosingTags.get(topElement.name);
                if (topElement !== this.#document && topElement.openTag?.selfClosingTag) {
                    this.#popElement(autocloseTag(topElement, topElement.openTag.endOffset));
                }
                else if (tagSet?.has(tag.name)) {
                    this.#popElement(autocloseTag(topElement, tag.startOffset));
                }
                this.#pushElement(tag);
            }
            return;
        }
        let lastTag = this.#stack[this.#stack.length - 1];
        while (this.#stack.length > 1 && lastTag && lastTag.name !== tag.name) {
            this.#popElement(autocloseTag(lastTag, tag.startOffset));
            lastTag = this.#stack[this.#stack.length - 1];
        }
        if (this.#stack.length === 1) {
            return;
        }
        this.#popElement(tag);
        function autocloseTag(element, offset) {
            return new Tag(element.name, offset, offset, new Map(), false, false);
        }
    }
    #popElement(closeTag) {
        const element = this.#stack.pop();
        if (!element) {
            return;
        }
        element.closeTag = closeTag;
    }
    #pushElement(openTag) {
        const topElement = this.#stack[this.#stack.length - 1];
        const newElement = new FormatterElement(openTag.name);
        if (topElement) {
            newElement.parent = topElement;
            topElement.children.push(newElement);
        }
        newElement.openTag = openTag;
        this.#stack.push(newElement);
    }
    peekToken(offset = 0) {
        return this.#tokenIndex + offset < this.#tokens.length ? this.#tokens[this.#tokenIndex + offset] : null;
    }
    nextToken() {
        return this.#tokens[this.#tokenIndex++];
    }
    document() {
        return this.#document;
    }
}
const SelfClosingTags = new Set([
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);
const AutoClosingTags = new Map([
    ['head', new Set(['body'])],
    ['li', new Set(['li'])],
    ['dt', new Set(['dt', 'dd'])],
    ['dd', new Set(['dt', 'dd'])],
    [
        'p',
        new Set([
            'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
            'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
        ]),
    ],
    ['rb', new Set(['rb', 'rt', 'rtc', 'rp'])],
    ['rt', new Set(['rb', 'rt', 'rtc', 'rp'])],
    ['rtc', new Set(['rb', 'rtc', 'rp'])],
    ['rp', new Set(['rb', 'rt', 'rtc', 'rp'])],
    ['optgroup', new Set(['optgroup'])],
    ['option', new Set(['option', 'optgroup'])],
    ['colgroup', new Set(['colgroup'])],
    ['thead', new Set(['tbody', 'tfoot'])],
    ['tbody', new Set(['tbody', 'tfoot'])],
    ['tfoot', new Set(['tbody'])],
    ['tr', new Set(['tr'])],
    ['td', new Set(['td', 'th'])],
    ['th', new Set(['td', 'th'])],
]);
class Token {
    value;
    type;
    startOffset;
    endOffset;
    constructor(value, type, startOffset, endOffset) {
        this.value = value;
        this.type = type;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
    }
}
class Tag {
    name;
    startOffset;
    endOffset;
    attributes;
    isOpenTag;
    selfClosingTag;
    constructor(name, startOffset, endOffset, attributes, isOpenTag, selfClosingTag) {
        this.name = name;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        this.attributes = attributes;
        this.isOpenTag = isOpenTag;
        this.selfClosingTag = selfClosingTag;
    }
}
class FormatterElement {
    name;
    children = [];
    parent = null;
    openTag = null;
    closeTag = null;
    hasComments = false;
    hasContent = false;
    constructor(name) {
        this.name = name;
    }
}

// Copyright 2016 The Chromium Authors
class IdentityFormatter {
    builder;
    constructor(builder) {
        this.builder = builder;
    }
    format(text, _lineEndings, fromOffset, toOffset) {
        const content = text.substring(fromOffset, toOffset);
        this.builder.addToken(content, fromOffset);
    }
}

// Copyright 2022 The Chromium Authors
function parseScopes(expression, sourceType = 'script') {
    let root = null;
    try {
        root = parse$1(expression, {
            ecmaVersion: ECMA_VERSION,
            allowAwaitOutsideFunction: true,
            checkPrivateFields: false,
            ranges: false,
            sourceType,
        });
    }
    catch {
        return null;
    }
    return new ScopeVariableAnalysis(root, expression).run();
}
class Scope {
    variables = new Map();
    parent;
    start;
    end;
    kind;
    name;
    nameMappingLocations;
    children = [];
    constructor(start, end, parent, kind, name, nameMappingLocations) {
        this.start = start;
        this.end = end;
        this.parent = parent;
        this.kind = kind;
        this.name = name;
        this.nameMappingLocations = nameMappingLocations;
        if (parent) {
            parent.children.push(this);
        }
    }
    export() {
        const variables = [];
        for (const variable of this.variables) {
            const offsets = [];
            for (const use of variable[1].uses) {
                offsets.push(use.offset);
            }
            variables.push({ name: variable[0], kind: variable[1].definitionKind, offsets });
        }
        const children = this.children.map(c => c.export());
        return {
            start: this.start,
            end: this.end,
            variables,
            kind: this.kind,
            name: this.name,
            nameMappingLocations: this.nameMappingLocations,
            children,
        };
    }
    addVariable(name, offset, definitionKind, isShorthandAssignmentProperty) {
        const variable = this.variables.get(name);
        const use = { offset, scope: this, isShorthandAssignmentProperty };
        if (!variable) {
            this.variables.set(name, { definitionKind, uses: [use] });
            return;
        }
        if (variable.definitionKind === 0 ) {
            variable.definitionKind = definitionKind;
        }
        variable.uses.push(use);
    }
    findBinders(name) {
        const result = [];
        let scope = this;
        while (scope !== null) {
            const defUse = scope.variables.get(name);
            if (defUse && defUse.definitionKind !== 0 ) {
                result.push(defUse);
            }
            scope = scope.parent;
        }
        return result;
    }
    #mergeChildDefUses(name, defUses) {
        const variable = this.variables.get(name);
        if (!variable) {
            this.variables.set(name, defUses);
            return;
        }
        variable.uses.push(...defUses.uses);
        if (defUses.definitionKind === 2 ) {
            console.assert(variable.definitionKind !== 1 );
            if (variable.definitionKind === 0 ) {
                variable.definitionKind = defUses.definitionKind;
            }
        }
        else {
            console.assert(defUses.definitionKind === 0 );
        }
    }
    finalizeToParent(isFunctionScope) {
        if (!this.parent) {
            console.error('Internal error: wrong nesting in scope analysis.');
            throw new Error('Internal error');
        }
        const keysToRemove = [];
        for (const [name, defUse] of this.variables.entries()) {
            if (defUse.definitionKind === 0  ||
                (defUse.definitionKind === 2  && !isFunctionScope)) {
                this.parent.#mergeChildDefUses(name, defUse);
                keysToRemove.push(name);
            }
        }
        keysToRemove.forEach(k => this.variables.delete(k));
    }
}
class ScopeVariableAnalysis {
    #rootScope;
    #allNames = new Set();
    #currentScope;
    #rootNode;
    #sourceText;
    #methodName;
    #additionalMappingLocations = [];
    constructor(node, sourceText) {
        this.#rootNode = node;
        this.#sourceText = sourceText;
        this.#rootScope = new Scope(node.start, node.end, null, 3 );
        this.#currentScope = this.#rootScope;
    }
    run() {
        this.#processNode(this.#rootNode);
        return this.#rootScope;
    }
    #processNode(node) {
        if (node === null) {
            return;
        }
        switch (node.type) {
            case 'AwaitExpression':
                this.#processNode(node.argument);
                break;
            case 'ArrayExpression':
                node.elements.forEach(item => this.#processNode(item));
                break;
            case 'ExpressionStatement':
                this.#processNode(node.expression);
                break;
            case 'Program':
                console.assert(this.#currentScope === this.#rootScope);
                node.body.forEach(item => this.#processNode(item));
                console.assert(this.#currentScope === this.#rootScope);
                break;
            case 'ArrayPattern':
                node.elements.forEach(item => this.#processNode(item));
                break;
            case 'ArrowFunctionExpression': {
                this.#pushScope(node.start, node.end, 4 , undefined, mappingLocationsForArrowFunctions(node, this.#sourceText));
                node.params.forEach(this.#processNodeAsDefinition.bind(this, 2 , false));
                if (node.body.type === 'BlockStatement') {
                    node.body.body.forEach(this.#processNode.bind(this));
                }
                else {
                    this.#processNode(node.body);
                }
                this.#popScope(true);
                break;
            }
            case 'AssignmentExpression':
            case 'AssignmentPattern':
            case 'BinaryExpression':
            case 'LogicalExpression':
                this.#processNode(node.left);
                this.#processNode(node.right);
                break;
            case 'BlockStatement':
                this.#pushScope(node.start, node.end, 1 );
                node.body.forEach(this.#processNode.bind(this));
                this.#popScope(false);
                break;
            case 'CallExpression':
                this.#processNode(node.callee);
                node.arguments.forEach(this.#processNode.bind(this));
                break;
            case 'VariableDeclaration': {
                const definitionKind = node.kind === 'var' ? 2  : 1 ;
                node.declarations.forEach(this.#processVariableDeclarator.bind(this, definitionKind));
                break;
            }
            case 'CatchClause':
                this.#pushScope(node.start, node.end, 1 );
                this.#processNodeAsDefinition(1 , false, node.param);
                this.#processNode(node.body);
                this.#popScope(false);
                break;
            case 'ClassBody':
                node.body.forEach(this.#processNode.bind(this));
                break;
            case 'ClassDeclaration':
                this.#processNodeAsDefinition(1 , false, node.id);
                this.#processNode(node.superClass ?? null);
                this.#processNode(node.body);
                break;
            case 'ClassExpression':
                this.#processNode(node.superClass ?? null);
                this.#processNode(node.body);
                break;
            case 'ChainExpression':
                this.#processNode(node.expression);
                break;
            case 'ConditionalExpression':
                this.#processNode(node.test);
                this.#processNode(node.consequent);
                this.#processNode(node.alternate);
                break;
            case 'DoWhileStatement':
                this.#processNode(node.body);
                this.#processNode(node.test);
                break;
            case 'ForInStatement':
            case 'ForOfStatement':
                this.#pushScope(node.start, node.end, 1 );
                this.#processNode(node.left);
                this.#processNode(node.right);
                this.#processNode(node.body);
                this.#popScope(false);
                break;
            case 'ForStatement':
                this.#pushScope(node.start, node.end, 1 );
                this.#processNode(node.init ?? null);
                this.#processNode(node.test ?? null);
                this.#processNode(node.update ?? null);
                this.#processNode(node.body);
                this.#popScope(false);
                break;
            case 'FunctionDeclaration':
                this.#processNodeAsDefinition(2 , false, node.id);
                this.#pushScope(node.id?.end ?? node.start, node.end, 2 , node.id.name, mappingLocationsForFunctionDeclaration(node, this.#sourceText));
                this.#addVariable('this', node.start, 3 );
                this.#addVariable('arguments', node.start, 3 );
                node.params.forEach(this.#processNodeAsDefinition.bind(this, 1 , false));
                node.body.body.forEach(this.#processNode.bind(this));
                this.#popScope(true);
                break;
            case 'FunctionExpression':
                this.#pushScope(node.id?.end ?? node.start, node.end, 2 , this.#methodName ?? node.id?.name, [...this.#additionalMappingLocations, ...mappingLocationsForFunctionExpression(node, this.#sourceText)]);
                this.#additionalMappingLocations = [];
                this.#methodName = undefined;
                this.#addVariable('this', node.start, 3 );
                this.#addVariable('arguments', node.start, 3 );
                node.params.forEach(this.#processNodeAsDefinition.bind(this, 1 , false));
                node.body.body.forEach(this.#processNode.bind(this));
                this.#popScope(true);
                break;
            case 'Identifier':
                this.#addVariable(node.name, node.start);
                break;
            case 'IfStatement':
                this.#processNode(node.test);
                this.#processNode(node.consequent);
                this.#processNode(node.alternate ?? null);
                break;
            case 'LabeledStatement':
                this.#processNode(node.body);
                break;
            case 'MetaProperty':
                break;
            case 'MethodDefinition':
                if (node.computed) {
                    this.#processNode(node.key);
                }
                else {
                    this.#additionalMappingLocations = mappingLocationsForMethodDefinition(node);
                    this.#methodName = nameForMethodDefinition(node);
                }
                this.#processNode(node.value);
                break;
            case 'NewExpression':
                this.#processNode(node.callee);
                node.arguments.forEach(this.#processNode.bind(this));
                break;
            case 'MemberExpression':
                this.#processNode(node.object);
                if (node.computed) {
                    this.#processNode(node.property);
                }
                break;
            case 'ObjectExpression':
                node.properties.forEach(this.#processNode.bind(this));
                break;
            case 'ObjectPattern':
                node.properties.forEach(this.#processNode.bind(this));
                break;
            case 'PrivateIdentifier':
                break;
            case 'PropertyDefinition':
                if (node.computed) {
                    this.#processNode(node.key);
                }
                this.#processNode(node.value ?? null);
                break;
            case 'Property':
                if (node.shorthand) {
                    console.assert(node.value.type === 'Identifier');
                    console.assert(node.key.type === 'Identifier');
                    console.assert(node.value.name === node.key.name);
                    this.#addVariable(node.value.name, node.value.start, 0 , true);
                }
                else {
                    if (node.computed) {
                        this.#processNode(node.key);
                    }
                    else if (node.value.type === 'FunctionExpression') {
                        this.#additionalMappingLocations = mappingLocationsForMethodDefinition(node);
                        this.#methodName = nameForMethodDefinition(node);
                    }
                    this.#processNode(node.value);
                }
                break;
            case 'RestElement':
                this.#processNodeAsDefinition(1 , false, node.argument);
                break;
            case 'ReturnStatement':
                this.#processNode(node.argument ?? null);
                break;
            case 'SequenceExpression':
                node.expressions.forEach(this.#processNode.bind(this));
                break;
            case 'SpreadElement':
                this.#processNode(node.argument);
                break;
            case 'SwitchCase':
                this.#processNode(node.test ?? null);
                node.consequent.forEach(this.#processNode.bind(this));
                break;
            case 'SwitchStatement':
                this.#processNode(node.discriminant);
                node.cases.forEach(this.#processNode.bind(this));
                break;
            case 'TaggedTemplateExpression':
                this.#processNode(node.tag);
                this.#processNode(node.quasi);
                break;
            case 'TemplateLiteral':
                node.expressions.forEach(this.#processNode.bind(this));
                break;
            case 'ThisExpression':
                this.#addVariable('this', node.start);
                break;
            case 'ThrowStatement':
                this.#processNode(node.argument);
                break;
            case 'TryStatement':
                this.#processNode(node.block);
                this.#processNode(node.handler ?? null);
                this.#processNode(node.finalizer ?? null);
                break;
            case 'WithStatement':
                this.#processNode(node.object);
                this.#processNode(node.body);
                break;
            case 'YieldExpression':
                this.#processNode(node.argument ?? null);
                break;
            case 'UnaryExpression':
            case 'UpdateExpression':
                this.#processNode(node.argument);
                break;
            case 'WhileStatement':
                this.#processNode(node.test);
                this.#processNode(node.body);
                break;
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'DebuggerStatement':
            case 'EmptyStatement':
            case 'Literal':
            case 'Super':
            case 'TemplateElement':
                break;
            case 'ImportDeclaration':
            case 'ImportDefaultSpecifier':
            case 'ImportNamespaceSpecifier':
            case 'ImportSpecifier':
            case 'ImportExpression':
            case 'ExportAllDeclaration':
            case 'ExportDefaultDeclaration':
            case 'ExportNamedDeclaration':
            case 'ExportSpecifier':
                break;
            case 'VariableDeclarator':
                console.error('Should not encounter VariableDeclarator in general traversal.');
                break;
        }
    }
    getFreeVariables() {
        const result = new Map();
        for (const [name, defUse] of this.#rootScope.variables) {
            if (defUse.definitionKind !== 0 ) {
                continue;
            }
            result.set(name, defUse.uses);
        }
        return result;
    }
    getAllNames() {
        return this.#allNames;
    }
    #pushScope(start, end, kind, name, nameMappingLocations) {
        this.#currentScope = new Scope(start, end, this.#currentScope, kind, name, nameMappingLocations);
    }
    #popScope(isFunctionContext) {
        if (this.#currentScope.parent === null) {
            console.error('Internal error: wrong nesting in scope analysis.');
            throw new Error('Internal error');
        }
        this.#currentScope.finalizeToParent(isFunctionContext);
        this.#currentScope = this.#currentScope.parent;
    }
    #addVariable(name, offset, definitionKind = 0 , isShorthandAssignmentProperty = false) {
        this.#allNames.add(name);
        this.#currentScope.addVariable(name, offset, definitionKind, isShorthandAssignmentProperty);
    }
    #processNodeAsDefinition(definitionKind, isShorthandAssignmentProperty, node) {
        if (node === null) {
            return;
        }
        switch (node.type) {
            case 'ArrayPattern':
                node.elements.forEach(this.#processNodeAsDefinition.bind(this, definitionKind, false));
                break;
            case 'AssignmentPattern':
                this.#processNodeAsDefinition(definitionKind, isShorthandAssignmentProperty, node.left);
                this.#processNode(node.right);
                break;
            case 'Identifier':
                this.#addVariable(node.name, node.start, definitionKind, isShorthandAssignmentProperty);
                break;
            case 'MemberExpression':
                this.#processNode(node.object);
                if (node.computed) {
                    this.#processNode(node.property);
                }
                break;
            case 'ObjectPattern':
                node.properties.forEach(this.#processNodeAsDefinition.bind(this, definitionKind, false));
                break;
            case 'Property':
                if (node.computed) {
                    this.#processNode(node.key);
                }
                this.#processNodeAsDefinition(definitionKind, node.shorthand, node.value);
                break;
            case 'RestElement':
                this.#processNodeAsDefinition(definitionKind, false, node.argument);
                break;
        }
    }
    #processVariableDeclarator(definitionKind, decl) {
        this.#processNodeAsDefinition(definitionKind, false, decl.id);
        this.#processNode(decl.init ?? null);
    }
}
function mappingLocationsForFunctionDeclaration(node, sourceText) {
    const result = [node.id.start];
    const searchParenEndPos = node.params.length ? node.params[0].start : node.body.start;
    const parenPos = indexOfCharInBounds(sourceText, '(', node.id.end, searchParenEndPos);
    if (parenPos >= 0) {
        result.push(parenPos);
    }
    return result;
}
function mappingLocationsForFunctionExpression(node, sourceText) {
    const result = [];
    if (node.id) {
        result.push(node.id.start);
    }
    const searchParenStartPos = node.id ? node.id.end : node.start;
    const searchParenEndPos = node.params.length ? node.params[0].start : node.body.start;
    const parenPos = indexOfCharInBounds(sourceText, '(', searchParenStartPos, searchParenEndPos);
    if (parenPos >= 0) {
        result.push(parenPos);
    }
    return result;
}
function mappingLocationsForMethodDefinition(node) {
    if (node.key.type === 'Identifier' || node.key.type === 'PrivateIdentifier') {
        const id = node.key;
        return [id.start];
    }
    return [];
}
function nameForMethodDefinition(node) {
    if (node.key.type === 'Identifier') {
        return node.key.name;
    }
    if (node.key.type === 'PrivateIdentifier') {
        return '#' + node.key.name;
    }
    return undefined;
}
function mappingLocationsForArrowFunctions(node, sourceText) {
    const result = [];
    const searchParenStartPos = node.async ? node.start + 5 : node.start;
    const searchParenEndPos = node.params.length ? node.params[0].start : node.body.start;
    const parenPos = indexOfCharInBounds(sourceText, '(', searchParenStartPos, searchParenEndPos);
    if (parenPos >= 0) {
        result.push(parenPos);
    }
    const searchArrowStartPos = node.params.length ? node.params[node.params.length - 1].end : node.start;
    const arrowPos = indexOfCharInBounds(sourceText, '=', searchArrowStartPos, node.body.start);
    if (arrowPos >= 0 && sourceText[arrowPos + 1] === '>') {
        result.push(arrowPos);
    }
    return result;
}
function indexOfCharInBounds(str, needle, start, end) {
    for (let i = start; i < end; ++i) {
        if (str[i] === needle) {
            return i;
        }
    }
    return -1;
}

// Copyright 2022 The Chromium Authors
function substituteExpression(expression, scopes) {
    const replacements = computeSubstitution(expression, scopes);
    return applySubstitution(expression, replacements);
}
function parseBindingExpression(expression) {
    const options = {
        ecmaVersion: ECMA_VERSION,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        checkPrivateFields: false,
        ranges: false,
    };
    const root = parse$1(`(${expression})`, options);
    const exprAt = Parser$1.parseExpressionAt(expression, 0, options);
    if (root.body.length !== 1 || root.body[0].type !== 'ExpressionStatement') {
        throw new SyntaxError(`Invalid binding expression '${expression}'`);
    }
    const expr = root.body[0].expression;
    if (exprAt.start !== expr.start - 1 || exprAt.end !== expr.end - 1) {
        throw new SyntaxError(`Invalid binding expression '${expression}'`);
    }
    const analysis = new ScopeVariableAnalysis(root, `(${expression})`);
    analysis.run();
    const needsParens = expr.type !== 'Identifier' && expr.type !== 'MemberExpression' && expr.type !== 'ThisExpression';
    return {
        replacement: needsParens ? `(${expression})` : expression,
        freeVariables: [...analysis.getFreeVariables().keys()],
        allNames: analysis.getAllNames(),
    };
}
function computeSubstitution(expression, scopes) {
    const root = parse$1(expression, {
        ecmaVersion: ECMA_VERSION,
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        checkPrivateFields: false,
        ranges: false,
    });
    const scopeVariables = new ScopeVariableAnalysis(root, expression);
    scopeVariables.run();
    const freeVariables = scopeVariables.getFreeVariables();
    const result = [];
    const allNames = scopeVariables.getAllNames();
    const nameMap = new Map();
    const parsedBindings = new Map();
    const shadowedNames = new Set();
    for (const { bindings, generatedNames } of scopes) {
        const scopeNames = new Set(generatedNames);
        for (const [name, rename] of bindings.entries()) {
            let parsed;
            if (rename !== null) {
                try {
                    parsed = parseBindingExpression(rename);
                    parsed.allNames.forEach(id => allNames.add(id));
                    parsed.freeVariables.forEach(id => scopeNames.add(id));
                }
                catch (error) {
                    if (!nameMap.has(name) && freeVariables.has(name)) {
                        throw error;
                    }
                }
            }
            if (!nameMap.has(name)) {
                const isShadowed = parsed?.freeVariables.some(id => shadowedNames.has(id));
                nameMap.set(name, isShadowed ? null : rename);
                if (parsed && !isShadowed) {
                    parsedBindings.set(name, parsed);
                }
            }
        }
        scopeNames.forEach(id => shadowedNames.add(id));
    }
    function getNewName(base) {
        let i = 1;
        while (allNames.has(`${base}_${i}`)) {
            i++;
        }
        const newName = `${base}_${i}`;
        allNames.add(newName);
        return newName;
    }
    const capturedBinders = new Map();
    for (const [name, rename] of nameMap.entries()) {
        const defUse = freeVariables.get(name);
        if (!defUse) {
            continue;
        }
        if (rename === null) {
            throw new Error(`Cannot substitute '${name}' as the underlying variable '${rename}' is unavailable`);
        }
        const parsed = parsedBindings.get(name);
        if (!parsed) {
            continue;
        }
        const freeIds = [...parsed.freeVariables];
        for (const use of defUse) {
            result.push({
                from: name,
                to: parsed.replacement,
                offset: use.offset,
                isShorthandAssignmentProperty: use.isShorthandAssignmentProperty,
            });
            for (const freeId of freeIds) {
                for (const binder of use.scope.findBinders(freeId)) {
                    capturedBinders.set(binder, freeId);
                }
            }
        }
    }
    for (const [binder, freeId] of capturedBinders.entries()) {
        if (binder.definitionKind === 3 ) {
            throw new Error(`Cannot avoid capture of '${freeId}'`);
        }
        const newName = getNewName(freeId);
        for (const use of binder.uses) {
            result.push({
                from: freeId,
                to: newName,
                offset: use.offset,
                isShorthandAssignmentProperty: use.isShorthandAssignmentProperty,
            });
        }
    }
    result.sort((l, r) => l.offset - r.offset);
    return result;
}
function applySubstitution(expression, replacements) {
    const accumulator = [];
    let last = 0;
    for (const r of replacements) {
        accumulator.push(expression.slice(last, r.offset));
        let replacement = r.to;
        if (r.isShorthandAssignmentProperty) {
            replacement = `${r.from}: ${r.to}`;
        }
        accumulator.push(replacement);
        last = r.offset + r.from.length;
    }
    accumulator.push(expression.slice(last));
    return accumulator.join('');
}

// Copyright 2011 The Chromium Authors
function createTokenizer(mimeType) {
    const mode = CodeMirror.getMode({ indentUnit: 2 }, mimeType);
    const state = CodeMirror.startState(mode);
    if (!mode || mode.name === 'null') {
        throw new Error(`Could not find CodeMirror mode for MimeType: ${mimeType}`);
    }
    if (!mode.token) {
        throw new Error(`Could not find CodeMirror mode with token method: ${mimeType}`);
    }
    return (line, callback, startOffset = 0) => {
        const stream = new CodeMirror.StringStream(line);
        if (startOffset) {
            stream.pos = startOffset;
            stream.start = startOffset;
        }
        while (!stream.eol()) {
            const style = mode.token(stream, state);
            const value = stream.current();
            if (callback(value, style, stream.start, stream.start + value.length) === AbortTokenization) {
                return;
            }
            stream.start = stream.pos;
        }
    };
}
const AbortTokenization = {};
function format(mimeType, text, indentString) {
    indentString = indentString || '    ';
    let result;
    const builder = new FormattedContentBuilder(indentString);
    const lineEndings = findLineEndingIndexes(text);
    try {
        switch (mimeType) {
            case "text/html" : {
                const formatter = new HTMLFormatter(builder);
                formatter.format(text, lineEndings);
                break;
            }
            case "text/css" : {
                const formatter = new CSSFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
                break;
            }
            case "application/javascript" :
            case "text/javascript" : {
                const formatter = new JavaScriptFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
                break;
            }
            case "application/json" :
            case "application/manifest+json" : {
                const formatter = new JSONFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
                break;
            }
            default: {
                const formatter = new IdentityFormatter(builder);
                formatter.format(text, lineEndings, 0, text.length);
            }
        }
        result = {
            mapping: builder.mapping,
            content: builder.content(),
        };
    }
    catch (e) {
        console.error(e);
        result = {
            mapping: { original: [0], formatted: [0] },
            content: text,
        };
    }
    return result;
}

// Copyright 2013 The Chromium Authors
const cssTrimEnd = (tokenValue) => {
    const re = /(?:\r?\n|[\t\f\r ])+$/g;
    return tokenValue.replace(re, '');
};
class CSSFormatter {
    #builder;
    #text;
    #toOffset;
    #fromOffset;
    #lineEndings;
    #lastLine = -1;
    #currentLineIndex = 0;
    #state = {};
    constructor(builder) {
        this.#builder = builder;
    }
    format(text, lineEndings, fromOffset, toOffset) {
        this.#text = text;
        this.#lineEndings = lineEndings;
        this.#fromOffset = fromOffset;
        this.#toOffset = toOffset;
        this.#state = {};
        this.#lastLine = -1;
        this.#currentLineIndex = 0;
        const tokenize = createTokenizer('text/css');
        const oldEnforce = this.#builder.setEnforceSpaceBetweenWords(false);
        tokenize(text.substring(this.#fromOffset, this.#toOffset), this.#tokenCallback.bind(this));
        this.#builder.setEnforceSpaceBetweenWords(oldEnforce);
    }
    #isSelectorPseudoColon(colonOffset) {
        let parenDepth = 0;
        for (let i = colonOffset + 1; i < this.#toOffset; ++i) {
            const ch = this.#text[i];
            if (ch === '/' && this.#text[i + 1] === '*') {
                const commentEnd = this.#text.indexOf('*/', i + 2);
                if (commentEnd === -1) {
                    break;
                }
                i = commentEnd + 1;
                continue;
            }
            if (ch === '\'' || ch === '"') {
                const quote = ch;
                for (++i; i < this.#toOffset; ++i) {
                    if (this.#text[i] === '\\') {
                        ++i;
                    }
                    else if (this.#text[i] === quote) {
                        break;
                    }
                }
                continue;
            }
            if (ch === '(') {
                ++parenDepth;
            }
            else if (ch === ')') {
                if (parenDepth === 0) {
                    return false;
                }
                --parenDepth;
            }
            else if (parenDepth === 0) {
                if (ch === '{') {
                    return true;
                }
                if (ch === ';' || ch === '}') {
                    return false;
                }
            }
        }
        return false;
    }
    #tokenCallback(token, type, startPosition) {
        startPosition += this.#fromOffset;
        while (this.#currentLineIndex < this.#lineEndings.length &&
            this.#lineEndings[this.#currentLineIndex] < startPosition) {
            this.#currentLineIndex++;
        }
        const startLine = this.#currentLineIndex;
        if (startLine !== this.#lastLine) {
            this.#state.eatWhitespace = true;
        }
        if (type && (/^property/.test(type) || /^variable-2/.test(type)) && !this.#state.inPropertyValue) {
            this.#state.seenProperty = true;
        }
        this.#lastLine = startLine;
        const isWhitespace = /^(?:\r?\n|[\t\f\r ])+$/.test(token);
        if (isWhitespace) {
            if (!this.#state.eatWhitespace) {
                this.#builder.addSoftSpace();
            }
            return;
        }
        this.#state.eatWhitespace = false;
        if (token === '\n') {
            return;
        }
        if (token !== '}') {
            if (this.#state.afterClosingBrace) {
                this.#builder.addNewLine(true);
            }
            this.#state.afterClosingBrace = false;
        }
        if (token === '}') {
            if (this.#state.inPropertyValue) {
                this.#builder.addNewLine();
            }
            this.#builder.decreaseNestingLevel();
            this.#state.afterClosingBrace = true;
            this.#state.inPropertyValue = false;
            this.#state.seenProperty = false;
        }
        else if (token === ':' && !this.#state.inPropertyValue && this.#state.seenProperty) {
            if (this.#isSelectorPseudoColon(startPosition)) {
                this.#state.seenProperty = false;
            }
            else {
                this.#builder.addToken(token, startPosition);
                this.#builder.addSoftSpace();
                this.#state.eatWhitespace = true;
                this.#state.inPropertyValue = true;
                this.#state.seenProperty = false;
                return;
            }
        }
        else if (token === '{') {
            this.#state.seenProperty = false;
            this.#builder.addSoftSpace();
            this.#builder.addToken(token, startPosition);
            this.#builder.addNewLine();
            this.#builder.increaseNestingLevel();
            return;
        }
        this.#builder.addToken(cssTrimEnd(token), startPosition);
        if (type === 'comment' && !this.#state.inPropertyValue && !this.#state.seenProperty) {
            this.#builder.addNewLine();
        }
        if (token === ';' && this.#state.inPropertyValue) {
            this.#state.inPropertyValue = false;
            this.#builder.addNewLine();
        }
        else if (token === '}') {
            this.#builder.addNewLine();
        }
    }
}

// Copyright 2016 The Chromium Authors
const CSSParserStates = {
    Initial: 'Initial',
    Selector: 'Selector',
    Style: 'Style',
    PropertyName: 'PropertyName',
    PropertyValue: 'PropertyValue',
    AtRule: 'AtRule',
};
function parseCSS(text, chunkCallback) {
    const chunkSize = 100000;
    const lines = text.split('\n');
    let rules = [];
    let processedChunkCharacters = 0;
    let state = CSSParserStates.Initial;
    let rule;
    let property;
    const UndefTokenType = new Set();
    let disabledRules = [];
    function disabledRulesCallback(chunk) {
        disabledRules = disabledRules.concat(chunk.chunk);
    }
    function cssTrim(tokenValue) {
        const re = /^(?:\r?\n|[\t\f\r ])+|(?:\r?\n|[\t\f\r ])+$/g;
        return tokenValue.replace(re, '');
    }
    function processToken(tokenValue, tokenTypes, column, newColumn) {
        const tokenType = tokenTypes ? new Set(tokenTypes.split(' ')) : UndefTokenType;
        switch (state) {
            case CSSParserStates.Initial:
                if (tokenType.has('qualifier') || tokenType.has('builtin') || tokenType.has('tag')) {
                    rule = {
                        selectorText: tokenValue,
                        lineNumber,
                        columnNumber: column,
                        properties: [],
                    };
                    state = CSSParserStates.Selector;
                }
                else if (tokenType.has('def')) {
                    rule = {
                        atRule: tokenValue,
                        lineNumber,
                        columnNumber: column,
                    };
                    state = CSSParserStates.AtRule;
                }
                break;
            case CSSParserStates.Selector:
                if (tokenValue === '{' && tokenType === UndefTokenType) {
                    rule.selectorText = cssTrim(rule.selectorText);
                    rule.styleRange = createRange(lineNumber, newColumn);
                    state = CSSParserStates.Style;
                }
                else {
                    rule.selectorText += tokenValue;
                }
                break;
            case CSSParserStates.AtRule:
                if ((tokenValue === ';' || tokenValue === '{') && tokenType === UndefTokenType) {
                    rule.atRule = cssTrim(rule.atRule);
                    rules.push(rule);
                    state = CSSParserStates.Initial;
                }
                else {
                    rule.atRule += tokenValue;
                }
                break;
            case CSSParserStates.Style:
                if (tokenType.has('meta') || tokenType.has('property') || tokenType.has('variable-2')) {
                    property = {
                        name: tokenValue,
                        value: '',
                        range: createRange(lineNumber, column),
                        nameRange: createRange(lineNumber, column),
                    };
                    state = CSSParserStates.PropertyName;
                }
                else if (tokenValue === '}' && tokenType === UndefTokenType) {
                    rule.styleRange.endLine = lineNumber;
                    rule.styleRange.endColumn = column;
                    rules.push(rule);
                    state = CSSParserStates.Initial;
                }
                else if (tokenType.has('comment')) {
                    if (tokenValue.substring(0, 2) !== '/*' || tokenValue.substring(tokenValue.length - 2) !== '*/') {
                        break;
                    }
                    const uncommentedText = tokenValue.substring(2, tokenValue.length - 2);
                    const fakeRule = 'a{\n' + uncommentedText + '}';
                    disabledRules = [];
                    parseCSS(fakeRule, disabledRulesCallback);
                    if (disabledRules.length === 1 && disabledRules[0].properties.length === 1) {
                        const disabledProperty = disabledRules[0].properties[0];
                        disabledProperty.disabled = true;
                        disabledProperty.range = createRange(lineNumber, column);
                        disabledProperty.range.endColumn = newColumn;
                        const lineOffset = lineNumber - 1;
                        const columnOffset = column + 2;
                        disabledProperty.nameRange.startLine += lineOffset;
                        disabledProperty.nameRange.startColumn += columnOffset;
                        disabledProperty.nameRange.endLine += lineOffset;
                        disabledProperty.nameRange.endColumn += columnOffset;
                        disabledProperty.valueRange.startLine += lineOffset;
                        disabledProperty.valueRange.startColumn += columnOffset;
                        disabledProperty.valueRange.endLine += lineOffset;
                        disabledProperty.valueRange.endColumn += columnOffset;
                        rule.properties.push(disabledProperty);
                    }
                }
                break;
            case CSSParserStates.PropertyName:
                if (tokenValue === ':' && tokenType === UndefTokenType) {
                    property.name = property.name;
                    property.nameRange.endLine = lineNumber;
                    property.nameRange.endColumn = column;
                    property.valueRange = createRange(lineNumber, newColumn);
                    state = CSSParserStates.PropertyValue;
                }
                else if (tokenType.has('property')) {
                    property.name += tokenValue;
                }
                break;
            case CSSParserStates.PropertyValue:
                if ((tokenValue === ';' || tokenValue === '}') && tokenType === UndefTokenType) {
                    property.value = property.value;
                    property.valueRange.endLine = lineNumber;
                    property.valueRange.endColumn = column;
                    property.range.endLine = lineNumber;
                    property.range.endColumn = tokenValue === ';' ? newColumn : column;
                    rule.properties.push(property);
                    if (tokenValue === '}') {
                        rule.styleRange.endLine = lineNumber;
                        rule.styleRange.endColumn = column;
                        rules.push(rule);
                        state = CSSParserStates.Initial;
                    }
                    else {
                        state = CSSParserStates.Style;
                    }
                }
                else if (!tokenType.has('comment')) {
                    property.value += tokenValue;
                }
                break;
            default:
                console.assert(false, 'Unknown CSS parser state.');
        }
        processedChunkCharacters += newColumn - column;
        if (processedChunkCharacters > chunkSize) {
            chunkCallback({ chunk: rules, isLastChunk: false });
            rules = [];
            processedChunkCharacters = 0;
        }
    }
    const tokenizer = createTokenizer('text/css');
    let lineNumber;
    for (lineNumber = 0; lineNumber < lines.length; ++lineNumber) {
        const line = lines[lineNumber];
        tokenizer(line, processToken);
        processToken('\n', null, line.length, line.length + 1);
    }
    chunkCallback({ chunk: rules, isLastChunk: true });
    function createRange(lineNumber, columnNumber) {
        return { startLine: lineNumber, startColumn: columnNumber, endLine: lineNumber, endColumn: columnNumber };
    }
}

// Copyright 2019 The Chromium Authors
HOST_RUNTIME.workerScope.onmessage = function (event) {
    const method = event.data.method;
    const params = event.data.params;
    if (!method) {
        return;
    }
    switch (method) {
        case "format" :
            HOST_RUNTIME.workerScope.postMessage(format(params.mimeType, params.content, params.indentString));
            break;
        case "parseCSS" :
            parseCSS(params.content, self.postMessage);
            break;
        case "javaScriptSubstitute" : {
            let result;
            try {
                result = substituteExpression(params.content, params.mapping);
            }
            catch (error) {
                result = { error: error instanceof Error ? error.message : String(error) };
            }
            HOST_RUNTIME.workerScope.postMessage(result);
            break;
        }
        case "javaScriptScopeTree" : {
            HOST_RUNTIME.workerScope.postMessage(parseScopes(params.content, params.sourceType)?.export());
            break;
        }
        default:
            assertNever(method, `Unsupport method name: ${method}`);
    }
};
HOST_RUNTIME.workerScope.postMessage('workerReady');
//# sourceMappingURL=devtools-formatter-worker.js.map
