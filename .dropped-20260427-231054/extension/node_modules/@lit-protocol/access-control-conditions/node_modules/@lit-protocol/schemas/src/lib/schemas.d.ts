import { z } from 'zod';
export declare const PKPDataSchema: z.ZodEffects<z.ZodObject<{
    tokenId: z.ZodBigInt;
    pubkey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tokenId: bigint;
    pubkey: string;
}, {
    tokenId: bigint;
    pubkey: string;
}>, {
    ethAddress: string;
    tokenId: bigint;
    pubkey: string;
}, {
    tokenId: bigint;
    pubkey: string;
}>;
export type PKPData = z.infer<typeof PKPDataSchema>;
export declare const SigningChainSchema: z.ZodEnum<["ethereum", "bitcoin", "cosmos", "solana"]>;
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
export declare const NodeRequestSchema: z.ZodObject<{
    fullPath: z.ZodString;
    data: z.ZodAny;
    requestId: z.ZodString;
    epoch: z.ZodNumber;
    version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    version: string;
    epoch: number;
    fullPath: string;
    requestId: string;
    data?: any;
}, {
    version: string;
    epoch: number;
    fullPath: string;
    requestId: string;
    data?: any;
}>;
export declare const DomainSchema: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>;
/**
 * Turn any data into a bytes array
 */
export declare const BytesArraySchema: z.ZodEffects<z.ZodAny, number[], any>;
export declare const NormalizeArraySchema: z.ZodArray<z.ZodNumber, "many">;
export declare const UrlSchema: z.ZodString;
export declare const NodeUrlsSchema: z.ZodArray<z.ZodObject<{
    url: z.ZodString;
    price: z.ZodOptional<z.ZodBigInt>;
}, "strip", z.ZodTypeAny, {
    url: string;
    price?: bigint | undefined;
}, {
    url: string;
    price?: bigint | undefined;
}>, "many">;
export declare const SessionKeyUriSchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * @deprecated - use z.any() instead. If we parse using this,
 * it will remove all the other properties.
 */
