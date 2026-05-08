import { LIT_ABILITY_VALUES, LIT_RESOURCE_PREFIX_VALUES } from '@lit-protocol/constants';
import { AccessControlConditions, ILitResource } from '@lit-protocol/types';
declare const RESOLVED_AUTH_CONTEXT_PREFIX = "lit-resolvedauthcontext";
type InternalResourcePrefix = LIT_RESOURCE_PREFIX_VALUES | typeof RESOLVED_AUTH_CONTEXT_PREFIX;
declare abstract class LitResourceBase {
    abstract resourcePrefix: InternalResourcePrefix;
    readonly resource: string;
    constructor(resource: string);
    getResourceKey(): string;
    toString(): string;
}
export declare class LitAccessControlConditionResource extends LitResourceBase implements ILitResource {
    readonly resourcePrefix: "lit-accesscontrolcondition";
    /**
     * Creates a new LitAccessControlConditionResource.
     * @param resource The identifier for the resource. This should be the
     * hashed key value of the access control condition.
     */
    constructor(resource: string);
    isValidLitAbility(litAbility: LIT_ABILITY_VALUES): boolean;
    /**
     * Composes a resource string by hashing access control conditions and appending a data hash.
     *
     * @param {AccessControlConditions} accs - The access control conditions to hash.
     * @param {string} dataToEncryptHash - The hash of the data to encrypt.
     * @returns {Promise<string>} The composed resource string in the format 'hashedAccs/dataToEncryptHash'.
     */
    static generateResourceString(accs: AccessControlConditions, dataToEncryptHash: string): Promise<string>;
}
export declare class LitPKPResource extends LitResourceBase implements ILitResource {
    readonly resourcePrefix: "lit-pkp";
    /**
     * Creates a new LitPKPResource.
     * @param resource The identifier for the resource. This should be the
     * PKP token ID.
     */
    constructor(resource: string);
    isValidLitAbility(litAbility: LIT_ABILITY_VALUES): boolean;
}
export declare class LitPaymentDelegationResource extends LitResourceBase implements ILitResource {
    readonly resourcePrefix: "lit-paymentdelegation";
    /**
     * Creates a new LitPaymentDelegationResource.
     * @param resource The identifier for the resource. This should be the
     * Payment Delegation token ID.
     */
    constructor(resource: string);
    isValidLitAbility(litAbility: LIT_ABILITY_VALUES): boolean;
}
export declare class LitActionResource extends LitResourceBase implements ILitResource {
    readonly resourcePrefix: "lit-litaction";
    /**
     * Creates a new LitActionResource.
     * @param resource The identifier for the resource. This should be the
     * Lit Action IPFS CID.
     */
    constructor(resource: string);
    isValidLitAbility(litAbility: LIT_ABILITY_VALUES): boolean;
}
export declare function parseLitResource(resourceKey: string): ILitResource;
export {};
