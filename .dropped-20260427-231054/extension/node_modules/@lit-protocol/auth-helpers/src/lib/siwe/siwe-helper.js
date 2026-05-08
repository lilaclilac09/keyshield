"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRecapToSiweMessage = exports.generateSessionCapabilityObjectWithWildcards = exports.createCapacityCreditsResourceData = void 0;
exports.sanitizeSiweMessage = sanitizeSiweMessage;
const constants_1 = require("@lit-protocol/constants");
const recap_session_capability_object_1 = require("../recap/recap-session-capability-object");
/**
 * Sanitizes a SIWE message by unescaping double-escaped newlines and replacing escaped double quotes with single quotes.
 *
 * @param message - The SIWE message to sanitize.
 * @returns The sanitized SIWE message.
 */
function sanitizeSiweMessage(message) {
    let sanitizedMessage = message.replace(/\\\\n/g, '\\n');
    sanitizedMessage = sanitizedMessage.replace(/\\"/g, "'");
    return sanitizedMessage;
}
/**
 * Creates the resource data for a capacity delegation request.
 * @param params - The capacity delegation fields.
 * @returns The capacity delegation request object.
 */
const createCapacityCreditsResourceData = (params) => {
    return {
        ...(params.delegateeAddresses
            ? {
                delegate_to: params.delegateeAddresses.map((address) => address.startsWith('0x') ? address.slice(2) : address),
            }
            : {}),
        ...(params.uses !== undefined ? { uses: params.uses.toString() } : {}),
    };
};
exports.createCapacityCreditsResourceData = createCapacityCreditsResourceData;
/**
 * Generates wildcard capability for each of the LIT resources
 * specified.
 * @param litResources is an array of LIT resources
 * @param addAllCapabilities is a boolean that specifies whether to add all capabilities for each resource
 */
const generateSessionCapabilityObjectWithWildcards = async (litResources, addAllCapabilities) => {
    const sessionCapabilityObject = new recap_session_capability_object_1.RecapSessionCapabilityObject({}, []);
    // disable for now
    const _addAllCapabilities = addAllCapabilities ?? false;
    if (_addAllCapabilities) {
        for (const litResource of litResources) {
            sessionCapabilityObject.addAllCapabilitiesForResource(litResource);
        }
    }
    return sessionCapabilityObject;
};
exports.generateSessionCapabilityObjectWithWildcards = generateSessionCapabilityObjectWithWildcards;
/**
 * Adds recap capabilities to a SiweMessage.
 * @param siweMessage - The SiweMessage to add recap capabilities to.
 * @param resources - An array of LitResourceAbilityRequest objects representing the resources and abilities to add.
 * @returns The updated SiweMessage with recap capabilities added.
 * @throws An error if the resources array is empty or if litNodeClient is not provided.
 * @throws An error if the generated capabilities fail to verify for any resource and ability.
 */
const addRecapToSiweMessage = async ({ siweMessage, resources, }) => {
    if (!resources || resources.length < 1) {
        throw new constants_1.InvalidArgumentException({
            info: {
                resources,
                siweMessage,
            },
        }, 'resources is required');
    }
    for (const request of resources) {
        const recapObject = await (0, exports.generateSessionCapabilityObjectWithWildcards)([
            request.resource,
        ]);
        recapObject.addCapabilityForResource(request.resource, request.ability, request.data);
        const verified = recapObject.verifyCapabilitiesForResource(request.resource, request.ability);
        if (!verified) {
            throw new constants_1.UnknownError({
                info: {
                    recapObject,
                    request,
                },
            }, `Failed to verify capabilities for resource: "${request.resource}" and ability: "${request.ability}`);
        }
        siweMessage = recapObject.addToSiweMessage(siweMessage);
    }
    return siweMessage;
};
exports.addRecapToSiweMessage = addRecapToSiweMessage;
//# sourceMappingURL=siwe-helper.js.map