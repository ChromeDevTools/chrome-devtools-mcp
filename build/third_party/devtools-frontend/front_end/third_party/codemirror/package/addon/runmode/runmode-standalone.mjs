(function () {
  'use strict';

  function copyObj(obj, target, overwrite) {
    if (!target) { target = {}; }
    for (var prop in obj)
      { if (obj.hasOwnProperty(prop) && (overwrite !== false || !target.hasOwnProperty(prop)))
        { target[prop] = obj[prop]; } }
    return target
  }

  // Counts the column offset in a string, taking tabs into account.
  // Used mostly to find indentation.
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

  // STRING STREAM

  // Fed to the mode parsers, provides helper functions to make
  // parsers more succinct.

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

  // Known modes, by name and by MIME
  var modes = {}, mimeModes = {};

  // Extra arguments are stored as the mode's dependencies, which is
  // used by (legacy) mechanisms like loadmode.js to automatically
  // load a mode. (Preferred mechanism is the require/define calls.)
  function defineMode(name, mode) {
    if (arguments.length > 2)
      { mode.dependencies = Array.prototype.slice.call(arguments, 2); }
    modes[name] = mode;
  }

  function defineMIME(mime, spec) {
    mimeModes[mime] = spec;
  }

  // Given a MIME type, a {name, ...options} config object, or a name
  // string, return a mode config object.
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

  // Given a mode spec (anything that resolveMode accepts), find and
  // initialize an actual mode object.
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

  // This can be used to attach properties to mode objects from
  // outside the actual mode definition.
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

  // Given a mode and a state (for that mode), find the inner mode and
  // state at the position that the state refers to.
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

  // declare global: globalThis, CodeMirror

  // Create a minimal CodeMirror needed to use runMode, and assign to root.
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.CodeMirror = {};

  // Copy StringStream and mode methods into CodeMirror object.
  CodeMirror.StringStream = StringStream;
  for (var exported in modeMethods) { CodeMirror[exported] = modeMethods[exported]; }

  // Minimal default mode.
  CodeMirror.defineMode("null", function () { return ({token: function (stream) { return stream.skipToEnd(); }}); });
  CodeMirror.defineMIME("text/plain", "null");

  CodeMirror.registerHelper = CodeMirror.registerGlobalHelper = Math.min;
  CodeMirror.splitLines = function(string) { return string.split(/\r?\n|\r/) };
  CodeMirror.countColumn = countColumn;

  CodeMirror.defaults = { indentUnit: 2 };

  // CodeMirror, copyright (c) by Marijn Haverbeke and others
  // Distributed under an MIT license: https://codemirror.net/LICENSE

  (function(mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
      { mod(require("../../lib/codemirror")); }
    else if (typeof define == "function" && define.amd) // AMD
      { define(["../../lib/codemirror"], mod); }
    else // Plain browser env
      { mod(CodeMirror); }
  })(function(CodeMirror) {

  CodeMirror.runMode = function(string, modespec, callback, options) {
    var mode = CodeMirror.getMode(CodeMirror.defaults, modespec);
    var tabSize = (options && options.tabSize) || CodeMirror.defaults.tabSize;

    // Create a tokenizing callback function if passed-in callback is a DOM element.
    if (callback.appendChild) {
      var ie = /MSIE \d/.test(navigator.userAgent);
      var ie_lt9 = ie && (document.documentMode == null || document.documentMode < 9);
      var node = callback, col = 0;
      node.innerHTML = "";
      callback = function(text, style) {
        if (text == "\n") {
          // Emitting LF or CRLF on IE8 or earlier results in an incorrect display.
          // Emitting a carriage return makes everything ok.
          node.appendChild(document.createTextNode(ie_lt9 ? '\r' : text));
          col = 0;
          return;
        }
        var content = "";
        // replace tabs
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
        // Create a node with token style and append it to the callback DOM element.
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
