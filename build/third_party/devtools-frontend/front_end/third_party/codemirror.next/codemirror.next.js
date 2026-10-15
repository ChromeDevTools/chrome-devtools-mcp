
export default {};
export const cssStreamParser = () => Promise.resolve({ startState: () => ({}) });
export class StringStream { constructor() {} }
export const css = { cssLanguage: { parser: { parse: () => ({ topNode: { getChild: () => null } }) } } };
