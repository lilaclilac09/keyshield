"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EoaAuthContextSchema = exports.PKPAuthContextSchema = exports.AttenuationsObjectSchema = exports.SessionKeyPairSchema = exports.CosmosWalletTypeSchema = exports.LitActionSdkParamsSchema = exports.AuthMethodSchema = exports.ExecuteJsAdvancedOptionsSchema = exports.IpfsOptionsSchema = exports.LitActionResponseStrategySchema = exports.ResponseStrategySchema = exports.NodeSignedAuthSig = exports.AuthSigSchema = exports.AllLitChainsSchema = exports.LitCosmosChainsSchema = exports.LitSVMChainsSchema = exports.LitEVMChainsSchema = exports.LitCosmosChainSchema = exports.LitSVMChainSchema = exports.LitEVMChainSchema = exports.LitBaseChainSchema = exports.LitAuthSigChainKeysSchema = exports.EpochInfoSchema = exports.TokenInfoSchema = exports.DerivedAddressesSchema = exports.LitAbilitySchema = exports.LitResourcePrefixSchema = exports.LitNetworkKeysSchema = exports.PricedSchema = exports.ChainedSchema = exports.EvmChainSchema = exports.ChainSchema = exports.HexSchema = exports.JsonSchema = exports.DefinedJsonSchema = exports.NodeInfoSchema = exports.NodeSetsFromUrlsSchema = exports.NodeSetSchema = exports.HexPrefixedSchema = exports.ExpirationSchema = exports.SignerSchema = exports.SessionKeyUriSchema = exports.NodeUrlsSchema = exports.UrlSchema = exports.NormalizeArraySchema = exports.BytesArraySchema = exports.DomainSchema = exports.NodeRequestSchema = exports.SigningChainSchema = exports.PKPDataSchema = void 0;
exports.AuthContextSchema2 = void 0;
const zod_1 = require("zod");
const constants_1 = require("@lit-protocol/constants");
const utils_1 = require("ethers/lib/utils");
const __1 = require("..");
exports.PKPDataSchema = zod_1.z
    .object({
    tokenId: zod_1.z.bigint(),
    pubkey: zod_1.z.string(),
})
    .transform((data) => ({
    ...data,
    ethAddress: (0, utils_1.computeAddress)(data.pubkey),
}));
exports.SigningChainSchema = zod_1.z.enum([
    'ethereum',
    'bitcoin',
    'cosmos',
    'solana',
]);
/**
 * Schema for validating node request objects
 * @template T - The type of data expected in the request
 * @example
 * // Define a schema for a specific request type
 * const MyRequestSchema = NodeRequestSchema<MyDataType>();
 *
 * // Validate a request
 * const request = {
 *   fullPath: '/api/v1/sign',
 *   data: { message: 'Hello' },
 *   requestId: '123',
 *   epoch: 1,
 *   version: '1.0.0'
 * };
 * const validated = MyRequestSchema.parse(request);
 */
// export const NodeRequestSchema = <T>() =>
//   z.object({
//     fullPath: z.string(),
//     data: z.custom<T>(),
//     requestId: z.string(),
//     epoch: z.number(),
//     version: z.string(),
//   });
exports.NodeRequestSchema = zod_1.z.object({
    fullPath: zod_1.z.string(),
    data: zod_1.z.any(),
    requestId: zod_1.z.string(),
    epoch: zod_1.z.number(),
    version: zod_1.z.string(),
});
exports.DomainSchema = zod_1.z
    .string()
    .optional()
    .default('localhost')
    .transform((val) => {
    if (!val || val === '')
        return val;
    // Strip away any path or trailing slash - just keep the domain:port part
    const domainMatch = val.match(/^([^/]+)/);
    return domainMatch ? domainMatch[1] : val;
});
/**
 * Turn any data into a bytes array
 */
