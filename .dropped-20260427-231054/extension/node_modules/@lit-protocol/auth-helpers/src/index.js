"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformShorthandResources = exports.isResourceShorthandInput = void 0;
const tslib_1 = require("tslib");
tslib_1.__exportStar(require("./lib/auth-config-builder"), exports);
tslib_1.__exportStar(require("./lib/generate-auth-sig"), exports);
tslib_1.__exportStar(require("./lib/models"), exports);
tslib_1.__exportStar(require("./lib/payment-delegation"), exports);
tslib_1.__exportStar(require("./lib/recap/recap-session-capability-object"), exports);
tslib_1.__exportStar(require("./lib/recap/resource-builder"), exports);
tslib_1.__exportStar(require("./lib/recap/utils"), exports);
tslib_1.__exportStar(require("./lib/resources"), exports);
tslib_1.__exportStar(require("./lib/session-capability-object"), exports);
tslib_1.__exportStar(require("./lib/siwe/create-siwe-message"), exports);
tslib_1.__exportStar(require("./lib/siwe/siwe-helper"), exports);
// export * from './lib/siwe';
// export * from './lib/wallets/walletconnect';
// Export new resource shorthand transformer utilities
var resource_shorthand_transformer_1 = require("./lib/resource-shorthand-transformer");
Object.defineProperty(exports, "isResourceShorthandInput", { enumerable: true, get: function () { return resource_shorthand_transformer_1.isResourceShorthandInput; } });
Object.defineProperty(exports, "transformShorthandResources", { enumerable: true, get: function () { return resource_shorthand_transformer_1.transformShorthandResources; } });
//# sourceMappingURL=index.js.map