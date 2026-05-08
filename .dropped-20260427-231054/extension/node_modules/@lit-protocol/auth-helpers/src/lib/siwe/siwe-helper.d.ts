import { SiweMessage } from 'siwe';
import { CapacityDelegationFields, ILitResource, ISessionCapabilityObject, LitResourceAbilityRequest } from '@lit-protocol/types';
import { LitResourceAbilityRequestSchema } from '@lit-protocol/schemas';
import { z } from 'zod';
/**
 * Sanitizes a SIWE message by unescaping double-escaped newlines and replacing escaped double quotes with single quotes.
 *
 * @param message - The SIWE message to sanitize.
 * @returns The sanitized SIWE message.
 */
export declare function sanitizeSiweMessage(message: string): string;
/**
 * Creates the resource data for a capacity delegation request.
 * @param params - The capacity delegation fields.
 * @returns The capacity delegation request object.
 */
export declare const createCapacityCreditsResourceData: (params: CapacityDelegationFields) => z.infer<(typeof LitResourceAbilityRequestSchema)["shape"]["data"]>;
/**
 * Generates wildcard capability for each of the LIT resources
 * specified.
 * @param litResources is an array of LIT resources
 * @param addAllCapabilities is a boolean that specifies whether to add all capabilities for each resource
 */
export declare const generateSessionCapabilityObjectWithWildcards: (litResources: ILitResource[], addAllCapabilities?: boolean) => Promise<ISessionCapabilityObject>;
/**
 * Adds recap capabilities to a SiweMessage.
 * @param siweMessage - The SiweMessage to add recap capabilities to.
 * @param resources - An array of LitResourceAbilityRequest objects representing the resources and abilities to add.
 * @returns The updated SiweMessage with recap capabilities added.
 * @throws An error if the resources array is empty or if litNodeClient is not provided.
 * @throws An error if the generated capabilities fail to verify for any resource and ability.
 */
export declare const addRecapToSiweMessage: ({ siweMessage, resources, }: {
    siweMessage: SiweMessage;
    resources: LitResourceAbilityRequest[];
}) => Promise<SiweMessage>;
