import { LITChain, LITCosmosChain, LITEVMChain, LITSVMChain } from './types';
export type ConstantKeys<T> = keyof T;
export type ConstantValues<T> = T[keyof T];
export declare const VMTYPE: {
    readonly EVM: "EVM";
    readonly SVM: "SVM";
    readonly CVM: "CVM";
};
export type VMTYPE_TYPE = ConstantKeys<typeof VMTYPE>;
export type VMTYPE_VALUES = ConstantValues<typeof VMTYPE>;
/**
 * Lit Protocol Network Public Key
 */
export declare const NETWORK_PUB_KEY = "9971e835a1fe1a4d78e381eebbe0ddc84fde5119169db816900de796d10187f3c53d65c1202ac083d099a517f34a9b62";
export declare const LIT_AUTH_SIG_CHAIN_KEYS: readonly ["ethereum", "solana", "cosmos", "kyve"];
export declare const LIT_CHAINS_KEYS: readonly ["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "campMainnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"];
export declare const LIT_SVM_CHAINS_KEYS: readonly ["solana", "solanaDevnet", "solanaTestnet"];
export declare const LIT_COSMOS_CHAINS_KEYS: readonly ["cosmos", "kyve", "evmosCosmos", "evmosCosmosTestnet", "cheqdMainnet", "cheqdTestnet", "juno"];
export type LitEVMChainKeys = (typeof LIT_CHAINS_KEYS)[number];
export type LITSVMChainKeys = (typeof LIT_SVM_CHAINS_KEYS)[number];
export type LitCosmosChainKeys = (typeof LIT_COSMOS_CHAINS_KEYS)[number];
/**
 * EVM Chains supported by the LIT protocol.  Each chain includes an optional pre-deployed token contract that you may use for minting LITs.  These are ERC1155 contracts that let you mint any quantity of a given token.  Use the chain name as a key in this object.
 * @constant
 * @type { LITEVMChain }
 * @default
 */
export declare const LIT_CHAINS: LITChain<LitEVMChainKeys, LITEVMChain>;
/**
 * Object containing information to submit to Metamask
 */
export declare const METAMASK_CHAIN_INFO: {
    /**
     * Information about the "chronicleYellowstone" chain.
     */
    readonly yellowstone: {
        readonly chainId: number;
        readonly chainName: string;
        readonly nativeCurrency: {
            readonly name: string;
            readonly symbol: string;
            readonly decimals: number;
        };
        readonly rpcUrls: readonly string[];
        readonly blockExplorerUrls: string[];
        readonly iconUrls: readonly ["future"];
    };
};
/**
 * Constants representing the available LIT RPC endpoints.
 */
export declare const LIT_RPC: {
    /**
     * Local Anvil RPC endpoint.
     */
    readonly LOCAL_ANVIL: "http://127.0.0.1:8545";
    /**
     * Chronicle Yellowstone RPC endpoint - used for >= Datil-test
     * More info: https://app.conduit.xyz/published/view/chronicle-yellowstone-testnet-9qgmzfcohk
     */
    readonly CHRONICLE_YELLOWSTONE: "https://yellowstone-rpc.litprotocol.com";
    /**
     * Lit Chain mainnet RPC endpoint.
     */
    readonly LIT_CHAIN: "https://lit-chain-rpc.litprotocol.com/";
};
export type LIT_RPC_TYPE = ConstantKeys<typeof LIT_RPC>;
export type LIT_RPC_VALUES = ConstantValues<typeof LIT_RPC>;
export declare const LIT_EVM_CHAINS: LITChain<"ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "base" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "yellowstone" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "campMainnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana", LITEVMChain>;
/**
 * Represents the Lit Network constants.
 */
export declare const LIT_NETWORK: {
    readonly Naga: "naga";
    readonly NagaDev: "naga-dev";
    readonly NagaTest: "naga-test";
    readonly Custom: "custom";
};
/**
 * The type representing the keys of the LIT_NETWORK object.
 */
export type LIT_NETWORK_TYPES = ConstantKeys<typeof LIT_NETWORK>;
/**
 * The type representing the values of the LIT_NETWORK object.
 * This should replicate LIT_NETWORKS_KEYS in types package
 */
export type LIT_NETWORK_VALUES = ConstantValues<typeof LIT_NETWORK>;
/**
 * RPC URL by Network
 *
 * A mapping of network names to their corresponding RPC URLs.
 */
export declare const RPC_URL_BY_NETWORK: Record<LIT_NETWORK_VALUES, LIT_RPC_VALUES>;
export declare const HTTP = "http://";
export declare const HTTPS = "https://";
/**
 * Solana Chains supported by the LIT protocol.  Use the chain name as a key in this object.
 * @constant
 * @type { LITSVMChain }
 * @default
 */
export declare const LIT_SVM_CHAINS: LITChain<LITSVMChainKeys, LITSVMChain>;
/**
 * Cosmos Chains supported by the LIT protocol.  Use the chain name as a key in this object.
 * @constant
 * @type { LITCosmosChain }
 * @default
 */
export declare const LIT_COSMOS_CHAINS: LITChain<LitCosmosChainKeys, LITCosmosChain>;
/**
 * All Chains supported by the LIT protocol.  Use the chain name as a key in this object.
 */
export declare const ALL_LIT_CHAINS: {
    readonly cosmos: LITCosmosChain;
    readonly kyve: LITCosmosChain;
    readonly evmosCosmos: LITCosmosChain;
    readonly evmosCosmosTestnet: LITCosmosChain;
    readonly cheqdMainnet: LITCosmosChain;
    readonly cheqdTestnet: LITCosmosChain;
    readonly juno: LITCosmosChain;
    readonly solana: LITSVMChain;
    readonly solanaDevnet: LITSVMChain;
    readonly solanaTestnet: LITSVMChain;
    readonly ethereum: LITEVMChain;
    readonly polygon: LITEVMChain;
    readonly fantom: LITEVMChain;
    readonly xdai: LITEVMChain;
    readonly bsc: LITEVMChain;
    readonly arbitrum: LITEVMChain;
    readonly arbitrumSepolia: LITEVMChain;
    readonly avalanche: LITEVMChain;
    readonly fuji: LITEVMChain;
    readonly harmony: LITEVMChain;
    readonly mumbai: LITEVMChain;
    readonly goerli: LITEVMChain;
    readonly cronos: LITEVMChain;
    readonly optimism: LITEVMChain;
    readonly celo: LITEVMChain;
    readonly aurora: LITEVMChain;
    readonly eluvio: LITEVMChain;
    readonly alfajores: LITEVMChain;
    readonly xdc: LITEVMChain;
    readonly evmos: LITEVMChain;
    readonly evmosTestnet: LITEVMChain;
    readonly bscTestnet: LITEVMChain;
    readonly baseGoerli: LITEVMChain;
    readonly baseSepolia: LITEVMChain;
    readonly moonbeam: LITEVMChain;
    readonly moonriver: LITEVMChain;
    readonly moonbaseAlpha: LITEVMChain;
    readonly filecoin: LITEVMChain;
    readonly filecoinCalibrationTestnet: LITEVMChain;
    readonly hyperspace: LITEVMChain;
    readonly sepolia: LITEVMChain;
    readonly scrollSepolia: LITEVMChain;
    readonly scroll: LITEVMChain;
    readonly zksync: LITEVMChain;
    readonly base: LITEVMChain;
    readonly lukso: LITEVMChain;
    readonly luksoTestnet: LITEVMChain;
    readonly zora: LITEVMChain;
    readonly zoraGoerli: LITEVMChain;
    readonly zksyncTestnet: LITEVMChain;
    readonly lineaGoerli: LITEVMChain;
    readonly lineaSepolia: LITEVMChain;
    readonly yellowstone: LITEVMChain;
    readonly chiado: LITEVMChain;
    readonly zkEvm: LITEVMChain;
    readonly mantleTestnet: LITEVMChain;
    readonly mantle: LITEVMChain;
    readonly klaytn: LITEVMChain;
    readonly publicGoodsNetwork: LITEVMChain;
    readonly optimismGoerli: LITEVMChain;
    readonly waevEclipseTestnet: LITEVMChain;
    readonly waevEclipseDevnet: LITEVMChain;
    readonly verifyTestnet: LITEVMChain;
    readonly fuse: LITEVMChain;
    readonly vanar: LITEVMChain;
    readonly lisk: LITEVMChain;
    readonly chilizMainnet: LITEVMChain;
    readonly chilizTestnet: LITEVMChain;
    readonly skaleTestnet: LITEVMChain;
    readonly skale: LITEVMChain;
    readonly skaleCalypso: LITEVMChain;
    readonly skaleCalypsoTestnet: LITEVMChain;
    readonly skaleEuropaTestnet: LITEVMChain;
    readonly skaleEuropa: LITEVMChain;
    readonly skaleTitanTestnet: LITEVMChain;
    readonly skaleTitan: LITEVMChain;
    readonly fhenixHelium: LITEVMChain;
    readonly hederaTestnet: LITEVMChain;
    readonly bitTorrentTestnet: LITEVMChain;
    readonly storyOdyssey: LITEVMChain;
    readonly campTestnet: LITEVMChain;
    readonly campMainnet: LITEVMChain;
    readonly hushedNorthstar: LITEVMChain;
    readonly amoy: LITEVMChain;
    readonly matchain: LITEVMChain;
    readonly coreDao: LITEVMChain;
    readonly zkCandySepoliaTestnet: LITEVMChain;
    readonly vana: LITEVMChain;
};
/**
 * Local storage key constants
 */
export declare const LOCAL_STORAGE_KEYS: {
    readonly AUTH_SIGNATURE: "lit-auth-signature";
    readonly WEB3_PROVIDER: "lit-web3-provider";
    readonly SESSION_KEY: "lit-session-key";
    readonly WALLET_SIGNATURE: "lit-wallet-sig";
};
/**
 * Default node URLs for each LIT network
 * Note: Dynamic networks have no default node URLS; they are always
 * loaded from the chain during initialization
 */
export declare const LIT_NETWORKS: Record<LIT_NETWORK_VALUES, string[]>;
export declare const AUTH_METHOD_TYPE: {
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
};
export type AUTH_METHOD_TYPE_TYPE = ConstantKeys<typeof AUTH_METHOD_TYPE>;
export type AUTH_METHOD_TYPE_VALUES = ConstantValues<typeof AUTH_METHOD_TYPE>;
export declare const AUTH_METHOD_SCOPE: {
    readonly NoPermissions: 0;
    readonly SignAnything: 1;
    readonly PersonalSign: 2;
};
export type AUTH_METHOD_SCOPE_TYPE = ConstantKeys<typeof AUTH_METHOD_SCOPE>;
export type AUTH_METHOD_SCOPE_VALUES = ConstantValues<typeof AUTH_METHOD_SCOPE>;
export declare const STAKING_STATES: {
    readonly Active: 0;
    readonly NextValidatorSetLocked: 1;
    readonly ReadyForNextEpoch: 2;
    readonly Unlocked: 3;
    readonly Paused: 4;
    readonly Restore: 5;
};
export type STAKING_STATES_TYPE = ConstantKeys<typeof STAKING_STATES>;
export type STAKING_STATES_VALUES = ConstantValues<typeof STAKING_STATES>;
/**
 * Prefixes used for identifying various LIT resources.
 *
 * @description These resource prefixes are also used as valid IRI schemes.
 */
export declare const LIT_RESOURCE_PREFIX: {
    readonly AccessControlCondition: "lit-accesscontrolcondition";
    readonly PKP: "lit-pkp";
    readonly RLI: "lit-ratelimitincrease";
    readonly PaymentDelegation: "lit-paymentdelegation";
    readonly LitAction: "lit-litaction";
};
export type LIT_RESOURCE_PREFIX_TYPE = ConstantKeys<typeof LIT_RESOURCE_PREFIX>;
export type LIT_RESOURCE_PREFIX_VALUES = ConstantValues<typeof LIT_RESOURCE_PREFIX>;
/**
 * User-facing abilities that can be granted to a session.
 */
export declare const LIT_ABILITY: {
    /**
     * This is the ability to process an encryption access control condition.
     * The resource will specify the corresponding hashed key value of the
     * access control condition.
     */
    readonly AccessControlConditionDecryption: "access-control-condition-decryption";
    /**
     * This is the ability to process a signing access control condition.
     * The resource will specify the corresponding hashed key value of the
     * access control condition.
     */
    readonly AccessControlConditionSigning: "access-control-condition-signing";
    /**
     * This is the ability to use a PKP for signing purposes. The resource will specify
     * the corresponding PKP token ID.
     */
    readonly PKPSigning: "pkp-signing";
    /**
     * This is the ability to use Payment Delegation
     */
    readonly PaymentDelegation: "lit-payment-delegation";
    /**
     * This is the ability to execute a Lit Action. The resource will specify the
     * corresponding Lit Action IPFS CID.
     */
    readonly LitActionExecution: "lit-action-execution";
};
export type LIT_ABILITY_TYPE = ConstantKeys<typeof LIT_ABILITY>;
export type LIT_ABILITY_VALUES = ConstantValues<typeof LIT_ABILITY>;
/**
 * LIT specific abilities mapped into the Recap specific terminology
 * of an 'ability'.
 */
export declare const LIT_RECAP_ABILITY: {
    readonly Decryption: "Decryption";
    readonly Signing: "Signing";
    readonly Auth: "Auth";
    readonly Execution: "Execution";
};
export type LIT_RECAP_ABILITY_TYPE = ConstantKeys<typeof LIT_RECAP_ABILITY>;
export type LIT_RECAP_ABILITY_VALUES = ConstantValues<typeof LIT_RECAP_ABILITY>;
export declare const LIT_NAMESPACE: {
    readonly Auth: "Auth";
    readonly Threshold: "Threshold";
};
export type LIT_NAMESPACE_TYPE = ConstantKeys<typeof LIT_NAMESPACE>;
export type LIT_NAMESPACE_VALUES = ConstantValues<typeof LIT_NAMESPACE>;
/**
 * SDK Logger levels
 */
export declare const LOG_LEVEL: {
    readonly INFO: 0;
    readonly DEBUG: 1;
    readonly WARN: 2;
    readonly ERROR: 3;
    readonly FATAL: 4;
    readonly TIMING_START: 5;
    readonly TIMING_END: 6;
    readonly OFF: -1;
};
export type LOG_LEVEL_TYPE = ConstantKeys<typeof LOG_LEVEL>;
export type LOG_LEVEL_VALUES = ConstantValues<typeof LOG_LEVEL>;
/**
 * This is useful when the node is not able to connect to the IPFS gateway,
 * so the sdk can fall back to these gateways.
 */
export declare const FALLBACK_IPFS_GATEWAYS: readonly ["https://flk-ipfs.io/ipfs/", "https://litprotocol.mypinata.cloud/ipfs/"];
export declare const SIWE_URI_PREFIX: {
    readonly SESSION_KEY: "lit:session:";
    readonly DELEGATION: "lit:capability:delegation";
};
export type SIWE_URI_PREFIX_TYPE = ConstantKeys<typeof SIWE_URI_PREFIX>;
export type SIWE_URI_PREFIX_VALUES = ConstantValues<typeof SIWE_URI_PREFIX>;
export declare const DEV_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
