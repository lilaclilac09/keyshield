import { SiweMessage } from 'siwe';
import { z } from 'zod';
export declare const ILitResourceSchema: z.ZodObject<{
    /**
     * Gets the fully qualified resource key.
     * @returns The fully qualified resource key.
     */
    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
    /**
     * Validates that the given LIT ability is valid for this resource.
     * @param litAbility The LIT ability to validate.
     */
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
/**
 * A LIT resource ability is a combination of a LIT resource and a LIT ability.
 * It specifies which LIT specific ability is being requested to be performed
 * on the specified LIT resource.
 *
 * @description This object does NOT guarantee compatibility between the
 * specified LIT resource and the specified LIT ability, and will be validated by
 * the LIT-internal systems.
 */
export declare const LitResourceAbilityRequestSchema: z.ZodObject<{
    resource: z.ZodObject<{
        /**
         * Gets the fully qualified resource key.
         * @returns The fully qualified resource key.
         */
        getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
        /**
         * Validates that the given LIT ability is valid for this resource.
         * @param litAbility The LIT ability to validate.
         */
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
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
}, "strip", z.ZodTypeAny, {
    resource: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    };
    ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
    data?: Record<string, import("./schemas").DefinedJson> | undefined;
}, {
    resource: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    };
    ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
    data?: Record<string, import("./schemas").DefinedJson> | undefined;
}>;
export declare const AuthCallbackParamsSchema: z.ZodObject<{
    litActionCode: z.ZodOptional<z.ZodString>;
    litActionIpfsId: z.ZodOptional<z.ZodString>;
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
} & {
    /**
     * The serialized session key pair to sign. If not provided, a session key pair will be fetched from localStorge or generated.
     */
    sessionKey: z.ZodOptional<z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>>;
    /**
     * The chain you want to use.  Find the supported list of chains here: https://developer.litprotocol.com/docs/supportedChains
     */
    chain: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "campMainnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
    /**
     *   The statement that describes what the user is signing. If the auth callback is for signing a SIWE message, you MUST add this statement to the end of the SIWE statement.
     */
    statement: z.ZodOptional<z.ZodString>;
    /**
     * The blockhash that the nodes return during the handshake
     */
    nonce: z.ZodString;
    /**
     * Optional and only used with EVM chains.  A list of resources to be passed to Sign In with Ethereum.  These resources will be part of the Sign in with Ethereum signed message presented to the user.
     */
    resources: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * Optional and only used with EVM chains right now.  Set to true by default.  Whether or not to ask Metamask or the user's wallet to switch chains before signing.  This may be desired if you're going to have the user send a txn on that chain.  On the other hand, if all you care about is the user's wallet signature, then you probably don't want to make them switch chains for no reason.  Pass false here to disable this chain switching behavior.
     */
    switchChain: z.ZodOptional<z.ZodBoolean>;
    expiration: z.ZodOptional<z.ZodString>;
    uri: z.ZodOptional<z.ZodString>;
    /**
     * Cosmos wallet type, to support mutliple popular cosmos wallets
     * Keplr & Cypher -> window.keplr
     * Leap -> window.leap
     */
    cosmosWalletType: z.ZodOptional<z.ZodEnum<["keplr", "leap"]>>;
    /**
     * Optional project ID for WalletConnect V2. Only required if one is using checkAndSignAuthMessage and wants to display WalletConnect as an option.
     */
    walletConnectProjectId: z.ZodOptional<z.ZodString>;
    resourceAbilityRequests: z.ZodOptional<z.ZodArray<z.ZodObject<{
        resource: z.ZodObject<{
            /**
             * Gets the fully qualified resource key.
             * @returns The fully qualified resource key.
             */
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /**
             * Validates that the given LIT ability is valid for this resource.
             * @param litAbility The LIT ability to validate.
             */
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
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
    }, "strip", z.ZodTypeAny, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    nonce: string;
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
    expiration?: string | undefined;
    statement?: string | undefined;
    resources?: string[] | undefined;
    sessionKey?: {
        publicKey: string;
        secretKey: string;
    } | undefined;
    switchChain?: boolean | undefined;
    uri?: string | undefined;
    cosmosWalletType?: "keplr" | "leap" | undefined;
    walletConnectProjectId?: string | undefined;
    resourceAbilityRequests?: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }[] | undefined;
}, {
    chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    nonce: string;
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
    expiration?: string | undefined;
    statement?: string | undefined;
    resources?: string[] | undefined;
    sessionKey?: {
        publicKey: string;
        secretKey: string;
    } | undefined;
    switchChain?: boolean | undefined;
    uri?: string | undefined;
    cosmosWalletType?: "keplr" | "leap" | undefined;
    walletConnectProjectId?: string | undefined;
    resourceAbilityRequests?: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }[] | undefined;
}>;
export declare const AuthCallbackSchema: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
    litActionCode: z.ZodOptional<z.ZodString>;
    litActionIpfsId: z.ZodOptional<z.ZodString>;
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
} & {
    /**
     * The serialized session key pair to sign. If not provided, a session key pair will be fetched from localStorge or generated.
     */
    sessionKey: z.ZodOptional<z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>>;
    /**
     * The chain you want to use.  Find the supported list of chains here: https://developer.litprotocol.com/docs/supportedChains
     */
    chain: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "campMainnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
    /**
     *   The statement that describes what the user is signing. If the auth callback is for signing a SIWE message, you MUST add this statement to the end of the SIWE statement.
     */
    statement: z.ZodOptional<z.ZodString>;
    /**
     * The blockhash that the nodes return during the handshake
     */
    nonce: z.ZodString;
    /**
     * Optional and only used with EVM chains.  A list of resources to be passed to Sign In with Ethereum.  These resources will be part of the Sign in with Ethereum signed message presented to the user.
     */
    resources: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * Optional and only used with EVM chains right now.  Set to true by default.  Whether or not to ask Metamask or the user's wallet to switch chains before signing.  This may be desired if you're going to have the user send a txn on that chain.  On the other hand, if all you care about is the user's wallet signature, then you probably don't want to make them switch chains for no reason.  Pass false here to disable this chain switching behavior.
     */
    switchChain: z.ZodOptional<z.ZodBoolean>;
    expiration: z.ZodOptional<z.ZodString>;
    uri: z.ZodOptional<z.ZodString>;
    /**
     * Cosmos wallet type, to support mutliple popular cosmos wallets
     * Keplr & Cypher -> window.keplr
     * Leap -> window.leap
     */
    cosmosWalletType: z.ZodOptional<z.ZodEnum<["keplr", "leap"]>>;
    /**
     * Optional project ID for WalletConnect V2. Only required if one is using checkAndSignAuthMessage and wants to display WalletConnect as an option.
     */
    walletConnectProjectId: z.ZodOptional<z.ZodString>;
    resourceAbilityRequests: z.ZodOptional<z.ZodArray<z.ZodObject<{
        resource: z.ZodObject<{
            /**
             * Gets the fully qualified resource key.
             * @returns The fully qualified resource key.
             */
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /**
             * Validates that the given LIT ability is valid for this resource.
             * @param litAbility The LIT ability to validate.
             */
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
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
    }, "strip", z.ZodTypeAny, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    nonce: string;
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
    expiration?: string | undefined;
    statement?: string | undefined;
    resources?: string[] | undefined;
    sessionKey?: {
        publicKey: string;
        secretKey: string;
    } | undefined;
    switchChain?: boolean | undefined;
    uri?: string | undefined;
    cosmosWalletType?: "keplr" | "leap" | undefined;
    walletConnectProjectId?: string | undefined;
    resourceAbilityRequests?: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }[] | undefined;
}, {
    chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    nonce: string;
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
    expiration?: string | undefined;
    statement?: string | undefined;
    resources?: string[] | undefined;
    sessionKey?: {
        publicKey: string;
        secretKey: string;
    } | undefined;
    switchChain?: boolean | undefined;
    uri?: string | undefined;
    cosmosWalletType?: "keplr" | "leap" | undefined;
    walletConnectProjectId?: string | undefined;
    resourceAbilityRequests?: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }[] | undefined;
}>], z.ZodUnknown>, z.ZodPromise<z.ZodObject<{
    sig: z.ZodString;
    derivedVia: z.ZodString;
    signedMessage: z.ZodString;
    address: z.ZodString;
    algo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sig: string;
    derivedVia: string;
    signedMessage: string;
    address: string;
    algo?: string | undefined;
}, {
    sig: string;
    derivedVia: string;
    signedMessage: string;
    address: string;
    algo?: string | undefined;
}>>>;
export declare const ISessionCapabilityObjectSchema: z.ZodObject<{
    attenuations: z.ZodLazy<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>, "many">>>>;
    proofs: z.ZodArray<z.ZodString, "many">;
    statement: z.ZodString;
    addProof: z.ZodFunction<z.ZodTuple<[z.ZodString], z.ZodUnknown>, z.ZodVoid>;
    /**
     * Add an arbitrary attenuation to the session capability object.
     *
     * @description We do NOT recommend using this unless with the LIT specific
     * abilities. Use this ONLY if you know what you are doing.
     */
    addAttenuation: z.ZodFunction<z.ZodTuple<[z.ZodString, z.ZodOptional<z.ZodString>, z.ZodOptional<z.ZodString>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>], z.ZodUnknown>, z.ZodVoid>;
    addToSiweMessage: z.ZodFunction<z.ZodTuple<[z.ZodType<SiweMessage, z.ZodTypeDef, SiweMessage>], z.ZodUnknown>, z.ZodType<SiweMessage, z.ZodTypeDef, SiweMessage>>;
    /**
     * Encode the session capability object as a SIWE resource.
     */
    encodeAsSiweResource: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
    /** LIT specific methods */
    /**
     * Add a LIT-specific capability to the session capability object for the
     * specified resource.
     *
     * @param litResource The LIT-specific resource being added.
     * @param ability The LIT-specific ability being added.
     * @param [data]
     * @example If the ability is `LitAbility.AccessControlConditionDecryption`,
     * then the resource should be the hashed key value of the access control
     * condition.
     * @example If the ability is `LitAbility.AccessControlConditionSigning`,
     * then the resource should be the hashed key value of the access control
     * condition.
     * @example If the ability is `LitAbility.PKPSigning`, then the resource
     * should be the PKP token ID.
     * @example If the ability is `LitAbility.RateLimitIncreaseAuth`, then the
     * resource should be the RLI token ID.
     * @example If the ability is `LitAbility.LitActionExecution`, then the
     * resource should be the Lit Action IPFS CID.
     * @throws If the ability is not a LIT-specific ability.
     */
    addCapabilityForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
        /**
         * Gets the fully qualified resource key.
         * @returns The fully qualified resource key.
         */
        getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
        /**
         * Validates that the given LIT ability is valid for this resource.
         * @param litAbility The LIT ability to validate.
         */
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
    }>, z.ZodNativeEnum<{
        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
        readonly AccessControlConditionSigning: "access-control-condition-signing";
        readonly PKPSigning: "pkp-signing";
        readonly PaymentDelegation: "lit-payment-delegation";
        readonly LitActionExecution: "lit-action-execution";
    }>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>], z.ZodUnknown>, z.ZodVoid>;
    /**
     * Verify that the session capability object has the specified LIT-specific
     * capability for the specified resource.
     */
    verifyCapabilitiesForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
        /**
         * Gets the fully qualified resource key.
         * @returns The fully qualified resource key.
         */
        getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
        /**
         * Validates that the given LIT ability is valid for this resource.
         * @param litAbility The LIT ability to validate.
         */
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
    }>, z.ZodNativeEnum<{
        readonly AccessControlConditionDecryption: "access-control-condition-decryption";
        readonly AccessControlConditionSigning: "access-control-condition-signing";
        readonly PKPSigning: "pkp-signing";
        readonly PaymentDelegation: "lit-payment-delegation";
        readonly LitActionExecution: "lit-action-execution";
    }>], z.ZodUnknown>, z.ZodBoolean>;
    /**
     * Add a wildcard ability to the session capability object for the specified
     * resource.
     */
    addAllCapabilitiesForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
        /**
         * Gets the fully qualified resource key.
         * @returns The fully qualified resource key.
         */
        getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
        /**
         * Validates that the given LIT ability is valid for this resource.
         * @param litAbility The LIT ability to validate.
         */
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
    }>], z.ZodUnknown>, z.ZodVoid>;
}, "strip", z.ZodTypeAny, {
    statement: string;
    attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
    proofs: string[];
    addProof: (args_0: string, ...args: unknown[]) => void;
    addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
    addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
    encodeAsSiweResource: (...args: unknown[]) => string;
    addCapabilityForResource: (args_0: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
    verifyCapabilitiesForResource: (args_0: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
    addAllCapabilitiesForResource: (args_0: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    }, ...args: unknown[]) => void;
}, {
    statement: string;
    attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
    proofs: string[];
    addProof: (args_0: string, ...args: unknown[]) => void;
    addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
    addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
    encodeAsSiweResource: (...args: unknown[]) => string;
    addCapabilityForResource: (args_0: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
    verifyCapabilitiesForResource: (args_0: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
    addAllCapabilitiesForResource: (args_0: {
        toString: (...args: unknown[]) => string;
        getResourceKey: (...args: unknown[]) => string;
        isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
        resource: string;
    }, ...args: unknown[]) => void;
}>;
export declare const AuthenticationContextSchema: z.ZodObject<{
    litActionCode: z.ZodOptional<z.ZodString>;
    litActionIpfsId: z.ZodOptional<z.ZodString>;
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
} & {
    /**
     * Session signature properties shared across all functions that generate session signatures.
     */
    pkpPublicKey: z.ZodOptional<z.ZodString>;
    /**
     * When this session signature will expire. After this time is up you will need to reauthenticate, generating a new session signature. The default time until expiration is 24 hours. The formatting is an [RFC3339](https://datatracker.ietf.org/doc/html/rfc3339) timestamp.
     */
    expiration: z.ZodOptional<z.ZodAny>;
    /**
     * @deprecated
     * The chain to use for the session signature and sign the session key. This value is almost always `ethereum`. If you're using EVM, this parameter isn't very important.
     */
    chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    /**
     * An array of resource abilities that you want to request for this session. These will be signed with the session key.
     * For example, an ability is added to grant a session permission to decrypt content associated with a particular Access Control Conditions (ACC) hash. When trying to decrypt, this ability is checked in the `resourceAbilityRequests` to verify if the session has the required decryption capability.
     * @example
     * [{ resource: new LitAccessControlConditionResource('someAccHash`), ability: LitAbility.AccessControlConditionDecryption }]
     */
    resourceAbilityRequests: z.ZodArray<z.ZodObject<{
        resource: z.ZodObject<{
            /**
             * Gets the fully qualified resource key.
             * @returns The fully qualified resource key.
             */
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /**
             * Validates that the given LIT ability is valid for this resource.
             * @param litAbility The LIT ability to validate.
             */
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
        data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
    }, "strip", z.ZodTypeAny, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }, {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }>, "many">;
    /**
     * @deprecated
     * The session capability object that you want to request for this session.
     * It is likely you will not need this, as the object will be automatically derived from the `resourceAbilityRequests`.
     * If you pass nothing, then this will default to a wildcard for each type of resource you're accessing.
     * The wildcard means that the session will be granted the ability to perform operations with any access control condition.
     */
    sessionCapabilityObject: z.ZodOptional<z.ZodObject<{
        attenuations: z.ZodLazy<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>, "many">>>>;
        proofs: z.ZodArray<z.ZodString, "many">;
        statement: z.ZodString;
        addProof: z.ZodFunction<z.ZodTuple<[z.ZodString], z.ZodUnknown>, z.ZodVoid>;
        /**
         * Add an arbitrary attenuation to the session capability object.
         *
         * @description We do NOT recommend using this unless with the LIT specific
         * abilities. Use this ONLY if you know what you are doing.
         */
        addAttenuation: z.ZodFunction<z.ZodTuple<[z.ZodString, z.ZodOptional<z.ZodString>, z.ZodOptional<z.ZodString>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>], z.ZodUnknown>, z.ZodVoid>;
        addToSiweMessage: z.ZodFunction<z.ZodTuple<[z.ZodType<SiweMessage, z.ZodTypeDef, SiweMessage>], z.ZodUnknown>, z.ZodType<SiweMessage, z.ZodTypeDef, SiweMessage>>;
        /**
         * Encode the session capability object as a SIWE resource.
         */
        encodeAsSiweResource: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
        /** LIT specific methods */
        /**
         * Add a LIT-specific capability to the session capability object for the
         * specified resource.
         *
         * @param litResource The LIT-specific resource being added.
         * @param ability The LIT-specific ability being added.
         * @param [data]
         * @example If the ability is `LitAbility.AccessControlConditionDecryption`,
         * then the resource should be the hashed key value of the access control
         * condition.
         * @example If the ability is `LitAbility.AccessControlConditionSigning`,
         * then the resource should be the hashed key value of the access control
         * condition.
         * @example If the ability is `LitAbility.PKPSigning`, then the resource
         * should be the PKP token ID.
         * @example If the ability is `LitAbility.RateLimitIncreaseAuth`, then the
         * resource should be the RLI token ID.
         * @example If the ability is `LitAbility.LitActionExecution`, then the
         * resource should be the Lit Action IPFS CID.
         * @throws If the ability is not a LIT-specific ability.
         */
        addCapabilityForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
            /**
             * Gets the fully qualified resource key.
             * @returns The fully qualified resource key.
             */
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /**
             * Validates that the given LIT ability is valid for this resource.
             * @param litAbility The LIT ability to validate.
             */
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
        }>, z.ZodNativeEnum<{
            readonly AccessControlConditionDecryption: "access-control-condition-decryption";
            readonly AccessControlConditionSigning: "access-control-condition-signing";
            readonly PKPSigning: "pkp-signing";
            readonly PaymentDelegation: "lit-payment-delegation";
            readonly LitActionExecution: "lit-action-execution";
        }>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>], z.ZodUnknown>, z.ZodVoid>;
        /**
         * Verify that the session capability object has the specified LIT-specific
         * capability for the specified resource.
         */
        verifyCapabilitiesForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
            /**
             * Gets the fully qualified resource key.
             * @returns The fully qualified resource key.
             */
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /**
             * Validates that the given LIT ability is valid for this resource.
             * @param litAbility The LIT ability to validate.
             */
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
        }>, z.ZodNativeEnum<{
            readonly AccessControlConditionDecryption: "access-control-condition-decryption";
            readonly AccessControlConditionSigning: "access-control-condition-signing";
            readonly PKPSigning: "pkp-signing";
            readonly PaymentDelegation: "lit-payment-delegation";
            readonly LitActionExecution: "lit-action-execution";
        }>], z.ZodUnknown>, z.ZodBoolean>;
        /**
         * Add a wildcard ability to the session capability object for the specified
         * resource.
         */
        addAllCapabilitiesForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
            /**
             * Gets the fully qualified resource key.
             * @returns The fully qualified resource key.
             */
            getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /**
             * Validates that the given LIT ability is valid for this resource.
             * @param litAbility The LIT ability to validate.
             */
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
        }>], z.ZodUnknown>, z.ZodVoid>;
    }, "strip", z.ZodTypeAny, {
        statement: string;
        attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
        proofs: string[];
        addProof: (args_0: string, ...args: unknown[]) => void;
        addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
        encodeAsSiweResource: (...args: unknown[]) => string;
        addCapabilityForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        verifyCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        addAllCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, ...args: unknown[]) => void;
    }, {
        statement: string;
        attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
        proofs: string[];
        addProof: (args_0: string, ...args: unknown[]) => void;
        addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
        encodeAsSiweResource: (...args: unknown[]) => string;
        addCapabilityForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        verifyCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        addAllCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, ...args: unknown[]) => void;
    }>>;
    /**
     * If you want to ask MetaMask to try and switch the user's chain, you may pass true here. This will only work if the user is using MetaMask, otherwise this will be ignored.
     */
    switchChain: z.ZodOptional<z.ZodBoolean>;
    /**
     * The serialized session key pair to sign.
     * If not provided, a session key pair will be fetched from localStorage or generated.
     */
    sessionKey: z.ZodOptional<z.ZodObject<{
        publicKey: z.ZodString;
        secretKey: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        publicKey: string;
        secretKey: string;
    }, {
        publicKey: string;
        secretKey: string;
    }>>;
    /**
     * Not limited to capacityDelegationAuthSig. Other AuthSigs with other purposes can also be in this array.
     */
    capabilityAuthSigs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        sig: z.ZodString;
        derivedVia: z.ZodString;
        signedMessage: z.ZodString;
        address: z.ZodString;
        algo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }, {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }>, "many">>;
    /**
     * This is a callback that will be used to generate an AuthSig within the session signatures. It's inclusion is required, as it defines the specific resources and abilities that will be allowed for the current session.
     */
    authNeededCallback: z.ZodOptional<z.ZodFunction<z.ZodTuple<[z.ZodObject<{
        litActionCode: z.ZodOptional<z.ZodString>;
        litActionIpfsId: z.ZodOptional<z.ZodString>;
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
    } & {
        /**
         * The serialized session key pair to sign. If not provided, a session key pair will be fetched from localStorge or generated.
         */
        sessionKey: z.ZodOptional<z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>>;
        /**
         * The chain you want to use.  Find the supported list of chains here: https://developer.litprotocol.com/docs/supportedChains
         */
        chain: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "campMainnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
        /**
         *   The statement that describes what the user is signing. If the auth callback is for signing a SIWE message, you MUST add this statement to the end of the SIWE statement.
         */
        statement: z.ZodOptional<z.ZodString>;
        /**
         * The blockhash that the nodes return during the handshake
         */
        nonce: z.ZodString;
        /**
         * Optional and only used with EVM chains.  A list of resources to be passed to Sign In with Ethereum.  These resources will be part of the Sign in with Ethereum signed message presented to the user.
         */
        resources: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /**
         * Optional and only used with EVM chains right now.  Set to true by default.  Whether or not to ask Metamask or the user's wallet to switch chains before signing.  This may be desired if you're going to have the user send a txn on that chain.  On the other hand, if all you care about is the user's wallet signature, then you probably don't want to make them switch chains for no reason.  Pass false here to disable this chain switching behavior.
         */
        switchChain: z.ZodOptional<z.ZodBoolean>;
        expiration: z.ZodOptional<z.ZodString>;
        uri: z.ZodOptional<z.ZodString>;
        /**
         * Cosmos wallet type, to support mutliple popular cosmos wallets
         * Keplr & Cypher -> window.keplr
         * Leap -> window.leap
         */
        cosmosWalletType: z.ZodOptional<z.ZodEnum<["keplr", "leap"]>>;
        /**
         * Optional project ID for WalletConnect V2. Only required if one is using checkAndSignAuthMessage and wants to display WalletConnect as an option.
         */
        walletConnectProjectId: z.ZodOptional<z.ZodString>;
        resourceAbilityRequests: z.ZodOptional<z.ZodArray<z.ZodObject<{
            resource: z.ZodObject<{
                /**
                 * Gets the fully qualified resource key.
                 * @returns The fully qualified resource key.
                 */
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                /**
                 * Validates that the given LIT ability is valid for this resource.
                 * @param litAbility The LIT ability to validate.
                 */
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
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
        }, "strip", z.ZodTypeAny, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
        nonce: string;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        expiration?: string | undefined;
        statement?: string | undefined;
        resources?: string[] | undefined;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        uri?: string | undefined;
        cosmosWalletType?: "keplr" | "leap" | undefined;
        walletConnectProjectId?: string | undefined;
        resourceAbilityRequests?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[] | undefined;
    }, {
        chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
        nonce: string;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        expiration?: string | undefined;
        statement?: string | undefined;
        resources?: string[] | undefined;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        uri?: string | undefined;
        cosmosWalletType?: "keplr" | "leap" | undefined;
        walletConnectProjectId?: string | undefined;
        resourceAbilityRequests?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[] | undefined;
    }>], z.ZodUnknown>, z.ZodPromise<z.ZodObject<{
        sig: z.ZodString;
        derivedVia: z.ZodString;
        signedMessage: z.ZodString;
        address: z.ZodString;
        algo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }, {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }>>>>;
    authMethods: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
    }, {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
    }>, "many">>;
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
}, "strip", z.ZodTypeAny, {
    resourceAbilityRequests: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }[];
    chain?: string | undefined;
    pkpPublicKey?: string | undefined;
    ipfsOptions?: {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    } | undefined;
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
    authNeededCallback?: ((args_0: {
        chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
        nonce: string;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        expiration?: string | undefined;
        statement?: string | undefined;
        resources?: string[] | undefined;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        uri?: string | undefined;
        cosmosWalletType?: "keplr" | "leap" | undefined;
        walletConnectProjectId?: string | undefined;
        resourceAbilityRequests?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[] | undefined;
    }, ...args: unknown[]) => Promise<{
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }>) | undefined;
    capabilityAuthSigs?: {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }[] | undefined;
    expiration?: any;
    sessionKey?: {
        publicKey: string;
        secretKey: string;
    } | undefined;
    switchChain?: boolean | undefined;
    sessionCapabilityObject?: {
        statement: string;
        attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
        proofs: string[];
        addProof: (args_0: string, ...args: unknown[]) => void;
        addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
        encodeAsSiweResource: (...args: unknown[]) => string;
        addCapabilityForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        verifyCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        addAllCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, ...args: unknown[]) => void;
    } | undefined;
    authMethods?: {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
    }[] | undefined;
}, {
    resourceAbilityRequests: {
        resource: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        };
        ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
        data?: Record<string, import("./schemas").DefinedJson> | undefined;
    }[];
    chain?: string | undefined;
    pkpPublicKey?: string | undefined;
    ipfsOptions?: {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    } | undefined;
    litActionCode?: string | undefined;
    litActionIpfsId?: string | undefined;
    jsParams?: any;
    authNeededCallback?: ((args_0: {
        chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
        nonce: string;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        expiration?: string | undefined;
        statement?: string | undefined;
        resources?: string[] | undefined;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        uri?: string | undefined;
        cosmosWalletType?: "keplr" | "leap" | undefined;
        walletConnectProjectId?: string | undefined;
        resourceAbilityRequests?: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[] | undefined;
    }, ...args: unknown[]) => Promise<{
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }>) | undefined;
    capabilityAuthSigs?: {
        sig: string;
        derivedVia: string;
        signedMessage: string;
        address: string;
        algo?: string | undefined;
    }[] | undefined;
    expiration?: any;
    sessionKey?: {
        publicKey: string;
        secretKey: string;
    } | undefined;
    switchChain?: boolean | undefined;
    sessionCapabilityObject?: {
        statement: string;
        attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
        proofs: string[];
        addProof: (args_0: string, ...args: unknown[]) => void;
        addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
        encodeAsSiweResource: (...args: unknown[]) => string;
        addCapabilityForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
        verifyCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
        addAllCapabilitiesForResource: (args_0: {
            toString: (...args: unknown[]) => string;
            getResourceKey: (...args: unknown[]) => string;
            isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
            resource: string;
        }, ...args: unknown[]) => void;
    } | undefined;
    authMethods?: {
        authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
        accessToken: string;
    }[] | undefined;
}>;
export declare const JsonExecutionSdkParamsBaseSchema: z.ZodObject<Pick<{
    litActionCode: z.ZodOptional<z.ZodString>;
    litActionIpfsId: z.ZodOptional<z.ZodString>;
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
}, "jsParams"> & {
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
    useSingleNode: z.ZodOptional<z.ZodBoolean>;
    keySetIdentifier: z.ZodOptional<z.ZodString>;
} & {
    userMaxPrice: z.ZodOptional<z.ZodBigInt>;
} & {
    /**
     *  JS code to run on the nodes
     */
    code: z.ZodOptional<z.ZodString>;
    /**
     * The IPFS ID of some JS code to run on the nodes
     */
    ipfsId: z.ZodOptional<z.ZodString>;
    /**
     * auth context
     */
    authContext: z.ZodObject<{
        litActionCode: z.ZodOptional<z.ZodString>;
        litActionIpfsId: z.ZodOptional<z.ZodString>;
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
    } & {
        /**
         * Session signature properties shared across all functions that generate session signatures.
         */
        pkpPublicKey: z.ZodOptional<z.ZodString>;
        /**
         * When this session signature will expire. After this time is up you will need to reauthenticate, generating a new session signature. The default time until expiration is 24 hours. The formatting is an [RFC3339](https://datatracker.ietf.org/doc/html/rfc3339) timestamp.
         */
        expiration: z.ZodOptional<z.ZodAny>;
        /**
         * @deprecated
         * The chain to use for the session signature and sign the session key. This value is almost always `ethereum`. If you're using EVM, this parameter isn't very important.
         */
        chain: z.ZodOptional<z.ZodDefault<z.ZodString>>;
        /**
         * An array of resource abilities that you want to request for this session. These will be signed with the session key.
         * For example, an ability is added to grant a session permission to decrypt content associated with a particular Access Control Conditions (ACC) hash. When trying to decrypt, this ability is checked in the `resourceAbilityRequests` to verify if the session has the required decryption capability.
         * @example
         * [{ resource: new LitAccessControlConditionResource('someAccHash`), ability: LitAbility.AccessControlConditionDecryption }]
         */
        resourceAbilityRequests: z.ZodArray<z.ZodObject<{
            resource: z.ZodObject<{
                /**
                 * Gets the fully qualified resource key.
                 * @returns The fully qualified resource key.
                 */
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                /**
                 * Validates that the given LIT ability is valid for this resource.
                 * @param litAbility The LIT ability to validate.
                 */
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
            data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
        }, "strip", z.ZodTypeAny, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }, {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }>, "many">;
        /**
         * @deprecated
         * The session capability object that you want to request for this session.
         * It is likely you will not need this, as the object will be automatically derived from the `resourceAbilityRequests`.
         * If you pass nothing, then this will default to a wildcard for each type of resource you're accessing.
         * The wildcard means that the session will be granted the ability to perform operations with any access control condition.
         */
        sessionCapabilityObject: z.ZodOptional<z.ZodObject<{
            attenuations: z.ZodLazy<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodArray<z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>, "many">>>>;
            proofs: z.ZodArray<z.ZodString, "many">;
            statement: z.ZodString;
            addProof: z.ZodFunction<z.ZodTuple<[z.ZodString], z.ZodUnknown>, z.ZodVoid>;
            /**
             * Add an arbitrary attenuation to the session capability object.
             *
             * @description We do NOT recommend using this unless with the LIT specific
             * abilities. Use this ONLY if you know what you are doing.
             */
            addAttenuation: z.ZodFunction<z.ZodTuple<[z.ZodString, z.ZodOptional<z.ZodString>, z.ZodOptional<z.ZodString>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>], z.ZodUnknown>, z.ZodVoid>;
            addToSiweMessage: z.ZodFunction<z.ZodTuple<[z.ZodType<SiweMessage, z.ZodTypeDef, SiweMessage>], z.ZodUnknown>, z.ZodType<SiweMessage, z.ZodTypeDef, SiweMessage>>;
            /**
             * Encode the session capability object as a SIWE resource.
             */
            encodeAsSiweResource: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
            /** LIT specific methods */
            /**
             * Add a LIT-specific capability to the session capability object for the
             * specified resource.
             *
             * @param litResource The LIT-specific resource being added.
             * @param ability The LIT-specific ability being added.
             * @param [data]
             * @example If the ability is `LitAbility.AccessControlConditionDecryption`,
             * then the resource should be the hashed key value of the access control
             * condition.
             * @example If the ability is `LitAbility.AccessControlConditionSigning`,
             * then the resource should be the hashed key value of the access control
             * condition.
             * @example If the ability is `LitAbility.PKPSigning`, then the resource
             * should be the PKP token ID.
             * @example If the ability is `LitAbility.RateLimitIncreaseAuth`, then the
             * resource should be the RLI token ID.
             * @example If the ability is `LitAbility.LitActionExecution`, then the
             * resource should be the Lit Action IPFS CID.
             * @throws If the ability is not a LIT-specific ability.
             */
            addCapabilityForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
                /**
                 * Gets the fully qualified resource key.
                 * @returns The fully qualified resource key.
                 */
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                /**
                 * Validates that the given LIT ability is valid for this resource.
                 * @param litAbility The LIT ability to validate.
                 */
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
            }>, z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>], z.ZodUnknown>, z.ZodVoid>;
            /**
             * Verify that the session capability object has the specified LIT-specific
             * capability for the specified resource.
             */
            verifyCapabilitiesForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
                /**
                 * Gets the fully qualified resource key.
                 * @returns The fully qualified resource key.
                 */
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                /**
                 * Validates that the given LIT ability is valid for this resource.
                 * @param litAbility The LIT ability to validate.
                 */
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
            }>, z.ZodNativeEnum<{
                readonly AccessControlConditionDecryption: "access-control-condition-decryption";
                readonly AccessControlConditionSigning: "access-control-condition-signing";
                readonly PKPSigning: "pkp-signing";
                readonly PaymentDelegation: "lit-payment-delegation";
                readonly LitActionExecution: "lit-action-execution";
            }>], z.ZodUnknown>, z.ZodBoolean>;
            /**
             * Add a wildcard ability to the session capability object for the specified
             * resource.
             */
            addAllCapabilitiesForResource: z.ZodFunction<z.ZodTuple<[z.ZodObject<{
                /**
                 * Gets the fully qualified resource key.
                 * @returns The fully qualified resource key.
                 */
                getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                /**
                 * Validates that the given LIT ability is valid for this resource.
                 * @param litAbility The LIT ability to validate.
                 */
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
            }>], z.ZodUnknown>, z.ZodVoid>;
        }, "strip", z.ZodTypeAny, {
            statement: string;
            attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
            proofs: string[];
            addProof: (args_0: string, ...args: unknown[]) => void;
            addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
            encodeAsSiweResource: (...args: unknown[]) => string;
            addCapabilityForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            verifyCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            addAllCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, ...args: unknown[]) => void;
        }, {
            statement: string;
            attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
            proofs: string[];
            addProof: (args_0: string, ...args: unknown[]) => void;
            addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
            encodeAsSiweResource: (...args: unknown[]) => string;
            addCapabilityForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            verifyCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            addAllCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, ...args: unknown[]) => void;
        }>>;
        /**
         * If you want to ask MetaMask to try and switch the user's chain, you may pass true here. This will only work if the user is using MetaMask, otherwise this will be ignored.
         */
        switchChain: z.ZodOptional<z.ZodBoolean>;
        /**
         * The serialized session key pair to sign.
         * If not provided, a session key pair will be fetched from localStorage or generated.
         */
        sessionKey: z.ZodOptional<z.ZodObject<{
            publicKey: z.ZodString;
            secretKey: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            publicKey: string;
            secretKey: string;
        }, {
            publicKey: string;
            secretKey: string;
        }>>;
        /**
         * Not limited to capacityDelegationAuthSig. Other AuthSigs with other purposes can also be in this array.
         */
        capabilityAuthSigs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            sig: z.ZodString;
            derivedVia: z.ZodString;
            signedMessage: z.ZodString;
            address: z.ZodString;
            algo: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }, {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }>, "many">>;
        /**
         * This is a callback that will be used to generate an AuthSig within the session signatures. It's inclusion is required, as it defines the specific resources and abilities that will be allowed for the current session.
         */
        authNeededCallback: z.ZodOptional<z.ZodFunction<z.ZodTuple<[z.ZodObject<{
            litActionCode: z.ZodOptional<z.ZodString>;
            litActionIpfsId: z.ZodOptional<z.ZodString>;
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
        } & {
            /**
             * The serialized session key pair to sign. If not provided, a session key pair will be fetched from localStorge or generated.
             */
            sessionKey: z.ZodOptional<z.ZodObject<{
                publicKey: z.ZodString;
                secretKey: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                publicKey: string;
                secretKey: string;
            }, {
                publicKey: string;
                secretKey: string;
            }>>;
            /**
             * The chain you want to use.  Find the supported list of chains here: https://developer.litprotocol.com/docs/supportedChains
             */
            chain: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "campMainnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
            /**
             *   The statement that describes what the user is signing. If the auth callback is for signing a SIWE message, you MUST add this statement to the end of the SIWE statement.
             */
            statement: z.ZodOptional<z.ZodString>;
            /**
             * The blockhash that the nodes return during the handshake
             */
            nonce: z.ZodString;
            /**
             * Optional and only used with EVM chains.  A list of resources to be passed to Sign In with Ethereum.  These resources will be part of the Sign in with Ethereum signed message presented to the user.
             */
            resources: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            /**
             * Optional and only used with EVM chains right now.  Set to true by default.  Whether or not to ask Metamask or the user's wallet to switch chains before signing.  This may be desired if you're going to have the user send a txn on that chain.  On the other hand, if all you care about is the user's wallet signature, then you probably don't want to make them switch chains for no reason.  Pass false here to disable this chain switching behavior.
             */
            switchChain: z.ZodOptional<z.ZodBoolean>;
            expiration: z.ZodOptional<z.ZodString>;
            uri: z.ZodOptional<z.ZodString>;
            /**
             * Cosmos wallet type, to support mutliple popular cosmos wallets
             * Keplr & Cypher -> window.keplr
             * Leap -> window.leap
             */
            cosmosWalletType: z.ZodOptional<z.ZodEnum<["keplr", "leap"]>>;
            /**
             * Optional project ID for WalletConnect V2. Only required if one is using checkAndSignAuthMessage and wants to display WalletConnect as an option.
             */
            walletConnectProjectId: z.ZodOptional<z.ZodString>;
            resourceAbilityRequests: z.ZodOptional<z.ZodArray<z.ZodObject<{
                resource: z.ZodObject<{
                    /**
                     * Gets the fully qualified resource key.
                     * @returns The fully qualified resource key.
                     */
                    getResourceKey: z.ZodFunction<z.ZodTuple<[], z.ZodUnknown>, z.ZodString>;
                    /**
                     * Validates that the given LIT ability is valid for this resource.
                     * @param litAbility The LIT ability to validate.
                     */
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
                data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("./schemas").DefinedJson, z.ZodTypeDef, import("./schemas").DefinedJson>>>;
            }, "strip", z.ZodTypeAny, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }, {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
            nonce: string;
            litActionCode?: string | undefined;
            litActionIpfsId?: string | undefined;
            jsParams?: any;
            expiration?: string | undefined;
            statement?: string | undefined;
            resources?: string[] | undefined;
            sessionKey?: {
                publicKey: string;
                secretKey: string;
            } | undefined;
            switchChain?: boolean | undefined;
            uri?: string | undefined;
            cosmosWalletType?: "keplr" | "leap" | undefined;
            walletConnectProjectId?: string | undefined;
            resourceAbilityRequests?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }, {
            chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
            nonce: string;
            litActionCode?: string | undefined;
            litActionIpfsId?: string | undefined;
            jsParams?: any;
            expiration?: string | undefined;
            statement?: string | undefined;
            resources?: string[] | undefined;
            sessionKey?: {
                publicKey: string;
                secretKey: string;
            } | undefined;
            switchChain?: boolean | undefined;
            uri?: string | undefined;
            cosmosWalletType?: "keplr" | "leap" | undefined;
            walletConnectProjectId?: string | undefined;
            resourceAbilityRequests?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }>], z.ZodUnknown>, z.ZodPromise<z.ZodObject<{
            sig: z.ZodString;
            derivedVia: z.ZodString;
            signedMessage: z.ZodString;
            address: z.ZodString;
            algo: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }, {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }>>>>;
        authMethods: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
            accessToken: string;
        }, {
            authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
            accessToken: string;
        }>, "many">>;
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
    }, "strip", z.ZodTypeAny, {
        resourceAbilityRequests: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[];
        chain?: string | undefined;
        pkpPublicKey?: string | undefined;
        ipfsOptions?: {
            overwriteCode?: boolean | undefined;
            gatewayUrl?: string | undefined;
        } | undefined;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        authNeededCallback?: ((args_0: {
            chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
            nonce: string;
            litActionCode?: string | undefined;
            litActionIpfsId?: string | undefined;
            jsParams?: any;
            expiration?: string | undefined;
            statement?: string | undefined;
            resources?: string[] | undefined;
            sessionKey?: {
                publicKey: string;
                secretKey: string;
            } | undefined;
            switchChain?: boolean | undefined;
            uri?: string | undefined;
            cosmosWalletType?: "keplr" | "leap" | undefined;
            walletConnectProjectId?: string | undefined;
            resourceAbilityRequests?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }, ...args: unknown[]) => Promise<{
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }>) | undefined;
        capabilityAuthSigs?: {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: any;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        sessionCapabilityObject?: {
            statement: string;
            attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
            proofs: string[];
            addProof: (args_0: string, ...args: unknown[]) => void;
            addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
            encodeAsSiweResource: (...args: unknown[]) => string;
            addCapabilityForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            verifyCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            addAllCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, ...args: unknown[]) => void;
        } | undefined;
        authMethods?: {
            authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
            accessToken: string;
        }[] | undefined;
    }, {
        resourceAbilityRequests: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[];
        chain?: string | undefined;
        pkpPublicKey?: string | undefined;
        ipfsOptions?: {
            overwriteCode?: boolean | undefined;
            gatewayUrl?: string | undefined;
        } | undefined;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        authNeededCallback?: ((args_0: {
            chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
            nonce: string;
            litActionCode?: string | undefined;
            litActionIpfsId?: string | undefined;
            jsParams?: any;
            expiration?: string | undefined;
            statement?: string | undefined;
            resources?: string[] | undefined;
            sessionKey?: {
                publicKey: string;
                secretKey: string;
            } | undefined;
            switchChain?: boolean | undefined;
            uri?: string | undefined;
            cosmosWalletType?: "keplr" | "leap" | undefined;
            walletConnectProjectId?: string | undefined;
            resourceAbilityRequests?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }, ...args: unknown[]) => Promise<{
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }>) | undefined;
        capabilityAuthSigs?: {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: any;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        sessionCapabilityObject?: {
            statement: string;
            attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
            proofs: string[];
            addProof: (args_0: string, ...args: unknown[]) => void;
            addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
            encodeAsSiweResource: (...args: unknown[]) => string;
            addCapabilityForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            verifyCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            addAllCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, ...args: unknown[]) => void;
        } | undefined;
        authMethods?: {
            authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
            accessToken: string;
        }[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    authContext: {
        resourceAbilityRequests: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[];
        chain?: string | undefined;
        pkpPublicKey?: string | undefined;
        ipfsOptions?: {
            overwriteCode?: boolean | undefined;
            gatewayUrl?: string | undefined;
        } | undefined;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        authNeededCallback?: ((args_0: {
            chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
            nonce: string;
            litActionCode?: string | undefined;
            litActionIpfsId?: string | undefined;
            jsParams?: any;
            expiration?: string | undefined;
            statement?: string | undefined;
            resources?: string[] | undefined;
            sessionKey?: {
                publicKey: string;
                secretKey: string;
            } | undefined;
            switchChain?: boolean | undefined;
            uri?: string | undefined;
            cosmosWalletType?: "keplr" | "leap" | undefined;
            walletConnectProjectId?: string | undefined;
            resourceAbilityRequests?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }, ...args: unknown[]) => Promise<{
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }>) | undefined;
        capabilityAuthSigs?: {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: any;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        sessionCapabilityObject?: {
            statement: string;
            attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
            proofs: string[];
            addProof: (args_0: string, ...args: unknown[]) => void;
            addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
            encodeAsSiweResource: (...args: unknown[]) => string;
            addCapabilityForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            verifyCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            addAllCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, ...args: unknown[]) => void;
        } | undefined;
        authMethods?: {
            authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
            accessToken: string;
        }[] | undefined;
    };
    code?: string | undefined;
    userMaxPrice?: bigint | undefined;
    responseStrategy?: {
        strategy: "custom" | "leastCommon" | "mostCommon";
        customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
    } | undefined;
    ipfsOptions?: {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    } | undefined;
    useSingleNode?: boolean | undefined;
    keySetIdentifier?: string | undefined;
    jsParams?: any;
    ipfsId?: string | undefined;
}, {
    authContext: {
        resourceAbilityRequests: {
            resource: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            };
            ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
            data?: Record<string, import("./schemas").DefinedJson> | undefined;
        }[];
        chain?: string | undefined;
        pkpPublicKey?: string | undefined;
        ipfsOptions?: {
            overwriteCode?: boolean | undefined;
            gatewayUrl?: string | undefined;
        } | undefined;
        litActionCode?: string | undefined;
        litActionIpfsId?: string | undefined;
        jsParams?: any;
        authNeededCallback?: ((args_0: {
            chain: "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
            nonce: string;
            litActionCode?: string | undefined;
            litActionIpfsId?: string | undefined;
            jsParams?: any;
            expiration?: string | undefined;
            statement?: string | undefined;
            resources?: string[] | undefined;
            sessionKey?: {
                publicKey: string;
                secretKey: string;
            } | undefined;
            switchChain?: boolean | undefined;
            uri?: string | undefined;
            cosmosWalletType?: "keplr" | "leap" | undefined;
            walletConnectProjectId?: string | undefined;
            resourceAbilityRequests?: {
                resource: {
                    toString: (...args: unknown[]) => string;
                    getResourceKey: (...args: unknown[]) => string;
                    isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                    resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                    resource: string;
                };
                ability: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution";
                data?: Record<string, import("./schemas").DefinedJson> | undefined;
            }[] | undefined;
        }, ...args: unknown[]) => Promise<{
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }>) | undefined;
        capabilityAuthSigs?: {
            sig: string;
            derivedVia: string;
            signedMessage: string;
            address: string;
            algo?: string | undefined;
        }[] | undefined;
        expiration?: any;
        sessionKey?: {
            publicKey: string;
            secretKey: string;
        } | undefined;
        switchChain?: boolean | undefined;
        sessionCapabilityObject?: {
            statement: string;
            attenuations: Record<string, Record<string, import("./schemas").DefinedJson[]>>;
            proofs: string[];
            addProof: (args_0: string, ...args: unknown[]) => void;
            addAttenuation: (args_0: string, args_1: string | undefined, args_2: string | undefined, args_3: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            addToSiweMessage: (args_0: SiweMessage, ...args: unknown[]) => SiweMessage;
            encodeAsSiweResource: (...args: unknown[]) => string;
            addCapabilityForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", args_2: Record<string, import("./schemas").DefinedJson> | undefined, ...args: unknown[]) => void;
            verifyCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, args_1: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
            addAllCapabilitiesForResource: (args_0: {
                toString: (...args: unknown[]) => string;
                getResourceKey: (...args: unknown[]) => string;
                isValidLitAbility: (args_0: "access-control-condition-decryption" | "access-control-condition-signing" | "pkp-signing" | "lit-payment-delegation" | "lit-action-execution", ...args: unknown[]) => boolean;
                resourcePrefix: "lit-accesscontrolcondition" | "lit-pkp" | "lit-ratelimitincrease" | "lit-paymentdelegation" | "lit-litaction";
                resource: string;
            }, ...args: unknown[]) => void;
        } | undefined;
        authMethods?: {
            authMethodType: 1 | 2 | 4 | 3 | 5 | 6 | 8 | 9 | 10 | 11 | 12 | 13;
            accessToken: string;
        }[] | undefined;
    };
    code?: string | undefined;
    userMaxPrice?: bigint | undefined;
    responseStrategy?: {
        strategy: "custom" | "leastCommon" | "mostCommon";
        customFilter?: ((args_0: Record<string, string>[], ...args: unknown[]) => Record<string, string>) | undefined;
    } | undefined;
    ipfsOptions?: {
        overwriteCode?: boolean | undefined;
        gatewayUrl?: string | undefined;
    } | undefined;
    useSingleNode?: boolean | undefined;
    keySetIdentifier?: string | undefined;
    jsParams?: any;
    ipfsId?: string | undefined;
}>;
