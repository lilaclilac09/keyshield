"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isResourceShorthandInput = isResourceShorthandInput;
exports.transformShorthandResources = transformShorthandResources;
const constants_1 = require("@lit-protocol/constants");
const resources_1 = require("./resources"); // Assuming these are exported from resources.ts
/**
 * Type guard to check if the given resources are in a shorthand format
 * (either array of tuples or array of objects) that needs transformation.
 * It does not check for the fully structured LitResourceAbilityRequest[].
 * @param resources - The resources to check.
 * @returns True if resources are in a known shorthand format, false otherwise.
 */
function isResourceShorthandInput(resources) {
    if (!Array.isArray(resources)) {
        return false;
    }
    if (resources.length === 0) {
        return true; // Empty array is a valid shorthand input
    }
    const firstElement = resources[0];
    // Check if it's an array of tuples
    if (Array.isArray(firstElement) &&
        firstElement.length === 2 &&
        typeof firstElement[0] === 'string' &&
        typeof firstElement[1] === 'string') {
        // Further check if all elements match this pattern (optional, can be done in transform)
        return resources.every((item) => Array.isArray(item) &&
            item.length === 2 &&
            typeof item[0] === 'string' &&
            typeof item[1] === 'string');
    }
    // Check if it's an array of objects
    if (typeof firstElement === 'object' &&
        firstElement !== null &&
        'ability' in firstElement &&
        'resource' in firstElement &&
        typeof firstElement.ability === 'string' &&
        typeof firstElement.resource === 'string') {
        // Further check if all elements match this pattern (optional, can be done in transform)
        return resources.every((item) => typeof item === 'object' &&
            item !== null &&
            'ability' in item &&
            'resource' in item &&
            typeof item.ability === 'string' &&
            typeof item.resource === 'string');
    }
    return false; // Not a recognized shorthand format
}
/**
 * Transforms an array of resource shorthands (tuples or objects)
 * into an array of full LitResourceAbilityRequest objects.
 * @param shorthandInput - The array of resource shorthands.
 * @returns An array of LitResourceAbilityRequest objects.
 * @throws Error if an unknown shorthand resource type or format is encountered.
 */
function transformShorthandResources(shorthandInput) {
    return shorthandInput.map((item) => {
        let abilityValue;
        let resourceId;
        if (Array.isArray(item)) {
            // It's a tuple [ability, resourceId]
            if (item.length === 2 &&
                typeof item[0] === 'string' &&
                typeof item[1] === 'string') {
                abilityValue = item[0]; // Type assertion
                resourceId = item[1];
            }
            else {
                throw new Error('Invalid resource shorthand tuple format.');
            }
        }
        else if (typeof item === 'object' &&
            item !== null &&
            'ability' in item &&
            'resource' in item) {
            // It's an object { ability, resource }
            if (typeof item.ability === 'string' &&
                typeof item.resource === 'string') {
                abilityValue = item.ability; // Type assertion
                resourceId = item.resource;
            }
            else {
                throw new Error('Invalid resource shorthand object format: ability or resource is not a string.');
            }
        }
        else {
            throw new Error('Unknown item format in resource shorthand array.');
        }
        let resourceInstance;
        let abilityEnum;
        switch (abilityValue) {
            case constants_1.LIT_ABILITY.PKPSigning:
                resourceInstance = new resources_1.LitPKPResource(resourceId);
                abilityEnum = constants_1.LIT_ABILITY.PKPSigning;
                break;
            case constants_1.LIT_ABILITY.LitActionExecution:
                resourceInstance = new resources_1.LitActionResource(resourceId);
                abilityEnum = constants_1.LIT_ABILITY.LitActionExecution;
                break;
            case constants_1.LIT_ABILITY.AccessControlConditionSigning:
                resourceInstance = new resources_1.LitAccessControlConditionResource(resourceId);
                abilityEnum = constants_1.LIT_ABILITY.AccessControlConditionSigning;
                break;
            case constants_1.LIT_ABILITY.AccessControlConditionDecryption:
                resourceInstance = new resources_1.LitAccessControlConditionResource(resourceId);
                abilityEnum = constants_1.LIT_ABILITY.AccessControlConditionDecryption;
                break;
            case constants_1.LIT_ABILITY.PaymentDelegation:
                resourceInstance = new resources_1.LitPaymentDelegationResource(resourceId);
                abilityEnum = constants_1.LIT_ABILITY.PaymentDelegation;
                break;
            default:
                const exhaustiveCheck = abilityValue;
                throw new Error('Unknown shorthand ability type: ' + exhaustiveCheck);
        }
        return {
            resource: resourceInstance,
            ability: abilityEnum,
        };
    });
}
//# sourceMappingURL=resource-shorthand-transformer.js.map