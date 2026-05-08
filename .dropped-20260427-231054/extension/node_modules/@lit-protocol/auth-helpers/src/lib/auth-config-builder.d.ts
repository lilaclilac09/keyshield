/**
 * @module AuthConfigBuilder
 * This module provides a builder for creating AuthConfig objects in a fluent manner.
 * It simplifies the process of constructing authentication configurations and defining
 * resource capabilities directly within a single builder.
 *
 * @example
 * // import { createAuthConfigBuilder } from './auth-config-builder';
 *
 * // async function setupAuth() {
 * //   const authConfig = createAuthConfigBuilder()
 * //     .addStatement('This is a custom statement for authentication.')
 * //     .addDomain('myapp.example.com')
 * //     .addPKPSigningRequest('*') // Directly add resource capabilities
 * //     .addLitActionExecutionRequest('my-lit-action-ipfs-id') // Example Lit Action IPFS ID
 * //     .build();
 * //   console.log('Constructed AuthConfig:', authConfig);
 * // }
 * // setupAuth();
 */
import { AuthConfigSchema } from '@lit-protocol/schemas';
import { AuthSig } from '@lit-protocol/types';
import { z } from 'zod';
type AuthConfig = z.infer<typeof AuthConfigSchema>;
/**
 * Interface for the AuthConfigBuilder.
 * Defines the fluent API for constructing an AuthConfig object and its associated resources.
 */
interface IAuthConfigBuilder {
    addCapabilityAuthSigs: (sigs: AuthSig[]) => IAuthConfigBuilder;
    addExpiration: (expiration: string | Date) => IAuthConfigBuilder;
    addStatement: (statement: string) => IAuthConfigBuilder;
    addDomain: (domain: string) => IAuthConfigBuilder;
    addPKPSigningRequest: (resourceId: string) => IAuthConfigBuilder;
    addLitActionExecutionRequest: (resourceId: string) => IAuthConfigBuilder;
    addAccessControlConditionSigningRequest: (resourceId: string) => IAuthConfigBuilder;
    addAccessControlConditionDecryptionRequest: (resourceId: string) => IAuthConfigBuilder;
    addPaymentDelegationRequest: (resourceId: string) => IAuthConfigBuilder;
    build: () => AuthConfig;
}
/**
 * Creates and returns a new instance of the AuthConfigBuilder.
 */
export declare const createAuthConfigBuilder: () => IAuthConfigBuilder;
export {};
