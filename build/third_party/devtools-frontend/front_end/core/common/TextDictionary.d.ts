import { Trie } from './Trie.js';
export declare class TextDictionary {
    readonly words: Map<string, number>;
    readonly index: Trie<string>;
    addWord(word: string): void;
    removeWord(word: string): void;
    wordsWithPrefix(prefix: string): string[];
    hasWord(word: string): boolean;
    wordCount(word: string): number;
    reset(): void;
}
