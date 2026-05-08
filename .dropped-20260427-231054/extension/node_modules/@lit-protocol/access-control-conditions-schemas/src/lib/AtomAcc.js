"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtomAccSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
exports.AtomAccSchema = zod_1.z
    .object({
    conditionType: zod_1.z.literal('cosmos').optional(),
    path: zod_1.z.string(),
    chain: common_1.ChainEnumAtom,
    method: zod_1.z.string().optional(),
    parameters: zod_1.z.array(zod_1.z.string()).optional(),
    returnValueTest: common_1.ReturnValueTestSchema,
})
    .strict();
//# sourceMappingURL=AtomAcc.js.map