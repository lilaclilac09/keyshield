"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperatorAccSchema = void 0;
const zod_1 = require("zod");
exports.OperatorAccSchema = zod_1.z
    .object({
    operator: zod_1.z.enum(['and', 'or']),
})
    .strict();
//# sourceMappingURL=OperatorAcc.js.map