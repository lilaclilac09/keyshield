import { BaseSiweMessage, WithCapacityDelegation, WithRecap } from '@lit-protocol/types';
import { z } from 'zod';
/**
 * Schema for parameters needed to create a PKP SIWE message
 */
export declare const CreatePKPSiweMessageParamsSchema: z.ZodObject<{
    /** Public key of the PKP that will sign */
    pkpPublicKey: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    /** URI identifying the session key */
    sessionKeyUri: z.ZodString;
    /** Nonce from the Lit Node */
    nonce: z.ZodString;
    /** Expiration time for the session */
    expiration: z.ZodString;
    /** Optional statement to append to the default SIWE statement */
    statement: z.ZodOptional<z.ZodString>;
    /** Optional domain for the SIWE message */
    domain: z.ZodOptional<z.ZodString>;
    /** Optional resources and abilities for SIWE ReCap */
    resources: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
}, "strip", z.ZodTypeAny, {
    expiration: string;
    pkpPublicKey: string;
    sessionKeyUri: string;
    nonce: string;
    resources?: any[] | undefined;
    statement?: string | undefined;
    domain?: string | undefined;
}, {
    expiration: string;
    pkpPublicKey: string;
    sessionKeyUri: string;
    nonce: string;
    resources?: any[] | undefined;
    statement?: string | undefined;
    domain?: string | undefined;
}>;
/**
 * Creates the specific SIWE message that needs to be signed by a PKP
 * to authorize a session key.
 * @param params - Parameters for creating the PKP SIWE message.
 * @returns A promise that resolves to the prepared SIWE message string.
 */
export declare const createPKPSiweMessage: (params: z.infer<typeof CreatePKPSiweMessageParamsSchema>) => Promise<string>;
/**
 * Creates a SIWE
 * @param { BaseSiweMessage } params - The parameters for creating the SIWE message.
 * @returns A promise that resolves to the created SIWE message as a string.
 * @throws An error if the walletAddress parameter is missing.
 */
export declare const createSiweMessage: <T extends BaseSiweMessage>(params: T) => Promise<string>;
/**
 * Creates a SIWE message with recaps added to it.
 *
 * @param { WithRecap } params - The parameters for creating the SIWE message with recaps.
 * @returns A Promise that resolves to a string representing the SIWE message.
 */
export declare const createSiweMessageWithResources: (params: WithRecap) => Promise<string>;
/**
 * Creates a SIWE message with capacity delegation.
 * @param { WithCapacityDelegation } params - The parameters for creating the SIWE message.
 * @returns A Promise that resolves to the created SIWE message.
 * @throws An error if litNodeClient is not provided.
 */
export declare const createSiweMessageWithCapacityDelegation: (params: WithCapacityDelegation) => Promise<string>;
