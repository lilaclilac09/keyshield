"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvmContractAccSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
const FunctionAbiInputSchema = zod_1.z
    .object({
    name: zod_1.z.string(),
    type: zod_1.z.string(),
    internalType: zod_1.z.string().optional(),
})
    .strict();
const FunctionAbiOutputSchema = zod_1.z
    .object({
    name: zod_1.z.string(),
    type: zod_1.z.string(),
    internalType: zod_1.z.string().optional(),
})
    .strict();
const FunctionAbiSchema = zod_1.z
    .object({
    name: zod_1.z.string(),
    type: zod_1.z.string().optional(),
    stateMutability: zod_1.z.string(),
    constant: zod_1.z.boolean().optional(),
    inputs: zod_1.z.array(FunctionAbiInputSchema),
    outputs: zod_1.z.array(FunctionAbiOutputSchema),
})
    .strict();
exports.EvmContractAccSchema = zod_1.z
    .object({
    conditionType: zod_1.z.literal('evmContract').optional(),
    contractAddress: zod_1.z.string(),
    chain: common_1.EvmChainEnum,
    functionName: zod_1.z.string(),
    functionParams: zod_1.z.array(zod_1.z.string()),
    functionAbi: FunctionAbiSchema,
    returnValueTest: common_1.ReturnValueTestSchema,
})
    .strict();
//# sourceMappingURL=EvmContractAcc.js.map