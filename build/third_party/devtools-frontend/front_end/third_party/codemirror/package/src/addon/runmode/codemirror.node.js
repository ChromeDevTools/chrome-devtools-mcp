import * as modeMethods from "../../modes.js";
import { countColumn } from "../../util/misc.js";
import StringStream from "../../util/StringStream.js";
// Copy StringStream and mode methods into exports (CodeMirror) object.
exports.StringStream = StringStream;
exports.countColumn = countColumn;
for (var exported in modeMethods)
    exports[exported] = modeMethods[exported];
// Shim library CodeMirror with the minimal CodeMirror defined above.
require.cache[require.resolve("../../lib/codemirror")] = require.cache[require.resolve("./runmode.node")];
require.cache[require.resolve("../../addon/runmode/runmode")] = require.cache[require.resolve("./runmode.node")];
// Minimal default mode.
exports.defineMode("null", () => ({ token: stream => stream.skipToEnd() }));
exports.defineMIME("text/plain", "null");
exports.registerHelper = exports.registerGlobalHelper = Math.min;
exports.splitLines = function (string) { return string.split(/\r?\n|\r/); };
exports.defaults = { indentUnit: 2 };
//# sourceMappingURL=codemirror.node.js.map