import { z } from 'zod';
export declare const ChainEnumAtom: z.ZodEnum<["cosmos", "kyve", "evmosCosmos", "evmosCosmosTestnet", "cheqdMainnet", "cheqdTestnet", "juno"]>;
export declare const EvmChainEnum: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "campNetwork", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
export declare const ChainEnumSol: z.ZodEnum<["solana", "solanaDevnet", "solanaTestnet"]>;
export declare const ReturnValueTestSchema: z.ZodObject<{
    key: z.ZodString;
    comparator: z.ZodEnum<["contains", "=", ">", ">=", "<", "<="]>;
    value: z.ZodString;
}, "strict", z.ZodTypeAny, {
    value: string;
    key: string;
    comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
}, {
    value: string;
    key: string;
    comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
}>;
