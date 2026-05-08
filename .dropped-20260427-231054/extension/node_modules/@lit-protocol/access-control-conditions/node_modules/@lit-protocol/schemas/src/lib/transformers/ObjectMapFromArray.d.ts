/**
 * @example
 * const obj = ['a', 'b', 'c']
 * ObjectMapFromArray(obj) // { a: 'a', b: 'b', c: 'c' }
 */
export declare const ObjectMapFromArray: <T extends readonly string[]>(arr: T) => { [K in T[number]]: K; };
