export interface LayoutShiftWithAttribution {
    attribution: {
        affectedNodes: Node[];
    };
    entry: LayoutShift;
    value: number;
}
export declare function onEachLayoutShift(callback: (layoutShift: LayoutShiftWithAttribution) => void): void;
