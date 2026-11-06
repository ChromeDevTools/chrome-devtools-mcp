import type * as Acorn from '../../third_party/acorn/acorn.js';
export declare class ESTreeWalker {
    #private;
    constructor(beforeVisit: (arg0: Acorn.ESTree.Node) => unknown, afterVisit: ((arg0: Acorn.ESTree.Node) => unknown));
    walk(ast: Acorn.ESTree.Node): void;
}