exports.BytesArraySchema = zod_1.z.any().transform((data) => {
    if (typeof data === 'string') {
        data = new TextEncoder().encode(data);
    }
    if (Array.isArray(data)) {
        data = Uint8Array.from(data);
    }
    if (!(data instanceof Uint8Array)) {
        throw new Error('Data must be a string, number[], or Uint8Array');
    }
    return Array.from(data);
});
exports.NormalizeArraySchema = zod_1.z.array(zod_1.z.number());
exports.UrlSchema = zod_1.z.string().url({ message: 'Invalid URL format' });
exports.NodeUrlsSchema = zod_1.z.array(zod_1.z.object({
    url: zod_1.z.string(),
    price: zod_1.z.bigint().optional(), // This only exists for Naga
}));
exports.SessionKeyUriSchema = zod_1.z.string().transform((val) => {
    if (!val.startsWith(constants_1.SIWE_URI_PREFIX.SESSION_KEY)) {
        return `${constants_1.SIWE_URI_PREFIX.SESSION_KEY}${val}`;
    }
    return val;
});
/**
 * @deprecated - use z.any() instead. If we parse using this,
 * it will remove all the other properties.
 */
exports.SignerSchema = zod_1.z.any();
// z.object({
//   signMessage: z.function().args(z.string()).returns(z.promise(z.string())),
//   getAddress: z.function().args().returns(z.promise(z.string())),
// });
exports.ExpirationSchema = zod_1.z
    .string()
    .optional()
    .default(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    return now.toISOString();
})
    .refine((val) => !isNaN(Date.parse(val)) && val === new Date(val).toISOString(), {
    message: 'Must be a valid ISO 8601 date string',
});
exports.HexPrefixedSchema = zod_1.z
    .string()
    .transform((val) => (val.startsWith('0x') ? val : `0x${val}`))
    .refine((val) => /^0x[0-9a-fA-F]*$/.test(val), {
    message: 'String must start with 0x and contain only hex characters',
});
// Naga V8: Selected Nodes for ECDSA endpoints #1223
// https://github.com/LIT-Protocol/lit-assets/pull/1223/
exports.NodeSetSchema = zod_1.z.object({
    // reference: https://github.com/LIT-Protocol/lit-assets/blob/f82b28e83824a861547307aaed981a6186e51d48/rust/lit-node/common/lit-node-testnet/src/node_collection.rs#L185-L191
    // eg: 192.168.0.1:8080
    socketAddress: zod_1.z.string(),
    // (See PR description) the value parameter is a U64 that generates a sort order. This could be pricing related information, or another value to help select the right nodes. The value could also be zero with only the correct number of nodes participating in the signing request.
    value: zod_1.z.number(),
});
exports.NodeSetsFromUrlsSchema = zod_1.z
    .array(zod_1.z.string().url())
    .transform((urls) => urls.map((url) => {
    const socketAddress = url.replace(/(^\w+:|^)\/\//, '');
    return exports.NodeSetSchema.parse({ socketAddress, value: 1 });
}));
exports.NodeInfoSchema = zod_1.z
    .array(zod_1.z.object({
    url: zod_1.z.string(),
    price: zod_1.z.bigint(),
}))
    .transform((item) => ({
    urls: item.map((item) => item.url),
    nodeSet: item
        .map((item) => item.url)
        .map((url) => {
        // remove protocol from the url as we only need ip:port
        const urlWithoutProtocol = url.replace(/(^\w+:|^)\/\//, '');
        return exports.NodeSetSchema.parse({
            socketAddress: urlWithoutProtocol,
            // CHANGE: This is a placeholder value. Brendon said: It's not used anymore in the nodes, but leaving it as we may need it in the future.
            value: 1,
        });
    }),
}));
const definedLiteralSchema = zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()]);
exports.DefinedJsonSchema = zod_1.z.lazy(() => zod_1.z.union([
    definedLiteralSchema,
    zod_1.z.array(exports.DefinedJsonSchema),
    zod_1.z.record(exports.DefinedJsonSchema),
]));
const literalSchema = zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.null()]);
exports.JsonSchema = zod_1.z.lazy(() => zod_1.z.union([literalSchema, zod_1.z.array(exports.JsonSchema), zod_1.z.record(exports.JsonSchema)]));
exports.HexSchema = zod_1.z.string().regex(/^0x[0-9a-fA-F]+$/);
exports.ChainSchema = zod_1.z.string().default('ethereum');
exports.EvmChainSchema = zod_1.z.enum(constants_1.LIT_CHAINS_KEYS);
exports.ChainedSchema = zod_1.z.object({
    /**
     * The chain name of the chain that will be used. See LIT_CHAINS for currently supported chains.
     */
    chain: exports.ChainSchema.optional(),
});
exports.PricedSchema = zod_1.z.object({
    userMaxPrice: zod_1.z.bigint(),
});
exports.LitNetworkKeysSchema = zod_1.z.nativeEnum(constants_1.LIT_NETWORK);
exports.LitResourcePrefixSchema = zod_1.z.nativeEnum(constants_1.LIT_RESOURCE_PREFIX);
exports.LitAbilitySchema = zod_1.z.nativeEnum(constants_1.LIT_ABILITY);
exports.DerivedAddressesSchema = zod_1.z.object({
    publicKey: zod_1.z.string(),
    publicKeyBuffer: zod_1.z.any(), // Buffer
    ethAddress: zod_1.z.string(),
    btcAddress: zod_1.z.string(),
    cosmosAddress: zod_1.z.string(),
    isNewPKP: zod_1.z.boolean(),
});
exports.TokenInfoSchema = exports.DerivedAddressesSchema.extend({
    tokenId: zod_1.z.string(),
});
/**
 * from the `getActiveUnkickedValidatorStructsAndCounts` Staking contract function
 epochLength: _BigNumber { _hex: '0x05dc', _isBigNumber: true },
 number: _BigNumber { _hex: '0x04c5', _isBigNumber: true },
 endTime: _BigNumber { _hex: '0x66c75b12', _isBigNumber: true },
 retries: _BigNumber { _hex: '0x03', _isBigNumber: true },
 timeout: _BigNumber { _hex: '0x3c', _isBigNumber: true }
 */
