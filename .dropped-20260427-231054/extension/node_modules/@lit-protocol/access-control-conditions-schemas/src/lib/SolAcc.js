"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolAccSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
const PdaInterfaceSchema = zod_1.z
    .object({
    offset: zod_1.z.number(),
    fields: zod_1.z.object({}).catchall(zod_1.z.any()),
})
    .strict();
exports.SolAccSchema = zod_1.z
    .object({
    conditionType: zod_1.z.literal('solRpc').optional(),
    method: zod_1.z.string(),
    params: zod_1.z.array(zod_1.z.string()),
    pdaParams: zod_1.z.array(zod_1.z.string()).optional(),
    pdaInterface: PdaInterfaceSchema,
    pdaKey: zod_1.z.string(),
    chain: common_1.ChainEnumSol,
    returnValueTest: common_1.ReturnValueTestSchema,
})
    .strict();
//# sourceMappingURL=SolAcc.js.map