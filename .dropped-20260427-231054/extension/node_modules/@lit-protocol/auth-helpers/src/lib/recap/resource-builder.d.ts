import { LIT_ABILITY_VALUES } from '@lit-protocol/constants';
import { ILitResource } from '@lit-protocol/types';
/**
 * Creates a resource ability request builder for creating resource ability requests.
 *
 * @example
 * import { createResourceBuilder } from '@lit-protocol/auth-helpers';

const builder = createResourceBuilder();

builder
  .addPKPSigningRequest('*') // PKP Signing
  .addLitActionExecutionRequest('*') // Lit Action Execution
  .addAccessControlConditionSigningRequest('*') // ACC Signing
  .addAccessControlConditionDecryptionRequest('*') // ACC Decryption
  .addPaymentDelegationRequest('*'); // Payment Delegation

const requests = builder.build();

 */
interface IResourceBuilder {
    addPKPSigningRequest: (resourceId: string) => IResourceBuilder;
    addLitActionExecutionRequest: (resourceId: string) => IResourceBuilder;
    addAccessControlConditionSigningRequest: (resourceId: string) => IResourceBuilder;
    addAccessControlConditionDecryptionRequest: (resourceId: string) => IResourceBuilder;
    addPaymentDelegationRequest: (resourceId: string) => IResourceBuilder;
    readonly requests: Array<{
        resource: ILitResource;
        ability: LIT_ABILITY_VALUES;
    }>;
    getResources: () => Array<{
        resource: ILitResource;
        ability: LIT_ABILITY_VALUES;
    }>;
}
export declare const createResourceBuilder: () => IResourceBuilder;
export {};
