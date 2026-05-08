"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvmBasicAccSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
const StandardContractTypeEnum = zod_1.z.enum([
    '',
    'ERC20',
    'ERC721',
    'ERC721MetadataName',
    'ERC1155',
    'CASK',
    'Creaton',
    'POAP',
    'timestamp',
    'MolochDAOv2.1',
    'ProofOfHumanity',
    'SIWE',
    'PKPPermissions',
    'LitAction',
]);
exports.EvmBasicAccSchema = zod_1.z
    .object({
    conditionType: zod_1.z.literal('evmBasic').optional(),
    contractAddress: zod_1.z.string(),
    chain: common_1.EvmChainEnum,
    standardContractType: StandardContractTypeEnum,
    method: zod_1.z.string(),
    parameters: zod_1.z.array(zod_1.z.string()),
    returnValueTest: common_1.ReturnValueTestSchema.omit({ key: true }),
})
    .strict();
//# sourceMappingURL=EvmBasicAcc.js.map