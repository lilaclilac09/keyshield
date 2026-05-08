"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReturnValueTestSchema = exports.ChainEnumSol = exports.EvmChainEnum = exports.ChainEnumAtom = void 0;
const zod_1 = require("zod");
const constants_1 = require("@lit-protocol/constants");
exports.ChainEnumAtom = zod_1.z.enum(constants_1.LIT_COSMOS_CHAINS_KEYS);
exports.EvmChainEnum = zod_1.z.enum(constants_1.LIT_CHAINS_KEYS);
exports.ChainEnumSol = zod_1.z.enum(constants_1.LIT_SVM_CHAINS_KEYS);
exports.ReturnValueTestSchema = zod_1.z
    .object({
    key: zod_1.z.string(),
    comparator: zod_1.z.enum(['contains', '=', '>', '>=', '<', '<=']),
    value: zod_1.z.string(),
})
    .strict();
//# sourceMappingURL=common.js.map