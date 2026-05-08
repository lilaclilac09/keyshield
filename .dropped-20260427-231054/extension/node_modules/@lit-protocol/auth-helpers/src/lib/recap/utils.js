"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOLVED_AUTH_CONTEXT_PREFIX = void 0;
exports.getRecapNamespaceAndAbility = getRecapNamespaceAndAbility;
exports.getLitAbilityFromRecap = getLitAbilityFromRecap;
const constants_1 = require("@lit-protocol/constants");
/**
 * Map from a LitAbility to the Recap namespace and ability.
 * @throws Error if the LitAbility is unknown
 */
function getRecapNamespaceAndAbility(litAbility) {
    switch (litAbility) {
        case constants_1.LIT_ABILITY.AccessControlConditionDecryption:
            return {
                recapNamespace: constants_1.LIT_NAMESPACE.Threshold,
                recapAbility: constants_1.LIT_RECAP_ABILITY.Decryption,
            };
        case constants_1.LIT_ABILITY.AccessControlConditionSigning:
            return {
                recapNamespace: constants_1.LIT_NAMESPACE.Threshold,
                recapAbility: constants_1.LIT_RECAP_ABILITY.Signing,
            };
        case constants_1.LIT_ABILITY.PKPSigning:
            return {
                recapNamespace: constants_1.LIT_NAMESPACE.Threshold,
                recapAbility: constants_1.LIT_RECAP_ABILITY.Signing,
            };
        case constants_1.LIT_ABILITY.PaymentDelegation:
            return {
                recapNamespace: constants_1.LIT_NAMESPACE.Auth,
                recapAbility: constants_1.LIT_RECAP_ABILITY.Auth,
            };
        case constants_1.LIT_ABILITY.LitActionExecution:
            return {
                recapNamespace: constants_1.LIT_NAMESPACE.Threshold,
                recapAbility: constants_1.LIT_RECAP_ABILITY.Execution,
            };
        default:
            throw new constants_1.InvalidArgumentException({
                info: {
                    litAbility,
                },
            }, `Unknown LitAbility`);
    }
}
exports.RESOLVED_AUTH_CONTEXT_PREFIX = 'lit-resolvedauthcontext://';
const PAYMENT_DELEGATION_PREFIX = 'lit-paymentdelegation://';
const PKP_PREFIX = 'lit-pkp://';
const ACC_PREFIX = 'lit-accesscontrolcondition://';
/**
 * Reverse mapping from Recap namespace/ability to LitAbility.
 * Returns null when the recap entry only carries metadata (eg. resolved auth context).
 */
function getLitAbilityFromRecap(params) {
    const { recapNamespace, recapAbility, resourceKey } = params;
    if (recapNamespace === constants_1.LIT_NAMESPACE.Threshold) {
        if (recapAbility === constants_1.LIT_RECAP_ABILITY.Decryption) {
            return constants_1.LIT_ABILITY.AccessControlConditionDecryption;
        }
        if (recapAbility === constants_1.LIT_RECAP_ABILITY.Execution) {
            return constants_1.LIT_ABILITY.LitActionExecution;
        }
        if (recapAbility === constants_1.LIT_RECAP_ABILITY.Signing) {
            if (resourceKey.startsWith(PKP_PREFIX)) {
                return constants_1.LIT_ABILITY.PKPSigning;
            }
            if (resourceKey.startsWith(ACC_PREFIX)) {
                return constants_1.LIT_ABILITY.AccessControlConditionSigning;
            }
        }
    }
    if (recapNamespace === constants_1.LIT_NAMESPACE.Auth &&
        recapAbility === constants_1.LIT_RECAP_ABILITY.Auth) {
        if (resourceKey.startsWith(PAYMENT_DELEGATION_PREFIX)) {
            return constants_1.LIT_ABILITY.PaymentDelegation;
        }
        if (resourceKey.startsWith(exports.RESOLVED_AUTH_CONTEXT_PREFIX)) {
            // Resolved auth context entries only contain metadata.
            return null;
        }
    }
    return null;
}
//# sourceMappingURL=utils.js.map