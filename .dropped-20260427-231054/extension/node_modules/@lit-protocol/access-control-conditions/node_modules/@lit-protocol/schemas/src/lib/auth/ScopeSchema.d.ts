import { z } from 'zod';
/**
 * Defines schemas for PKP permission scopes.
 * Handles both string inputs and bigint transformations for contract calls.
 */
export declare const SCOPE_VALUES: readonly ["no-permissions", "sign-anything", "personal-sign"];
export type ScopeString = (typeof SCOPE_VALUES)[number];
export declare const SCOPE_MAPPING: {
    readonly 'no-permissions': 0n;
    readonly 'sign-anything': 1n;
    readonly 'personal-sign': 2n;
};
export type ScopeBigInt = (typeof SCOPE_MAPPING)[ScopeString];
export declare const ScopeStringSchema: z.ZodEnum<["no-permissions", "sign-anything", "personal-sign"]>;
export declare const ScopeSchemaRaw: z.ZodEffects<z.ZodEnum<["no-permissions", "sign-anything", "personal-sign"]>, 0n | 1n | 2n, "no-permissions" | "sign-anything" | "personal-sign">;
