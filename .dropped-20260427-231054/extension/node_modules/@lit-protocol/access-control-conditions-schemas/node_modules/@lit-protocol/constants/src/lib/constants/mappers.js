"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRODUCT_IDS = exports.GLOBAL_OVERWRITE_IPFS_CODE_BY_NETWORK = exports.NETWORK_CONTEXT_BY_NETWORK = void 0;
const contracts_1 = require("@lit-protocol/contracts");
const constants_1 = require("./constants");
/**
 * Mapping of network context by network value.
 */
exports.NETWORK_CONTEXT_BY_NETWORK = {
    [constants_1.LIT_NETWORK.NagaDev]: contracts_1.nagaDev,
    [constants_1.LIT_NETWORK.Custom]: undefined,
};
/**
 * Whether to overwrite the IPFS code for a given network.
 * This is useful when the nodes are not able to connect to the IPFS gateway,
 * so the sdk can fallback to these gateways.
 */
exports.GLOBAL_OVERWRITE_IPFS_CODE_BY_NETWORK = {
    [constants_1.LIT_NETWORK.NagaDev]: false,
    [constants_1.LIT_NETWORK.Custom]: false,
};
/**
 * Product IDs used for price feed and node selection
 *
 * - DECRYPTION (0): Used for decryption operations
 * - SIGN (1): Used for signing operations
 * - LA (2): Used for Lit Actions execution
 * - SIGN_SESSION_KEY (3): Used for sign session key operations
 */
exports.PRODUCT_IDS = {
    DECRYPTION: 0, // For decryption operations
    SIGN: 1, // For signing operations
    LIT_ACTION: 2, // For Lit Actions execution
    SIGN_SESSION_KEY: 3, // For sign session key operations
};
//# sourceMappingURL=mappers.js.map