exports.EpochInfoSchema = zod_1.z
    .object({
    epochLength: zod_1.z.number(),
    number: zod_1.z.number(),
    endTime: zod_1.z.number(),
    retries: zod_1.z.number(),
    timeout: zod_1.z.number(),
})
    .strict();
exports.LitAuthSigChainKeysSchema = zod_1.z
    .enum(constants_1.LIT_AUTH_SIG_CHAIN_KEYS)
    .readonly();
// Lit supported chains
exports.LitBaseChainSchema = zod_1.z
    .object({
    name: zod_1.z.string(),
    symbol: zod_1.z.string(),
    decimals: zod_1.z.number(),
    rpcUrls: zod_1.z.array(zod_1.z.string()).nonempty().readonly(),
    blockExplorerUrls: zod_1.z.array(zod_1.z.string()).nonempty().readonly(),
})
    .strict();
// EVM
exports.LitEVMChainSchema = exports.LitBaseChainSchema.extend({
    vmType: zod_1.z.literal(constants_1.VMTYPE.EVM),
    chainId: zod_1.z.number(),
    contractAddress: zod_1.z.union([zod_1.z.string().optional(), zod_1.z.null()]),
    type: zod_1.z.union([zod_1.z.string().optional(), zod_1.z.null()]),
})
    .strict()
    .readonly();
// Solana
exports.LitSVMChainSchema = exports.LitBaseChainSchema.extend({
    vmType: zod_1.z.literal(constants_1.VMTYPE.SVM),
})
    .strict()
    .readonly();
// Cosmos
exports.LitCosmosChainSchema = exports.LitBaseChainSchema.extend({
    vmType: zod_1.z.literal(constants_1.VMTYPE.CVM),
    chainId: zod_1.z.string(),
})
    .strict()
    .readonly();
