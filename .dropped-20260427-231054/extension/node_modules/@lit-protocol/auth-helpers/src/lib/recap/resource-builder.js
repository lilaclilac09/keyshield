"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResourceBuilder = void 0;
const constants_1 = require("@lit-protocol/constants");
const resources_1 = require("../resources");
const createResourceBuilder = () => {
    const requestsArray = [];
    // Need to declare the builder object first so its methods can refer to it.
    const builder = {
        addPKPSigningRequest(resourceId) {
            requestsArray.push({
                resource: new resources_1.LitPKPResource(resourceId),
                ability: constants_1.LIT_ABILITY.PKPSigning,
            });
            return builder; // Return the builder instance
        },
        addLitActionExecutionRequest(resourceId) {
            requestsArray.push({
                resource: new resources_1.LitActionResource(resourceId),
                ability: constants_1.LIT_ABILITY.LitActionExecution,
            });
            return builder; // Return the builder instance
        },
        addAccessControlConditionSigningRequest(resourceId) {
            requestsArray.push({
                resource: new resources_1.LitAccessControlConditionResource(resourceId),
                ability: constants_1.LIT_ABILITY.AccessControlConditionSigning,
            });
            return builder; // Return the builder instance
        },
        addAccessControlConditionDecryptionRequest(resourceId) {
            requestsArray.push({
                resource: new resources_1.LitAccessControlConditionResource(resourceId),
                ability: constants_1.LIT_ABILITY.AccessControlConditionDecryption,
            });
            return builder; // Return the builder instance
        },
        addPaymentDelegationRequest(resourceId) {
            requestsArray.push({
                resource: new resources_1.LitPaymentDelegationResource(resourceId),
                ability: constants_1.LIT_ABILITY.PaymentDelegation,
            });
            return builder; // Return the builder instance
        },
        get requests() {
            return requestsArray;
        },
        getResources() {
            return requestsArray;
        },
    };
    return builder;
};
exports.createResourceBuilder = createResourceBuilder;
//# sourceMappingURL=resource-builder.js.map