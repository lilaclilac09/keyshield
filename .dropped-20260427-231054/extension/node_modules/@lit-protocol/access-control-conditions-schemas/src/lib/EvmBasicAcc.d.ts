import { z } from 'zod';
export declare const EvmBasicAccSchema: z.ZodObject<{
    conditionType: z.ZodOptional<z.ZodLiteral<"evmBasic">>;
    contractAddress: z.ZodString;
    chain: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "campNetwork", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
    standardContractType: z.ZodEnum<["", "ERC20", "ERC721", "ERC721MetadataName", "ERC1155", "CASK", "Creaton", "POAP", "timestamp", "MolochDAOv2.1", "ProofOfHumanity", "SIWE", "PKPPermissions", "LitAction"]>;
    method: z.ZodString;
    parameters: z.ZodArray<z.ZodString, "many">;
    returnValueTest: z.ZodObject<Omit<{
        key: z.ZodString;
        comparator: z.ZodEnum<["contains", "=", ">", ">=", "<", "<="]>;
        value: z.ZodString;
    }, "key">, "strict", z.ZodTypeAny, {
        value: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    }, {
        value: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    }>;
}, "strict", z.ZodTypeAny, {
    chain: "yellowstone" | "base" | "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "campNetwork" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    method: string;
    parameters: string[];
    returnValueTest: {
        value: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    contractAddress: string;
    standardContractType: "" | "PKPPermissions" | "timestamp" | "ERC20" | "ERC721" | "ERC721MetadataName" | "ERC1155" | "CASK" | "Creaton" | "POAP" | "MolochDAOv2.1" | "ProofOfHumanity" | "SIWE" | "LitAction";
    conditionType?: "evmBasic" | undefined;
}, {
    chain: "yellowstone" | "base" | "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "campNetwork" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    method: string;
    parameters: string[];
    returnValueTest: {
        value: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    contractAddress: string;
    standardContractType: "" | "PKPPermissions" | "timestamp" | "ERC20" | "ERC721" | "ERC721MetadataName" | "ERC1155" | "CASK" | "Creaton" | "POAP" | "MolochDAOv2.1" | "ProofOfHumanity" | "SIWE" | "LitAction";
    conditionType?: "evmBasic" | undefined;
}>;
export type EvmBasicAcc = z.infer<typeof EvmBasicAccSchema>;
