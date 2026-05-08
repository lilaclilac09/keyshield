import { z } from 'zod';
export declare const SolAccSchema: z.ZodObject<{
    conditionType: z.ZodOptional<z.ZodLiteral<"solRpc">>;
    method: z.ZodString;
    params: z.ZodArray<z.ZodString, "many">;
    pdaParams: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pdaInterface: z.ZodObject<{
        offset: z.ZodNumber;
        fields: z.ZodObject<{}, "strip", z.ZodAny, z.objectOutputType<{}, z.ZodAny, "strip">, z.objectInputType<{}, z.ZodAny, "strip">>;
    }, "strict", z.ZodTypeAny, {
        fields: {} & {
            [k: string]: any;
        };
        offset: number;
    }, {
        fields: {} & {
            [k: string]: any;
        };
        offset: number;
    }>;
    pdaKey: z.ZodString;
    chain: z.ZodEnum<["solana", "solanaDevnet", "solanaTestnet"]>;
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
    params: string[];
    chain: "solana" | "solanaDevnet" | "solanaTestnet";
    method: string;
    returnValueTest: {
        value: string;
        key: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    pdaInterface: {
        fields: {} & {
            [k: string]: any;
        };
        offset: number;
    };
    pdaKey: string;
    conditionType?: "solRpc" | undefined;
    pdaParams?: string[] | undefined;
}, {
    params: string[];
    chain: "solana" | "solanaDevnet" | "solanaTestnet";
    method: string;
    returnValueTest: {
        value: string;
        key: string;
        comparator: "contains" | "=" | ">" | ">=" | "<" | "<=";
    };
    pdaInterface: {
        fields: {} & {
            [k: string]: any;
        };
        offset: number;
    };
    pdaKey: string;
    conditionType?: "solRpc" | undefined;
    pdaParams?: string[] | undefined;
}>;
export type SolAcc = z.infer<typeof SolAccSchema>;
