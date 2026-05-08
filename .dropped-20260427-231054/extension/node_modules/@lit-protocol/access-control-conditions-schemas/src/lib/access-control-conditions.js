"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultipleAccessControlConditionsSchema = exports.UnifiedConditionsSchema = exports.SolRpcConditionsSchema = exports.EvmContractConditionsSchema = exports.EvmBasicConditionsSchema = exports.AtomConditionsSchema = void 0;
const zod_1 = require("zod");
const AtomAcc_1 = require("./AtomAcc");
const EvmBasicAcc_1 = require("./EvmBasicAcc");
const EvmContractAcc_1 = require("./EvmContractAcc");
const OperatorAcc_1 = require("./OperatorAcc");
const SolAcc_1 = require("./SolAcc");
// Schema definitions
// Atom
const AtomConditionUnionSchema = zod_1.z.union([
    AtomAcc_1.AtomAccSchema,
    OperatorAcc_1.OperatorAccSchema,
    zod_1.z.array(zod_1.z.lazy(() => AtomConditionSchema)),
]);
const AtomConditionSchema = zod_1.z.lazy(() => AtomConditionUnionSchema);
exports.AtomConditionsSchema = zod_1.z
    .array(AtomConditionSchema)
    .nonempty();
// EVM Basic
const EvmBasicConditionUnionSchema = zod_1.z.union([
    EvmBasicAcc_1.EvmBasicAccSchema,
    OperatorAcc_1.OperatorAccSchema,
    zod_1.z.array(zod_1.z.lazy(() => EvmBasicConditionSchema)),
]);
const EvmBasicConditionSchema = zod_1.z.lazy(() => EvmBasicConditionUnionSchema);
exports.EvmBasicConditionsSchema = zod_1.z
    .array(EvmBasicConditionSchema)
    .nonempty();
// EVM Contract
const EvmContractConditionUnionSchema = zod_1.z.union([
    EvmContractAcc_1.EvmContractAccSchema,
    OperatorAcc_1.OperatorAccSchema,
    zod_1.z.array(zod_1.z.lazy(() => EvmContractConditionSchema)),
]);
const EvmContractConditionSchema = zod_1.z.lazy(() => EvmContractConditionUnionSchema);
exports.EvmContractConditionsSchema = zod_1.z
    .array(EvmContractConditionSchema)
    .nonempty();
// Solana
const SolRpcConditionUnionSchema = zod_1.z.union([
    SolAcc_1.SolAccSchema,
    OperatorAcc_1.OperatorAccSchema,
    zod_1.z.array(zod_1.z.lazy(() => SolRpcConditionSchema)),
]);
const SolRpcConditionSchema = zod_1.z.lazy(() => SolRpcConditionUnionSchema);
exports.SolRpcConditionsSchema = zod_1.z
    .array(SolRpcConditionSchema)
    .nonempty();
// Unified
const UnifiedConditionUnionSchema = zod_1.z.union([
    AtomAcc_1.AtomAccSchema.required({ conditionType: true }),
    EvmBasicAcc_1.EvmBasicAccSchema.required({ conditionType: true }),
    EvmContractAcc_1.EvmContractAccSchema.required({ conditionType: true }),
    SolAcc_1.SolAccSchema.required({ conditionType: true }),
    OperatorAcc_1.OperatorAccSchema,
    zod_1.z.array(zod_1.z.lazy(() => UnifiedConditionSchema)),
]);
const UnifiedConditionSchema = zod_1.z.lazy(() => UnifiedConditionUnionSchema);
exports.UnifiedConditionsSchema = zod_1.z.array(UnifiedConditionSchema).nonempty();
exports.MultipleAccessControlConditionsSchema = zod_1.z.object({
    // The access control conditions that the user must meet to obtain this signed token.  This could be possession of an NFT, for example.  You must pass either accessControlConditions or evmContractConditions or solRpcConditions or unifiedAccessControlConditions.
    accessControlConditions: exports.EvmBasicConditionsSchema.optional(),
    // EVM Smart Contract access control conditions that the user must meet to obtain this signed token.  This could be possession of an NFT, for example.  This is different than accessControlConditions because accessControlConditions only supports a limited number of contract calls.  evmContractConditions supports any contract call.  You must pass either accessControlConditions or evmContractConditions or solRpcConditions or unifiedAccessControlConditions.
    evmContractConditions: exports.EvmContractConditionsSchema.optional(),
    // Solana RPC call conditions that the user must meet to obtain this signed token.  This could be possession of an NFT, for example.
    solRpcConditions: exports.SolRpcConditionsSchema.optional(),
    // An array of unified access control conditions.  You may use AccessControlCondition, EVMContractCondition, or SolRpcCondition objects in this array, but make sure you add a conditionType for each one.  You must pass either accessControlConditions or evmContractConditions or solRpcConditions or unifiedAccessControlConditions.
    unifiedAccessControlConditions: exports.UnifiedConditionsSchema.optional(),
});
//# sourceMappingURL=access-control-conditions.js.map