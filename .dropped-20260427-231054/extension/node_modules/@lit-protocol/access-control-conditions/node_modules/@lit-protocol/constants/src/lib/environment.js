"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Environment = void 0;
class Environment {
    static get isNode() {
        return typeof process?.versions?.node !== 'undefined';
    }
    static get isBrowser() {
        return !Environment.isNode;
    }
}
exports.Environment = Environment;
//# sourceMappingURL=environment.js.map