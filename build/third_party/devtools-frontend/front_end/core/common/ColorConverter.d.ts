export declare class ColorConverter {
    static labToXyzd50(l: number, a: number, b: number): [number, number, number];
    static xyzd50ToLab(x: number, y: number, z: number): [number, number, number];
    static oklabToXyzd65(l: number, a: number, b: number): [number, number, number];
    static xyzd65ToOklab(x: number, y: number, z: number): [number, number, number];
    static lchToLab(l: number, c: number, h: number | undefined): [number, number, number];
    static labToLch(l: number, a: number, b: number): [number, number, number];
    static displayP3ToXyzd50(r: number, g: number, b: number): [number, number, number];
    static xyzd50ToDisplayP3(x: number, y: number, z: number): [number, number, number];
    static displayP3LinearToXyzd50(r: number, g: number, b: number): [number, number, number];
    static xyzd50ToDisplayP3Linear(x: number, y: number, z: number): [number, number, number];
    static proPhotoToXyzd50(r: number, g: number, b: number): [number, number, number];
    static xyzd50ToProPhoto(x: number, y: number, z: number): [number, number, number];
    static adobeRGBToXyzd50(r: number, g: number, b: number): [number, number, number];
    static xyzd50ToAdobeRGB(x: number, y: number, z: number): [number, number, number];
    static rec2020ToXyzd50(r: number, g: number, b: number): [number, number, number];
    static xyzd50ToRec2020(x: number, y: number, z: number): [number, number, number];
    static xyzd50ToD65(x: number, y: number, z: number): [number, number, number];
    static xyzd65ToD50(x: number, y: number, z: number): [number, number, number];
    static xyzd50TosRGBLinear(x: number, y: number, z: number): [number, number, number];
    static srgbLinearToXyzd50(r: number, g: number, b: number): [number, number, number];
    static srgbToXyzd50(r: number, g: number, b: number): [number, number, number];
    static xyzd50ToSrgb(x: number, y: number, z: number): [number, number, number];
    static oklchToXyzd50(lInput: number, c: number, h: number): [number, number, number];
    static xyzd50ToOklch(x: number, y: number, z: number): [number, number, number];
}
