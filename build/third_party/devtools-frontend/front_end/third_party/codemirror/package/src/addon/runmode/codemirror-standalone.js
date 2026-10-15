import * as modeMethods from "../../modes.js";
import { countColumn } from "../../util/misc.js";
import StringStream from "../../util/StringStream.js";
// declare global: globalThis, CodeMirror
// Create a minimal CodeMirror needed to use runMode, and assign to root.
var root = typeof globalThis !== 'undefined' ? globalThis : window;
root.CodeMirror = {};
// Copy StringStream and mode methods into CodeMirror object.
CodeMirror.StringStream = StringStream;
for (var exported in modeMethods)
    CodeMirror[exported] = modeMethods[exported];
// Minimal default mode.
CodeMirror.defineMode("null", () => ({ token: stream => stream.skipToEnd() }));
CodeMirror.defineMIME("text/plain", "null");
CodeMirror.registerHelper = CodeMirror.registerGlobalHelper = Math.min;
CodeMirror.splitLines = function (string) { return string.split(/\r?\n|\r/); };
CodeMirror.countColumn = countColumn;
CodeMirror.defaults = { indentUnit: 2 };
export default CodeMirror;
//# sourceMappingURL=codemirror-standalone.js.map