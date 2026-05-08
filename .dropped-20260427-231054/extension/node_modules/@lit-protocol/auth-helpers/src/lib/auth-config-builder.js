"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthConfigBuilder = void 0;
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
const schemas_1 = require("@lit-protocol/schemas");
const constants_1 = require("@lit-protocol/constants");
const resources_1 = require("./resources"); // Corrected path: from ../lib/auth-config-builder.ts to ../lib/resources/
const zod_1 = require("zod");
/**
 * Creates and returns a new instance of the AuthConfigBuilder.
 */
const createAuthConfigBuilder = () => {
    const configInProgress = {};
    const resourcesArray = [];
    const builder = {
        addCapabilityAuthSigs(sigs) {
            configInProgress.capabilityAuthSigs = sigs;
            return builder;
        },
        addExpiration(expiration) {
            if (expiration instanceof Date) {
                configInProgress.expiration = expiration.toISOString();
            }
            else {
                configInProgress.expiration = expiration;
            }
            return builder;
        },
        addStatement(statement) {
            configInProgress.statement = statement;
            return builder;
        },
        addDomain(domain) {
            configInProgress.domain = domain;
            return builder;
        },
        // Resource capability methods
        addPKPSigningRequest(resourceId) {
            resourcesArray.push({
                resource: new resources_1.LitPKPResource(resourceId),
                ability: constants_1.LIT_ABILITY.PKPSigning,
            });
            return builder;
        },
        addLitActionExecutionRequest(resourceId) {
            resourcesArray.push({
                resource: new resources_1.LitActionResource(resourceId),
                ability: constants_1.LIT_ABILITY.LitActionExecution,
            });
            return builder;
        },
        addAccessControlConditionSigningRequest(resourceId) {
            resourcesArray.push({
                resource: new resources_1.LitAccessControlConditionResource(resourceId),
                ability: constants_1.LIT_ABILITY.AccessControlConditionSigning,
            });
            return builder;
        },
        addAccessControlConditionDecryptionRequest(resourceId) {
            resourcesArray.push({
                resource: new resources_1.LitAccessControlConditionResource(resourceId),
                ability: constants_1.LIT_ABILITY.AccessControlConditionDecryption,
            });
            return builder;
        },
        addPaymentDelegationRequest(resourceId) {
            resourcesArray.push({
                resource: new resources_1.LitPaymentDelegationResource(resourceId),
                ability: constants_1.LIT_ABILITY.PaymentDelegation,
            });
            return builder;
        },
        build: () => {
            const finalConfig = {
                ...configInProgress,
                resources: resourcesArray, // Cast needed if ResourceRequest is not strictly LitResourceAbilityRequest
            };
            // if resources is empty, throw an error
            if (resourcesArray.length === 0) {
                throw new Error(`🤯 Resources array is empty, please add at least one resource to the auth config. You can add resources using the following methods:
          - addPKPSigningRequest
          - addLitActionExecutionRequest
          - addAccessControlConditionSigningRequest
          - addAccessControlConditionDecryptionRequest
          - addPaymentDelegationRequest
          `);
            }
            try {
                // Ensure default values for top-level AuthConfig props are applied
                // by parsing an object that includes the resources array.
                const parsedConfig = schemas_1.AuthConfigSchema.parse(finalConfig);
                return parsedConfig;
            }
            catch (e) {
                if (e instanceof zod_1.z.ZodError) {
                    console.error('AuthConfig validation failed:', e.errors);
                }
                throw new Error(`Failed to build AuthConfig: ${e.message}`);
            }
        },
    };
    return builder;
};
exports.createAuthConfigBuilder = createAuthConfigBuilder;
//# sourceMappingURL=auth-config-builder.js.map