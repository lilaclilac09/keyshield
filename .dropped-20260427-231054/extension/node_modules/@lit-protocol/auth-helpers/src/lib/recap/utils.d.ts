import { LIT_ABILITY_VALUES, LIT_RECAP_ABILITY_VALUES, LIT_NAMESPACE_VALUES } from '@lit-protocol/constants';
/**
 * Map from a LitAbility to the Recap namespace and ability.
 * @throws Error if the LitAbility is unknown
 */
export declare function getRecapNamespaceAndAbility(litAbility: LIT_ABILITY_VALUES): {
    recapNamespace: LIT_NAMESPACE_VALUES;
    recapAbility: LIT_RECAP_ABILITY_VALUES;
};
export declare const RESOLVED_AUTH_CONTEXT_PREFIX = "lit-resolvedauthcontext://";
/**
 * Reverse mapping from Recap namespace/ability to LitAbility.
 * Returns null when the recap entry only carries metadata (eg. resolved auth context).
 */
export declare function getLitAbilityFromRecap(params: {
    recapNamespace: string;
    recapAbility: string;
    resourceKey: string;
}): LIT_ABILITY_VALUES | null;
