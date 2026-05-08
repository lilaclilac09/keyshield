"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectMapFromArray = void 0;
/**
 * @example
 * const obj = ['a', 'b', 'c']
 * ObjectMapFromArray(obj) // { a: 'a', b: 'b', c: 'c' }
 */
const ObjectMapFromArray = (arr) => {
    return arr.reduce((acc, scope) => ({ ...acc, [scope]: scope }), {});
};
exports.ObjectMapFromArray = ObjectMapFromArray;
//# sourceMappingURL=ObjectMapFromArray.js.map