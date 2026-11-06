import type * as Lantern from '../types/types.js';
import type { CPUNode } from './CPUNode.js';
import type { NetworkNode } from './NetworkNode.js';
/**
 * A union of all types derived from BaseNode, allowing type check discrimination
 * based on `node.type`. If a new node type is created, it should be added here.
 */
export type Node<T = Lantern.AnyNetworkObject> = CPUNode<T> | NetworkNode<T>;
/**
 * @file This class encapsulates logic for handling resources and tasks used to model the
 * execution dependency graph of the page. A node has a unique identifier and can depend on other
 * nodes/be depended on. The construction of the graph maintains some important invariants that are
 * inherent to the model:
 *
 *    1. The graph is a DAG, there are no cycles.
 *    2. There is always a root node upon which all other nodes eventually depend.
 *
 * This allows particular optimizations in this class so that we do no need to check for cycles as
 * these methods are called and we can always start traversal at the root node.
 */
declare class BaseNode<T = Lantern.AnyNetworkObject> {
    static types: {
        readonly NETWORK: 'network';
        readonly CPU: 'cpu';
    };
    _id: string;
    _isMainDocument: boolean;
    dependents: Node[];
    dependencies: Node[];
    constructor(id: string);
    get id(): string;
    get type(): 'network' | 'cpu';
    /**
     * In microseconds
     */
    get startTime(): number;
    /**
     * In microseconds
     */
    get endTime(): number;
    setIsMainDocument(value: boolean): void;
    isMainDocument(): boolean;
    getDependents(): Node[];
    getNumberOfDependents(): number;
    getDependencies(): Node[];
    getNumberOfDependencies(): number;
    getRootNode(): Node<T>;
    addDependent(node: Node): void;
    addDependency(node: Node): void;
    removeDependent(node: Node): void;
    removeDependency(node: Node): void;
    removeAllDependencies(): void;
    /**
     * Computes whether the given node is anywhere in the dependency graph of this node.
     * While this method can prevent cycles, it walks the graph and should be used sparingly.
     * Nodes are always considered dependent on themselves for the purposes of cycle detection.
     */
    isDependentOn(node: BaseNode<T>): boolean;
    /**
     * Clones the node's information without adding any dependencies/dependents.
     */
    cloneWithoutRelationships(): Node<T>;
    /**
     * Clones the entire graph connected to this node filtered by the optional predicate. If a node is
     * included by the predicate, all nodes along the paths between the node and the root will be included. If the
     * node this was called on is not included in the resulting filtered graph, the method will throw.
     *
     * This does not clone NetworkNode's `record` or `rawRecord` fields. It may be reasonable to clone the former,
     * to assist in graph construction, but the latter should never be cloned as one constraint of Lantern is that
     * the underlying data records are accessible for plain object reference equality checks.
     */
    cloneWithRelationships(predicate?: (arg0: Node) => boolean): Node;
    /**
     * Traverses all connected nodes in BFS order, calling `callback` exactly once
     * on each. `traversalPath` is the shortest (though not necessarily unique)
     * path from `node` to the root of the iteration.
     *
     * The `getNextNodes` function takes a visited node and returns which nodes to
     * visit next. It defaults to returning the node's dependents.
     */
    traverse(callback: (node: Node<T>, traversalPath: Array<Node<T>>) => void, getNextNodes?: (arg0: Node<T>) => Array<Node<T>>): void;
    /**
     * @see BaseNode.traverse
     */
    traverseGenerator(getNextNodes?: (arg0: Node) => Node[]): Generator<{
        node: Node;
        traversalPath: Node[];
    }, void, unknown>;
    /**
     * If the given node has a cycle, returns a path representing that cycle.
     * Else returns null.
     *
     * Does a DFS on in its dependent graph.
     */
    static findCycle(node: Node, direction?: 'dependents' | 'dependencies' | 'both'): BaseNode[] | null;
    canDependOn(node: Node): boolean;
}
export { BaseNode };