exports.LitEVMChainsSchema = zod_1.z.record(zod_1.z.string(), exports.LitEVMChainSchema);
exports.LitSVMChainsSchema = zod_1.z.record(zod_1.z.string(), exports.LitSVMChainSchema);
exports.LitCosmosChainsSchema = zod_1.z.record(zod_1.z.string(), exports.LitCosmosChainSchema);
exports.AllLitChainsSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.union([exports.LitEVMChainSchema, exports.LitSVMChainSchema, exports.LitCosmosChainSchema]));
exports.AuthSigSchema = zod_1.z.object({
    /**
     * The signature produced by signing the `signMessage` property with the corresponding private key for the `address` property.
     */
    sig: zod_1.z.string(),
    /**
     * The method used to derive the signature (e.g, `web3.eth.personal.sign`).
     */
    derivedVia: zod_1.z.string(),
    /**
     * An [ERC-5573](https://eips.ethereum.org/EIPS/eip-5573) SIWE (Sign-In with Ethereum) message. This can be prepared by using one of the `createSiweMessage` functions from the [`@auth-helpers`](https://v6-api-doc-lit-js-sdk.vercel.app/modules/auth_helpers_src.html) package:
     * -  [`createSiweMessage`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessage.html)
     * -  [`createSiweMessageWithResources](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithResources.html)
     * -  [`createSiweMessageWithCapacityDelegation`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithCapacityDelegation.html)
     */
    signedMessage: zod_1.z.string(),
    /**
     * The Ethereum address that was used to sign `signedMessage` and create the `sig`.
     */
    address: zod_1.z.string(),
    /**
     * An optional property only seen when generating session signatures, this is the signing algorithm used to generate session signatures.
     */
    algo: zod_1.z.string().optional(),
});
exports.NodeSignedAuthSig = zod_1.z
    .object({
    blsCombinedSignature: zod_1.z.string(),
    signedMessage: zod_1.z.string(),
    pkpPublicKey: exports.HexPrefixedSchema,
})
    .transform((item) => exports.AuthSigSchema.parse({
    sig: JSON.stringify({
        ProofOfPossession: item.blsCombinedSignature,
        algo: 'LIT_BLS',
        derivedVia: 'lit.bls',
        signedMessage: item.signedMessage,
        address: (0, utils_1.computeAddress)(item.pkpPublicKey),
    }),
}));
exports.ResponseStrategySchema = zod_1.z.enum([
    'leastCommon',
    'mostCommon',
    'custom',
]);
exports.LitActionResponseStrategySchema = zod_1.z.object({
    strategy: exports.ResponseStrategySchema,
    customFilter: zod_1.z
        .function()
        .args(zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.string())))
        .returns(zod_1.z.record(zod_1.z.string(), zod_1.z.string()))
        .optional(),
});
exports.IpfsOptionsSchema = zod_1.z.object({
    overwriteCode: zod_1.z.boolean().optional(),
    gatewayUrl: zod_1.z.string().startsWith('https://').endsWith('/ipfs/').optional(),
});
exports.ExecuteJsAdvancedOptionsSchema = zod_1.z.object({
    /**
     * a strategy for processing `response` objects returned from the
     * Lit Action execution context
     */
    responseStrategy: exports.LitActionResponseStrategySchema.optional(),
    /**
     * Allow overriding the default `code` property in the `JsonExecutionSdkParams`
     */
    ipfsOptions: exports.IpfsOptionsSchema.optional(),
    /**
     * Only run the action on a single node; this will only work if all code in your action is non-interactive
     */
    useSingleNode: zod_1.z.boolean().optional(),
});
// pub struct AuthMethod {
//     pub auth_method_type: u32,
//     pub access_token: String,
// }
exports.AuthMethodSchema = zod_1.z.object({
    authMethodType: zod_1.z.nativeEnum(constants_1.AUTH_METHOD_TYPE),
    accessToken: zod_1.z.string(),
});
// TODO make it forcefully have litActionCode OR litActionIpfsId, one and only one of them MUST be provided
exports.LitActionSdkParamsSchema = zod_1.z.object({
    /**
     * The litActionCode is the JavaScript code that will run on the nodes.
     * You will need to convert the string content to base64.
     *
     * @example
     * Buffer.from(litActionCodeString).toString('base64');
     */
    litActionCode: zod_1.z.string().optional(),
    /**
     * You can obtain the Lit Action IPFS CID by converting your JavaScript code using this tool:
     * https://explorer.litprotocol.com/create-action
     *
     * Note: You do not need to pin your code to IPFS necessarily.
     * You can convert a code string to an IPFS hash using the "ipfs-hash-only" or 'ipfs-unixfs-importer' library.
     *
     * @example
     * async function stringToIpfsHash(input: string): Promise<string> {
     *   // Convert the input string to a Buffer
     *   const content = Buffer.from(input);
     *
     *   // Import the content to create an IPFS file
     *   const files = importer([{ content }], {} as any, { onlyHash: true });
     *
     *   // Get the first (and only) file result
     *   const result = (await files.next()).value;
     *
     *   const ipfsHash = (result as any).cid.toString();
     *   if (!ipfsHash.startsWith('Qm')) {
     *     throw new Error('Generated hash does not start with Qm');
     *   }
     *
     *   return ipfsHash;
     * }
     */
    litActionIpfsId: zod_1.z.string().optional(),
    /**
     * An object that contains params to expose to the Lit Action.  These will be injected to the JS runtime before your code runs, so you can use any of these as normal variables in your Lit Action.
     */
    jsParams: zod_1.z
        .union([
        zod_1.z.any(), // TODO what happens if jsParams is a string/number/primitive?
        zod_1.z
            .object({
            publicKey: zod_1.z.string().optional(),
            sigName: zod_1.z.string().optional(),
        })
            .catchall(zod_1.z.any()),
    ])
        .optional(),
});
exports.CosmosWalletTypeSchema = zod_1.z.enum(['keplr', 'leap']);
exports.SessionKeyPairSchema = zod_1.z.object({
    publicKey: zod_1.z.string(),
    secretKey: zod_1.z.string(),
});
// .transform((item) => ({
//   publicKey: item.publicKey,
//   secretKey: item.secretKey,
//   sessionKeyUri: `${SIWE_URI_PREFIX.SESSION_KEY}${item.publicKey}`,
// }));
exports.AttenuationsObjectSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.array(exports.DefinedJsonSchema)));
exports.PKPAuthContextSchema = zod_1.z.object({
    pkpPublicKey: exports.HexPrefixedSchema.optional(),
    // viemAccount: z.custom<Account>().optional(),
    // authMethod: AuthMethodSchema.optional(),
    chain: zod_1.z.string(),
    sessionKeyPair: exports.SessionKeyPairSchema,
    // which one do we need here?
    // resourceAbilityRequests: z.array(
    //   z.lazy(() => LitResourceAbilityRequestSchema)
    // ),
    // which one do we need here?
    // sessionCapabilityObject: z.lazy(() => ISessionCapabilityObjectSchema),
    // which one do we need here? TODO: ❗️ specify the type properly
    // siweResources: z.any(),
    authNeededCallback: zod_1.z.function(),
    // capabilityAuthSigs: z.array(AuthSigSchema),
    authConfig: zod_1.z.lazy(() => __1.AuthConfigSchema),
});
exports.EoaAuthContextSchema = zod_1.z.object({
    account: zod_1.z.any(),
    authenticator: zod_1.z.any(),
    authData: zod_1.z.lazy(() => __1.AuthDataSchema),
    authNeededCallback: zod_1.z.function(),
    sessionKeyPair: exports.SessionKeyPairSchema,
    authConfig: zod_1.z.lazy(() => __1.AuthConfigSchema),
});
// export const AllAuthContextSchema = z.union([
//   PKPAuthContextSchema,
//   EoaAuthContextSchema,
// ]);
// export type AllAuthContext = z.infer<typeof AllAuthContextSchema>;
exports.AuthContextSchema2 = zod_1.z.union([
    exports.PKPAuthContextSchema,
    exports.EoaAuthContextSchema,
]);
//# sourceMappingURL=schemas.js.map