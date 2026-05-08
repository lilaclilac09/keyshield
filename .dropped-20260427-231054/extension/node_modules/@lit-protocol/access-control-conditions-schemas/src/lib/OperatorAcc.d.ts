import { z } from 'zod';
export declare const OperatorAccSchema: z.ZodObject<{
    operator: z.ZodEnum<["and", "or"]>;
}, "strict", z.ZodTypeAny, {
    operator: "and" | "or";
}, {
    operator: "and" | "or";
}>;
export type OperatorAcc = z.infer<typeof OperatorAccSchema>;