export declare const SignerSchema: z.ZodAny;
export declare const ExpirationSchema: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>;
export declare const HexPrefixedSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
export declare const NodeSetSchema: z.ZodObject<{
    socketAddress: z.ZodString;
    value: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    value: number;
    socketAddress: string;
}, {
    value: number;
    socketAddress: string;
}>;
export declare const NodeSetsFromUrlsSchema: z.ZodEffects<z.ZodArray<z.ZodString, "many">, {
    value: number;
    socketAddress: string;
}[], string[]>;
export declare const NodeInfoSchema: z.ZodEffects<z.ZodArray<z.ZodObject<{
    url: z.ZodString;
    price: z.ZodBigInt;
}, "strip", z.ZodTypeAny, {
    url: string;
    price: bigint;
}, {
    url: string;
    price: bigint;
}>, "many">, {
    urls: string[];
    nodeSet: {
        value: number;
        socketAddress: string;
    }[];
}, {
    url: string;
    price: bigint;
}[]>;
declare const definedLiteralSchema: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean]>;
export type DefinedLiteral = z.infer<typeof definedLiteralSchema>;
export type DefinedJson = DefinedLiteral | {
    [key: string]: DefinedJson;
} | DefinedJson[];
export declare const DefinedJsonSchema: z.ZodType<DefinedJson>;
declare const literalSchema: z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>;
export type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | {
    [key: string]: Json;
} | Json[];
export declare const JsonSchema: z.ZodType<Json>;
export declare const HexSchema: z.ZodString;
export declare const ChainSchema: z.ZodDefault<z.ZodString>;
export declare const EvmChainSchema: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "campNetwork", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
export declare const ChainedSchema: z.ZodObject<{
    /**
     * The chain name of the chain that will be used. See LIT_CHAINS for currently supported chains.
     */
    chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    chain?: string | undefined;
}, {
    chain?: string | undefined;
}>;
export declare const PricedSchema: z.ZodObject<{
    userMaxPrice: z.ZodBigInt;
}, "strip", z.ZodTypeAny, {
    userMaxPrice: bigint;
}, {
    userMaxPrice: bigint;
}>;
export declare const LitNetworkKeysSchema: z.ZodNativeEnum<{
    readonly NagaDev: "naga-dev";
    readonly Custom: "custom";
}>;
export declare const LitResourcePrefixSchema: z.ZodNativeEnum<{
    readonly AccessControlCondition: "lit-accesscontrolcondition";
    readonly PKP: "lit-pkp";
    readonly RLI: "lit-ratelimitincrease";
    readonly PaymentDelegation: "lit-paymentdelegation";
    readonly LitAction: "lit-litaction";
}>;
export declare const LitAbilitySchema: z.ZodNativeEnum<{
    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
    readonly AccessControlConditionSigning: "access-control-condition-signing";
    readonly PKPSigning: "pkp-signing";
    readonly PaymentDelegation: "lit-payment-delegation";
    readonly LitActionExecution: "lit-action-execution";
}>;
export declare const DerivedAddressesSchema: z.ZodObject<{
    publicKey: z.ZodString;
    publicKeyBuffer: z.ZodAny;
    ethAddress: z.ZodString;
    btcAddress: z.ZodString;
    cosmosAddress: z.ZodString;
    isNewPKP: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    ethAddress: string;
    publicKey: string;
    btcAddress: string;
    cosmosAddress: string;
    isNewPKP: boolean;
    publicKeyBuffer?: any;
}, {
    ethAddress: string;
    publicKey: string;
    btcAddress: string;
    cosmosAddress: string;
    isNewPKP: boolean;
    publicKeyBuffer?: any;
}>;
export declare const TokenInfoSchema: z.ZodObject<{
    publicKey: z.ZodString;
    publicKeyBuffer: z.ZodAny;
    ethAddress: z.ZodString;
    btcAddress: z.ZodString;
    cosmosAddress: z.ZodString;
    isNewPKP: z.ZodBoolean;
} & {
    tokenId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tokenId: string;
    ethAddress: string;
    publicKey: string;
    btcAddress: string;
    cosmosAddress: string;
    isNewPKP: boolean;
    publicKeyBuffer?: any;
}, {
    tokenId: string;
    ethAddress: string;
    publicKey: string;
    btcAddress: string;
    cosmosAddress: string;
    isNewPKP: boolean;
    publicKeyBuffer?: any;
}>;
/**
 * from the `getActiveUnkickedValidatorStructsAndCounts` Staking contract function
 epochLength: _BigNumber { _hex: '0x05dc', _isBigNumber: true },
 number: _BigNumber { _hex: '0x04c5', _isBigNumber: true },
 endTime: _BigNumber { _hex: '0x66c75b12', _isBigNumber: true },
 retries: _BigNumber { _hex: '0x03', _isBigNumber: true },
 timeout: _BigNumber { _hex: '0x3c', _isBigNumber: true }
 */
