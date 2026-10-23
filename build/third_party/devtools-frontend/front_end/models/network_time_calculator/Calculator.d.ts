/**
 * The TimelineGrid is used in the Performance panel and Memory panel -> Allocating sampling, so the value can be either
 * milliseconds or bytes
 **/
export interface Calculator {
    computePosition(value: number): number;
    formatValue(value: number, precision?: number): string;
    minimumBoundary(): number;
    zeroTime(): number;
    maximumBoundary(): number;
    boundarySpan(): number;
}
