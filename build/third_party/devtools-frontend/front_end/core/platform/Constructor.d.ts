export type Constructor<T, Args extends any[] = any[]> = new (...args: Args) => T;
export type AbstractConstructor<T, Args extends any[] = any[]> = (abstract new (...args: Args) => T);
export type ConstructorOrAbstract<T> = Constructor<T> | AbstractConstructor<T>;
