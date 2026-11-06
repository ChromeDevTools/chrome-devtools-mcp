export declare class Size {
    width: number;
    height: number;
    constructor(width: number, height: number);
    clipTo(size?: Size | null): Size;
    scale(scale: number): Size;
    isEqual(size: Size | null): boolean;
    widthToMax(size: number | Size): Size;
    addWidth(size: number | Size): Size;
    heightToMax(size: number | Size): Size;
    addHeight(size: number | Size): Size;
}
