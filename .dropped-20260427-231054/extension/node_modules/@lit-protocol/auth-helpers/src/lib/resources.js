"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LitActionResource = exports.LitPaymentDelegationResource = exports.LitPKPResource = exports.LitAccessControlConditionResource = void 0;
exports.parseLitResource = parseLitResource;
const access_control_conditions_1 = require("@lit-protocol/access-control-conditions");
const constants_1 = require("@lit-protocol/constants");
const utils_1 = require("./utils");
const RESOLVED_AUTH_CONTEXT_PREFIX = 'lit-resolvedauthcontext';
class LitResourceBase {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    getResourceKey() {
        return `${this.resourcePrefix}://${this.resource}`;
    }
    toString() {
        return this.getResourceKey();
    }
}
class LitAccessControlConditionResource extends LitResourceBase {
    resourcePrefix = constants_1.LIT_RESOURCE_PREFIX.AccessControlCondition;
    /**
     * Creates a new LitAccessControlConditionResource.
     * @param resource The identifier for the resource. This should be the
     * hashed key value of the access control condition.
     */
    constructor(resource) {
        super(resource);
    }
    isValidLitAbility(litAbility) {
        return (litAbility === constants_1.LIT_ABILITY.AccessControlConditionDecryption ||
            litAbility === constants_1.LIT_ABILITY.AccessControlConditionSigning);
    }
    /**
     * Composes a resource string by hashing access control conditions and appending a data hash.
     *
     * @param {AccessControlConditions} accs - The access control conditions to hash.
     * @param {string} dataToEncryptHash - The hash of the data to encrypt.
     * @returns {Promise<string>} The composed resource string in the format 'hashedAccs/dataToEncryptHash'.
     */
    static async generateResourceString(accs, dataToEncryptHash) {
        if (!accs || !dataToEncryptHash) {
            throw new constants_1.InvalidArgumentException({
                info: {
                    accs,
                    dataToEncryptHash,
                },
            }, 'Invalid input: Access control conditions and data hash are required.');
        }
        const hashedAccs = await (0, access_control_conditions_1.hashAccessControlConditions)(accs);
        const hashedAccsStr = Buffer.from(new Uint8Array(hashedAccs)).toString('hex');
        const resourceString = `${hashedAccsStr}/${dataToEncryptHash}`;
        return resourceString;
    }
}
exports.LitAccessControlConditionResource = LitAccessControlConditionResource;
class LitPKPResource extends LitResourceBase {
    resourcePrefix = constants_1.LIT_RESOURCE_PREFIX.PKP;
    /**
     * Creates a new LitPKPResource.
     * @param resource The identifier for the resource. This should be the
     * PKP token ID.
     */
    constructor(resource) {
        const fixedResource = (0, utils_1.formatPKPResource)(resource);
        super(fixedResource);
    }
    isValidLitAbility(litAbility) {
        return litAbility === constants_1.LIT_ABILITY.PKPSigning;
    }
}
exports.LitPKPResource = LitPKPResource;
class LitPaymentDelegationResource extends LitResourceBase {
    resourcePrefix = constants_1.LIT_RESOURCE_PREFIX.PaymentDelegation;
    /**
     * Creates a new LitPaymentDelegationResource.
     * @param resource The identifier for the resource. This should be the
     * Payment Delegation token ID.
     */
    constructor(resource) {
        super(resource);
    }
    isValidLitAbility(litAbility) {
        return litAbility === constants_1.LIT_ABILITY.PaymentDelegation;
    }
}
exports.LitPaymentDelegationResource = LitPaymentDelegationResource;
class LitActionResource extends LitResourceBase {
    resourcePrefix = constants_1.LIT_RESOURCE_PREFIX.LitAction;
    /**
     * Creates a new LitActionResource.
     * @param resource The identifier for the resource. This should be the
     * Lit Action IPFS CID.
     */
    constructor(resource) {
        super(resource);
    }
    isValidLitAbility(litAbility) {
        return litAbility === constants_1.LIT_ABILITY.LitActionExecution;
    }
}
exports.LitActionResource = LitActionResource;
function parseLitResource(resourceKey) {
    if (resourceKey.startsWith(constants_1.LIT_RESOURCE_PREFIX.AccessControlCondition)) {
        return new LitAccessControlConditionResource(resourceKey.substring(`${constants_1.LIT_RESOURCE_PREFIX.AccessControlCondition}://`.length));
    }
    else if (resourceKey.startsWith(constants_1.LIT_RESOURCE_PREFIX.PKP)) {
        return new LitPKPResource(resourceKey.substring(`${constants_1.LIT_RESOURCE_PREFIX.PKP}://`.length));
    }
    else if (resourceKey.startsWith(constants_1.LIT_RESOURCE_PREFIX.PaymentDelegation)) {
        return new LitPaymentDelegationResource(resourceKey.substring(`${constants_1.LIT_RESOURCE_PREFIX.PaymentDelegation}://`.length));
    }
    else if (resourceKey.startsWith(constants_1.LIT_RESOURCE_PREFIX.LitAction)) {
        return new LitActionResource(resourceKey.substring(`${constants_1.LIT_RESOURCE_PREFIX.LitAction}://`.length));
    }
    else if (resourceKey.startsWith(RESOLVED_AUTH_CONTEXT_PREFIX)) {
        const resource = resourceKey.substring(`${RESOLVED_AUTH_CONTEXT_PREFIX}://`.length);
        return {
            resourcePrefix: RESOLVED_AUTH_CONTEXT_PREFIX,
            resource,
            getResourceKey: () => `${RESOLVED_AUTH_CONTEXT_PREFIX}://${resource}`,
            toString: () => `${RESOLVED_AUTH_CONTEXT_PREFIX}://${resource}`,
            isValidLitAbility: () => false,
        };
    }
    throw new constants_1.InvalidArgumentException({
        info: {
            resourceKey,
        },
    }, `Invalid resource prefix`);
}
//# sourceMappingURL=resources.js.map