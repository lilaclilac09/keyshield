import { nagaDev } from '@lit-protocol/contracts';
import { LIT_NETWORK_VALUES, ConstantKeys, ConstantValues } from './constants';
/**
 * Mapping of network context by network value.
 */
export declare const NETWORK_CONTEXT_BY_NETWORK: Record<LIT_NETWORK_VALUES, typeof nagaDev | undefined>;
/**
 * Whether to overwrite the IPFS code for a given network.
 * This is useful when the nodes are not able to connect to the IPFS gateway,
 * so the sdk can fallback to these gateways.
 */
export declare const GLOBAL_OVERWRITE_IPFS_CODE_BY_NETWORK: Record<LIT_NETWORK_VALUES, boolean>;
/**
 * Product IDs used for price feed and node selection
 *
 * - DECRYPTION (0): Used for decryption operations
 * - SIGN (1): Used for signing operations
 * - LA (2): Used for Lit Actions execution
 * - SIGN_SESSION_KEY (3): Used for sign session key operations
 */
export declare const PRODUCT_IDS: {
    readonly DECRYPTION: 0;
    readonly SIGN: 1;
    readonly LIT_ACTION: 2;
    readonly SIGN_SESSION_KEY: 3;
};
export type PRODUCT_ID_TYPE = ConstantKeys<typeof PRODUCT_IDS>;
export type PRODUCT_ID_VALUES = ConstantValues<typeof PRODUCT_IDS>;
