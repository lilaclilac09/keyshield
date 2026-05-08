import { LIT_ABILITY } from '@lit-protocol/constants';
import { LitResourceAbilityRequest } from '@lit-protocol/types';
export type ShorthandAbilityType = typeof LIT_ABILITY.PKPSigning | typeof LIT_ABILITY.LitActionExecution | typeof LIT_ABILITY.AccessControlConditionSigning | typeof LIT_ABILITY.AccessControlConditionDecryption | typeof LIT_ABILITY.PaymentDelegation;
export type ResourceShorthandTuple = [ShorthandAbilityType, string];
export type ResourceShorthandObject = {
    ability: ShorthandAbilityType;
    resource: string;
};
export type ResourceShorthandInput = (ResourceShorthandTuple | ResourceShorthandObject)[];
/**
 * Type guard to check if the given resources are in a shorthand format
 * (either array of tuples or array of objects) that needs transformation.
 * It does not check for the fully structured LitResourceAbilityRequest[].
 * @param resources - The resources to check.
 * @returns True if resources are in a known shorthand format, false otherwise.
 */
export declare function isResourceShorthandInput(resources: any): resources is ResourceShorthandInput;
/**
 * Transforms an array of resource shorthands (tuples or objects)
 * into an array of full LitResourceAbilityRequest objects.
 * @param shorthandInput - The array of resource shorthands.
 * @returns An array of LitResourceAbilityRequest objects.
 * @throws Error if an unknown shorthand resource type or format is encountered.
 */
export declare function transformShorthandResources(shorthandInput: ResourceShorthandInput): LitResourceAbilityRequest[];
