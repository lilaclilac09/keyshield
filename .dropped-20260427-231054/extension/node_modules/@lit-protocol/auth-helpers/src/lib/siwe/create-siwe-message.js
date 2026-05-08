"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSiweMessageWithCapacityDelegation = exports.createSiweMessageWithResources = exports.createSiweMessage = exports.createPKPSiweMessage = exports.CreatePKPSiweMessageParamsSchema = void 0;
const transactions_1 = require("@ethersproject/transactions");
const siwe_1 = require("siwe");
const constants_1 = require("@lit-protocol/constants");
const schemas_1 = require("@lit-protocol/schemas");
const zod_1 = require("zod");
const siwe_helper_1 = require("./siwe-helper");
const globalScope = (0, constants_1.getGlobal)();
/**
 * Schema for parameters needed to create a PKP SIWE message
 */
exports.CreatePKPSiweMessageParamsSchema = zod_1.z.object({
    /** Public key of the PKP that will sign */
    pkpPublicKey: schemas_1.HexPrefixedSchema,
    /** URI identifying the session key */
    sessionKeyUri: zod_1.z.string(),
    /** Nonce from the Lit Node */
    nonce: zod_1.z.string(),
    /** Expiration time for the session */
    expiration: zod_1.z.string(),
    /** Optional statement to append to the default SIWE statement */
    statement: zod_1.z.string().optional(),
    /** Optional domain for the SIWE message */
    domain: zod_1.z.string().optional(),
    /** Optional resources and abilities for SIWE ReCap */
    resources: zod_1.z.array(zod_1.z.any()).optional(), // Using any here as LitResourceAbilityRequest is imported
});
/**
 * Creates the specific SIWE message that needs to be signed by a PKP
 * to authorize a session key.
 * @param params - Parameters for creating the PKP SIWE message.
 * @returns A promise that resolves to the prepared SIWE message string.
 */
const createPKPSiweMessage = async (params) => {
    let siweMessage;
    // Compute the address from the public key.
    const pkpEthAddress = (0, transactions_1.computeAddress)(params.pkpPublicKey);
    let siwe_statement = 'Lit Protocol PKP session signature';
    if (params.statement) {
        siwe_statement += ' ' + params.statement;
    }
    const siweParams = {
        domain: params.domain || globalScope.location?.host || 'litprotocol.com',
        walletAddress: pkpEthAddress,
        statement: siwe_statement,
        uri: params.sessionKeyUri,
        version: '1',
        chainId: 1,
        expiration: params.expiration,
        nonce: params.nonce,
    };
    if (params.resources) {
        siweMessage = await (0, exports.createSiweMessageWithResources)({
            ...siweParams,
            resources: params.resources,
        });
    }
    else {
        siweMessage = await (0, exports.createSiweMessage)(siweParams);
    }
    return siweMessage;
};
exports.createPKPSiweMessage = createPKPSiweMessage;
/**
 * Creates a SIWE
 * @param { BaseSiweMessage } params - The parameters for creating the SIWE message.
 * @returns A promise that resolves to the created SIWE message as a string.
 * @throws An error if the walletAddress parameter is missing.
 */
const createSiweMessage = async (params) => {
    // -- validations
    if (!params.walletAddress) {
        throw new constants_1.InvalidArgumentException({
            info: {
                params,
            },
        }, 'walletAddress is required');
    }
    const ONE_WEEK_FROM_NOW = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const siweParams = {
        domain: params?.domain ?? 'localhost',
        address: params.walletAddress,
        statement: params?.statement ??
            'This is a test statement.  You can put anything you want here.',
        uri: params?.uri ?? 'https://localhost/login',
        version: params?.version ?? '1',
        chainId: params?.chainId ?? 1,
        nonce: params.nonce,
        expirationTime: params?.expiration ?? ONE_WEEK_FROM_NOW,
    };
    let siweMessage = new siwe_1.SiweMessage(siweParams);
    // -- add recap resources if needed
    if (params.resources) {
        siweMessage = await (0, siwe_helper_1.addRecapToSiweMessage)({
            siweMessage,
            resources: params.resources,
        });
    }
    return siweMessage.prepareMessage();
};
exports.createSiweMessage = createSiweMessage;
/**
 * Creates a SIWE message with recaps added to it.
 *
 * @param { WithRecap } params - The parameters for creating the SIWE message with recaps.
 * @returns A Promise that resolves to a string representing the SIWE message.
 */
const createSiweMessageWithResources = async (params) => {
    return (0, exports.createSiweMessage)({
        ...params,
    });
};
exports.createSiweMessageWithResources = createSiweMessageWithResources;
/**
 * Creates a SIWE message with capacity delegation.
 * @param { WithCapacityDelegation } params - The parameters for creating the SIWE message.
 * @returns A Promise that resolves to the created SIWE message.
 * @throws An error if litNodeClient is not provided.
 */
const createSiweMessageWithCapacityDelegation = async (params) => {
    return (0, exports.createSiweMessage)({
        ...params,
    });
};
exports.createSiweMessageWithCapacityDelegation = createSiweMessageWithCapacityDelegation;
//# sourceMappingURL=create-siwe-message.js.map