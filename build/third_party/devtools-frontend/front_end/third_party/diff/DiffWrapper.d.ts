import './diff_match_patch.js';
export declare const DiffWrapper: {
    charDiff: (text1: string, text2: string, cleanup?: boolean) => {
        0: number;
        1: string;
    }[];
    lineDiff: (lines1: string[], lines2: string[]) => DiffArray;
    convertToEditDiff: (diff: DiffArray) => number[][];
    /**
     * Scores character-sequence diffs, giving higher scores for longer sequences.
     */
    characterScore: (item: string, against: string) => number;
};
export declare enum Operation {
    Equal = 0,
    Insert = 1,
    Delete = -1,
    Edit = 2
}
export type DiffArray = {
    0: Operation;
    1: string[];
}[];
