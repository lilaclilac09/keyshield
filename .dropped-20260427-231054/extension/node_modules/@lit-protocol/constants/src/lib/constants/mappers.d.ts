import { ConstantKeys, ConstantValues } from './constants';
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
