import * as Formatter from '../../models/formatter/formatter.js';
import * as TextUtils from '../text_utils/text_utils.js';
import type { Script } from './Script.js';
type ScopeTreeNode = Formatter.FormatterWorkerPool.ScopeTreeNode;
type Text = TextUtils.Text.Text;
/**
 * Computes and caches the scope tree for `script`.
 *
 * We use {@link Script} as a key to uniquely identify scripts.
 * {@link Script} boils down to "target" + "script ID". This
 * duplicates work in case of identical script running on multiple targets
 * (e.g. workers).
 *
 * We also return a {@link TextUtils.Text.Text} instance. The scope tree uses offsets
 * and the text allows conversion from/to line/column numbers.
 */
export declare function scopeTreeForScript(script: Script): Promise<{
    scopeTree: ScopeTreeNode;
    text: Text;
} | null>;
export {};
