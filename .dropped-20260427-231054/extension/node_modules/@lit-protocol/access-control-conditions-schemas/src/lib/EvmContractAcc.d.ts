import { z } from 'zod';
export declare const EvmContractAccSchema: z.ZodObject<{
    conditionType: z.ZodOptional<z.ZodLiteral<"evmContract">>;
    contractAddress: z.ZodString;
    chain: z.ZodEnum<["ethereum", "polygon", "fantom", "xdai", "bsc", "arbitrum", "arbitrumSepolia", "avalanche", "fuji", "harmony", "mumbai", "goerli", "cronos", "optimism", "celo", "aurora", "eluvio", "alfajores", "xdc", "evmos", "evmosTestnet", "bscTestnet", "baseGoerli", "baseSepolia", "moonbeam", "moonriver", "moonbaseAlpha", "filecoin", "filecoinCalibrationTestnet", "hyperspace", "sepolia", "scrollSepolia", "scroll", "zksync", "base", "lukso", "luksoTestnet", "zora", "zoraGoerli", "zksyncTestnet", "lineaGoerli", "lineaSepolia", "yellowstone", "chiado", "zkEvm", "mantleTestnet", "mantle", "klaytn", "publicGoodsNetwork", "optimismGoerli", "waevEclipseTestnet", "waevEclipseDevnet", "verifyTestnet", "fuse", "campNetwork", "vanar", "lisk", "chilizMainnet", "chilizTestnet", "skaleTestnet", "skale", "skaleCalypso", "skaleCalypsoTestnet", "skaleEuropaTestnet", "skaleEuropa", "skaleTitanTestnet", "skaleTitan", "fhenixHelium", "hederaTestnet", "bitTorrentTestnet", "storyOdyssey", "campTestnet", "hushedNorthstar", "amoy", "matchain", "coreDao", "zkCandySepoliaTestnet", "vana"]>;
    functionName: z.ZodString;
    functionParams: z.ZodArray<z.ZodString, "many">;
    functionAbi: z.ZodObject<{
        name: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        stateMutability: z.ZodString;
        constant: z.ZodOptional<z.ZodBoolean>;
        inputs: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            internalType: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            name: string;
            type: string;
            internalType?: string | undefined;
        }, {
            name: string;
            type: string;
            internalType?: string | undefined;
        }>, "many">;
        outputs: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            internalType: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            name: string;
            type: string;
            internalType?: string | undefined;
        }, {
            name: string;
            type: string;
            internalType?: string | undefined;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        name: string;
        stateMutability: string;
        inputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        outputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        type?: string | undefined;
        constant?: boolean | undefined;
    }, {
        name: string;
        stateMutability: string;
        inputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        outputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        type?: string | undefined;
        constant?: boolean | undefined;
    }>;
    returnValueTest: z.ZodObject<{
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
}, "strict", z.ZodTypeAny, {
    chain: "yellowstone" | "base" | "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "campNetwork" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    returnValueTest: {
        value: string;
        key: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    contractAddress: string;
    functionName: string;
    functionParams: string[];
    functionAbi: {
        name: string;
        stateMutability: string;
        inputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        outputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        type?: string | undefined;
        constant?: boolean | undefined;
    };
    conditionType?: "evmContract" | undefined;
}, {
    chain: "yellowstone" | "base" | "ethereum" | "polygon" | "fantom" | "xdai" | "bsc" | "arbitrum" | "arbitrumSepolia" | "avalanche" | "fuji" | "harmony" | "mumbai" | "goerli" | "cronos" | "optimism" | "celo" | "aurora" | "eluvio" | "alfajores" | "xdc" | "evmos" | "evmosTestnet" | "bscTestnet" | "baseGoerli" | "baseSepolia" | "moonbeam" | "moonriver" | "moonbaseAlpha" | "filecoin" | "filecoinCalibrationTestnet" | "hyperspace" | "sepolia" | "scrollSepolia" | "scroll" | "zksync" | "lukso" | "luksoTestnet" | "zora" | "zoraGoerli" | "zksyncTestnet" | "lineaGoerli" | "lineaSepolia" | "chiado" | "zkEvm" | "mantleTestnet" | "mantle" | "klaytn" | "publicGoodsNetwork" | "optimismGoerli" | "waevEclipseTestnet" | "waevEclipseDevnet" | "verifyTestnet" | "fuse" | "campNetwork" | "vanar" | "lisk" | "chilizMainnet" | "chilizTestnet" | "skaleTestnet" | "skale" | "skaleCalypso" | "skaleCalypsoTestnet" | "skaleEuropaTestnet" | "skaleEuropa" | "skaleTitanTestnet" | "skaleTitan" | "fhenixHelium" | "hederaTestnet" | "bitTorrentTestnet" | "storyOdyssey" | "campTestnet" | "hushedNorthstar" | "amoy" | "matchain" | "coreDao" | "zkCandySepoliaTestnet" | "vana";
    returnValueTest: {
        value: string;
        key: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    contractAddress: string;
    functionName: string;
    functionParams: string[];
    functionAbi: {
        name: string;
        stateMutability: string;
        inputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        outputs: {
            name: string;
            type: string;
            internalType?: string | undefined;
        }[];
        type?: string | undefined;
        constant?: boolean | undefined;
    };
    conditionType?: "evmContract" | undefined;
}>;
export type EvmContractAcc = z.infer<typeof EvmContractAccSchema>;