export declare const EpochInfoSchema: z.ZodObject<{
    epochLength: z.ZodNumber;
    number: z.ZodNumber;
    endTime: z.ZodNumber;
    retries: z.ZodNumber;
    timeout: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    number: number;
    timeout: number;
    epochLength: number;
    endTime: number;
    retries: number;
}, {
    number: number;
    timeout: number;
    epochLength: number;
    endTime: number;
    retries: number;
}>;
export declare const LitAuthSigChainKeysSchema: z.ZodReadonly<z.ZodEnum<["ethereum", "solana", "cosmos", "kyve"]>>;
export declare const LitBaseChainSchema: z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
}, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
}>;
export declare const LitEVMChainSchema: z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"EVM">;
    chainId: z.ZodNumber;
    contractAddress: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodNull]>;
    type: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodNull]>;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "EVM";
    type?: string | null | undefined;
    contractAddress?: string | null | undefined;
}, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "EVM";
    type?: string | null | undefined;
    contractAddress?: string | null | undefined;
}>>;
export declare const LitSVMChainSchema: z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"SVM">;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "SVM";
}, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "SVM";
}>>;
export declare const LitCosmosChainSchema: z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"CVM">;
    chainId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "CVM";
}, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "CVM";
}>>;
export declare const LitEVMChainsSchema: z.ZodRecord<z.ZodString, z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"EVM">;
    chainId: z.ZodNumber;
    contractAddress: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodNull]>;
    type: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodNull]>;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "EVM";
    type?: string | null | undefined;
    contractAddress?: string | null | undefined;
}, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "EVM";
    type?: string | null | undefined;
    contractAddress?: string | null | undefined;
}>>>;
export declare const LitSVMChainsSchema: z.ZodRecord<z.ZodString, z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"SVM">;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "SVM";
}, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "SVM";
}>>>;
export declare const LitCosmosChainsSchema: z.ZodRecord<z.ZodString, z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"CVM">;
    chainId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "CVM";
}, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "CVM";
}>>>;
export declare const AllLitChainsSchema: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"EVM">;
    chainId: z.ZodNumber;
    contractAddress: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodNull]>;
    type: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodNull]>;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "EVM";
    type?: string | null | undefined;
    contractAddress?: string | null | undefined;
}, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: number;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "EVM";
    type?: string | null | undefined;
    contractAddress?: string | null | undefined;
}>>, z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"SVM">;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "SVM";
}, {
    symbol: string;
    decimals: number;
    name: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "SVM";
}>>, z.ZodReadonly<z.ZodObject<{
    name: z.ZodString;
    symbol: z.ZodString;
    decimals: z.ZodNumber;
    rpcUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
    blockExplorerUrls: z.ZodReadonly<z.ZodArray<z.ZodString, "atleastone">>;
} & {
    vmType: z.ZodLiteral<"CVM">;
    chainId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "CVM";
}, {
    symbol: string;
    decimals: number;
    name: string;
    chainId: string;
    rpcUrls: readonly [string, ...string[]];
    blockExplorerUrls: readonly [string, ...string[]];
    vmType: "CVM";
}>>]>>;
export declare const AuthSigSchema: z.ZodObject<{
    /**
     * The signature produced by signing the `signMessage` property with the corresponding private key for the `address` property.
     */
    sig: z.ZodString;
    /**
     * The method used to derive the signature (e.g, `web3.eth.personal.sign`).
     */
    derivedVia: z.ZodString;
    /**
     * An [ERC-5573](https://eips.ethereum.org/EIPS/eip-5573) SIWE (Sign-In with Ethereum) message. This can be prepared by using one of the `createSiweMessage` functions from the [`@auth-helpers`](https://v6-api-doc-lit-js-sdk.vercel.app/modules/auth_helpers_src.html) package:
     * -  [`createSiweMessage`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessage.html)
     * -  [`createSiweMessageWithResources](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithResources.html)
     * -  [`createSiweMessageWithCapacityDelegation`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithCapacityDelegation.html)
     */
    signedMessage: z.ZodString;
    /**
     * The Ethereum address that was used to sign `signedMessage` and create the `sig`.
     */
    address: z.ZodString;
    /**
     * An optional property only seen when generating session signatures, this is the signing algorithm used to generate session signatures.
     */
    algo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    address: string;
    signedMessage: string;
    sig: string;
    derivedVia: string;
    algo?: string | undefined;
}, {
    address: string;
    signedMessage: string;
    sig: string;
    derivedVia: string;
    algo?: string | undefined;
}>;
export declare const NodeSignedAuthSig: z.ZodEffects<z.ZodObject<{
    blsCombinedSignature: z.ZodString;
    signedMessage: z.ZodString;
    pkpPublicKey: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
}, "strip", z.ZodTypeAny, {
    signedMessage: string;
    blsCombinedSignature: string;
    pkpPublicKey: string;
}, {
    signedMessage: string;
    blsCombinedSignature: string;
    pkpPublicKey: string;
}>, {
    address: string;
    signedMessage: string;
    sig: string;
    derivedVia: string;
    algo?: string | undefined;
}, {
    signedMessage: string;
    blsCombinedSignature: string;
    pkpPublicKey: string;
}>;
export declare const ResponseStrategySchema: z.ZodEnum<["leastCommon", "mostCommon", "custom"]>;
export declare const LitActionResponseStrategySchema: z.ZodObject<{
    strategy: z.ZodEnum<["leastCommon", "mostCommon", "custom"]>;
    customFilter: z.ZodOptional<z.ZodFunction<z.ZodTuple<[z.ZodArray<z.ZodRecord<z.ZodString, z.ZodString>, "many">], z.ZodUnknown>, z.ZodRecord<z.ZodString, z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    strategy: "custom" | "leastCommon" | "mostCommon";
    customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
}, {
    strategy: "custom" | "leastCommon" | "mostCommon";
    customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
}>;
export declare const IpfsOptionsSchema: z.ZodObject<{
    overwriteCode: z.ZodOptional<z.ZodBoolean>;
    gatewayUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    overwriteCode?: boolean | undefined;
    gatewayUrl?: string | undefined;
}, {
    overwriteCode?: boolean | undefined;
    gatewayUrl?: string | undefined;
}>;
export declare const ExecuteJsAdvancedOptionsSchema: z.ZodObject<{
    /**
     * a strategy for processing `response` objects returned from the
     * Lit Action execution context
     */
    responseStrategy: z.ZodOptional<z.ZodObject<{
        strategy: z.ZodEnum<["leastCommon", "mostCommon", "custom"]>;
        customFilter: z.ZodOptional<z.ZodFunction<z.ZodTuple<[z.ZodArray<z.ZodRecord<z.ZodString, z.ZodString>, "many">], z.ZodUnknown>, z.ZodRecord<z.ZodString, z.ZodString>>>;
    }, "strip", z.ZodTypeAny, {
        strategy: "custom" | "leastCommon" | "mostCommon";
        customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
    }, {
        strategy: "custom" | "leastCommon" | "mostCommon";
        customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
    }>>;
    /**
     * Allow overriding the default `code` property in the `JsonExecutionSdkParams`
     */
    ipfsOptions: z.ZodOptional<z.ZodObject<{
        overwriteCode: z.ZodOptional<z.ZodBoolean>;
        gatewayUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    }, {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    }>>;
    /**
     * Only run the action on a single node; this will only work if all code in your action is non-interactive
     */
    useSingleNode: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    responseStrategy?: {
        strategy: "custom" | "leastCommon" | "mostCommon";
        customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
    } | undefined;
    ipfsOptions?: {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    } | undefined;
    useSingleNode?: boolean | undefined;
}, {
    responseStrategy?: {
        strategy: "custom" | "leastCommon" | "mostCommon";
        customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
    } | undefined;
    ipfsOptions?: {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    } | undefined;
    useSingleNode?: boolean | undefined;
}>;
export declare const AuthMethodSchema: z.ZodObject<{
    authMethodType: z.ZodNativeEnum<{
        readonly EthWallet: 1;
        readonly LitAction: 2;
        readonly WebAuthn: 3;
        readonly Discord: 4;
        readonly Google: 5;
        readonly GoogleJwt: 6;
        readonly AppleJwt: 8;
        readonly StytchOtp: 9;
        readonly StytchEmailFactorOtp: 10;
        readonly StytchSmsFactorOtp: 11;
        readonly StytchWhatsAppFactorOtp: 12;
        readonly StytchTotpFactorOtp: 13;
    }>;
    accessToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
    accessToken: string;
}, {
    authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
    accessToken: string;
}>;
export declare const LitActionSdkParamsSchema: z.ZodObject<{
    /**
     * The litActionCode is the JavaScript code that will run on the nodes.
     * You will need to convert the string content to base64.
     *
     * @example
     * Buffer.from(litActionCodeString).toString('base64');
     */
    litActionCode: z.ZodOptional<z.ZodString>;
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
    litActionIpfsId: z.ZodOptional<z.ZodString>;
    /**
     * An object that contains params to expose to the Lit Action.  These will be injected to the JS runtime before your code runs, so you can use any of these as normal variables in your Lit Action.
     */
    jsParams: z.ZodOptional<z.ZodUnion<[z.ZodAny, z.ZodObject<{
        publicKey: z.ZodOptional<z.ZodString>;
        sigName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodAny, z.objectOutputType<{
        publicKey: z.ZodOptional<z.ZodString>;
        sigName: z.ZodOptional<z.ZodString>;
    }, z.ZodAny, "strip">, z.objectInputType<{
        publicKey: z.ZodOptional<z.ZodString>;
        sigName: z.ZodOptional<z.ZodString>;
    }, z.ZodAny, "strip">>]>>;
}, "strip", z.ZodTypeAny, {
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
}, {
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
}>;
export declare const CosmosWalletTypeSchema: z.ZodEnum<["keplr", "leap"]>;
export declare const SessionKeyPairSchema: z.ZodObject<{
    publicKey: z.ZodString;
    secretKey: z.ZodString;
}, "strip", z.ZodTypeAny, {
    publicKey: string;
    secretKey: string;
}, {
    publicKey: string;
    secretKey: string;
}>;
export declare const AttenuationsObjectSchema: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<DefinedJson, z.ZodTypeDef, DefinedJson>, "many">>>;
export declare const PKPAuthContextSchema: z.ZodObject<{
    pkpPublicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
    chain: z.ZodString;
    sessionKeyPair: z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>;
    authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
    authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
        capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            /**
             * The signature produced by signing the `signMessage` property with the corresponding private key for the `address` property.
             */
            sig: z.ZodString;
            /**
             * The method used to derive the signature (e.g, `web3.eth.personal.sign`).
             */
            derivedVia: z.ZodString;
            /**
             * An [ERC-5573](https://eips.ethereum.org/EIPS/eip-5573) SIWE (Sign-In with Ethereum) message. This can be prepared by using one of the `createSiweMessage` functions from the [`@auth-helpers`](https://v6-api-doc-lit-js-sdk.vercel.app/modules/auth_helpers_src.html) package:
             * -  [`createSiweMessage`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessage.html)
             * -  [`createSiweMessageWithResources](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithResources.html)
             * -  [`createSiweMessageWithCapacityDelegation`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithCapacityDelegation.html)
             */
            signedMessage: z.ZodString;
            /**
             * The Ethereum address that was used to sign `signedMessage` and create the `sig`.
             */
            address: z.ZodString;
            /**
             * An optional property only seen when generating session signatures, this is the signing algorithm used to generate session signatures.
             */
            algo: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }>, "many">>>;
        expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            resource: z.ZodObject<{
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>], z.ZodUnknown>, z.ZodBoolean>;
                toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                    readonly AccessControlCondition: "lit-accesscontrolcondition";
                    readonly PKP: "lit-pkp";
                    readonly RLI: "lit-ratelimitincrease";
                    readonly PaymentDelegation: "lit-paymentdelegation";
                    readonly LitAction: "lit-litaction";
                }>>;
                resource: z.ZodReadonly<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }>;
            ability: z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<DefinedJson, z.ZodTypeDef, DefinedJson>>>;
        }, "strip", z.ZodTypeAny, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, {
        capabilityAuthSigs?: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: string | undefined;
        statement?: string | undefined;
        domain?: string | undefined;
        resources?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[] | undefined;
    }>, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, unknown>>;
}, "strip", z.ZodTypeAny, {
    chain: string;
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    authConfig: {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    };
    pkpPublicKey?: string | undefined;
}, {
    chain: string;
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    pkpPublicKey?: string | undefined;
    authConfig?: unknown;
}>;
export type PKPAuthContextSchema = z.infer<typeof PKPAuthContextSchema>;
export declare const EoaAuthContextSchema: z.ZodObject<{
    account: z.ZodAny;
    authenticator: z.ZodAny;
    authData: z.ZodLazy<z.ZodObject<{
        authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
        authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
            readonly EthWallet: 1;
            readonly LitAction: 2;
            readonly WebAuthn: 3;
            readonly Discord: 4;
            readonly Google: 5;
            readonly GoogleJwt: 6;
            readonly AppleJwt: 8;
            readonly StytchOtp: 9;
            readonly StytchEmailFactorOtp: 10;
            readonly StytchSmsFactorOtp: 11;
            readonly StytchWhatsAppFactorOtp: 12;
            readonly StytchTotpFactorOtp: 13;
        }>>;
        accessToken: z.ZodString;
        publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        metadata: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }, {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }>>;
    authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
    sessionKeyPair: z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>;
    authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
        capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            /**
             * The signature produced by signing the `signMessage` property with the corresponding private key for the `address` property.
             */
            sig: z.ZodString;
            /**
             * The method used to derive the signature (e.g, `web3.eth.personal.sign`).
             */
            derivedVia: z.ZodString;
            /**
             * An [ERC-5573](https://eips.ethereum.org/EIPS/eip-5573) SIWE (Sign-In with Ethereum) message. This can be prepared by using one of the `createSiweMessage` functions from the [`@auth-helpers`](https://v6-api-doc-lit-js-sdk.vercel.app/modules/auth_helpers_src.html) package:
             * -  [`createSiweMessage`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessage.html)
             * -  [`createSiweMessageWithResources](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithResources.html)
             * -  [`createSiweMessageWithCapacityDelegation`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithCapacityDelegation.html)
             */
            signedMessage: z.ZodString;
            /**
             * The Ethereum address that was used to sign `signedMessage` and create the `sig`.
             */
            address: z.ZodString;
            /**
             * An optional property only seen when generating session signatures, this is the signing algorithm used to generate session signatures.
             */
            algo: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }>, "many">>>;
        expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            resource: z.ZodObject<{
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>], z.ZodUnknown>, z.ZodBoolean>;
                toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                    readonly AccessControlCondition: "lit-accesscontrolcondition";
                    readonly PKP: "lit-pkp";
                    readonly RLI: "lit-ratelimitincrease";
                    readonly PaymentDelegation: "lit-paymentdelegation";
                    readonly LitAction: "lit-litaction";
                }>>;
                resource: z.ZodReadonly<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }>;
            ability: z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<DefinedJson, z.ZodTypeDef, DefinedJson>>>;
        }, "strip", z.ZodTypeAny, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, {
        capabilityAuthSigs?: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: string | undefined;
        statement?: string | undefined;
        domain?: string | undefined;
        resources?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[] | undefined;
    }>, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, unknown>>;
}, "strip", z.ZodTypeAny, {
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    authConfig: {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    };
    authData: {
        authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    account?: any;
    authenticator?: any;
}, {
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    authData: {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    account?: any;
    authConfig?: unknown;
    authenticator?: any;
}>;
export declare const AuthContextSchema2: z.ZodUnion<[z.ZodObject<{
    pkpPublicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
    chain: z.ZodString;
    sessionKeyPair: z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>;
    authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
    authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
        capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            /**
             * The signature produced by signing the `signMessage` property with the corresponding private key for the `address` property.
             */
            sig: z.ZodString;
            /**
             * The method used to derive the signature (e.g, `web3.eth.personal.sign`).
             */
            derivedVia: z.ZodString;
            /**
             * An [ERC-5573](https://eips.ethereum.org/EIPS/eip-5573) SIWE (Sign-In with Ethereum) message. This can be prepared by using one of the `createSiweMessage` functions from the [`@auth-helpers`](https://v6-api-doc-lit-js-sdk.vercel.app/modules/auth_helpers_src.html) package:
             * -  [`createSiweMessage`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessage.html)
             * -  [`createSiweMessageWithResources](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithResources.html)
             * -  [`createSiweMessageWithCapacityDelegation`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithCapacityDelegation.html)
             */
            signedMessage: z.ZodString;
            /**
             * The Ethereum address that was used to sign `signedMessage` and create the `sig`.
             */
            address: z.ZodString;
            /**
             * An optional property only seen when generating session signatures, this is the signing algorithm used to generate session signatures.
             */
            algo: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }>, "many">>>;
        expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            resource: z.ZodObject<{
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>], z.ZodUnknown>, z.ZodBoolean>;
                toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                    readonly AccessControlCondition: "lit-accesscontrolcondition";
                    readonly PKP: "lit-pkp";
                    readonly RLI: "lit-ratelimitincrease";
                    readonly PaymentDelegation: "lit-paymentdelegation";
                    readonly LitAction: "lit-litaction";
                }>>;
                resource: z.ZodReadonly<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }>;
            ability: z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<DefinedJson, z.ZodTypeDef, DefinedJson>>>;
        }, "strip", z.ZodTypeAny, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, {
        capabilityAuthSigs?: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: string | undefined;
        statement?: string | undefined;
        domain?: string | undefined;
        resources?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[] | undefined;
    }>, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, unknown>>;
}, "strip", z.ZodTypeAny, {
    chain: string;
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    authConfig: {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    };
    pkpPublicKey?: string | undefined;
}, {
    chain: string;
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    pkpPublicKey?: string | undefined;
    authConfig?: unknown;
}>, z.ZodObject<{
    account: z.ZodAny;
    authenticator: z.ZodAny;
    authData: z.ZodLazy<z.ZodObject<{
        authMethodId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
        authMethodType: z.ZodPipeline<z.ZodNumber, z.ZodNativeEnum<{
            readonly EthWallet: 1;
            readonly LitAction: 2;
            readonly WebAuthn: 3;
            readonly Discord: 4;
            readonly Google: 5;
            readonly GoogleJwt: 6;
            readonly AppleJwt: 8;
            readonly StytchOtp: 9;
            readonly StytchEmailFactorOtp: 10;
            readonly StytchSmsFactorOtp: 11;
            readonly StytchWhatsAppFactorOtp: 12;
            readonly StytchTotpFactorOtp: 13;
        }>>;
        accessToken: z.ZodString;
        publicKey: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>;
        metadata: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }, {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    }>>;
    authNeededCallback: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodUnknown>;
    sessionKeyPair: z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>;
    authConfig: z.ZodLazy<z.ZodEffects<z.ZodObject<{
        capabilityAuthSigs: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            /**
             * The signature produced by signing the `signMessage` property with the corresponding private key for the `address` property.
             */
            sig: z.ZodString;
            /**
             * The method used to derive the signature (e.g, `web3.eth.personal.sign`).
             */
            derivedVia: z.ZodString;
            /**
             * An [ERC-5573](https://eips.ethereum.org/EIPS/eip-5573) SIWE (Sign-In with Ethereum) message. This can be prepared by using one of the `createSiweMessage` functions from the [`@auth-helpers`](https://v6-api-doc-lit-js-sdk.vercel.app/modules/auth_helpers_src.html) package:
             * -  [`createSiweMessage`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessage.html)
             * -  [`createSiweMessageWithResources](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithResources.html)
             * -  [`createSiweMessageWithCapacityDelegation`](https://v6-api-doc-lit-js-sdk.vercel.app/functions/auth_helpers_src.createSiweMessageWithCapacityDelegation.html)
             */
            signedMessage: z.ZodString;
            /**
             * The Ethereum address that was used to sign `signedMessage` and create the `sig`.
             */
            address: z.ZodString;
            /**
             * An optional property only seen when generating session signatures, this is the signing algorithm used to generate session signatures.
             */
            algo: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }, {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }>, "many">>>;
        expiration: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        statement: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        domain: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodString>>, string, string | undefined>>>;
        resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            resource: z.ZodObject<{
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                isValidLitAbility: z.ZodFunction<z.ZodTuple<[z.ZodNativeEnum<{
                    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                    readonly AccessControlConditionSigning: "access-control-condition-signing";
                    readonly PKPSigning: "pkp-signing";
                    readonly PaymentDelegation: "lit-payment-delegation";
                    readonly LitActionExecution: "lit-action-execution";
                }>], z.ZodUnknown>, z.ZodBoolean>;
                toString: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                resourcePrefix: z.ZodReadonly<z.ZodNativeEnum<{
                    readonly AccessControlCondition: "lit-accesscontrolcondition";
                    readonly PKP: "lit-pkp";
                    readonly RLI: "lit-ratelimitincrease";
                    readonly PaymentDelegation: "lit-paymentdelegation";
                    readonly LitAction: "lit-litaction";
                }>>;
                resource: z.ZodReadonly<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }>;
            ability: z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>;
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<DefinedJson, z.ZodTypeDef, DefinedJson>>>;
        }, "strip", z.ZodTypeAny, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, {
        capabilityAuthSigs?: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: string | undefined;
        statement?: string | undefined;
        domain?: string | undefined;
        resources?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[] | undefined;
    }>, {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    }, unknown>>;
}, "strip", z.ZodTypeAny, {
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    authConfig: {
        capabilityAuthSigs: {
            address: string;
            signedMessage: string;
            sig: string;
            derivedVia: string;
            algo?: string | undefined;
        }[];
        expiration: string;
        statement: string;
        domain: string;
        resources: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, DefinedJson> | undefined;
        }[];
    };
    authData: {
        authMethodType: 1 | 2 | 3 | 10 | 11 | 13 | 4 | 6 | 5 | 8 | 9 | 12;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    account?: any;
    authenticator?: any;
}, {
    sessionKeyPair: {
        publicKey: string;
        secretKey: string;
    };
    authNeededCallback: (...args: unknown[]) => unknown;
    authData: {
        authMethodType: number;
        accessToken: string;
        authMethodId: string;
        publicKey?: string | undefined;
        metadata?: any;
    };
    account?: any;
    authConfig?: unknown;
    authenticator?: any;
}>]>;
export type AuthContextSchema2 = z.infer<typeof AuthContextSchema2>;
export {};
