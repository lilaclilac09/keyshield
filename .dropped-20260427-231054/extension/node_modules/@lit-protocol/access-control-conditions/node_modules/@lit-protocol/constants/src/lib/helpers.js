"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobal = getGlobal;
function getGlobal() {
    if (typeof globalThis !== 'undefined')
        return globalThis;
    if (typeof window !== 'undefined')
        return window;
    if (typeof global !== 'undefined')
        return global;
    if (typeof self !== 'undefined')
        return self;
    throw new Error('Unable to locate global object');
}
//# sourceMappingURL=helpers.js.map