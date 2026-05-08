import { z } from 'zod';
export declare const AtomAccSchema: z.ZodObject<{
    conditionType: z.ZodOptional<z.ZodLiteral<"cosmos">>;
    path: z.ZodString;
    chain: z.ZodEnum<["cosmos", "kyve", "evmosCosmos", "evmosCosmosTestnet", "cheqdMainnet", "cheqdTestnet", "juno"]>;
    method: z.ZodOptional<z.ZodString>;
    parameters: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
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
    path: string;
    chain: "cosmos" | "kyve" | "evmosCosmos" | "evmosCosmosTestnet" | "cheqdMainnet" | "cheqdTestnet" | "juno";
    returnValueTest: {
        value: string;
        key: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    conditionType?: "cosmos" | undefined;
    method?: string | undefined;
    parameters?: string[] | undefined;
}, {
    path: string;
    chain: "cosmos" | "kyve" | "evmosCosmos" | "evmosCosmosTestnet" | "cheqdMainnet" | "cheqdTestnet" | "juno";
    returnValueTest: {
        value: string;
        key: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    conditionType?: "cosmos" | undefined;
    method?: string | undefined;
    parameters?: string[] | undefined;
}>;
export type AtomAcc = z.infer<typeof AtomAccSchema>;
